import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.js';
import { SLOTS } from './budget.js';
import {
  CORRIDOR, LOOP, speedTarget, createWorld, stepWorld, shipSpheres, sweptHit, gameUniforms, spawnMeteor,
} from './world.js';

const fresh = () => createWorld(createRng(1234));
const run = (w, seconds, target = { x: 0, y: 0 }, opts) => {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) stepWorld(w, 1 / 60, target, opts);
};
const parkMeteors = (w) => w.meteors.forEach((m) => { m.z = -100; m.prevZ = -100; });

test('constants', () => {
  assert.deepEqual(CORRIDOR, { halfW: 3.2, halfH: 1.7 });
  assert.equal(LOOP, 120);
});

test('speedTarget ramps 14 -> 38', () => {
  assert.equal(speedTarget(0), 14);
  assert.ok(Math.abs(speedTarget(20) - 23) < 1e-9);
  assert.equal(speedTarget(60), 38);
  assert.equal(speedTarget(1000), 38);
});

test('speed eases toward the target', () => {
  const w = fresh();
  assert.equal(w.speed, 4);
  run(w, 10, { x: 0, y: 0 }, { collide: false });
  assert.ok(Math.abs(w.speed - speedTarget(10)) < 0.6);
});

test('ship follows the target with a critically damped spring', () => {
  const w = fresh();
  parkMeteors(w);
  let maxX = 0, maxY = 0, bankOk = true, signOk = true;
  for (let i = 0; i < 120; i++) {
    parkMeteors(w);
    stepWorld(w, 1 / 60, { x: 2, y: 1 });
    maxX = Math.max(maxX, w.ship.x); maxY = Math.max(maxY, w.ship.y);
    if (Math.abs(w.ship.bank) > 0.65 + 1e-9) bankOk = false;
    if (Math.abs(w.ship.vx) > 0.5 && w.ship.bank * w.ship.vx >= 0) signOk = false;
  }
  assert.ok(Math.abs(w.ship.x - 2) < 0.05);
  assert.ok(Math.abs(w.ship.y - 1) < 0.05);
  assert.ok(maxX < 2.1 && maxY < 1.1);
  assert.ok(bankOk && signOk);
});

test('ship target is clamped to the corridor', () => {
  const w = fresh();
  for (let i = 0; i < 240; i++) { parkMeteors(w); stepWorld(w, 1 / 60, { x: 99, y: -99 }); }
  assert.ok(w.ship.x <= 3.2 && w.ship.x > 3);
  assert.ok(w.ship.y >= -1.7 && w.ship.y < -1.5);
});

test('world.corridor starts as the corridor given, the desktop one by default', () => {
  assert.deepEqual(fresh().corridor, CORRIDOR);
  const w = createWorld(createRng(1), { halfW: 2, halfH: 1.7 });
  assert.deepEqual(w.corridor, { halfW: 2, halfH: 1.7 });
  for (const m of w.meteors) assert.ok(Math.abs(m.x) <= 2 + 1.4 && Math.abs(m.y) <= 1.7 + 0.8);
});

test('ship target is clamped to world.corridor', () => {
  const w = fresh();
  w.corridor = { halfW: 1.5, halfH: 1 };
  for (let i = 0; i < 240; i++) { parkMeteors(w); stepWorld(w, 1 / 60, { x: 99, y: -99 }); }
  assert.ok(w.ship.x <= 1.5 && w.ship.x > 1.4);
  assert.ok(w.ship.y >= -1 && w.ship.y < -0.9);
});

test('a corridor that shrinks mid-run moves the ship back smoothly', () => {
  const w = fresh();
  for (let i = 0; i < 240; i++) { parkMeteors(w); stepWorld(w, 1 / 60, { x: 99, y: 0 }); }
  assert.ok(w.ship.x > 3.1);
  w.corridor = { halfW: 2, halfH: 1.7 };
  let maxStep = 0, last = w.ship.x;
  for (let i = 0; i < 240; i++) {
    parkMeteors(w);
    stepWorld(w, 1 / 60, { x: 99, y: 0 });
    maxStep = Math.max(maxStep, Math.abs(w.ship.x - last));
    last = w.ship.x;
  }
  assert.ok(Math.abs(w.ship.x - 2) < 0.05, `x ${w.ship.x}`);
  assert.ok(maxStep < 0.15, `largest step ${maxStep}`); // the spring, no teleport
});

