// Browser checks for the game inside the particle field.
//
//   node scripts/game-check.cjs positions
//   node scripts/game-check.cjs look       (captures in shots/look-nivelN.png;
//                                           LEVELS=1,3 limits the levels)
//   node scripts/game-check.cjs flow       (part 1: the controller on its own;
//                                           part 2: the game inside the live hero;
//                                           part 3: edge cases, captures in
//                                           shots/flow-*.png;
//                                           part 4: a portrait phone, the
//                                           keyboard and focus, abort on Esc)
//
//   (flow1, flow2, flow3, flow4 run one part alone)
//
//   node scripts/game-check.cjs heroPrograms (the hero's programs carry no
//                                           game code at load or after a game)
//   node scripts/game-check.cjs headLeak (after a crash the parked particles do
//                                           not come back as the head's shape)
//   node scripts/game-check.cjs rank      (the ranking on the score screen, with
//                                           /api/rank answered by the page's routes)
//   node scripts/game-check.cjs bench     (hero frame time vs main; exit 0 pass,
//                                           1 fail, 3 inconclusive; see bench)
//
// Needs the dev server (`npm run dev -- --port 5199`) and the globally
// installed Playwright. The site's own animation loop is stopped and the check
// steps the field itself, so every frame has a known dt and known uniforms.
// Exits non-zero if any criterion fails.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:5199';
const mode = process.argv[2];

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openSite(hash = '', options = {}, setup = null) {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ...options });
  const errors = [];
  page.on('console', (msg) => {
    // The ranking's request fails by design here (the dev server has no /api,
    // and the rank check answers 503 on purpose); the browser logs each one.
    if (msg.type() === 'error' && !msg.location().url.endsWith('/api/rank')) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  if (setup) await setup(page);
  await page.goto(`${BASE}/${hash}`);
  await page.waitForFunction(() => window.__pf && window.__pf.state().frames > 2, null, { timeout: 300000, polling: 500 });
  return { browser, page, errors };
}

// Runs in the page. Steps the world and the field together for `frames`
// frames, then one more frame at constant speed so a streak's step in z is
// exactly speed * dt, and measures the four position criteria.
async function positionsInPage() {
  const { field, renderer, state } = window.__pf;
  renderer.setAnimationLoop(null);

  const { gameBudget, STREAK_POINTS } = await import('/src/game/budget.js');
  const { buildGameLocal } = await import('/src/game/shapes.js');
  const { createWorld, stepWorld, gameUniforms } = await import('/src/game/world.js');
  const { createRng } = await import('/src/game/rng.js');

  const level = state().level;
  const budget = gameBudget(level);
  const grid = field.size;
  const local = buildGameLocal(budget, grid, createRng(7));
  const world = createWorld(createRng(11));

  const g = field.phrases.length;
  field.setGame(g, g + 1);
  field.setGameBudget(budget, local);
  // What the controller does on start: the game's programs replace the hero's.
  const { buildGamePrograms } = await import('/src/game/gpu.js');
  await field.loadGameShaders(buildGamePrograms);
  field.useGameShaders(true);
  field.setPair(0, g);
  field.setMorph(1);

  const DT = 1 / 60;
  const FRAMES = 90;
  let elapsed = 0;
  const frame = (u) => {
    field.setGameState(u);
    elapsed += DT;
    field.update(DT, elapsed);
  };

  for (let f = 0; f < FRAMES; f++) {
    stepWorld(world, DT, { x: 0, y: 0 }, { collide: false });
    frame(gameUniforms(world));
  }
  const u0 = gameUniforms(world);
  const p0 = field.readPositions();

  // One more frame at constant speed: the world module eases speed toward its
  // ramp every step, which would also change each streak's tail spacing.
  const u1 = gameUniforms(world);
  u1.distance = (u0.distance + u0.speed * DT) % 120;
  for (let s = 0; s < 10; s++) u1.meteors[s * 4 + 2] += u0.speed * DT;
  frame(u1);
  const p1 = field.readPositions();

  const { flame, shipEnd, ringEnd, meteorEnd, perMeteor, active } = budget;
  const out = {};

  // (a) hull particles sit on ship + rotated local offset.
  {
    const [sx, sy] = u1.ship;
    const [c, s] = u1.shipRot;
    let worst = 0;
    for (let i = flame; i < shipEnd; i++) {
      const lx = local[i * 4], ly = local[i * 4 + 1], lz = local[i * 4 + 2];
      const gx = sx + lx * c - ly * s, gy = sy + lx * s + ly * c, gz = lz;
      const d = Math.hypot(p1[i * 4] - gx, p1[i * 4 + 1] - gy, p1[i * 4 + 2] - gz);
      if (d > worst) worst = d;
    }
    out.a = { pass: worst < 0.06, detail: `hull ${shipEnd - flame} particles, worst ${worst.toFixed(5)} (< 0.06)` };
  }

  // (b) meteor 0 is placed directly: slot + R * rotY(local), no lag.
  {
    const [mx, my, mz, R] = u1.meteors;
    const [c, s] = u1.meteorRot;
    let worst = 0;
    for (let i = ringEnd; i < ringEnd + perMeteor; i++) {
      const lx = local[i * 4], ly = local[i * 4 + 1], lz = local[i * 4 + 2];
      const gx = mx + R * (lx * c - lz * s), gy = my + R * ly, gz = mz + R * (lx * s + lz * c);
      const d = Math.hypot(p1[i * 4] - gx, p1[i * 4 + 1] - gy, p1[i * 4 + 2] - gz);
      if (d > worst) worst = d;
    }
    out.b = { pass: worst < 0.001, detail: `meteor 0, ${perMeteor} particles at z ${mz.toFixed(2)}, worst ${worst.toExponential(2)} (< 0.001)` };
  }

  // (c) streak points advance speed * dt in z unless they wrapped round the
  // loop, and stay inside the corridor's depth.
  {
    const step = u0.speed * DT;
    let worst = 0, wrapped = 0, zMin = Infinity, zMax = -Infinity;
    for (let i = meteorEnd; i < active; i++) {
      const z0 = p0[i * 4 + 2], z1 = p1[i * 4 + 2];
      zMin = Math.min(zMin, z0, z1);
      zMax = Math.max(zMax, z0, z1);
      const dz = z1 - z0;
      if (dz < -60) { wrapped++; continue; }
      worst = Math.max(worst, Math.abs(dz - step));
    }
    const streaks = (active - meteorEnd) / STREAK_POINTS;
    out.c = {
      pass: worst < 0.001 && zMin >= -125 && zMax <= 8,
      detail: `${streaks} streaks, step ${step.toFixed(4)}, worst ${worst.toExponential(2)} (< 0.001), ${wrapped} wrapped, z in [${zMin.toFixed(2)}, ${zMax.toFixed(2)}] (within [-125, 8])`,
    };
  }

  // (d) particles beyond the budget are parked.
  {
    let worst = 0;
    for (let i = active; i < field.count; i++) {
      const d = Math.hypot(p1[i * 4] - p0[i * 4], p1[i * 4 + 1] - p0[i * 4 + 1], p1[i * 4 + 2] - p0[i * 4 + 2]);
      if (d > worst) worst = d;
    }
    out.d = { pass: worst < 0.05, detail: `${field.count - active} parked, worst step ${worst.toExponential(2)} (< 0.05)` };
  }

  out.level = level;
  return out;
}

async function positions() {
  const { browser, page, errors } = await openSite();
  let failed = false;
  try {
    const r = await page.evaluate(positionsInPage);
    console.log(`level ${r.level}`);
    for (const key of ['a', 'b', 'c', 'd']) {
      console.log(`${r[key].pass ? 'PASS' : 'FAIL'} (${key}) ${r[key].detail}`);
      if (!r[key].pass) failed = true;
    }
  } catch (err) {
    console.log(`FAIL ${err.message.split('\n')[0]}`);
    failed = true;
  }
  if (errors.length) {
    console.log(`FAIL console errors:\n  ${errors.join('\n  ')}`);
    failed = true;
  }
  await browser.close();
  return failed;
}

// Runs in the page. Puts the field on the game with the game's look and the
// chase camera, with the world at t = 8 s, renders one frame through the
// site's post chain and measures the share of non-dark pixels on the canvas.
async function lookInPage() {
  const { field, renderer, camera, post, dust, state } = window.__pf;
  renderer.setAnimationLoop(null);

  const { gameBudget } = await import('/src/game/budget.js');
  const { buildGameLocal } = await import('/src/game/shapes.js');
  const { createWorld, stepWorld, gameUniforms } = await import('/src/game/world.js');
  const { gameCamera } = await import('/src/game/camera.js');
  const { createRng } = await import('/src/game/rng.js');
  const { LEVELS } = await import('/src/quality.js');

  const level = state().level;
  const budget = gameBudget(level);
  const local = buildGameLocal(budget, field.size, createRng(7));
  const world = createWorld(createRng(11));

  const g = field.phrases.length;
  field.setGame(g, g + 1);
  field.setGameBudget(budget, local);
  // What the controller does on start: the game's programs replace the hero's.
  const { buildGamePrograms, gameLift } = await import('/src/game/gpu.js');
  await field.loadGameShaders(buildGamePrograms);
  field.useGameShaders(true);
  // As installShapes() in the controller: the lift for this level's bloom.
  field.gamePrograms.points.uniforms.uGameLift.value = gameLift(LEVELS[level].bloom);
  field.setPair(0, g);
  field.setMorph(1);
  field.setGameLook(1);
  // What the game controller does on entering (hooks.onEnter).
  dust.visible = false;
  field.setHeadSolid(0);
  field.setDim(0);
  field.setSnap(0);
  field.setRepelScale(0);
  post.setBloomScale(LEVELS[level].bloom);

  const placeCamera = () => {
    const c = gameCamera(world.ship, world.speed);
    camera.fov = c.fov;
    camera.position.set(c.px, c.py, c.pz);
    camera.lookAt(c.tx, c.ty, c.tz);
    camera.updateProjectionMatrix();
    field.setPixelScale(renderer.domElement.height / (2 * Math.tan((c.fov * Math.PI) / 360)));
    camera.updateMatrixWorld();
    const s = world.ship;
    field.setCamera(camera, Math.hypot(c.px - s.x, c.py - s.y, c.pz));
  };

  const DT = 1 / 60;
  // The world alone up to 1.5 s before the capture, then world and field
  // together, long enough for every spring to settle.
  while (world.t < 6.5) stepWorld(world, DT, { x: 0, y: 0 }, { collide: false });
  let elapsed = 0;
  while (world.t < 8) {
    stepWorld(world, DT, { x: 0, y: 0 }, { collide: false });
    field.setGameState(gameUniforms(world));
    placeCamera();
    elapsed += DT;
    field.update(DT, elapsed);
  }
  post.render(DT, elapsed);

  // Read the canvas in the same task as the render, before it is presented.
  const src = renderer.domElement;
  const c2 = document.createElement('canvas');
  c2.width = src.width;
  c2.height = src.height;
  const ctx = c2.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const px = ctx.getImageData(0, 0, c2.width, c2.height).data;
  let lit = 0, white = 0;
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.max(px[i], px[i + 1], px[i + 2]);
    if (m > 48) lit++;
    if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) white++;
  }
  const total = px.length / 4;
  return {
    level,
    active: budget.active,
    t: world.t,
    lit: lit / total,
    white: white / total,
    png: c2.toDataURL('image/png'),
  };
}

