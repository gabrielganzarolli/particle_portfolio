import test from 'node:test';
import assert from 'node:assert/strict';
import { clickAction } from './clickRules.js';

const base = { headOn: false, headFormed: false, onHead: false, onName: false, reducedMotion: false, gameActive: false };
const s = (o) => ({ ...base, ...o });

test('name without head, click on name toggles', () => {
  assert.equal(clickAction(s({ onName: true })), 'toggle');
});

test('name without head, click elsewhere does nothing', () => {
  assert.equal(clickAction(s({})), 'none');
});

test('head formed, click on head starts the game', () => {
  assert.equal(clickAction(s({ headOn: true, headFormed: true, onHead: true })), 'startGame');
});

test('head formed, click outside goes back to the name', () => {
  assert.equal(clickAction(s({ headOn: true, headFormed: true })), 'toggle');
});

test('head still forming, click on head does nothing', () => {
  assert.equal(clickAction(s({ headOn: true, headFormed: false, onHead: true })), 'none');
});

test('reduced motion: click on head goes back to the name', () => {
  assert.equal(clickAction(s({ headOn: true, headFormed: true, onHead: true, reducedMotion: true })), 'toggle');
});

test('gameActive always ignores clicks', () => {
  for (const o of [{ onName: true }, { headOn: true, headFormed: true, onHead: true }, { headOn: true, headFormed: true }]) {
    assert.equal(clickAction(s({ ...o, gameActive: true })), 'none');
  }
});
