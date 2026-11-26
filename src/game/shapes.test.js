import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.js';
import { gameBudget } from './budget.js';
import { buildGameLocal, sampleFuselage } from './shapes.js';

const EPS = 1e-5;
const near = (a, b) => Math.abs(a - b) < EPS;
const GRID = 512;
const budget = gameBudget(3);
const build = (seed = 7) => buildGameLocal(budget, GRID, createRng(seed));
const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
const fraction = (indices, pred) => indices.filter(pred).length / indices.length;

test('deterministic: same seed gives identical arrays without NaN', () => {
  const a = build(7);
  const b = build(7);
  assert.equal(a.length, GRID * GRID * 4);
  assert.deepEqual(a, b);
  assert.ok(a.every((v) => !Number.isNaN(v)));
});

test('hull stays inside the ship envelope', () => {
  const L = build();
  for (let i = budget.flame; i < budget.shipEnd; i++) {
    const x = L[i * 4], y = L[i * 4 + 1], z = L[i * 4 + 2];
    assert.ok(x >= -1.6 && x <= 1.6, `x ${x}`);
    assert.ok(y >= -0.3 && y <= 0.8, `y ${y}`);
    assert.ok(z >= -1.31 && z <= 1.17, `z ${z}`);
  }
});

test('fuselage keeps fewer points on faces turned away from the camera', () => {
  const rng = createRng(11);
  let low = 0, high = 0;
  for (let i = 0; i < 40000; i++) {
    const { u } = sampleFuselage(rng);
    if (u < 0.3) low++;
    else if (u > 0.7) high++;
  }
  // density per unit of u: low band spans 0.3, high band spans 0.3
  assert.ok(low / 0.3 < 0.5 * (high / 0.3), `low ${low} high ${high}`);
});

test('wings are sparse and their rims dense', () => {
  const L = build();
  const hull = range(budget.flame, budget.shipEnd);
  const rim = fraction(hull, (i) => near(L[i * 4 + 3], 0.95));
  const wing = fraction(hull, (i) => L[i * 4 + 3] >= 0.3 - EPS && L[i * 4 + 3] <= 0.5 - EPS);
  assert.ok(Math.abs(rim - 0.12) <= 0.03, `rim ${rim}`);
  assert.ok(Math.abs(wing - 0.24) <= 0.04, `wing ${wing}`);
});

test('engine caps are the brightest', () => {
  const L = build();
  const hull = range(budget.flame, budget.shipEnd);
  const caps = fraction(hull, (i) => near(L[i * 4 + 3], 1.5));
  assert.ok(Math.abs(caps - 0.045) <= 0.015, `caps ${caps}`);
});

test('meteors stay within radius 1.4 and 10-30% are interior points', () => {
  const L = build();
  const met = range(budget.ringEnd, budget.meteorEnd);
  for (const i of met) {
    const r = Math.hypot(L[i * 4], L[i * 4 + 1], L[i * 4 + 2]);
    assert.ok(r >= 0 && r <= 1.4, `r ${r}`);
  }
  const inner = fraction(met, (i) => near(L[i * 4 + 3], 0.3));
  assert.ok(inner >= 0.1 && inner <= 0.3, `inner ${inner}`);
});

test('ring lies on y = -0.42 with w 0.5 or 0.14', () => {
  const L = build();
  for (let i = budget.shipEnd; i < budget.ringEnd; i++) {
    assert.ok(near(L[i * 4 + 1], -0.42), `y ${L[i * 4 + 1]}`);
    const w = L[i * 4 + 3];
    assert.ok(near(w, 0.5) || near(w, 0.14), `w ${w}`);
  }
});

test('flame and streak indices carry no offsets', () => {
  const L = build();
  const idx = [...range(0, budget.flame), ...range(budget.meteorEnd, budget.active)];
  for (const i of idx) {
    assert.ok(near(L[i * 4], 0) && near(L[i * 4 + 1], 0) && near(L[i * 4 + 2], 0));
    assert.ok(near(L[i * 4 + 3], 1));
  }
});