const WHITE_CAP = 0.005;

async function look() {
  const fs = require('fs');
  const path = require('path');
  let failed = false;
  for (const level of (process.env.LEVELS || '1,2,3').split(',').map(Number)) {
    const { browser, page, errors } = await openSite(`#nivel${level}`);
    try {
      const r = await page.evaluate(lookInPage);
      const file = path.join('shots', `look-nivel${level}.png`);
      fs.mkdirSync('shots', { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
      const pct = (v) => `${(v * 100).toFixed(2)}%`;
      // Near-white cap: measured 0.20% (level 1), 0.20% (2), 0.21% (3) with
      // the final values; a blown-out field (the flames and the ship merging
      // into white) goes well past it.
      const ok = r.level === level && r.lit >= 0.002 && r.lit <= 0.12 && r.white <= WHITE_CAP;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} level ${r.level}: ${r.active} active, t ${r.t.toFixed(2)} s, ` +
          `non-dark ${pct(r.lit)} (within [0.20%, 12%]), white ${pct(r.white)} (<= ${pct(WHITE_CAP)}), ${file}`
      );
      if (!ok) failed = true;
    } catch (err) {
      console.log(`FAIL level ${level}: ${err.message.split('\n')[0]}`);
      failed = true;
    }
    if (errors.length) {
      console.log(`FAIL level ${level} console errors:\n  ${errors.join('\n  ')}`);
      failed = true;
    }
    await browser.close();
  }
  return failed;
}

// Runs in the page. Part 1 of the flow check: the controller on its own,
// built by hand from window.__pf (not the one main.js creates on a click).
// The site's loop is stopped and the check drives game.update + field.update itself at a
// fixed dt, yielding to the event loop between frames so the score phrase can
// build in slices. Records every phase change and every hook call.
async function flowInPage() {
  const { field, renderer, camera, state } = window.__pf;
  renderer.setAnimationLoop(null);

  const { createGame } = await import('/src/game/index.js');

  // main.js marks the game's phrases at boot; use those indices.
  const REST = 0;
  const GAME = field.gameIndex >= 0 ? field.gameIndex : field.phrases.length;
  const SCORE = GAME + 1;
  field.setGame(GAME, SCORE);

  const calls = { onEnter: 0, onExited: 0, onRunEnd: [] };
  const heroZ = camera.position.z;
  const game = createGame({
    field,
    camera,
    renderer,
    indices: { REST, GAME, SCORE },
    level: () => state().level,
    lang: () => 'en',
    heroPose: () => ({ px: 0, py: 0, pz: heroZ }),
    hooks: {
      onEnter: () => calls.onEnter++,
      onExited: () => calls.onExited++,
      onRunEnd: (info) => calls.onRunEnd.push(info),
    },
  });

  const DT = 1 / 60;
  const phases = [game.phase];
  let now = 0;
  let elapsed = 0;
  const frame = () => {
    now += DT * 1000;
    elapsed += DT;
    game.update(DT, now);
    field.update(DT, elapsed);
    if (phases[phases.length - 1] !== game.phase) phases.push(game.phase);
  };
  // Step until `done()` holds; give up after `max` frames.
  const run = async (done, max) => {
    for (let f = 0; f < max && !done(); f++) {
      frame();
      await new Promise((r) => setTimeout(r, 0));
    }
    return done();
  };
  const click = () =>
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 400, button: 0, bubbles: true }));

  const out = { level: state().level, notes: [] };
  const note = (ok, text) => out.notes.push({ ok, text });

  await game.start(REST);
  note(game.active && game.phase === 'enter', `start(REST) -> ${game.phase}, active ${game.active}`);
  note(calls.onEnter === 1, `onEnter called ${calls.onEnter} time(s) (1)`);

  await run(() => game.phase === 'play', 200);
  note(game.phase === 'play', `after ${(1.5).toFixed(1)} s of steps -> ${game.phase}`);

  await run(() => false, 30); // a little play, so the probe has frames
  const scale = field.material.uniforms.uPixelScale.value;
  const want = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  note(Math.abs(scale - want) < 1e-3, `pixel scale ${scale.toFixed(3)} matches fov ${camera.fov.toFixed(2)} (${want.toFixed(3)})`);

  const t = game.debug.world.t;
  game.debug.kill();
  frame();
  note(game.phase === 'dying', `kill() -> ${game.phase}`);
  note(calls.onRunEnd.length === 1, `onRunEnd at death: ${JSON.stringify(calls.onRunEnd[0])}`);

  await run(() => game.phase === 'score', 200);
  note(game.phase === 'score', `after the explosion -> ${game.phase}`);

  // The score must be on its way to the particles: the phrase holds the time.
  await run(() => field.indexB === SCORE, 200);
  const text = field.phrases[SCORE];
  note(field.indexA === GAME && field.indexB === SCORE, `pair ${field.indexA} -> ${field.indexB} (${GAME} -> ${SCORE})`);
  note(typeof text === 'string' && /^\d+\.\d s$/.test(text), `score phrase "${text}" (world t ${t.toFixed(2)} s at kill)`);

  // A click before SCORE_RESTART_S is ignored.
  click();
  frame();
  note(game.phase === 'score', `early click in score -> ${game.phase} (ignored)`);

  // SCORE_RESTART_S has passed but the text is still settling: ignored too.
  await run(() => false, Math.ceil(1.75 / DT));
  const formedEarly = game.debug.scoreFormed;
  click();
  frame();
  note(game.phase === 'score' && !formedEarly, `click 1.75 s into score, text still settling (scoreFormed ${formedEarly}) -> ${game.phase} (ignored)`);

  await run(() => game.debug.scoreFormed, 400);
  click();
  frame();
  note(game.phase === 'enter', `click once the score text settled -> ${game.phase}`);
  note(field.indexA === SCORE && field.indexB === GAME, `restart pair ${field.indexA} -> ${field.indexB}`);
  note(game.debug.world.alive && game.debug.world.t < 0.1, `fresh world (t ${game.debug.world.t.toFixed(3)})`);

  await run(() => false, 10);
  game.requestExit();
  note(game.phase === 'exit', `requestExit() -> ${game.phase}`);
  note(field.indexB === REST, `exit pair ${field.indexA} -> ${field.indexB} (B = REST ${REST})`);
  game.requestExit(); // idempotent
  await run(() => game.phase === 'idle', 200);
  note(game.phase === 'idle' && !game.active, `after the exit -> ${game.phase}, active ${game.active}`);
  game.requestExit();
  await run(() => false, 5);
  note(calls.onExited === 1, `onExited called ${calls.onExited} time(s) (1)`);
  note(calls.onRunEnd.length === 2, `onRunEnd called ${calls.onRunEnd.length} time(s) (death + exit)`);

  out.phases = phases;

  // The quality probe: a second run whose PLAY frames arrive every 30 ms
  // (dt stays fixed, only the clock passed as `now` is slow).
  const slowCalls = [];
  const slowGame = createGame({
    field, camera, renderer,
    indices: { REST, GAME, SCORE },
    level: () => state().level,
    lang: () => 'pt',
    heroPose: () => ({ px: 0, py: 0, pz: heroZ }),
    hooks: { onEnter() {}, onExited() {}, onRunEnd: (info) => slowCalls.push(info) },
  });
  await slowGame.start(REST);
  let clock = 0;
  for (let f = 0; f < 400 && slowGame.phase !== 'dying'; f++) {
    // Meteors near the ship are moved out of the corridor, so only kill() ends
    // this run and it always has its 150+ samples.
    for (const m of slowGame.debug.world.meteors) if (m.z > -20) m.x = 100;
    if (slowGame.phase === 'play' && f > 300) slowGame.debug.kill();
    clock += slowGame.phase === 'play' ? 30 : DT * 1000;
    slowGame.update(DT, clock);
  }
  note(slowCalls.length === 1 && slowCalls[0].slow === true, `30 ms frames -> onRunEnd ${JSON.stringify(slowCalls[0])} (slow)`);
  await run(() => false, 3); // let the score phrase start building
  slowGame.requestExit();
  for (let f = 0; f < 200 && slowGame.active; f++) slowGame.update(DT, (clock += DT * 1000));
  note(!slowGame.active && slowCalls.length === 1, `slow run exited, onRunEnd ${slowCalls.length} time(s) (1)`);

  // The restart waits for the score to form, not only for SCORE_RESTART_S.
  // A third game whose field.setPhrase is held back (then made to fail).
  const gated = createGame({
    field, camera, renderer,
    indices: { REST, GAME, SCORE },
    level: () => state().level,
    lang: () => 'en',
    heroPose: () => ({ px: 0, py: 0, pz: heroZ }),
    hooks: { onEnter() {}, onExited() {}, onRunEnd() {} },
  });
  const gFrame = () => {
    now += DT * 1000;
    elapsed += DT;
    gated.update(DT, now);
    field.update(DT, elapsed);
  };
  const gRun = async (done, max) => {
    for (let f = 0; f < max && !done(); f++) {
      gFrame();
      await new Promise((r) => setTimeout(r, 0));
    }
    return done();
  };
  const realSetPhrase = field.setPhrase;
  const restartAfter = Math.ceil((1.7 + 0.05) / DT); // SCORE_RESTART_S + 0.05 s
  try {
    // (1) setPhrase resolves only when released, long after SCORE began.
    let release;
    const held = new Promise((r) => (release = r));
    field.setPhrase = async function (i, text) {
      await held;
      return realSetPhrase.call(this, i, text);
    };
    await gated.start(REST);
    await gRun(() => gated.phase === 'play', 200);
    await gRun(() => false, 10);
    gated.debug.kill();
    await gRun(() => gated.phase === 'score', 200);
    await gRun(() => false, restartAfter);
    click();
    gFrame();
    note(gated.phase === 'score' && field.indexB !== SCORE,
      `slow score text: click ${restartAfter} frames into score -> ${gated.phase} (ignored), pair ${field.indexA} -> ${field.indexB}`);
    release();
    await gRun(() => gated.debug.scoreFormed, 400);
    note(field.indexB === SCORE && field.morph === 1 && gated.debug.scoreFormed, `slow score text formed: pair ${field.indexA} -> ${field.indexB}, morph ${field.morph}, scoreFormed ${gated.debug.scoreFormed}, phase ${gated.phase}`);
    click();
    gFrame();
    note(gated.phase === 'enter', `click once the score formed -> ${gated.phase}`);

    // (2) setPhrase fails: SCORE is never paired, and a click still restarts.
    field.setPhrase = () => Promise.reject(new Error('flow check: setPhrase rejected on purpose'));
    await gRun(() => gated.phase === 'play', 200);
    await gRun(() => false, 10);
    gated.debug.kill();
    let pairedScore = false;
    await gRun(() => {
      if (field.indexB === SCORE) pairedScore = true;
      return gated.phase === 'score';
    }, 200);
    for (let f = 0; f < restartAfter; f++) {
      gFrame();
      if (field.indexB === SCORE) pairedScore = true;
      await new Promise((r) => setTimeout(r, 0));
    }
    click();
    gFrame();
    note(gated.phase === 'enter' && !pairedScore,
      `failed score text: SCORE paired ${pairedScore} (false), click after 1.7 s -> ${gated.phase}`);
    gated.requestExit();
    await gRun(() => gated.phase === 'idle', 200);
    note(gated.phase === 'idle', `gated run exited -> ${gated.phase}`);
  } finally {
    delete field.setPhrase; // back to the prototype method
  }
  return out;
}

// Part 2 helpers. The site's own loop keeps running: these drive the page
// the way a visitor does (mouse, wheel, keyboard) and wait on its state.
const HEAD = 4;
const WAIT = { timeout: 180000, polling: 100 };

// Records every value window.__pf.game.phase takes ('none' before the game
// module has loaded), sampled once per animation frame.
function recordPhases(page) {
  return page.evaluate(() => {
    window.__phaseLog = [];
    const tick = () => {
      const g = window.__pf.game;
      const p = g ? g.phase : 'none';
      const log = window.__phaseLog;
      if (log[log.length - 1] !== p) log.push(p);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// Screen point (CSS px) of a world point on the field's plane, from the
// head's measured bounds: its centre, or just beyond its right edge.
function headScreenPoint(page, where) {
  return page.evaluate(
    ({ where, HEAD }) => {
      const { field, camera } = window.__pf;
      const b = field.boundsOf(HEAD);
      const v = camera.position.clone().set(where === 'outside' ? b.halfW + 0.6 : 0, where === 'outside' ? 0 : b.halfH * 0.2, 0);
      v.project(camera);
      const rect = document.getElementById('scene').getBoundingClientRect();
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
        halfW: b.halfW,
        halfH: b.halfH,
      };
    },
    { where, HEAD }
  );
}

const headFormed = () => {
  const s = window.__pf.state();
  return s.headOn && s.morphT === 1;
};
// Back on the name, at rest, the head off. `hover`: also on the hero's resting
// pair REST -> HOVER (reduced motion keeps REST -> HEAD after the head).
const onNameAtRest = (hover) => {
  const { field, state } = window.__pf;
  const s = state();
  return !s.headOn && s.morphT === 0 && field.indexA === 0 && field.currentIndex === 0 && (!hover || field.indexB === 1);
};

async function formHead(page, report, label) {
  await page.mouse.click(640, 400); // the name, at the centre of the hero
  const ok = await page.waitForFunction(headFormed, null, WAIT).then(() => true, () => false);
  report(ok, `${label}: click on the name -> head formed`);
  return ok;
}

async function flowPart2() {
  let failed = false;
  const report = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
    if (!ok) failed = true;
  };
  const finish = async ({ browser, errors }, label) => {
    if (errors.length) report(false, `${label}: console errors:\n  ${errors.join('\n  ')}`);
    else report(true, `${label}: no console errors`);
    await browser.close();
  };

  // (a) Click the formed head: the game enters and plays, the page locks, Esc
  // brings the name back. Then (b), on the same page: a click outside the
  // formed head returns to the name and starts nothing.
  {
    const site = await openSite();
    const { page } = site;
    try {
      console.log(`part 2 level ${(await page.evaluate(() => window.__pf.state().level))}`);
      await recordPhases(page);
      if (await formHead(page, report, '(a)')) {
        const pt = await headScreenPoint(page, 'centre');
        await page.mouse.click(pt.x, pt.y);
        const played = await page
          .waitForFunction(() => window.__pf.game?.phase === 'play', null, WAIT)
          .then(() => true, () => false);
        const log = await page.evaluate(() => window.__phaseLog.slice());
        const iEnter = log.indexOf('enter');
        report(played && iEnter >= 0 && log.indexOf('play') > iEnter, `(a) click on the head (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)}) -> phases ${log.join(' > ')}`);

        const dom = await page.evaluate(() => {
          const b = document.querySelector('[data-game-exit]');
          const cs = b && getComputedStyle(b);
          return {
            gameOn: document.documentElement.classList.contains('game-on'),
            exit: b ? { hidden: b.hidden, visibility: cs.visibility, label: b.getAttribute('aria-label') } : null,
            lang: getComputedStyle(document.querySelector('[data-lang-toggle]')).visibility,
          };
        });
        report(dom.gameOn, `(a) html.game-on ${dom.gameOn}`);
        report(!!dom.exit && !dom.exit.hidden && dom.exit.visibility === 'visible' && dom.exit.label === 'Back to the name',
          `(a) exit button ${JSON.stringify(dom.exit)}`);
        report(dom.lang === 'hidden', `(a) language toggle visibility ${dom.lang} (hidden)`);

        const y0 = await page.evaluate(() => window.scrollY);
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(600);
        const y1 = await page.evaluate(() => window.scrollY);
        report(y0 === y1, `(a) wheel during the game: scrollY ${y0} -> ${y1} (unchanged)`);

        await page.evaluate(() => (window.__phaseLog = [window.__pf.game.phase]));
        await page.keyboard.press('Escape');
        const idle = await page
          .waitForFunction(() => window.__pf.game.phase === 'idle', null, WAIT)
          .then(() => true, () => false);
        const exitLog = await page.evaluate(() => window.__phaseLog.slice());
        report(idle && exitLog.slice(-2).join() === 'exit,idle', `(a) Esc -> phases ${exitLog.join(' > ')}`);

        const back = await page.waitForFunction(onNameAtRest, true, WAIT).then(() => true, () => false);
        const after = await page.evaluate(() => {
          const { camera, dust, field, state } = window.__pf;
          return {
            gameOn: document.documentElement.classList.contains('game-on'),
            fov: camera.fov,
            dust: dust.visible,
            pair: `${field.indexA} -> ${field.indexB}`,
            morph: state().morphT,
            exitVisibility: getComputedStyle(document.querySelector('[data-game-exit]')).visibility,
          };
        });
        report(back && !after.gameOn && after.fov === 50 && after.dust && after.exitVisibility === 'hidden',
          `(a) after the exit: ${JSON.stringify(after)} (name, no game-on, fov 50, dust on, exit hidden)`);
      }

      // (b)
      if (await formHead(page, report, '(b)')) {
        const pt = await headScreenPoint(page, 'outside');
        const inView = pt.x > 10 && pt.x < 1270;
        await page.mouse.click(pt.x, pt.y);
        // The name spans most of the width, so that point can be over it:
        // move off it, or the hover would turn it into PRODUCT DESIGNER.
        await page.mouse.move(20, 780);
        const back = await page.waitForFunction(onNameAtRest, true, WAIT).then(() => true, () => false);
        await page.waitForTimeout(800);
        const phase = await page.evaluate(() => window.__pf.game?.phase ?? 'none');
        report(inView && back && phase === 'idle',
          `(b) click outside the head (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)}; head half-width ${pt.halfW.toFixed(2)}) -> name ${back}, game ${phase}`);
      }
    } catch (err) {
      report(false, `(a/b) ${err.message.split('\n')[0]}`);
    }
    await finish(site, '(a/b)');
  }

  // (c) Reduced motion, with #jogo in the address: no game from the address,
  // and a click on the head returns to the name.
  {
    const site = await openSite('#jogo', { reducedMotion: 'reduce' });
    const { page } = site;
    try {
      await page.waitForFunction(() => window.__pf.state().frames > 30, null, WAIT);
      const early = await page.evaluate(() => ({ game: window.__pf.game?.phase ?? 'none', gameOn: document.documentElement.classList.contains('game-on') }));
      report(early.game === 'none' && !early.gameOn, `(c) reduced motion + #jogo: game ${early.game}, game-on ${early.gameOn}`);
      if (await formHead(page, report, '(c)')) {
        const pt = await headScreenPoint(page, 'centre');
        await page.mouse.click(pt.x, pt.y);
        const back = await page.waitForFunction(onNameAtRest, false, WAIT).then(() => true, () => false);
        await page.waitForTimeout(1000);
        const r = await page.evaluate(() => ({ game: window.__pf.game?.phase ?? 'none', gameOn: document.documentElement.classList.contains('game-on') }));
        report(back && r.game === 'none' && !r.gameOn, `(c) reduced motion, click on the head -> name ${back}, game ${r.game}, game-on ${r.gameOn}`);
      }
    } catch (err) {
      report(false, `(c) ${err.message.split('\n')[0]}`);
    }
    await finish(site, '(c)');
  }

  // (d) #jogo starts the game from the name; Esc returns to it (the phrase
  // pair is forced back even though the hero's pair cache already says
  // REST -> HOVER).
  {
    const site = await openSite('#jogo');
    const { page } = site;
    try {
      const played = await page
        .waitForFunction(() => window.__pf.game?.phase === 'play', null, WAIT)
        .then(() => true, () => false);
      const pair = await page.evaluate(() => {
        const { field } = window.__pf;
        return { a: field.indexA, bIsGame: field.phrases[field.indexB]?.game === true };
      });
      report(played && pair.a === 0 && pair.bIsGame, `(d) #jogo -> play ${played}, pair ${JSON.stringify(pair)} (REST -> GAME)`);
      await page.keyboard.press('Escape');
      const back = await page.waitForFunction(onNameAtRest, true, WAIT).then(() => true, () => false);
      const r = await page.evaluate(() => ({ phase: window.__pf.game.phase, gameOn: document.documentElement.classList.contains('game-on') }));
      report(back && r.phase === 'idle' && !r.gameOn, `(d) Esc -> name ${back}, phase ${r.phase}, game-on ${r.gameOn}`);
    } catch (err) {
      report(false, `(d) ${err.message.split('\n')[0]}`);
    }
    await finish(site, '(d)');
  }
  return failed;
}

