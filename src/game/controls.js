// Steering: pure functions plus a thin DOM binding (attachControls).
// Only attachControls touches the window, and only when called.
import { CORRIDOR } from './world.js';

const SPEED_X = 5;
const SPEED_Y = 4;

const KEY_MAP = {
  ArrowLeft: 'l', a: 'l', A: 'l',
  ArrowRight: 'r', d: 'r', D: 'r',
  ArrowUp: 'u', w: 'u', W: 'u',
  ArrowDown: 'd', s: 'd', S: 'd',
};

const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));

// Moves state.tx/ty. Keys move the target; the pointer sets it directly.
// After keyboard use the pointer is ignored until it changes position again.
// Bookkeeping lives on `state` (_kbd, _px, _py).
export function steerTarget(state, input, dt) {
  const { kx, ky, pointer } = input;
  const keyed = kx !== 0 || ky !== 0;
  const moved = !!pointer && (pointer.x !== state._px || pointer.y !== state._py);
  if (pointer) { state._px = pointer.x; state._py = pointer.y; }
  if (keyed) {
    state._kbd = true;
    state.tx = clamp(state.tx + kx * SPEED_X * dt, CORRIDOR.halfW);
    state.ty = clamp(state.ty + ky * SPEED_Y * dt, CORRIDOR.halfH);
  } else if (pointer && (moved || !state._kbd)) {
    state._kbd = false;
    state.tx = clamp(pointer.x * CORRIDOR.halfW, CORRIDOR.halfW);
    state.ty = clamp(pointer.y * CORRIDOR.halfH, CORRIDOR.halfH);
  }
}

export function createKeyState() {
  const held = { l: false, r: false, u: false, d: false };
  return {
    set(key, down) {
      const k = KEY_MAP[key];
      if (k) held[k] = !!down;
    },
    releaseAll() { held.l = held.r = held.u = held.d = false; },
    read() {
      return { kx: (held.r ? 1 : 0) - (held.l ? 1 : 0), ky: (held.u ? 1 : 0) - (held.d ? 1 : 0) };
    },
  };
}

export function attachControls(win) {
  const keys = createKeyState();
  let pointer = null;
  const onPointer = (e) => {
    const w = win.innerWidth || 1, h = win.innerHeight || 1;
    pointer = { x: (e.clientX / w) * 2 - 1, y: 1 - (e.clientY / h) * 2 };
  };
  const onDown = (e) => {
    if (KEY_MAP[e.key]) { keys.set(e.key, true); e.preventDefault(); }
  };
  const onUp = (e) => keys.set(e.key, false);
  const onBlur = () => keys.releaseAll();
  const handlers = { pointermove: onPointer, pointerdown: onPointer, keydown: onDown, keyup: onUp, blur: onBlur };
  for (const [t, f] of Object.entries(handlers)) win.addEventListener(t, f);
  return {
    read() { return { ...keys.read(), pointer }; },
    dispose() {
      for (const [t, f] of Object.entries(handlers)) win.removeEventListener(t, f);
      keys.releaseAll();
    },
  };
}
