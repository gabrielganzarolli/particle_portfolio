import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, exitLabel } from './text.js';

test('formatTime uses a decimal comma in pt', () => {
  assert.equal(formatTime(42.34, 'pt'), '42,3 s');
  assert.equal(formatTime(0, 'pt'), '0,0 s');
});

test('formatTime uses a decimal point in en', () => {
  assert.equal(formatTime(42.34, 'en'), '42.3 s');
  assert.equal(formatTime(125.96, 'en'), '126.0 s');
});

test('exitLabel', () => {
  assert.equal(exitLabel('pt'), 'Voltar ao nome');
  assert.equal(exitLabel('en'), 'Back to the name');
});