// Part 3 helpers. Wraps the live game's update (main.js looks it up every
// frame) to count frames, time spent in the current phase, the camera at the
// last EXIT frame, and to keep meteors off the ship while `safe`, so a run
// only ends through debug.kill(). Also wraps field.update to measure, on the
// first frame drawn with debug.scoreFormed true, how many particles sit on
// their score text destinations (window.__g.formedAt, one entry per score).
function instrumentGame(page) {
  return page.evaluate(() => {
    const g = window.__pf.game;
    if (g.__checked) return;
    const { camera, field } = window.__pf;
    const log = (window.__g = { frames: 0, phase: g.phase, phaseT: 0, safe: true, exitZ: null, exitFov: null, formedAt: [], measured: false });
    const fieldUpdate = field.update;
    field.update = function (dt, elapsed) {
      fieldUpdate.call(field, dt, elapsed);
      if (g.phase !== 'score') {
        log.measured = false;
        return;
      }
      if (log.measured || !g.debug.scoreFormed || field.indexB !== field.scoreIndex) return;
      log.measured = true;
      const pos = field.readPositions();
      const tgt = field.targets[field.scoreIndex].image.data;
      const active = field.gameUniforms.uGameActive.value;
      let inActive = 0, inAll = 0;
      for (let i = 0; i < field.count; i++) {
        const d = Math.hypot(pos[4 * i] - tgt[4 * i], pos[4 * i + 1] - tgt[4 * i + 1], pos[4 * i + 2] - tgt[4 * i + 2]);
        if (d < 0.15) {
          inAll++;
          if (i < active) inActive++;
        }
      }
      log.formedAt.push({ active: inActive / active, all: inAll / field.count, phaseT: log.phaseT, morph: field.morph });
    };
    const update = g.update;
    g.update = function (dt, now) {
      const w = g.debug.world;
      if (log.safe && w && g.phase !== 'exit') for (const m of w.meteors) if (m.z > -25) m.x = 100;
      update.call(g, dt, now);
      log.frames++;
      if (g.phase !== log.phase) {
        log.phase = g.phase;
        log.phaseT = 0;
      } else log.phaseT += dt;
      if (g.phase === 'exit') {
        log.exitZ = camera.position.z;
        log.exitFov = camera.fov;
      }
    };
    g.__checked = true;
  });
}

