import test from 'node:test';
import assert from 'node:assert/strict';
import { gameCamera, blendPose, stepBlend, HERO_FOV } from './camera.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('chase camera at the origin', () => {
  const c = gameCamera({ x: 0, y: 0 }, 14);
  near(c.px, 0); near(c.py, 1.35); near(c.pz, 4.6);
  near(c.tx, 0); near(c.ty, 0.15); near(c.tz, -30);
  near(c.fov, 58 + 14 * 0.22);
});

test('chase camera follows the ship', () => {
  const c = gameCamera({ x: 2, y: 1 }, 14);
  near(c.px, 1.1); near(c.py, 1.8); near(c.tx, 0.7); near(c.ty, 0.45);
});

test('fov saturates at speed 40', () => {
  near(gameCamera({ x: 0, y: 0 }, 400).fov, 58 + 40 * 0.22);
});

test('HERO_FOV is 50', () => assert.equal(HERO_FOV, 50));

test('blendPose endpoints', () => {
  const a = { px: 0, py: 0, pz: 10, tx: 0, ty: 0, tz: 0, fov: 50 };
  const b = { px: 2, py: 4, pz: 6, tx: 1, ty: 1, tz: -30, fov: 60 };
  assert.deepEqual(blendPose(a, b, 0), a);
  assert.deepEqual(blendPose(a, b, 1), b);
  const m = blendPose(a, b, 0.5);
  near(m.py, 2); near(m.fov, 55);
});

test('stepBlend rises toward 1 and never exceeds it', () => {
  const v = stepBlend(0, 1, 1 / 60);
  assert.ok(v > 0 && v < 1);
  assert.ok(stepBlend(0.99, 1, 100) <= 1);
});

test('stepBlend falls to under 0.001 after 10 s', () => {
  assert.ok(stepBlend(1, 0, 10) < 0.001);
});
