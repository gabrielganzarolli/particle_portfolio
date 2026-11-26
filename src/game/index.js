// Game controller: the only src/game module that drives the particle field,
// the camera and the DOM. Loaded on demand (import()) on the first click on
// the head. The phase machine (phases.js) drives everything; each phase's work
// lives in a small function below.
//
// The host (main.js) calls update(dt, now) each frame while `active`, then
// field.update() and the render itself. On exit the host restores its own
// phrase pair, camera fov and page state in hooks.onExited().
import { gameBudget } from './budget.js';
import { buildGameLocal } from './shapes.js';
import { createWorld, stepWorld, gameUniforms } from './world.js';
import { steerTarget, attachControls } from './controls.js';
import { gameCamera, blendPose, stepBlend, HERO_FOV, corridorFor } from './camera.js';
import { createPhases, PHASE, ENTER_S, EXIT_S } from './phases.js';
import { submitPlay, formatScore } from './ranking.js';
import { createRng } from './rng.js';
import { buildGamePrograms, gameLift } from './gpu.js';
import { LEVELS } from '../quality.js';

// Seconds of the score morph once its pair is set, then seconds the click
// waits after it for the text to settle. The morph's end is not the text's:
// its particles come from all along the corridor (down to z = -112) and the
// last of them let go of the game only as the morph ends. With the game's
// speed cap and the stiff landing (snap) they arrive about 1.2 s later
// (measured: 95% within 0.15 of their destinations); the hold has a margin.
// scripts/game-check.cjs flow part 3 measures it at the moment the click opens.
const SCORE_FORM_S = 1.2;
const SCORE_SETTLE_S = 1.5;

// Quality probe: PLAY frame times, the first few ignored (shader warm-up).
const PROBE_SKIP = 30;
const PROBE_MIN = 150;
const PROBE_SLOW_MS = 21;
const PROBE_SLOW_SHARE = 0.25;

// The ship's local shape is fixed per level; only the world is reseeded.
const SHAPE_SEED = 7;

const DEG = Math.PI / 180;

