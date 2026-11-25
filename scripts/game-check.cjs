// Browser checks for the game inside the particle field.
//
//   node scripts/game-check.cjs positions
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

const checks = { positions };

(async () => {
  const run = checks[mode];
  if (!run) {
    console.error(`usage: node scripts/game-check.cjs <${Object.keys(checks).join('|')}>`);
    process.exit(2);
  }
  const failed = await run();
  process.exit(failed ? 1 : 0);
})();
