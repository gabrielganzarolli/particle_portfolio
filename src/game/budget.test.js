import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.js';
import { gameBudget, LEVEL_ACTIVE, STREAK_POINTS } from './budget.js';

test('gameBudget(3) matches the prototype proportions exactly', () => {
  assert.deepEqual(gameBudget(3), {
    active: 70000,
    flame: 1176,
    shipEnd: 8400,
    ringEnd: 10850,
    perMeteor: 3010,
    meteorEnd: 40950,
    streakCount: 2905,
  });
});

const FIELD = { 1: 256 * 256, 2: 384 * 384, 3: 512 * 512 };

for (const level of [1, 2, 3]) {
  test(`gameBudget(${level}) is consistent`, () => {
    const b = gameBudget(level);
    const target = LEVEL_ACTIVE[level];
    assert.ok(b.active <= target && target - b.active <= 9, `active ${b.active} vs ${target}`);
    assert.equal(b.active - b.meteorEnd, b.streakCount * STREAK_POINTS);
    assert.ok(b.active <= FIELD[level]);
  });
}

test('createRng is deterministic per seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('createRng yields values in [0, 1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});