/** easeInOutSine, the same curve main.js uses for its morphs. */
function ease(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function newSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

/**
 * @param {{
 *   field: import('../ParticleField.js').ParticleField,
 *   camera: import('three').PerspectiveCamera,
 *   renderer: import('three').WebGLRenderer,
 *   indices: { REST: number, GAME: number, SCORE: number },
 *   level: () => 1|2|3,
 *   lang: () => 'en'|'pt',
 *   heroPose: () => { px: number, py: number, pz: number },
 *   hooks: { onEnter(): void, onExited(): void, onRunEnd(info: { slow: boolean, seconds: number }): void },
 * }} ctx
 */
export function createGame(ctx) {
  const { field, camera, renderer, indices, hooks } = ctx;
  const { REST, GAME, SCORE } = indices;

  const phases = createPhases();
  const shapes = new Map(); // level -> { budget, local }
  const steer = { tx: 0, ty: 0 };

  let world = null;
  let controls = null;
  let blend = 0; // camera and look: 0 = hero, 1 = chase
  let run = 0; // bumped on every new run and on exit; stale async work checks it
  let starting = false; // start() is waiting for the game's programs
  let abortStart = false; // Esc or "×" while starting: do not begin the run
  let runEnded = false;
  let scorePhrase = null; // promise from field.setPhrase(SCORE, ...)
  // True once the player has seen the score: SCORE_SETTLE_S after its morph
  // reached 1 (or at once if the text failed to build, so there is nothing to
  // wait for). Gates the restart click together with phases.canRestart(),
  // which only knows about time in SCORE.
  let scoreFormed = false;
  let settle = -1; // seconds since the score morph ended; -1 when not settling
  let probe = { frames: 0, samples: 0, slow: 0, last: null };

  // A 0 -> 1 ramp of the field's morph, eased on the way to the shader.
  // `onDone` runs once, on the frame the ramp reaches 1; starting another
  // ramp drops it.
  const morph = { t: 1, dur: 1, running: false, onDone: null };
  const startMorph = (dur, onDone = null) => {
    morph.t = 0;
    morph.dur = dur;
    morph.running = true;
    morph.onDone = onDone;
    field.setMorph(0);
  };
  const stepMorph = (dt) => {
    if (!morph.running) return;
    morph.t = morph.t + dt / morph.dur;
    // Snap the last sliver: summed float steps can stop just short of 1 while
    // ease() already rounds to 1, and onDone must fire on the frame the field
    // shows the end of the morph.
    if (morph.t > 1 - 1e-6) morph.t = 1;
    field.setMorph(ease(morph.t));
    if (morph.t === 1) {
      morph.running = false;
      const done = morph.onDone;
      morph.onDone = null;
      done?.();
    }
  };

  // ------------------------------------------------------------- runs

  function installShapes() {
    const level = ctx.level();
    field.gamePrograms.points.uniforms.uGameLift.value = gameLift(LEVELS[level].bloom);
    let s = shapes.get(level);
    if (!s) {
      const budget = gameBudget(level);
      s = { budget, local: buildGameLocal(budget, field.size, createRng(SHAPE_SEED)) };
      shapes.set(level, s);
    }
    field.setGameBudget(s.budget, s.local);
  }

  // A fresh world, morphing from phrase `from` to the game.
  function beginRun(from) {
    run++;
    runEnded = false;
    scorePhrase = null;
    scoreFormed = false;
    settle = -1;
    probe = { frames: 0, samples: 0, slow: 0, last: null };
    installShapes();
    // The first meteors spawn in the narrowest chase view (speed 0); each
    // frame then sets the corridor for the current speed and screen.
    world = createWorld(createRng(newSeed()), corridorFor(camera.aspect, gameCamera({ x: 0, y: 0 }, 0).fov));
    steer.tx = steer.ty = 0;
    field.setGameState(gameUniforms(world));
    field.setSnap(0);
    field.setPair(from, GAME);
    startMorph(ENTER_S);
  }

  function endRun() {
    if (runEnded) return;
    runEnded = true;
    const slow = probe.samples >= PROBE_MIN && probe.slow > probe.samples * PROBE_SLOW_SHARE;
    hooks.onRunEnd({ slow, seconds: world.t });
  }

  function sampleFrame(now) {
    const last = probe.last;
    probe.last = now;
    if (last === null || ++probe.frames <= PROBE_SKIP) return;
    probe.samples++;
    if (now - last > PROBE_SLOW_MS) probe.slow++;
  }

  // ----------------------------------------------------------- phases

  function onPlay(now) {
    sampleFrame(now);
    if (world.alive) return;
    // The ship hit something. The score text starts building now, in slices,
    // while the ship explodes; DYING's end pairs it in.
    phases.die();
    field.pulseBurst();
    // The game entered with the focus on the "×" (main.js). From here on
    // Enter and Space mean "play again", which they cannot while the "×"
    // holds the focus (they would press it), so it lets go; Tab reaches it
    // again and Esc still exits.
    if (document.activeElement?.closest?.('[data-game-exit]')) document.activeElement.blur();
    scoreFormed = false;
    scorePhrase = buildScorePhrase(world.t, ctx.lang());
    scorePhrase.catch((err) => console.warn(err));
    endRun();
  }

  // The play's time goes to the ranking and the score text is its time and its
  // place among all the plays. If the place does not come in time, or at all
  // (no server, not configured), the text is the time alone: the game never
  // depends on the ranking. Only a crash counts as a play, not leaving with
  // `Esc` while the ship is alive.
  async function buildScorePhrase(seconds, lang) {
    const rank = await submitPlay(seconds);
    await field.setPhrase(SCORE, formatScore(seconds, rank, lang));
  }

  async function formScore() {
    const mine = run;
    let built = true;
    try {
      await scorePhrase;
    } catch {
      built = false;
    }
    if (mine !== run || phases.phase !== PHASE.SCORE) return;
    if (!built) {
      // The SCORE index would still hold an older run's time: never pair it.
      // Let a click restart instead of leaving the player stuck.
      scoreFormed = true;
      return;
    }
    field.setPair(GAME, SCORE);
    // The hero's landing: a stiffer, near-critically damped spring as the
    // morph ends (beginRun and requestExit set it back to 0).
    field.setSnap(1);
    startMorph(SCORE_FORM_S, () => {
      if (mine === run) settle = 0;
    });
  }

  // The one gate for a restart, by click or by key.
  function tryRestart() {
    if (!phases.canRestart() || !scoreFormed) return;
    phases.begin();
    beginRun(SCORE);
  }

  function onScoreClick(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target?.closest?.('[data-game-exit]')) return; // the "×" exits instead
    tryRestart();
  }

  // Enter or Space: play again, through the click's gate. Not when the focus
  // is on the "×" (there they press it: exit) or on any other control.
  function onScoreKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.closest?.('a, button, input, textarea, select, [contenteditable], [tabindex]')) return;
    e.preventDefault(); // Space would scroll, Enter could activate something
    if (!e.repeat) tryRestart();
  }

  function finishExit() {
    field.setMorph(1);
    blend = 0;
    field.setGameLook(0);
    controls?.dispose();
    controls = null;
    window.removeEventListener('pointerdown', onScoreClick);
    window.removeEventListener('keydown', onScoreKey);
    world = null;
    // The hero's own programs are back before the hero takes over.
    field.useGameShaders(false);
    hooks.onExited();
  }

  // Phase transitions made by phases.tick().
  function onTransition(from, to) {
    if (from === PHASE.DYING && to === PHASE.SCORE) formScore();
    else if (from === PHASE.EXIT && to === PHASE.IDLE) finishExit();
  }

  // ----------------------------------------------------- world, camera

  function stepWorldFrame(dt) {
    const p = phases.phase;
    // The corridor follows the screen's proportion (a resize changes it), as
    // seen through the chase camera's field of view at this speed, not the
    // blended camera's: that is the view the ship is flown in.
    world.corridor = corridorFor(camera.aspect, gameCamera(world.ship, world.speed).fov);
    if (p === PHASE.ENTER || p === PHASE.PLAY) {
      steerTarget(steer, controls.read(), dt, world.corridor);
    }
    stepWorld(world, dt, { x: steer.tx, y: steer.ty }, { collide: p !== PHASE.EXIT });
    field.setGameState(gameUniforms(world));
  }

  function placeCamera(dt) {
    const p = phases.phase;
    const chase = p === PHASE.ENTER || p === PHASE.PLAY || p === PHASE.DYING;
    blend = stepBlend(blend, chase ? 1 : 0, dt);
    // The exit morph ends on a fixed clock; the camera lands with it.
    if (p === PHASE.EXIT) blend = Math.min(blend, 1 - phases.t / EXIT_S);
    const e = ease(blend);

    // The hero pose is read every frame, not kept from start(): a resize
    // mid-game moves it, and the exit must land where the hero will draw.
    const h = ctx.heroPose();
    const hero = { px: h.px, py: h.py, pz: h.pz, tx: 0, ty: 0, tz: 0, fov: HERO_FOV };
    const c = blendPose(hero, gameCamera(world.ship, world.speed), e);
    camera.position.set(c.px, c.py, c.pz);
    camera.lookAt(c.tx, c.ty, c.tz);
    if (camera.fov !== c.fov) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
      field.setPixelScale(renderer.domElement.height / (2 * Math.tan((c.fov * DEG) / 2)));
    }
    camera.updateMatrixWorld();
    // Focus on the ship, which sits at the origin's depth; at the hero pose
    // this is the distance to the phrase plane's centre.
    const sx = world.ship.x * e, sy = world.ship.y * e;
    field.setCamera(camera, Math.hypot(c.px - sx, c.py - sy, c.pz));
    field.setGameLook(e);
  }

  // ------------------------------------------------------------ API

  const game = {
    get active() {
      return phases.phase !== PHASE.IDLE;
    },
    get phase() {
      return phases.phase;
    },
    /** True while start() waits for the game's programs. */
    get starting() {
      return starting;
    },

    /**
     * Start from phrase index `from` (the head, or REST for #jogo). The first
     * start builds and compiles the game's programs before the run begins;
     * `canStart` is asked again once they are ready, as the page may have
     * moved on meanwhile.
     */
    async start(from, canStart = () => true) {
      if (phases.phase !== PHASE.IDLE || starting) return;
      starting = true;
      abortStart = false;
      try {
        await field.loadGameShaders(buildGamePrograms);
      } finally {
        starting = false;
      }
      // Esc or "×" while the programs compiled: the hero was never left.
      if (abortStart) return;
      if (phases.phase !== PHASE.IDLE || !canStart()) return;
      field.useGameShaders(true);
      phases.begin();
      blend = 0;
      beginRun(from);
      controls = attachControls(window);
      window.addEventListener('pointerdown', onScoreClick);
      window.addEventListener('keydown', onScoreKey);
      hooks.onEnter();
    },

    update(dt, now) {
      if (phases.phase === PHASE.IDLE) return;
      const before = phases.phase;
      phases.tick(dt);
      if (phases.phase !== before) onTransition(before, phases.phase);
      if (phases.phase === PHASE.IDLE) return;

      stepWorldFrame(dt);
      if (phases.phase === PHASE.PLAY) onPlay(now);
      // Counted from the frame after the score morph ended.
      if (settle >= 0 && (settle += dt) >= SCORE_SETTLE_S) {
        settle = -1;
        scoreFormed = true;
      }
      stepMorph(dt);
      placeCamera(dt);
    },

    /** Esc or "×". Safe to call in any phase, any number of times. */
    requestExit() {
      if (starting) {
        abortStart = true;
        return;
      }
      const before = phases.phase;
      phases.exit();
      if (phases.phase !== PHASE.EXIT || before === PHASE.EXIT) return;
      run++; // drops a pending score pairing
      settle = -1;
      field.setSnap(0); // the exit lands as it does from play
      endRun();
      field.setPair(field.currentIndex, REST);
      startMorph(EXIT_S);
    },
  };

  if (import.meta.env.DEV) {
    game.debug = {
      /** End the run as if the ship had hit a meteor. */
      kill() {
        if (world) world.alive = false;
      },
      get world() {
        return world;
      },
      get scoreFormed() {
        return scoreFormed;
      },
    };
  }

  return game;
}