// rng scripted for one spawnMeteor call: z, aim?, x, y, R, spin, angle.
const script = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('spawn ranges follow world.corridor', () => {
  const w = fresh();
  w.corridor = { halfW: 2, halfH: 1 };
  w.ship.x = 0; w.ship.y = 0;
  // Not aimed (0.9 >= 0.45), x and y at the ends of their ranges.
  spawnMeteor(w, script([0, 0.9, 1, 1, 0, 0, 0]), 0, false);
  assert.ok(Math.abs(w.meteors[0].x - 3.4) < 1e-9 && Math.abs(w.meteors[0].y - 1.8) < 1e-9);
  spawnMeteor(w, script([0, 0.9, 0, 0, 0, 0, 0]), 0, false);
  assert.ok(Math.abs(w.meteors[0].x + 3.4) < 1e-9 && Math.abs(w.meteors[0].y + 1.8) < 1e-9);
  const rng = createRng(99);
  for (let i = 0; i < 2000; i++) {
    spawnMeteor(w, rng, 1, false);
    const m = w.meteors[1];
    assert.ok(Math.abs(m.x) <= 3.4 && Math.abs(m.y) <= 1.8);
  }
});

test('meteors aimed at the ship stay inside world.corridor', () => {
  const w = fresh();
  w.corridor = { halfW: 2, halfH: 1 };
  w.ship.x = 2; w.ship.y = 1; // at the corner
  spawnMeteor(w, script([0, 0.1, 1, 1, 0, 0, 0]), 0, false); // aimed, +0.9 / +0.7
  assert.equal(w.meteors[0].x, 2);
  assert.equal(w.meteors[0].y, 1);
  spawnMeteor(w, script([0, 0.1, 0, 0, 0, 0, 0]), 0, false); // aimed, -0.9 / -0.7
  assert.ok(Math.abs(w.meteors[0].x - 1.1) < 1e-9 && Math.abs(w.meteors[0].y - 0.3) < 1e-9);
});

test('no collisions in the first 2.2 s', () => {
  const w = fresh();
  const onShip = () => { const m = w.meteors[0]; m.x = 0; m.y = 0; m.z = 0.2; m.prevZ = 0.2; m.R = 1; };
  for (let i = 0; i < 120; i++) {
    parkMeteors(w); onShip();
    stepWorld(w, 1 / 60, { x: 0, y: 0 });
  }
  assert.ok(w.t < 2.2);
  assert.equal(w.alive, true);
  for (let i = 0; i < 30 && w.alive; i++) {
    parkMeteors(w); onShip();
    stepWorld(w, 1 / 60, { x: 0, y: 0 });
  }
  assert.equal(w.alive, false);
});

test('collision spheres', () => {
  const ship = { x: 0, y: 0, vx: 0, vy: 0, bank: 0 };
  const s = shipSpheres(ship);
  const expected = [[0, 0, -0.6, 0.3], [0, 0, 0.2, 0.42], [-0.9, 0, 0.4, 0.3], [0.9, 0, 0.4, 0.3]];
  assert.equal(s.length, 4);
  for (const e of expected) {
    assert.ok(s.some((p) => Math.abs(p.x - e[0]) < 1e-9 && Math.abs(p.y - e[1]) < 1e-9
      && Math.abs(p.z - e[2]) < 1e-9 && Math.abs(p.r - e[3]) < 1e-9), `missing ${e}`);
  }
  const m = (x) => ({ x, y: 0, z: 0.2, prevZ: 0.2, R: 1 });
  assert.equal(sweptHit(ship, m(0.5)), true);
  assert.equal(sweptHit(ship, m(2.5)), false);
});

