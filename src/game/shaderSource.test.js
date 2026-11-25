import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { gamePointsVert, gamePositionFrag, mirrorDrift, VELOCITY_REPLACED } from './shaderSource.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hero = {
  velocity: read('../shaders/simVelocity.frag'),
  position: read('../shaders/simPosition.frag'),
  points: read('../shaders/points.vert'),
};
const game = {
  velocity: read('./shaders/simVelocity.frag'),
  position: read('./shaders/simPosition.frag'),
  points: read('./shaders/points.vert'),
};

test('the velocity variant mirrors every hero line, in order', () => {
  assert.deepEqual(mirrorDrift(hero.velocity, game.velocity, VELOCITY_REPLACED), []);
});

test('the drift guard reports a changed hero line', () => {
  const line = 'force += swirl * (uTurbulence * (1.0 + 4.0 * energy));';
  assert.ok(hero.velocity.includes(line));
  const tuned = hero.velocity.replace(line, line.replace('4.0', '3.0'));
  const problems = mirrorDrift(tuned, game.velocity, VELOCITY_REPLACED);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not mirrored.*3\.0 \* energy/);
});

test('the drift guard reports a change to a line the variant replaces', () => {
  const tuned = hero.velocity.replace('vel *= pow(uDamping, uDt * 60.0);', 'vel *= pow(uDamping, uDt * 50.0);');
  const problems = mirrorDrift(tuned, game.velocity, VELOCITY_REPLACED);
  assert.ok(problems.some((p) => /replaced line .*60\.0.* 0 times/.test(p)), problems.join('\n'));
});

test('the drift guard reports hero lines out of order', () => {
  const a = 'vec3 d = pos - uMouse;';
  const b = 'd.z *= 0.35;';
  const swapped = hero.velocity.replace(`${a}\n  ${b}`, `${b}\n  ${a}`);
  assert.notEqual(swapped, hero.velocity);
  assert.equal(mirrorDrift(swapped, game.velocity, VELOCITY_REPLACED).length, 1);
});

test('the points variant is the hero file with main renamed, then the game part', () => {
  const src = gamePointsVert(hero.points, game.points);
  assert.ok(src.startsWith(hero.points.replace('void main()', 'void heroMain()')));
  assert.equal(src.match(/void main\(\)/g).length, 1); // the game's own main
  assert.ok(src.includes('heroMain();'));
  // No hero declaration is repeated in the game part.
  for (const decl of ['uniform sampler2D uPositions;', 'attribute vec2  aRef;', 'varying vec3  vColor;']) {
    assert.equal(src.split(decl).length - 1, 1, decl);
  }
});

test('the position variant is the hero file with gameSnap spliced before its output', () => {
  const src = gamePositionFrag(hero.position, game.position);
  assert.ok(src.startsWith(game.position));
  assert.match(src, /gameSnap\(pos\);\s*gl_FragColor = pos;/);
  assert.equal(src.replace('gameSnap(pos);\n  ', ''), `${game.position}\n${hero.position}`);
});

test('the builders throw when the hero no longer has their anchor', () => {
  assert.throws(() => gamePointsVert(hero.points.replace('void main()', 'void main ()'), game.points), /points\.vert/);
  assert.throws(() => gamePositionFrag(hero.position.replace('gl_FragColor = pos;', 'gl_FragColor = p;'), game.position), /simPosition/);
});
