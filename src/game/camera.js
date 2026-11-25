// Chase camera, hero/game pose blending and the corridor the screen allows.
// Pure: no three, no DOM.
import { CORRIDOR } from './world.js';

export const HERO_FOV = 50;

// The chase camera follows the ship sideways by FOLLOW_X of its offset and
// looks at a point FOLLOW_LOOK_X of it, CAM_Z in front of the ship's plane
// (z = 0) and LOOK_Z behind it.
const FOLLOW_X = 0.55;
const FOLLOW_LOOK_X = 0.35;
const CAM_Z = 4.6;
const LOOK_Z = -30;

export function gameCamera(ship, speed) {
  return {
    px: FOLLOW_X * ship.x,
    py: 1.35 + 0.45 * ship.y,
    pz: CAM_Z,
    tx: FOLLOW_LOOK_X * ship.x,
    ty: 0.15 + 0.3 * ship.y,
    tz: LOOK_Z,
    fov: 58 + Math.min(speed, 40) * 0.22,
  };
}

// Where the ship's centre may reach on screen, in NDC, at the corridor's side
// edges: the hull stays in view (on a narrow screen the wingtips may not).
export const EDGE_NDC = 0.85;
// The narrowest corridor: the ship spans 2.4 across and a meteor's hit radius
// is up to 1.16, so below +-1 there is no room left to dodge sideways. Only an
// aspect under ~0.2 (a strip, not a phone) reaches it.
export const MIN_HALF_W = 1;

// Screen x of the ship's centre per unit of ship x, at the ship's depth: the
// camera keeps (1 - FOLLOW_X) of the offset, and turning toward the look
// point adds the rest (small-angle; within 0.5% of a three.js projection).
const LATERAL_GAIN = 1 - FOLLOW_X + (CAM_Z * (FOLLOW_X - FOLLOW_LOOK_X)) / (CAM_Z - LOOK_Z);

/**
 * The corridor for a screen of `aspect` (width / height) seen through the
 * chase camera at vertical field of view `fov` (degrees): as wide as keeps
 * the ship's centre within EDGE_NDC, never wider than the desktop CORRIDOR
 * (every landscape screen, and up to aspect ~0.66, gets exactly CORRIDOR) and
 * never narrower than MIN_HALF_W. The height is CORRIDOR's at every aspect:
 * the field of view is vertical, so the ship's height on screen does not
 * depend on the width (at y = -1.7 its centre is at NDC -0.79).
 */
export function corridorFor(aspect, fov) {
  const halfTan = Math.tan((fov * Math.PI) / 360);
  const fit = (EDGE_NDC * CAM_Z * halfTan * aspect) / LATERAL_GAIN;
  return { halfW: Math.min(CORRIDOR.halfW, Math.max(MIN_HALF_W, fit)), halfH: CORRIDOR.halfH };
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