test('a small fast meteor does not tunnel', () => {
  const ship = { x: 0, y: 0, vx: 0, vy: 0, bank: 0 };
  const R = 0.5, dt = 0.05, speed = 38;
  let z = -3, swept = false, point = false;
  for (let i = 0; i < 10; i++) {
    const prevZ = z;
    z += speed * dt;
    // y offset 0.6: the contact z-window (1.72) is narrower than one step (1.9),
    // so point samples at z = -1.1, 0.8, 2.7 all miss while the sweep must hit.
    const m = { x: 0, y: 0.6, z, prevZ, R };
    if (sweptHit(ship, m)) swept = true;
    if (sweptHit(ship, { ...m, prevZ: z })) point = true;
  }
  assert.equal(swept, true);
  assert.equal(point, false);
});

test('meteors respawn at the far end after passing the camera', () => {
  const w = fresh();
  let aimed = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    parkMeteors(w);
    const m = w.meteors[0];
    m.z = 9.5; m.prevZ = 9.5;
    stepWorld(w, 1 / 60, { x: 0, y: 0 }, { collide: false });
    assert.ok(m.z >= -134 && m.z <= -112, `z=${m.z}`);
    // Aimed spawns land within +-0.9 in x and +-0.7 in y of the ship. Checking x
    // alone would also count ~20% of the random spawns (measured 0.57 overall).
    if (Math.abs(m.x - w.ship.x) <= 0.9 && Math.abs(m.y - w.ship.y) <= 0.7) aimed++;
  }
  const frac = aimed / N;
  assert.ok(frac > 0.4 && frac < 0.5, `aimed fraction ${frac}`);
});

test('initial meteors start far', () => {
  const w = fresh();
  assert.equal(w.meteors.length, SLOTS);
  for (const m of w.meteors) assert.ok(m.z <= -55);
  let maxZ = -Infinity;
  for (let i = 0; i < 180; i++) {
    stepWorld(w, 1 / 60, { x: 0, y: 0 }, { collide: false });
    for (const m of w.meteors) maxZ = Math.max(maxZ, m.z);
  }
  assert.ok(maxZ <= -3);
});

test('dt is clamped to 0.05', () => {
  const a = fresh(), b = fresh();
  stepWorld(a, 5, { x: 1, y: 0 }, { collide: false });
  stepWorld(b, 0.05, { x: 1, y: 0 }, { collide: false });
  assert.equal(a.t, b.t);
  assert.equal(a.distance, b.distance);
  assert.equal(a.ship.x, b.ship.x);
  assert.equal(a.meteors[0].z, b.meteors[0].z);
});

test('gameUniforms', () => {
  const w = fresh();
  run(w, 3, { x: 1, y: 0.5 }, { collide: false });
  w.distance = 250.5;
  const u = gameUniforms(w);
  assert.equal(u.distance, 250.5 % 120);
  assert.equal(u.meteors.length, SLOTS * 4);
  assert.equal(u.meteorRot.length, SLOTS * 2);
  assert.equal(u.ship.length, 4);
  assert.equal(u.shipRot.length, 2);
  w.meteors.forEach((m, i) => {
    assert.ok(Math.abs(u.meteors[4 * i] - m.x) < 1e-4);
    assert.ok(Math.abs(u.meteors[4 * i + 1] - m.y) < 1e-4);
    assert.ok(Math.abs(u.meteors[4 * i + 2] - m.z) < 1e-4);
    assert.ok(Math.abs(u.meteors[4 * i + 3] - m.R) < 1e-4);
    assert.ok(Math.abs(u.meteorRot[2 * i] - Math.cos(m.angle)) < 1e-4);
    assert.ok(Math.abs(u.meteorRot[2 * i + 1] - Math.sin(m.angle)) < 1e-4);
  });
  assert.equal(u.alive, 1);
  w.alive = false;
  assert.equal(gameUniforms(w).alive, 0);
});
