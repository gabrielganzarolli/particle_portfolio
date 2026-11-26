import test from 'node:test';
import assert from 'node:assert/strict';
import { steerTarget, createKeyState, attachControls } from './controls.js';
import { CORRIDOR } from './world.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const none = { kx: 0, ky: 0, pointer: null };

function fakeWindow() {
  const l = {};
  return {
    addEventListener(t, f) { (l[t] ||= new Set()).add(f); },
    removeEventListener(t, f) { l[t]?.delete(f); },
    dispatch(t, ev = {}) { for (const f of [...(l[t] || [])]) f(ev); },
    count: () => Object.values(l).reduce((n, s) => n + s.size, 0),
  };
}

test('keyboard moves 5 u/s horizontally and 4 u/s vertically', () => {
  const s = { tx: 0, ty: 0 };
  steerTarget(s, { kx: 1, ky: 1, pointer: null }, 0.1);
  near(s.tx, 0.5);
  near(s.ty, 0.4);
});

test('keyboard respects the corridor', () => {
  const s = { tx: 0, ty: 0 };
  for (let i = 0; i < 100; i++) steerTarget(s, { kx: 1, ky: -1, pointer: null }, 0.1);
  near(s.tx, CORRIDOR.halfW);
  near(s.ty, -CORRIDOR.halfH);
});

test('pointer in NDC (0.5, -1) maps to tx 1.6, ty -1.7', () => {
  const s = { tx: 0, ty: 0 };
  steerTarget(s, { kx: 0, ky: 0, pointer: { x: 0.5, y: -1 } }, 1 / 60);
  near(s.tx, 1.6);
  near(s.ty, -1.7);
});

test('active keyboard ignores the pointer until it moves again', () => {
  const s = { tx: 0, ty: 0 };
  const p = { x: 0.5, y: -1 };
  steerTarget(s, { kx: 0, ky: 0, pointer: p }, 1 / 60);
  steerTarget(s, { kx: -1, ky: 0, pointer: { ...p } }, 0.1);
  near(s.tx, 1.1);
  steerTarget(s, { ...none, pointer: { ...p } }, 0.1);
  near(s.tx, 1.1);
  steerTarget(s, { ...none, pointer: { x: -0.5, y: 0 } }, 0.1);
  near(s.tx, -1.6);
  near(s.ty, 0);
});

test('the corridor passed in bounds the pointer and the keys', () => {
  const corridor = { halfW: 2.2, halfH: 1.7 };
  const s = { tx: 0, ty: 0 };
  steerTarget(s, { kx: 0, ky: 0, pointer: { x: 1, y: 0 } }, 1 / 60, corridor);
  near(s.tx, 2.2);
  steerTarget(s, { kx: 0, ky: 0, pointer: { x: -0.5, y: 0 } }, 1 / 60, corridor);
  near(s.tx, -1.1);
  for (let i = 0; i < 100; i++) steerTarget(s, { kx: 1, ky: 0, pointer: null }, 0.1, corridor);
  near(s.tx, 2.2);
});

test('a corridor that shrinks re-clamps a held target without input', () => {
  const s = { tx: 0, ty: 0 };
  steerTarget(s, { kx: 0, ky: 0, pointer: { x: 1, y: 1 } }, 1 / 60);
  near(s.tx, CORRIDOR.halfW);
  steerTarget(s, none, 1 / 60, { halfW: 1.5, halfH: 1 });
  near(s.tx, 1.5);
  near(s.ty, 1);
});

test('no pointer and no keys leaves the target where it is', () => {
  const s = { tx: 0, ty: 0 };
  steerTarget(s, none, 0.5);
  assert.deepEqual([s.tx, s.ty], [0, 0]);
  s.tx = 1.2; s.ty = -0.4;
  steerTarget(s, none, 0.5);
  assert.deepEqual([s.tx, s.ty], [1.2, -0.4]);
});