const waitFrames = (page, n) =>
  page.evaluate((n) => window.__g.frames + n, n).then((until) =>
    page.waitForFunction((until) => window.__g.frames >= until, until, WAIT)
  );

// The hero's camera distance for the current viewport (main.js resize()).
const heroZFor = () => {
  const aspect = window.innerWidth / window.innerHeight;
  const t = Math.tan((50 * Math.PI) / 180 / 2);
  return Math.max(10 / 0.86 / (2 * t * aspect), (10 * 0.25) / 0.86 / (2 * t));
};

async function flowPart3() {
  const fs = require('fs');
  const path = require('path');
  let failed = false;
  const report = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
    if (!ok) failed = true;
  };
  const gameRequests = [];
  const site = await openSite('#nivel1', { viewport: { width: 1280, height: 720 } }, (page) =>
    page.on('request', (r) => {
      if (/\/game\/index/.test(r.url())) gameRequests.push(r.url());
    })
  );
  const { page } = site;
  fs.mkdirSync('shots', { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join('shots', `flow-${name}.png`) });
  const phase = () => page.evaluate(() => window.__pf.game?.phase ?? 'none');
  const waitPhase = (p) =>
    page.waitForFunction((p) => window.__pf.game?.phase === p, p, { ...WAIT, polling: 'raf' }).then(() => true, () => false);
  const away = () => page.mouse.move(20, 700); // off the name, so no hover
  const atRest = async (label) => {
    const back = await page.waitForFunction(onNameAtRest, true, WAIT).then(() => true, () => false);
    const r = await page.evaluate(() => ({
      phase: window.__pf.game.phase,
      scrollY: window.scrollY,
      gameOn: document.documentElement.classList.contains('game-on'),
      fov: window.__pf.camera.fov,
      langDisabled: document.querySelector('[data-lang-toggle]').disabled,
    }));
    report(back && r.phase === 'idle' && r.scrollY === 0 && !r.gameOn && r.fov === 50 && !r.langDisabled,
      `${label}: name ${back}, ${JSON.stringify(r)} (idle, scrollY 0, no game-on, fov 50, language toggle enabled)`);
  };
  const startFromName = async (label) => {
    await page.evaluate(() => window.__pf.game.start(0));
    const ok = await waitPhase('play');
    report(ok, `${label}: start() from idle -> play ${ok}`);
    return ok;
  };
  const killAndWait = async (p) => {
    await page.evaluate(() => window.__pf.game.debug.kill());
    return waitPhase(p);
  };
  const clickCentre = () => page.mouse.click(640, 360).then(away);

  try {
    console.log(`part 3 level ${await page.evaluate(() => window.__pf.state().level)}`);
    await page.waitForFunction(() => window.__pf.state().frames > 30, null, WAIT);
    report(gameRequests.length === 0, `(lazy) boot without #jogo: game module requests ${gameRequests.length} (0)`);

    // Start through the head, as a visitor does.
    if (!(await formHead(page, report, '(start)'))) throw new Error('head never formed');
    const pt = await headScreenPoint(page, 'centre');
    await page.mouse.click(pt.x, pt.y);
    await away();
    await page.waitForFunction(() => window.__pf.game, null, WAIT);
    await instrumentGame(page);
    const played = await waitPhase('play');
    report(played && gameRequests.length >= 1, `(lazy) click on the head -> play ${played}, game module requested ${gameRequests.length} time(s)`);
    await waitFrames(page, 10);
    await shot('play');

    // Language toggle during play.
    {
      const before = await page.evaluate(() => ({
        phase: window.__pf.game.phase,
        index: window.__pf.field.currentIndex,
        lang: document.documentElement.lang,
        text: document.querySelector('[data-lang-toggle]').textContent,
      }));
      await page.evaluate(() => document.querySelector('[data-lang-toggle]').click());
      await page.waitForTimeout(1200); // the crossfade would take 500 ms
      await waitFrames(page, 5);
      const after = await page.evaluate(() => ({
        phase: window.__pf.game.phase,
        index: window.__pf.field.currentIndex,
        lang: document.documentElement.lang,
        text: document.querySelector('[data-lang-toggle]').textContent,
        swapping: document.documentElement.classList.contains('lang-swapping'),
      }));
      report(after.phase === 'play' && after.index === before.index && after.lang === before.lang && after.text === before.text && !after.swapping,
        `(lang) toggle click in play: ${JSON.stringify(before)} -> ${JSON.stringify(after)} (unchanged, no swap)`);
    }

    // Viewport changes during play, then an exit at a new viewport.
    {
      const scaleOk = async (label) => {
        await waitFrames(page, 4);
        const r = await page.evaluate(() => {
          const { field, renderer, camera } = window.__pf;
          return {
            phase: window.__pf.game.phase,
            h: renderer.domElement.height,
            got: field.material.uniforms.uPixelScale.value,
            want: renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 180 / 2)),
            fov: camera.fov,
          };
        });
        report(r.phase === 'play' && Math.abs(r.got - r.want) < 0.001,
          `(resize) ${label}: phase ${r.phase}, canvas height ${r.h}, uPixelScale ${r.got.toFixed(4)} vs ${r.want.toFixed(4)} at fov ${r.fov.toFixed(2)}`);
      };
      await page.setViewportSize({ width: 390, height: 844 });
      await scaleOk('1280x720 -> 390x844');
      await page.setViewportSize({ width: 1280, height: 720 });
      await scaleOk('390x844 -> 1280x720');
      await page.setViewportSize({ width: 390, height: 844 });
      await scaleOk('1280x720 -> 390x844 again');
      await page.keyboard.press('Escape');
      await waitPhase('idle');
      await waitFrames(page, 0);
      await page.waitForTimeout(300);
      const heroZ = await page.evaluate(heroZFor);
      const r = await page.evaluate((heroZ) => {
        const { camera } = window.__pf;
        return { z: camera.position.z, fov: camera.fov, heroZ, exitZ: window.__g.exitZ, exitFov: window.__g.exitFov };
      }, heroZ);
      report(Math.abs(r.z - r.heroZ) < 1e-6 && r.fov === 50,
        `(resize) idle after exit at 390x844: camera z ${r.z.toFixed(4)}, hero z ${r.heroZ.toFixed(4)}, fov ${r.fov}`);
      report(Math.abs(r.exitZ - r.heroZ) < r.heroZ * 0.01,
        `(resize) last exit frame lands on the new hero pose: z ${r.exitZ.toFixed(4)} vs ${r.heroZ.toFixed(4)} (1%), fov ${r.exitFov.toFixed(2)}`);
      await page.setViewportSize({ width: 1280, height: 720 });
      await away();
      await atRest('(resize) back to 1280x720');
    }

    // Mashing everything, three full cycles.
    for (let c = 1; c <= 3; c++) {
      const L = `(mash ${c})`;
      // A fresh start() after idle: the controls are attached again.
      if (!(await startFromName(`${L} a`))) throw new Error('no play');
      const x0 = await page.evaluate(() => window.__pf.game.debug.world.ship.x);
      await page.keyboard.down('ArrowRight');
      const moved = await page
        .waitForFunction((x0) => window.__pf.game.debug.world.ship.x > x0 + 1, x0, WAIT)
        .then(() => true, () => false);
      await page.keyboard.up('ArrowRight');
      report(moved, `${L} a: ArrowRight moves the ship (keys attached again)`);

      // kill() and Esc in the same task.
      const r1 = await page.evaluate(() => {
        const g = window.__pf.game;
        g.debug.kill();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return g.phase;
      });
      report(r1 === 'exit', `${L} b: kill() then Esc at once -> ${r1}`);
      await waitPhase('idle');
      await away();
      await atRest(`${L} b`);

      // Two clicks right after the explosion; neither restarts.
      if (!(await startFromName(`${L} c`))) throw new Error('no play');
      await page.evaluate(() => (window.__g.formedAt.length = 0));
      await killAndWait('dying');
      if (c === 1) await shot('dying');
      await clickCentre();
      await clickCentre();
      const pd = await phase();
      const formed = await page
        .waitForFunction(() => window.__pf.game.debug.scoreFormed, null, { ...WAIT, polling: 'raf' })
        .then(() => true, () => false);
      const pf = await phase();
      report(pd === 'dying' && formed && pf === 'score', `${L} c: two clicks in dying -> ${pd}; score formed ${formed}, phase ${pf} (no restart)`);
      // The click gate opens only once the time is readable: on the first frame
      // drawn with scoreFormed, 95% of the particles are on their text
      // destinations (within 0.15 world units).
      {
        const m = await page
          .waitForFunction(() => window.__g.formedAt[0], null, WAIT)
          .then((h) => h.jsonValue(), () => null);
        const pct = (v) => `${(v * 100).toFixed(1)}%`;
        report(m && m.active >= 0.95 && m.all >= 0.95,
          `${L} c: score text formed when the click opens: ${m ? `${pct(m.active)} of active, ${pct(m.all)} of all particles within 0.15 of their targets, ${m.phaseT.toFixed(2)} s into score, morph ${m.morph}` : 'not measured'} (>= 95%)`);
      }

      // Two clicks in the same frame once the score formed: one restart.
      await page.waitForFunction(() => window.__g.phase === 'score' && window.__g.phaseT >= 1.75, null, { ...WAIT, polling: 'raf' });
      if (c === 1) {
        // The capture of the score, its text landed (the click gate waits
        // for that too: see the check right after (c)).
        await page.waitForFunction(() => window.__g.phaseT >= 3.5, null, { ...WAIT, polling: 'raf' });
        await shot('score');
      }
      const r2 = await page.evaluate(() => {
        const g = window.__pf.game;
        const down = () =>
          document.getElementById('scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360, button: 0, bubbles: true }));
        down();
        const w1 = g.debug.world;
        const p1 = g.phase;
        down();
        return { p1, p2: g.phase, same: g.debug.world === w1, t: w1.t };
      });
      report(r2.p1 === 'enter' && r2.p2 === 'enter' && r2.same && r2.t === 0,
        `${L} d: two clicks in one frame after the score -> ${r2.p1}, ${r2.p2}, one fresh world ${r2.same}`);

      // Esc during dying, twice.
      await waitPhase('play');
      await killAndWait('dying');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      const pe = await phase();
      report(pe === 'exit', `${L} e: Esc twice in dying -> ${pe}`);
      await waitPhase('idle');
      await atRest(`${L} e`);

      // Esc while the score is forming.
      if (!(await startFromName(`${L} f`))) throw new Error('no play');
      await page.evaluate(() => window.__pf.game.debug.kill());
      const forming = await page
        .waitForFunction(() => {
          const { game, field } = window.__pf;
          return game.phase === 'score' && field.indexB === field.scoreIndex && field.morph < 1 && !game.debug.scoreFormed;
        }, null, { ...WAIT, polling: 'raf' })
        .then(() => true, () => false);
      await page.keyboard.press('Escape');
      const pf2 = await phase();
      report(forming && pf2 === 'exit', `${L} f: Esc while the score forms (caught ${forming}) -> ${pf2}`);
      await waitPhase('idle');
      await atRest(`${L} f`);

      // A click while the score text is still being built (setPhrase held).
      if (!(await startFromName(`${L} g`))) throw new Error('no play');
      await page.evaluate(() => {
        const { field } = window.__pf;
        const real = Object.getPrototypeOf(field).setPhrase;
        window.__held = new Promise((r) => (window.__release = r));
        field.setPhrase = async function (i, text) {
          await window.__held;
          return real.call(this, i, text);
        };
      });
      try {
        await killAndWait('score');
        await page.waitForFunction(() => window.__g.phase === 'score' && window.__g.phaseT >= 1.8, null, { ...WAIT, polling: 'raf' });
        await clickCentre();
        await page.waitForFunction(() => window.__g.phaseT >= 2.1, null, { ...WAIT, polling: 'raf' });
        const r3 = await page.evaluate(() => ({ phase: window.__pf.game.phase, b: window.__pf.field.indexB, score: window.__pf.field.scoreIndex }));
        report(r3.phase === 'score' && r3.b !== r3.score, `${L} g: click while the score text is pending -> ${r3.phase}, pair B ${r3.b} (not ${r3.score})`);
        await page.evaluate(() => window.__release());
        const ok = await page
          .waitForFunction(() => window.__pf.game.debug.scoreFormed, null, { ...WAIT, polling: 'raf' })
          .then(() => true, () => false);
        await clickCentre();
        const pg = await phase();
        report(ok && pg === 'enter', `${L} g: score formed ${ok}, click -> ${pg}`);
      } finally {
        await page.evaluate(() => {
          window.__release?.();
          delete window.__pf.field.setPhrase;
        });
      }
      await page.keyboard.press('Escape');
      await waitPhase('idle');
      await atRest(`${L} end of cycle`);
    }

    // Scrolling after the game works as before.
    {
      await page.mouse.move(640, 600);
      const y0 = await page.evaluate(() => window.scrollY);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(150);
      }
      const reached = await page
        .waitForFunction(() => window.__pf.state().chainShown >= 1 && document.querySelector('.work .reveal.is-in'), null, WAIT)
        .then(() => true, () => false);
      const r = await page.evaluate(() => ({ y: window.scrollY, chain: window.__pf.state().chainShown, pair: window.__pf.state().pair }));
      report(r.y > y0 && reached, `(scroll) after the game: scrollY ${y0} -> ${r.y}, chainShown ${r.chain}, pair ${r.pair}, WORK revealed ${reached}`);
    }
  } catch (err) {
    report(false, `(part 3) ${err.message.split('\n')[0]}`);
  }
  if (site.errors.length) report(false, `(part 3) console errors:\n  ${site.errors.join('\n  ')}`);
  else report(true, '(part 3) no console errors');
  await site.browser.close();
  return failed;
}

