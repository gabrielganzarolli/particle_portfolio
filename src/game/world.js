// Game world: ship dynamics, meteors, difficulty ramp and swept collision.
// Pure logic (no three, no DOM). The ship sits at z = 0; the world moves toward
// the camera, so meteor z increases over time.
import { SLOTS } from './budget.js';

// The widest corridor (every landscape screen). The one in use is
// world.corridor, which the controller sets from the screen's proportion each
// frame (corridorFor in camera.js): the ship's clamp and the meteor spawns
// follow it.
export const CORRIDOR = Object.freeze({ halfW: 3.2, halfH: 1.7 });
export const LOOP = 120;

const MAX_DT = 0.05;
const GRACE = 2.2; // seconds without collisions at the start
const SPRING_K = 45;
const SPRING_C = 2 * Math.sqrt(SPRING_K) * 0.92;
const MAX_BANK = 0.65;
const SHIP_SPHERES = [
  [0, 0, -0.6, 0.3],
  [0, 0, 0.2, 0.42],
  [-0.9, 0, 0.4, 0.3],
  [0.9, 0, 0.4, 0.3],
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function speedTarget(t) {
  return Math.min(14 + 0.45 * t, 38);
}

// Places meteor `slot` at the far end. 45% aim at the ship (kept inside the
// corridor, so they arrive where the player can see them); the rest scatter
// across the corridor and a margin beyond it.
export function spawnMeteor(world, rng, slot, initial) {
  const m = world.meteors[slot];
  const { halfW, halfH } = world.corridor;
  m.z = initial ? -(55 + slot * 11 + rng() * 6) : -(112 + rng() * 22);
  const aim = rng() < 0.45;
  m.x = aim
    ? clamp(world.ship.x + (rng() - 0.5) * 1.8, -halfW, halfW)
    : (rng() * 2 - 1) * (halfW + 1.4);
  m.y = aim
    ? clamp(world.ship.y + (rng() - 0.5) * 1.4, -halfH, halfH)
    : (rng() * 2 - 1) * (halfH + 0.8);
  m.R = 0.5 + rng() * 0.95;
  m.spin = (rng() - 0.5) * 1.3;
  m.angle = rng() * Math.PI * 2;
  m.prevZ = m.z;
}

export function createWorld(rng, corridor = CORRIDOR) {
  const world = {
    corridor: { halfW: corridor.halfW, halfH: corridor.halfH },
    t: 0,
    speed: 4,
    distance: 0,
    alive: true,
    ship: { x: 0, y: 0, vx: 0, vy: 0, bank: 0 },
    meteors: [],
  };
  Object.defineProperty(world, 'rng', { value: rng, enumerable: false });
  for (let s = 0; s < SLOTS; s++) {
    world.meteors.push({ x: 0, y: 0, z: 0, R: 1, spin: 0, angle: 0, prevZ: 0 });
    spawnMeteor(world, rng, s, true);
  }
  return world;
}

export function shipSpheres(ship) {
  const c = Math.cos(ship.bank), s = Math.sin(ship.bank);
  return SHIP_SPHERES.map(([px, py, pz, r]) => ({
    x: ship.x + px * c - py * s,
    y: ship.y + px * s + py * c,
    z: pz,
    r,
  }));
}

// Swept test: the meteor's z interval for this step (prevZ -> z) against the
// z interval over which it touches each sphere at the current lateral offset.
export function sweptHit(ship, meteor) {
  const z1 = meteor.z;
  const z0 = meteor.prevZ ?? z1;
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
  for (const sp of shipSpheres(ship)) {
    const dx = sp.x - meteor.x, dy = sp.y - meteor.y;
    const rr = sp.r + 0.8 * meteor.R;
    const lat2 = dx * dx + dy * dy;
    if (lat2 >= rr * rr) continue;
    const half = Math.sqrt(rr * rr - lat2);
    if (hi >= sp.z - half && lo <= sp.z + half) return true;
  }
  return false;
}

export function stepWorld(world, dt, target, opts = {}) {
  dt = Math.min(dt, MAX_DT);
  const collide = opts.collide !== false;
  const ship = world.ship;

  if (world.alive) {
    world.t += dt;
    world.speed += (speedTarget(world.t) - world.speed) * Math.min(1, dt * 1.4);
    const { halfW, halfH } = world.corridor;
    const tx = clamp(target.x, -halfW, halfW);
    const ty = clamp(target.y, -halfH, halfH);
    ship.vx += (-SPRING_K * (ship.x - tx) - SPRING_C * ship.vx) * dt;
    ship.vy += (-SPRING_K * (ship.y - ty) - SPRING_C * ship.vy) * dt;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    ship.bank += (clamp(-ship.vx * 0.085, -MAX_BANK, MAX_BANK) - ship.bank) * Math.min(1, dt * 8);
  } else {
    world.speed *= Math.exp(-dt * 2.2);
  }

  world.distance += world.speed * dt;
  for (let s = 0; s < SLOTS; s++) {
    const m = world.meteors[s];
    m.prevZ = m.z;
    m.z += world.speed * dt;
    m.angle += m.spin * dt;
    if (world.alive && collide && world.t > GRACE && sweptHit(ship, m)) world.alive = false;
    if (m.z > 9) spawnMeteor(world, world.rng, s, false);
  }
}

export function gameUniforms(world) {
  const meteors = new Float32Array(SLOTS * 4);
  const meteorRot = new Float32Array(SLOTS * 2);
  world.meteors.forEach((m, i) => {
    meteors.set([m.x, m.y, m.z, m.R], i * 4);
    meteorRot[i * 2] = Math.cos(m.angle);
    meteorRot[i * 2 + 1] = Math.sin(m.angle);
  });
  const { ship } = world;
  return {
    ship: new Float32Array([ship.x, ship.y, ship.vx, ship.vy]),
    shipRot: new Float32Array([Math.cos(ship.bank), Math.sin(ship.bank)]),
    meteors,
    meteorRot,
    speed: world.speed,
    distance: world.distance % LOOP,
    alive: world.alive ? 1 : 0,
  };
}