test('arrows and WASD map to kx/ky', () => {
  const k = createKeyState();
  k.set('ArrowLeft', true);
  assert.deepEqual(k.read(), { kx: -1, ky: 0 });
  k.releaseAll();
  for (const [key, want] of [['a', { kx: -1, ky: 0 }], ['A', { kx: -1, ky: 0 }], ['ArrowRight', { kx: 1, ky: 0 }], ['d', { kx: 1, ky: 0 }], ['D', { kx: 1, ky: 0 }], ['ArrowUp', { kx: 0, ky: 1 }], ['w', { kx: 0, ky: 1 }], ['W', { kx: 0, ky: 1 }], ['ArrowDown', { kx: 0, ky: -1 }], ['s', { kx: 0, ky: -1 }], ['S', { kx: 0, ky: -1 }]]) {
    k.set(key, true);
    assert.deepEqual(k.read(), want, key);
    k.set(key, false);
    assert.deepEqual(k.read(), { kx: 0, ky: 0 }, key + ' up');
  }
  k.set('x', true);
  assert.deepEqual(k.read(), { kx: 0, ky: 0 });
});

test('opposite keys cancel; releaseAll clears everything', () => {
  const k = createKeyState();
  k.set('ArrowLeft', true); k.set('ArrowRight', true); k.set('w', true);
  assert.deepEqual(k.read(), { kx: 0, ky: 1 });
  k.releaseAll();
  assert.deepEqual(k.read(), { kx: 0, ky: 0 });
});

test('window blur releases all held keys', () => {
  const win = fakeWindow();
  const c = attachControls(win);
  const ev = { key: 'ArrowLeft', prevented: false, preventDefault() { this.prevented = true; } };
  win.dispatch('keydown', ev);
  assert.equal(ev.prevented, true);
  assert.equal(c.read().kx, -1);
  win.dispatch('blur');
  const r = c.read();
  assert.equal(r.kx, 0);
  assert.equal(r.ky, 0);
  c.dispose();
});

test('attachControls tracks the pointer in NDC (y up) and disposes listeners', () => {
  const win = fakeWindow();
  win.innerWidth = 200; win.innerHeight = 100;
  const c = attachControls(win);
  assert.equal(c.read().pointer, null);
  win.dispatch('pointermove', { clientX: 150, clientY: 100 });
  const p = c.read().pointer;
  near(p.x, 0.5);
  near(p.y, -1);
  c.dispose();
  assert.equal(win.count(), 0);
});

function keyEv(key, extra = {}) {
  return { key, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
}

test('modifier-held WASD keydown is ignored: not latched, not prevented', () => {
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
    const win = fakeWindow();
    const c = attachControls(win);
    const ev = keyEv('a', { [mod]: true });
    win.dispatch('keydown', ev);
    assert.equal(ev.prevented, false);
    assert.equal(c.read().kx, 0);
    c.dispose();
  }
});

test('keydown targeting an input, textarea, select or contentEditable is ignored', () => {
  const targets = [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }];
  for (const target of targets) {
    const win = fakeWindow();
    const c = attachControls(win);
    const ev = keyEv('ArrowLeft', { target });
    win.dispatch('keydown', ev);
    assert.equal(ev.prevented, false);
    assert.equal(c.read().kx, 0);
    c.dispose();
  }
});

test('WASD moves without preventDefault; arrows are prevented', () => {
  const win = fakeWindow();
  const c = attachControls(win);
  const w = keyEv('d', { target: { tagName: 'BODY' } });
  win.dispatch('keydown', w);
  assert.equal(c.read().kx, 1);
  assert.equal(w.prevented, false);
  const a = keyEv('ArrowUp');
  win.dispatch('keydown', a);
  assert.equal(a.prevented, true);
  assert.equal(c.read().ky, 1);
  c.dispose();
});

test('keyup always releases a latched key, even with a modifier or input target', () => {
  const win = fakeWindow();
  const c = attachControls(win);
  win.dispatch('keydown', keyEv('a'));
  assert.equal(c.read().kx, -1);
  win.dispatch('keyup', keyEv('a', { ctrlKey: true, target: { tagName: 'INPUT' } }));
  assert.equal(c.read().kx, 0);
  c.dispose();
});