// Part 4: a portrait phone (390x844). (abort) Esc while the first start
// compiles the game's programs leaves the hero as it was. (focus) The game
// enters with the focus on the "×", the page inert; its hit area is 44 px.
// (corridor) With the pointer at either screen edge the ship's centre stays
// on screen, and meteors aimed at it arrive on screen. (keys) Space restarts
// from the score; Shift+Tab mid-game neither scrolls the locked page nor
// freezes the game; Enter on the "×" exits; the focus comes back after the
// game (to the language toggle too, which the game disables).
async function flowPart4() {
  const fs = require('fs');
  const path = require('path');
  let failed = false;
  const report = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
    if (!ok) failed = true;
  };
  const W = 390, H = 844;
  const site = await openSite('#nivel1', { viewport: { width: W, height: H } });
  const { page } = site;
  const SHORT = { timeout: 60000, polling: 'raf' };
  fs.mkdirSync('shots', { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join('shots', `flow-${name}.png`) });
  const waitPhase = (p, opts = SHORT) =>
    page.waitForFunction((p) => window.__pf.game?.phase === p, p, opts).then(() => true, () => false);
  const away = () => page.mouse.move(W / 2, H - 40);
  const focusInfo = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return {
        focus: a === document.body ? 'body' : a?.matches?.('[data-game-exit]') ? 'exit' : a?.matches?.('[data-lang-toggle]') ? 'lang' : a?.tagName,
        mainInert: document.querySelector('main').inert,
        overlayInert: document.querySelector('.overlay').inert,
        gameOn: document.documentElement.classList.contains('game-on'),
        scrollY: window.scrollY,
        phase: window.__pf.game?.phase ?? 'none',
      };
    });
  const formHeadHere = async (label) => {
    if (await page.evaluate(headFormed)) return true;
    await page.mouse.click(W / 2, H / 2); // the name, at the centre
    await away();
    const ok = await page.waitForFunction(headFormed, null, WAIT).then(() => true, () => false);
    report(ok, `${label}: click on the name -> head formed`);
    return ok;
  };
  const clickHead = async () => {
    const pt = await headScreenPoint(page, 'centre');
    await page.mouse.click(pt.x, pt.y);
    await away();
  };
  // The ship's centre (or any world point) in NDC through the live camera.
  const ndcOf = (p) =>
    page.evaluate((p) => {
      const { camera } = window.__pf;
      const v = camera.position.clone().set(p.x, p.y, p.z).project(camera);
      return { x: v.x, y: v.y };
    }, p);
  const settleShip = async (side) => {
    await page.mouse.move(side < 0 ? 0 : W - 0.5, H / 2);
    await waitFrames(page, 30);
    await page.waitForFunction(() => {
      const s = window.__pf.game.debug.world.ship;
      return Math.abs(s.vx) < 0.02 && Math.abs(s.vy) < 0.02;
    }, null, SHORT);
    const ship = await page.evaluate(() => {
      const w = window.__pf.game.debug.world;
      return { x: w.ship.x, y: w.ship.y, z: 0, corridor: w.corridor ?? null };
    });
    return { ship, ndc: await ndcOf(ship) };
  };

  try {
    console.log(`part 4 level ${await page.evaluate(() => window.__pf.state().level)}, viewport ${W}x${H}`);
    await page.waitForFunction(() => window.__pf.state().frames > 30, null, WAIT);

    // (abort) The first start waits for the game's programs; hold that wait.
    await page.evaluate(() => {
      const { field } = window.__pf;
      const real = Object.getPrototypeOf(field).loadGameShaders;
      window.__compileHeld = new Promise((r) => (window.__compileRelease = r));
      field.loadGameShaders = async function (build) {
        await window.__compileHeld;
        return real.call(this, build);
      };
    });
    try {
      if (!(await formHeadHere('(abort)'))) throw new Error('head never formed');
      const heroState = () =>
        page.evaluate(() => {
          const { field, state } = window.__pf;
          const s = state();
          window.__heroVel ??= field.velVar.material;
          window.__heroPoints ??= field.points.material;
          return {
            headOn: s.headOn,
            morphT: s.morphT,
            pair: s.pair,
            heroPrograms: field.velVar.material === window.__heroVel && field.points.material === window.__heroPoints,
            gameOn: document.documentElement.classList.contains('game-on'),
            mainInert: document.querySelector('main').inert,
            langDisabled: document.querySelector('[data-lang-toggle]').disabled,
          };
        });
      const before = await heroState();
      await clickHead();
      const waiting = await page.waitForFunction(() => window.__pf.game, null, WAIT).then(() => true, () => false);
      await page.waitForTimeout(300); // start() is now held in its compile wait
      const held = await page.evaluate(() => ({ phase: window.__pf.game?.phase, starting: window.__pf.game?.starting }));
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.__compileRelease());
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => window.__pf.state().frames > 0, null, WAIT);
      const after = { ...(await heroState()), phase: await page.evaluate(() => window.__pf.game.phase) };
      report(waiting && after.phase === 'idle' && !after.gameOn && !after.mainInert && after.headOn === before.headOn &&
          after.morphT === before.morphT && after.pair === before.pair && after.heroPrograms && !after.langDisabled,
        `(abort) Esc during the first compile wait (held: ${JSON.stringify(held)}): before ${JSON.stringify(before)}, after ${JSON.stringify(after)} (idle, hero untouched)`);
    } finally {
      await page.evaluate(() => {
        window.__compileRelease?.();
        delete window.__pf.field.loadGameShaders;
      });
    }
    if ((await page.evaluate(() => window.__pf.game?.phase)) !== 'idle') {
      await page.keyboard.press('Escape');
      await waitPhase('idle', WAIT);
    }

    // (focus) A real start through the head.
    if (!(await formHeadHere('(focus)'))) throw new Error('head never formed');
    await clickHead();
    const played = await waitPhase('play', WAIT);
    await instrumentGame(page);
    const f0 = await focusInfo();
    report(played && f0.focus === 'exit' && f0.mainInert && f0.overlayInert && f0.scrollY === 0,
      `(focus) game entered: ${JSON.stringify(f0)} (focus on the "×", main and .overlay inert)`);
    {
      const hit = await page.evaluate(() => {
        const b = document.querySelector('[data-game-exit]');
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const at = (dx, dy) => document.elementFromPoint(cx + dx, cy + dy) === b;
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), edges: [at(-21, 0), at(21, 0), at(0, -21), at(0, 21), at(-21, -21), at(21, 21)] };
      });
      report(hit.edges.every(Boolean) && hit.w < 44 && hit.h < 44,
        `(focus) "×" box ${hit.w}x${hit.h} px (unchanged look), hits at +-21 px from its centre ${JSON.stringify(hit.edges)} (44 x 44 target)`);
    }

    // (corridor) The pointer at the screen's left and right edges.
    for (const side of [-1, 1]) {
      const r = await settleShip(side);
      report(Math.abs(r.ndc.x) <= 1 && Math.abs(r.ndc.y) <= 1,
        `(corridor) pointer at the ${side < 0 ? 'left' : 'right'} edge: ship x ${r.ship.x.toFixed(3)} (corridor ${JSON.stringify(r.ship.corridor)}), centre at NDC (${r.ndc.x.toFixed(3)}, ${r.ndc.y.toFixed(3)}) (within +-1)`);
      if (side > 0) await shot('portrait-edge');
    }

    // (corridor) Meteors aimed at the ship (at the right edge), spread across
    // the aim's +-0.9, measured as they reach the ship's depth (z >= -1).
    {
      const r = await page.evaluate(async () => {
        const g = window.__pf.game;
        const w = g.debug.world;
        const mod = await import('/src/game/world.js');
        const slots = [0, 1, 2];
        const offsets = [0, 0.5, 1]; // rng for the aim: -0.9, 0, +0.9
        const placed = [];
        for (let i = 0; i < slots.length; i++) {
          const m = w.meteors[slots[i]];
          if (mod.spawnMeteor) {
            const seq = [0, 0.1, offsets[i], 0.5, 0.3, 0.5, 0];
            let k = 0;
            mod.spawnMeteor(w, () => seq[k++], slots[i], false);
          } else {
            // Before the change: no spawnMeteor; the old aim had no clamp.
            m.x = w.ship.x + (offsets[i] - 0.5) * 1.8;
            m.y = w.ship.y;
            m.R = 0.5 + 0.3 * 0.95;
          }
          m.z = m.prevZ = -40;
          placed.push({ x: m.x, y: m.y });
        }
        window.__g.safe = false;
        window.__near = [];
        const { camera } = window.__pf;
        const update = g.update;
        g.update = function (dt, now) {
          for (let s = 0; s < w.meteors.length; s++) if (!slots.includes(s) && w.meteors[s].z > -25) w.meteors[s].x = 100;
          update.call(g, dt, now);
          for (const s of slots) {
            const m = w.meteors[s];
            if (window.__near[s] || m.z < -1 || m.z > 5) continue;
            const v = camera.position.clone().set(m.x, m.y, m.z).project(camera);
            window.__near[s] = { x: +m.x.toFixed(3), z: +m.z.toFixed(2), ndcX: +v.x.toFixed(3), ndcY: +v.y.toFixed(3) };
          }
        };
        window.__restoreUpdate = () => (g.update = update);
        return { placed, spawn: !!mod.spawnMeteor, ship: { x: w.ship.x, y: w.ship.y } };
      });
      const got = await page
        .waitForFunction(() => [0, 1, 2].every((s) => window.__near[s]), null, SHORT)
        .then(() => true, () => false);
      const near = await page.evaluate(() => window.__near);
      await page.evaluate(() => window.__restoreUpdate());
      const ok = got && near.every((n) => Math.abs(n.ndcX) <= 1 && Math.abs(n.ndcY) <= 1);
      report(ok, `(corridor) aimed meteors (${r.spawn ? 'spawnMeteor' : 'old aim'}, ship x ${r.ship.x.toFixed(2)}) at the ship's depth: ${JSON.stringify(near)} (NDC within +-1)`);
    }

    // (keys) The meteors ended the run. Space restarts once the score formed.
    if (await page.evaluate(() => window.__pf.game.phase === 'play')) await page.evaluate(() => window.__pf.game.debug.kill());
    await waitPhase('score', WAIT);
    await page.evaluate(() => (window.__g.safe = true));
    await page.waitForFunction(() => window.__pf.game.debug.scoreFormed, null, WAIT);
    {
      const fa = await focusInfo();
      await page.keyboard.press('Space');
      await waitFrames(page, 2);
      const fb = await focusInfo();
      report(fa.focus === 'body' && fb.phase === 'enter' && fb.scrollY === 0,
        `(keys) score formed, focus ${fa.focus} (released at the crash); Space -> ${fb.phase}, scrollY ${fb.scrollY} (enter, 0)`);
      if (fb.phase === 'score') await page.mouse.click(W / 2, H / 2).then(away); // restart anyway
    }

    // (focus) Shift+Tab, then Tab twice, mid-game.
    {
      await waitPhase('play', WAIT);
      const t0 = await page.evaluate(() => window.__pf.game.debug.world.t);
      await page.keyboard.press('Shift+Tab');
      await waitFrames(page, 3);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      const advancing = await page
        .waitForFunction((t0) => window.__pf.game.debug.world.t > t0 + 1, t0, SHORT)
        .then(() => true, () => false);
      const f = await focusInfo();
      const t1 = await page.evaluate(() => window.__pf.game.debug.world.t);
      report(advancing && f.scrollY === 0 && f.phase === 'play' && f.mainInert && f.focus === 'exit',
        `(focus) Shift+Tab mid-game: ${JSON.stringify(f)}, game time ${t0.toFixed(2)} -> ${t1.toFixed(2)} s (scrollY 0, still playing, main inert, focus on the "×")`);
    }

    // (keys) Enter on the "×" in the score: it exits, it does not restart.
    {
      await page.evaluate(() => window.__pf.game.debug.kill());
      await waitPhase('score', WAIT);
      await page.waitForFunction(() => window.__pf.game.debug.scoreFormed, null, WAIT);
      await page.evaluate(() => document.querySelector('[data-game-exit]').focus());
      await page.keyboard.press('Enter');
      await waitFrames(page, 0).catch(() => {});
      const p = await page.evaluate(() => window.__pf.game.phase);
      report(p === 'exit', `(keys) Enter with the focus on the "×" in the score -> ${p} (exit, not a restart)`);
      if (p !== 'exit') await page.keyboard.press('Escape');
    }

    // (focus) After the exit: the page is the page again.
    {
      const idle = await waitPhase('idle', SHORT);
      await page.waitForFunction(onNameAtRest, true, WAIT).catch(() => {});
      const f = await focusInfo();
      report(idle && !f.gameOn && !f.mainInert && !f.overlayInert && f.focus === 'body',
        `(focus) after the exit: ${JSON.stringify(f)} (idle, no game-on, not inert, focus back on body)`);
      await page.mouse.move(W / 2, H - 100);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(150);
      }
      const y = await page.evaluate(() => window.scrollY);
      report(y > 0, `(focus) after the exit the page scrolls: scrollY ${y}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.__pf.state().chainShown === 0 && window.scrollY === 0, null, WAIT);
    }

    // (focus) A game started with the focus on the language toggle (disabled
    // for the game) gives it back, enabled, after Esc.
    {
      await page.waitForFunction(onNameAtRest, false, WAIT);
      await page.evaluate(() => document.querySelector('[data-lang-toggle]').focus());
      await page.evaluate(() => window.__pf.game.start(0));
      const ok = await waitPhase('play', WAIT);
      const during = await focusInfo();
      await page.keyboard.press('Escape');
      const idle = await waitPhase('idle', SHORT);
      const f = await focusInfo();
      const enabled = await page.evaluate(() => !document.querySelector('[data-lang-toggle]').disabled);
      report(ok && during.focus === 'exit' && idle && f.focus === 'lang' && enabled && f.scrollY === 0,
        `(focus) language toggle focused before the game: during ${during.focus}, after Esc ${f.focus}, enabled ${enabled}, scrollY ${f.scrollY}`);
    }
  } catch (err) {
    report(false, `(part 4) ${err.message.split('\n')[0]}`);
  }
  if (site.errors.length) report(false, `(part 4) console errors:\n  ${site.errors.join('\n  ')}`);
  else report(true, '(part 4) no console errors');
  await site.browser.close();
  return failed;
}

async function flow() {
  const failed1 = await flowPart1();
  const failed2 = await flowPart2();
  const failed3 = await flowPart3();
  const failed4 = await flowPart4();
  const failed5 = await probeCheck();
  return failed1 || failed2 || failed3 || failed4 || failed5;
}

async function flowPart1() {
  const { browser, page, errors } = await openSite();
  let failed = false;
  try {
    const r = await page.evaluate(flowInPage);
    console.log(`level ${r.level}`);
    for (const n of r.notes) {
      console.log(`${n.ok ? 'PASS' : 'FAIL'} ${n.text}`);
      if (!n.ok) failed = true;
    }
    const want = ['idle', 'enter', 'play', 'dying', 'score', 'enter', 'exit', 'idle'];
    const ok = JSON.stringify(r.phases) === JSON.stringify(want);
    console.log(`${ok ? 'PASS' : 'FAIL'} phases ${r.phases.join(' > ')}`);
    if (!ok) failed = true;
  } catch (err) {
    console.log(`FAIL ${err.message.split('\n')[0]}`);
    failed = true;
  }
  if (errors.length) {
    console.log(`FAIL console errors:\n  ${errors.join('\n  ')}`);
    failed = true;
  }
  await browser.close();
  return failed;
}

// The frame probe is switched off while a game runs; after the game it must be
// back on (when the level is above 1), or the quality could never drop again.
// SwiftShader is always level 1, so the check poses as a discrete GPU.
async function probeCheck() {
  let failed = false;
  const report = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
    if (!ok) failed = true;
  };
  // Two cores make it level 2, the cheapest level above software rendering.
  const { browser, page, errors } = await openSite('#jogo', { viewport: { width: 800, height: 450 } }, (pg) =>
    pg.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 });
      for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!C) continue;
        const real = C.prototype.getParameter;
        C.prototype.getParameter = function (p) {
          return p === 0x9246 ? 'NVIDIA GeForce RTX (probe check)' : real.call(this, p);
        };
      }
    })
  );
  try {
    const wait = (fn, arg) => page.waitForFunction(fn, arg, WAIT).then(() => true, () => false);
    const level = await page.evaluate(() => window.__pf.state().level);
    report(level > 1, `(probe) posing as a discrete GPU: level ${level} (above 1)`);
    const played = await wait(() => window.__pf.game?.phase === 'play');
    report(played, '(probe) #jogo -> play');
    const during = await page.evaluate(() => window.__pf.state().probing);
    report(during === false, `(probe) probing during the game ${during} (false)`);
    await page.keyboard.press('Escape');
    const idle = await wait(() => window.__pf.game.phase === 'idle');
    const after = await page.evaluate(() => window.__pf.state());
    report(idle && after.probing === after.level > 1,
      `(probe) after the exit: probing ${after.probing} at level ${after.level} (on when level > 1)`);
  } catch (err) {
    report(false, err.message.split('\n')[0]);
  }
  if (errors.length) report(false, `(probe) console errors:\n  ${errors.join('\n  ')}`);
  await browser.close();
  return failed;
}

// Hero cost: the average frame time of the live hero at #nivel1 (3 s warm-up,
// 10 s measured) on this branch and on main, alternating the builds. Software
// rendering is noisy, so the verdict compares medians and reports the spread.
//   MAIN_BASE (default http://localhost:5198) serves a `git worktree` of main.
//   BENCH_RUNS (default 4, at least 3) measured runs per build.
async function benchRun(base) {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${base}/#nivel1`);
    await page.waitForFunction(() => window.__pf && window.__pf.state().frames > 2, null, { timeout: 300000, polling: 500 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const f0 = window.__pf.state().frames;
          const t0 = performance.now();
          setTimeout(() => {
            const f1 = window.__pf.state().frames;
            resolve({ frames: f1 - f0, ms: performance.now() - t0 });
          }, 10000);
        })
    );
    return r.ms / r.frames;
  } finally {
    await browser.close();
  }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The game's particle budget per level: 25000, 40000, 70000 active. The count is
