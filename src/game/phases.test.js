import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, createPhases, ENTER_S, DYING_S, SCORE_RESTART_S, EXIT_S } from './phases.js';

function at(phase) {
  const p = createPhases();
  if (phase === PHASE.IDLE) return p;
  p.begin();
  if (phase === PHASE.ENTER) return p;
  p.tick(ENTER_S);
  if (phase === PHASE.PLAY) return p;
  p.die();
  if (phase === PHASE.DYING) return p;
  p.tick(DYING_S);
  if (phase === PHASE.SCORE) return p;
  p.exit();
  p.tick(0);
  return p;
}

test('starts in IDLE with t = 0', () => {
  const p = createPhases();
  assert.equal(p.phase, PHASE.IDLE);
  assert.equal(p.t, 0);
});

test('begin in IDLE goes to ENTER', () => {
  const p = createPhases();
  p.begin();
  assert.equal(p.phase, PHASE.ENTER);
  assert.equal(p.t, 0);
});

test('begin in ENTER or PLAY is ignored', () => {
  const p = at(PHASE.ENTER);
  p.tick(0.5);
  p.begin();
  assert.equal(p.phase, PHASE.ENTER);
  assert.equal(p.t, 0.5);
  const q = at(PHASE.PLAY);
  q.tick(2);
  q.begin();
  assert.equal(q.phase, PHASE.PLAY);
  assert.equal(q.t, 2);
});

test('tick(ENTER_S) takes ENTER to PLAY; tick below it does not', () => {
  const p = at(PHASE.ENTER);
  p.tick(ENTER_S - 0.01);
  assert.equal(p.phase, PHASE.ENTER);
  p.tick(0.01);
  assert.equal(p.phase, PHASE.PLAY);
  assert.equal(p.t, 0);
});

test('die only counts in PLAY', () => {
  for (const ph of [PHASE.IDLE, PHASE.ENTER, PHASE.DYING, PHASE.SCORE, PHASE.EXIT]) {
    const p = at(ph);
    p.die();
    assert.equal(p.phase, ph, `die in ${ph}`);
  }
  const p = at(PHASE.PLAY);
  p.die();
  assert.equal(p.phase, PHASE.DYING);
});

test('tick(DYING_S) takes DYING to SCORE', () => {
  const p = at(PHASE.DYING);
  p.tick(DYING_S - 0.01);
  assert.equal(p.phase, PHASE.DYING);
  p.tick(0.01);
  assert.equal(p.phase, PHASE.SCORE);
});

test('canRestart is false in SCORE before SCORE_RESTART_S and true after', () => {
  const p = at(PHASE.SCORE);
  assert.equal(p.canRestart(), false);
  p.tick(SCORE_RESTART_S - 0.01);
  assert.equal(p.canRestart(), false);
  p.tick(0.01);
  assert.equal(p.canRestart(), true);
  assert.equal(p.phase, PHASE.SCORE);
});

test('canRestart is false outside SCORE', () => {
  for (const ph of [PHASE.IDLE, PHASE.ENTER, PHASE.PLAY, PHASE.DYING, PHASE.EXIT]) {
    assert.equal(at(ph).canRestart(), false, ph);
  }
});

test('begin in SCORE is ignored until canRestart, then restarts', () => {
  const p = at(PHASE.SCORE);
  p.begin();
  assert.equal(p.phase, PHASE.SCORE);
  p.tick(SCORE_RESTART_S);
  p.begin();
  assert.equal(p.phase, PHASE.ENTER);
  assert.equal(p.t, 0);
});

test('begin during DYING or EXIT is ignored', () => {
  const d = at(PHASE.DYING);
  d.begin();
  assert.equal(d.phase, PHASE.DYING);
  const e = at(PHASE.PLAY);
  e.exit();
  e.begin();
  assert.equal(e.phase, PHASE.EXIT);
});

test('exit works in ENTER, PLAY, DYING and SCORE', () => {
  for (const ph of [PHASE.ENTER, PHASE.PLAY, PHASE.DYING, PHASE.SCORE]) {
    const p = at(ph);
    p.exit();
    assert.equal(p.phase, PHASE.EXIT, ph);
    assert.equal(p.t, 0);
  }
});

test('exit twice changes nothing', () => {
  const p = at(PHASE.PLAY);
  p.exit();
  p.tick(0.4);
  p.exit();
  assert.equal(p.phase, PHASE.EXIT);
  assert.equal(p.t, 0.4);
});

test('tick(EXIT_S) takes EXIT to IDLE', () => {
  const p = at(PHASE.PLAY);
  p.exit();
  p.tick(EXIT_S - 0.01);
  assert.equal(p.phase, PHASE.EXIT);
  p.tick(0.01);
  assert.equal(p.phase, PHASE.IDLE);
});

test('exit in IDLE is ignored', () => {
  const p = createPhases();
  p.exit();
  assert.equal(p.phase, PHASE.IDLE);
});

test('mashing: click during the explosion never reaches ENTER without SCORE', () => {
  const p = at(PHASE.PLAY);
  p.die();
  p.begin();
  p.begin();
  assert.equal(p.phase, PHASE.DYING);
  p.tick(DYING_S);
  p.begin();
  assert.equal(p.phase, PHASE.SCORE);
});

test('mashing Esc and clicks always ends back in IDLE', () => {
  const p = at(PHASE.PLAY);
  p.die();
  p.exit();
  p.exit();
  p.begin();
  p.die();
  assert.equal(p.phase, PHASE.EXIT);
  p.tick(EXIT_S);
  assert.equal(p.phase, PHASE.IDLE);
  p.exit();
  p.tick(10);
  assert.equal(p.phase, PHASE.IDLE);
});

test('tick in IDLE and SCORE only advances t, never changes phase', () => {
  const i = createPhases();
  i.tick(5);
  assert.equal(i.phase, PHASE.IDLE);
  const s = at(PHASE.SCORE);
  s.tick(100);
  assert.equal(s.phase, PHASE.SCORE);
});

test('canRestart is monotonic within SCORE', () => {
  const p = at(PHASE.SCORE);
  p.tick(SCORE_RESTART_S);
  assert.equal(p.canRestart(), true);
  for (let i = 0; i < 20; i++) {
    p.tick(0.5);
    assert.equal(p.canRestart(), true);
  }
  assert.equal(p.phase, PHASE.SCORE);
});
