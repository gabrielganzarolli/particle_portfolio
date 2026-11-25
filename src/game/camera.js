// Chase camera and hero/game pose blending. Pure: no three, no DOM.
export const HERO_FOV = 50;

export function gameCamera(ship, speed) {
  return {
    px: 0.55 * ship.x,
    py: 1.35 + 0.45 * ship.y,
    pz: 4.6,
    tx: 0.35 * ship.x,
    ty: 0.15 + 0.3 * ship.y,
    tz: -30,
    fov: 58 + Math.min(speed, 40) * 0.22,
  };
}

const KEYS = ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'fov'];

export function blendPose(hero, game, e) {
  const out = {};
  for (const k of KEYS) out[k] = hero[k] * (1 - e) + game[k] * e;
  return out;
}

// Exponential approach of `blend` toward `target` (0 or 1).
export function stepBlend(blend, target, dt) {
  const v = blend + (target - blend) * (1 - Math.exp(-dt * 2.2));
  return Math.min(1, Math.max(0, v));
}