// rounded down to whole streaks (10 points each), so it may sit up to 9 below
// the table (budget.test.js allows the same).
async function budgetCheck() {
  let failed = false;
  const want = { 1: 25000, 2: 40000, 3: 70000 };
  for (const lvl of [1, 2, 3]) {
    const { browser, page } = await openSite(`#nivel${lvl}-jogo`);
    const got = await page
      .waitForFunction(() => window.__pf.field.gameBudget?.active ?? false, null, WAIT)
      .then((h) => h.jsonValue(), () => null);
    const ok = got !== null && got <= want[lvl] && want[lvl] - got <= 9;
    console.log(`${ok ? 'PASS' : 'FAIL'} level ${lvl}: game budget active ${got} (${want[lvl]}, up to 9 below)`);
    if (!ok) failed = true;
    await browser.close();
  }
  return failed;
}

// Exit codes: 0 pass, 1 fail, 3 inconclusive (the margin to the criterion is
// inside the run-to-run noise). The order alternates every iteration and one
// warm-up run per build is discarded, so neither build gets the warm machine.
async function bench() {
  const runs = Math.max(3, +(process.env.BENCH_RUNS || 4));
  const mainBase = process.env.MAIN_BASE || 'http://localhost:5198';
  const builds = { branch: BASE, main: mainBase };
  await benchRun(builds.branch);
  await benchRun(builds.main);
  console.log('warm-up runs discarded (one per build)');
  const times = { branch: [], main: [] };
  for (let i = 0; i < runs; i++) {
    const order = i % 2 ? ['main', 'branch'] : ['branch', 'main'];
    for (const k of order) times[k].push(await benchRun(builds[k]));
    console.log(
      `run ${i + 1} (${order.join(' then ')}): branch ${times.branch[i].toFixed(1)} ms/frame, main ${times.main[i].toFixed(1)} ms/frame`
    );
  }
  const mb = median(times.branch);
  const mm = median(times.main);
  const ratio = mb / mm;
  const spread = (a) => (Math.max(...a) - Math.min(...a)) / median(a);
  console.log(`branch median ${mb.toFixed(2)} ms  runs ${times.branch.map((v) => v.toFixed(1)).join(', ')}  spread ${(spread(times.branch) * 100).toFixed(1)}%`);
  console.log(`main   median ${mm.toFixed(2)} ms  runs ${times.main.map((v) => v.toFixed(1)).join(', ')}  spread ${(spread(times.main) * 100).toFixed(1)}%`);
  console.log(`ratio branch/main ${ratio.toFixed(3)} (criterion <= 1.10)`);
  const noise = Math.max(spread(times.branch), spread(times.main));
  const margin = Math.abs(1.1 - ratio);
  const note = `margin ${(margin * 100).toFixed(1)}%, spread ${(noise * 100).toFixed(1)}%`;
  let code = 0;
  if (margin <= noise) {
    console.log(`INCONCLUSIVE (within noise: ${note})`);
    code = 3;
  } else if (ratio <= 1.1) console.log(`PASS hero cost within +10% (${note})`);
  else {
    console.log(`FAIL hero cost above +10% (${note})`);
    code = 1;
  }
  const budgetFailed = await budgetCheck();
  return code || (budgetFailed ? 1 : 0);
}

