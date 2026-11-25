import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gameCamera, blendPose, stepBlend, HERO_FOV, corridorFor, MIN_HALF_W, EDGE_NDC } from './camera.js';
import { CORRIDOR } from './world.js';

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

// The ship's centre in NDC, projected by three.js from the chase camera pose.
function shipNdc(ship, speed, aspect) {
  const c = gameCamera(ship, speed);
  const cam = new THREE.PerspectiveCamera(c.fov, aspect, 0.1, 500);
  cam.position.set(c.px, c.py, c.pz);
  cam.lookAt(c.tx, c.ty, c.tz);
  cam.updateMatrixWorld();
  return new THREE.Vector3(ship.x, ship.y, 0).project(cam);
}
const fovAt = (speed) => gameCamera({ x: 0, y: 0 }, speed).fov;

test('corridorFor: 16:9, 16:10, 4:3 and ultra-wide keep the desktop corridor', () => {
  for (const aspect of [16 / 9, 16 / 10, 4 / 3, 21 / 9, 32 / 9]) {
    for (const speed of [4, 14, 38]) assert.deepEqual(corridorFor(aspect, fovAt(speed)), CORRIDOR);
  }
});

test('corridorFor: portrait phone narrows the width, keeps the height', () => {
  const aspect = 390 / 844;
  const c = corridorFor(aspect, fovAt(14));
  assert.ok(c.halfW < CORRIDOR.halfW && c.halfW > 2, `halfW ${c.halfW}`);
  assert.equal(c.halfH, CORRIDOR.halfH);
});

test('corridorFor: at the corridor edge the ship centre stays within EDGE_NDC', () => {
  assert.equal(EDGE_NDC, 0.85);
  for (const aspect of [390 / 844, 360 / 800, 0.5, 0.6, 0.75, 1, 16 / 9]) {
    for (const speed of [4, 14, 26, 38]) {
      const c = corridorFor(aspect, fovAt(speed));
      for (const sx of [-1, 1]) for (const sy of [-1, 0, 1]) {
        const v = shipNdc({ x: sx * c.halfW, y: sy * c.halfH }, speed, aspect);
        assert.ok(Math.abs(v.x) <= EDGE_NDC + 0.005, `aspect ${aspect} speed ${speed}: ndc x ${v.x}`);
        assert.ok(Math.abs(v.y) <= EDGE_NDC + 0.005, `aspect ${aspect} speed ${speed}: ndc y ${v.y}`);
      }
    }
  }
});

test('corridorFor: where the width is cut, the edge sits at EDGE_NDC (not overly narrow)', () => {
  const aspect = 390 / 844;
  const c = corridorFor(aspect, fovAt(14));
  const v = shipNdc({ x: c.halfW, y: 0 }, 14, aspect);
  assert.ok(Math.abs(v.x - EDGE_NDC) < 0.01, `ndc x ${v.x}`);
});

test('corridorFor: a tiny aspect stops at the playable minimum', () => {
  assert.equal(MIN_HALF_W, 1);
  assert.equal(corridorFor(0.1, fovAt(14)).halfW, MIN_HALF_W);
  assert.equal(corridorFor(0.01, fovAt(38)).halfW, MIN_HALF_W);
});

test('corridorFor: width never shrinks as the screen widens', () => {
  let last = 0;
  for (let a = 0.05; a < 3; a += 0.01) {
    const w = corridorFor(a, fovAt(14)).halfW;
    assert.ok(w >= last - 1e-12);
    last = w;
  }
});
