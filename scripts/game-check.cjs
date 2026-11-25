// Browser checks for the game inside the particle field.
//
//   node scripts/game-check.cjs positions
//   node scripts/game-check.cjs look       (captures in shots/look-nivelN.png)
//   node scripts/game-check.cjs flow       (part 1: the controller on its own)
//
// Needs the dev server (`npm run dev -- --port 5199`) and the globally
// installed Playwright. The site's own animation loop is stopped and the check
// steps the field itself, so every frame has a known dt and known uniforms.
// Exits non-zero if any criterion fails.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:5199';
const mode = process.argv[2];

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openSite(hash = '') {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
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

async function look() {
  const fs = require('fs');
  const path = require('path');
  let failed = false;
  for (const level of [1, 2, 3]) {
    const { browser, page, errors } = await openSite(`#nivel${level}`);
    try {
      const r = await page.evaluate(lookInPage);
      const file = path.join('shots', `look-nivel${level}.png`);
      fs.mkdirSync('shots', { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
      const pct = (v) => `${(v * 100).toFixed(2)}%`;
      const ok = r.level === level && r.lit >= 0.002 && r.lit <= 0.12;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} level ${r.level}: ${r.active} active, t ${r.t.toFixed(2)} s, ` +
          `non-dark ${pct(r.lit)} (within [0.20%, 12%]), white ${pct(r.white)}, ${file}`
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
// built by hand from window.__pf (main.js does not wire it yet). The site's
// loop is stopped and the check drives game.update + field.update itself at a
// fixed dt, yielding to the event loop between frames so the score phrase can
// build in slices. Records every phase change and every hook call.
async function flowInPage() {
  const { field, renderer, camera, state } = window.__pf;
  renderer.setAnimationLoop(null);

  const { createGame } = await import('/src/game/index.js');

  const REST = 0;
  const GAME = field.phrases.length;
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

  game.start(REST);
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

  await run(() => false, Math.ceil(1.75 / DT));
  click();
  frame();
  note(game.phase === 'enter', `click after 1.7 s in score -> ${game.phase}`);
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
  slowGame.start(REST);
  let clock = 0;
  for (let f = 0; f < 400 && slowGame.phase !== 'dying'; f++) {
    if (slowGame.phase === 'play' && f > 300) slowGame.debug.kill();
    clock += slowGame.phase === 'play' ? 30 : DT * 1000;
    slowGame.update(DT, clock);
  }
  note(slowCalls.length === 1 && slowCalls[0].slow === true, `30 ms frames -> onRunEnd ${JSON.stringify(slowCalls[0])} (slow)`);
  await run(() => false, 3); // let the score phrase start building
  slowGame.requestExit();
  for (let f = 0; f < 200 && slowGame.active; f++) slowGame.update(DT, (clock += DT * 1000));
  note(!slowGame.active && slowCalls.length === 1, `slow run exited, onRunEnd ${slowCalls.length} time(s) (1)`);
  return out;
}

async function flow() {
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

const checks = { positions, look, flow };

(async () => {
  const run = checks[mode];
  if (!run) {
    console.error(`usage: node scripts/game-check.cjs <${Object.keys(checks).join('|')}>`);
    process.exit(2);
  }
  const failed = await run();
  process.exit(failed ? 1 : 0);
})();