// Runs in the page. The hero's velocity, position and points programs must be
// the hero's own (no game code, uniforms or samplers) at load and again after
// a game round trip; the game's variants are only in place during a game.
async function heroProgramsInPage() {
  const { field, renderer, camera, post, state } = window.__pf;
  renderer.setAnimationLoop(null);
  const GAME_MARKS = ['uGame', 'gameGoal', 'uGameLocal'];
  const programs = () => {
    const mats = { velocity: field.velVar.material, position: field.posVar.material, points: field.points.material };
    const out = {};
    for (const [k, m] of Object.entries(mats)) {
      const src = k === 'points' ? m.vertexShader : m.fragmentShader;
      out[k] = {
        src,
        entries: Object.keys(m.uniforms).length,
        samplers: (src.match(/uniform\s+sampler2D/g) || []).length,
        game: GAME_MARKS.filter((s) => src.includes(s)),
      };
    }
    return out;
  };
  const out = { level: state().level, notes: [] };
  const note = (ok, text) => out.notes.push({ ok, text });

  const atLoad = programs();
  for (const [k, p] of Object.entries(atLoad)) {
    note(p.game.length === 0, `at load: ${k} has no game code (found ${JSON.stringify(p.game)})`);
  }

  const { createGame } = await import('/src/game/index.js');
  const REST = 0;
  const GAME = field.gameIndex;
  const SCORE = field.scoreIndex;
  const heroZ = camera.position.z;
  let exitedPrograms = null;
  const game = createGame({
    field,
    camera,
    renderer,
    indices: { REST, GAME, SCORE },
    level: () => state().level,
    lang: () => 'en',
    heroPose: () => ({ px: 0, py: 0, pz: heroZ }),
    hooks: {
      onEnter() {},
      // The hero takes over in onExited: its programs must be back by then.
      onExited: () => (exitedPrograms = programs()),
      onRunEnd() {},
    },
  });
  const DT = 1 / 60;
  let now = 0, elapsed = 0;
  const run = async (done, max) => {
    for (let f = 0; f < max && !done(); f++) {
      now += DT * 1000;
      elapsed += DT;
      game.update(DT, now);
      field.update(DT, elapsed);
      await new Promise((r) => setTimeout(r, 0));
    }
    return done();
  };

  const t0 = performance.now();
  await game.start(REST);
  out.startMs = performance.now() - t0;
  const during = programs();
  for (const k of ['velocity', 'position', 'points']) {
    note(during[k].src.includes('gameGoal') || during[k].src.includes('uGame'), `during the game: ${k} runs the game variant`);
  }
  // start() compiled them: the first game frame links no new program.
  const before = renderer.info.programs.length;
  game.update(DT, (now += DT * 1000));
  field.update(DT, (elapsed += DT));
  post.render(DT, elapsed);
  const after = renderer.info.programs.length;
  note(after === before, `first game frame: programs ${before} -> ${after} (no compile on the frame)`);
  await run(() => game.phase === 'play', 300);
  note(game.phase === 'play', `game reached ${game.phase} (play)`);
  game.requestExit();
  await run(() => game.phase === 'idle', 400);
  note(game.phase === 'idle', `after the exit -> ${game.phase} (idle)`);

  for (const [label, p] of [['in onExited', exitedPrograms], ['after the exit', programs()]]) {
    if (!p) {
      note(false, `${label}: onExited was not called`);
      continue;
    }
    for (const k of ['velocity', 'position', 'points']) {
      const a = atLoad[k], b = p[k];
      note(
        b.src === a.src && b.entries === a.entries && b.samplers === a.samplers,
        `${label}: ${k} source identical to load ${b.src === a.src}, uniform entries ${b.entries} (${a.entries}), samplers ${b.samplers} (${a.samplers})`
      );
    }
  }
  return out;
}

async function heroPrograms() {
  const { browser, page, errors } = await openSite();
  let failed = false;
  try {
    const r = await page.evaluate(heroProgramsInPage);
    console.log(`level ${r.level}; game start (shader load and compile) ${r.startMs.toFixed(0)} ms`);
    for (const n of r.notes) {
      console.log(`${n.ok ? 'PASS' : 'FAIL'} ${n.text}`);
      if (!n.ok) failed = true;
    }
  } catch (err) {
    console.log(`FAIL ${err.message.split('\n')[0]}`);
    failed = true;
  }
  if (errors.length) {
    console.log(`FAIL console errors:\n  ${errors.join('\n  ')}`);
    failed = true;
  }
  await browser.close();
  return failed;
}

// After the ship blows up, the particles that sit outside the game's budget
// (parked: they hold still, hidden, while the game runs) must not come back
// into view in the head's shape on the way to the score. Started from the head,
// they were frozen exactly there; once the score phase blended the look back to
// the hero's they showed as a head for about two seconds before the morph moved
// them. Measured at the first frames where they are drawn at 15% and at 50%.
async function headLeak() {
  const { browser, page, errors } = await openSite('#nivel1');
  let failed = false;
  const report = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
    if (!ok) failed = true;
  };
  try {
    if (await formHead(page, report, 'head')) {
      const pt = await headScreenPoint(page, 'centre');
      await page.mouse.click(pt.x, pt.y);
      await page.waitForFunction(() => window.__pf.game?.phase === 'play', null, WAIT);
      await page.waitForTimeout(1500);
      const marks = await page.evaluate(
        (HEAD) =>
          new Promise((resolve, reject) => {
            const { field, game } = window.__pf;
            const N = field.size * field.size;
            const active = field.gameBudget.active;
            const head = field.targets[HEAD].image.data;
            // Share of the parked particles within 0.4 of their place in the head.
            const nearHead = () => {
              const pos = field.readPositions();
              let near = 0;
              for (let i = active; i < N; i++) {
                const d = Math.hypot(pos[i * 4] - head[i * 4], pos[i * 4 + 1] - head[i * 4 + 1], pos[i * 4 + 2] - head[i * 4 + 2]);
                if (d < 0.4) near++;
              }
              return near / (N - active);
            };
            const pending = [0.85, 0.5]; // gameLook values; the parked are drawn at 1 - look
            const out = [];
            const giveUp = setTimeout(() => reject(new Error('the score phase never reached the marks')), 170000);
            game.debug.kill();
            const tick = () => {
              if (game.phase === 'score') {
                const look = field.gameLook.value;
                while (pending.length && look < pending[0]) out.push({ drawn: +(1 - pending.shift()).toFixed(2), nearHead: nearHead() });
                if (!pending.length) {
                  clearTimeout(giveUp);
                  return resolve(out);
                }
              }
              requestAnimationFrame(tick);
            };
            tick();
          }),
        HEAD
      );
      for (const m of marks) {
        report(m.nearHead < 0.1, `parked particles drawn at ${(m.drawn * 100).toFixed(0)}%: ${(m.nearHead * 100).toFixed(1)}% in the head's shape (< 10%)`);
      }
      report(marks.length === 2, `both marks measured (${marks.length})`);
    }
  } catch (err) {
    report(false, err.message.split('\n')[0]);
  }
  if (errors.length) report(false, `console errors:\n  ${errors.join('\n  ')}`);
  await browser.close();
  return failed;
}

// The ranking on the score screen. There is no Redis here, so /api/rank is
// answered by the page's own routes: the place comes in the score text, the
// time alone shows when the server fails or is too slow, and only a crash is a
// play (leaving with Esc while the ship is alive sends nothing).
async function rankCheck() {
  let failed = false;
  const report = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
    if (!ok) failed = true;
  };
  const SCORE_TEXT = () => {
    const f = window.__pf.field;
    return f.phrases[f.scoreIndex];
  };

  // One play: the answer `answer(route)` is given to the request, the ship is
  // crashed, and the score text is read once it has been built.
  async function play(label, answer, { crash = true } = {}) {
    const sent = [];
    const { browser, page, errors } = await openSite(`#jogo-nivel${process.env.RANK_LEVEL || 1}`, {}, (p) =>
      p.route('**/api/rank', async (route) => {
        sent.push({ method: route.request().method(), body: route.request().postData() });
        await answer(route);
      })
    );
    let text = null;
    try {
      await page.waitForFunction(() => window.__pf.game?.phase === 'play', null, WAIT);
      if (crash) {
        await page.evaluate(() => window.__pf.game.debug.kill());
        await page.waitForFunction(() => window.__pf.game.phase === 'score', null, WAIT);
        await page.waitForFunction(() => /^(\{1\.8\})?\d+\.\d s/.test(String(window.__pf.field.phrases[window.__pf.field.scoreIndex])), null, WAIT);
        text = await page.evaluate(SCORE_TEXT);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__pf.game.phase === 'idle', null, WAIT);
        await page.waitForTimeout(1500); // a request, if one were going to be sent
      }
    } catch (err) {
      report(false, `${label}: ${err.message.split('\n')[0]}`);
    }
    if (errors.length) report(false, `${label}: console errors:\n  ${errors.join('\n  ')}`);
    return { browser, page, sent, text };
  }

  // (a) The server answers: time and place, one request, the time as shown.
  {
    const r = await play('(a)', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rank: 37, total: 1204, top: [99, 98, 97, 96, 95, 94, 93, 92, 91, 90.5] }) }));
    const lines = (r.text ?? '').split('\n');
    const cell = (n, t) => `{1|0.85}${n}  ${t}`;
    report(lines.length === 8 && lines[3] === `${cell(1, '99.0 s')}\t${cell(6, '94.0 s')}` && lines[7] === `${cell(5, '95.0 s')}\t${cell(10, '90.5 s')}`, `(a) the best times as rows: ${JSON.stringify(lines.slice(2))}`);
    report(lines[1] === '{1|0.8}#37 of 1,204', `(a) the place under the time: "${lines[1]}"`);
    const m = /^\{1\.8\}(\d+\.\d) s$/.exec(lines[0]);
    report(!!m, `(a) first line is the time: "${lines[0]}"`);
    await r.page.waitForFunction(() => window.__pf.game.debug.scoreFormed, null, WAIT).catch(() => {});
    await r.page.waitForTimeout(1500);
    require('fs').mkdirSync('shots', { recursive: true });
    await r.page.screenshot({ path: 'shots/rank-top10.png' });
    const body = r.sent[0] ? JSON.parse(r.sent[0].body) : null;
    report(r.sent.length === 1 && r.sent[0].method === 'POST', `(a) one POST to /api/rank (${r.sent.length})`);
    report(!!m && body && body.seconds === Number(m[1]), `(a) the time sent (${body && body.seconds}) is the time shown (${m && m[1]})`);
    await r.page.keyboard.press('Escape');
    await r.page.waitForFunction(() => window.__pf.game.phase === 'idle', null, WAIT).catch(() => {});
    report(r.sent.length === 1, `(a) leaving the score screen sends nothing more (${r.sent.length})`);
    await r.browser.close();
  }

  // (b) The server is not configured: the time alone.
  {
    const r = await play('(b)', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not-configured"}' }));
    report(/^\d+\.\d s$/.test(r.text ?? ''), `(b) 503 -> the time alone: "${r.text}"`);
    await r.browser.close();
  }

  // (c) The server is too slow: the time alone, and the game is not held up.
  {
    const t0 = Date.now();
    const r = await play('(c)', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rank: 1, total: 1 }) }).catch(() => {});
    });
    report(/^\d+\.\d s$/.test(r.text ?? ''), `(c) slow server -> the time alone: "${r.text}"`);
    await r.browser.close();
    void t0;
  }

  // (d) Esc with the ship alive is not a play.
  {
    const r = await play('(d)', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"rank":1,"total":1}' }), { crash: false });
    report(r.sent.length === 0, `(d) Esc with the ship alive sends nothing (${r.sent.length})`);
    await r.browser.close();
  }
  return failed;
}

const checks = { positions, look, flow, flow1: flowPart1, flow2: flowPart2, flow3: flowPart3, flow4: flowPart4, probe: probeCheck, budget: budgetCheck, bench, heroPrograms, headLeak, rank: rankCheck };

(async () => {
  const run = checks[mode];
  if (!run) {
    console.error(`usage: node scripts/game-check.cjs <${Object.keys(checks).join('|')}>`);
    process.exit(2);
  }
  const failed = await run();
  process.exit(typeof failed === 'number' ? failed : failed ? 1 : 0);
})();
