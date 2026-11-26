// Procedural local shapes (ship hull, ring, meteors), ported from the CPU prototype.
// Pure module: no three, no DOM. Output is deterministic for a given rng.

const TAU = 6.2832;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Value noise, for irregular meteors.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483629);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}

// Fuselage point; the camera sits behind and slightly above, so faces turned away are thinned.
export function sampleFuselage(rng) {
  for (;;) {
    const u = rng(), z = -1.3 + 2.3 * u;
    const rad = 0.36 * Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * u)), 0.75);
    const phi = rng() * TAU, cx = Math.cos(phi), cy = Math.sin(phi);
    const nz = u < 0.3 ? -0.6 : u > 0.7 ? 0.25 : 0;
    const facing = cy * 0.35 + nz;
    if (rng() < 0.22 + 0.78 * clamp(facing * 1.2 + 0.5, 0, 1)) {
      const canopy = cy > 0 ? 0.09 * Math.exp(-Math.pow((z + 0.15) / 0.45, 2)) : 0;
      return { x: rad * cx * 1.15, y: rad * cy * 0.62 + canopy, z, w: 0.5 + rng() * 0.35, u };
    }
  }
}

const WA = [0.25, -0.02, 0.55], WB = [1.55, -0.06, 0.85], WC = [0.3, -0.02, -0.45];

function tri(rng, a, b, c) {
  let u = rng(), v = rng();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  return [
    a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
    a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
    a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v,
  ];
}

function shipPoint(rng) {
  const r = rng();
  if (r < 0.44) { const f = sampleFuselage(rng); return [f.x, f.y, f.z, f.w]; }
  if (r < 0.68) { // wing: sparse
    const p = tri(rng, WA, WB, WC);
    const s = rng() < 0.5 ? -1 : 1;
    return [p[0] * s, p[1] + (rng() - 0.5) * 0.018, p[2], 0.3 + rng() * 0.2];
  }
  if (r < 0.80) { // wing rim: dense
    const e = (rng() * 3) | 0, t = rng(), s = rng() < 0.5 ? -1 : 1;
    const [a, b] = e === 0 ? [WA, WB] : e === 1 ? [WB, WC] : [WC, WA];
    return [(a[0] + (b[0] - a[0]) * t) * s, a[1] + (b[1] - a[1]) * t + (rng() - 0.5) * 0.02, a[2] + (b[2] - a[2]) * t, 0.95];
  }
  if (r < 0.87) { // rudder
    const p = tri(rng, [0, 0.18, 0.25], [0, 0.78, 0.9], [0, 0.18, 0.9]);
    return [(rng() - 0.5) * 0.02, p[1], p[2], 0.55 + rng() * 0.3];
  }
  const s = rng() < 0.5 ? -1 : 1; // engine pods
  if (rng() < 0.35) { // engine cap: brightest
    const a = rng() * TAU, rr = Math.sqrt(rng()) * 0.14;
    return [s * 0.42 + Math.cos(a) * rr, -0.02 + Math.sin(a) * rr, 1.16, 1.5];
  }
  const a = rng() * TAU;
  return [s * 0.42 + Math.cos(a) * 0.14, -0.02 + Math.sin(a) * 0.14, 0.72 + rng() * 0.44, 0.9];
}

function gauss(rng) { return (rng() + rng() + rng() + rng() - 2) * 1.7; }

// RGBA per particle: xyz local offset, w base brightness. Flame and streak slots stay xyz=0, w=1.
export function buildGameLocal(budget, grid, rng) {
  const out = new Float32Array(grid * grid * 4);
  const { flame, shipEnd, ringEnd, meteorEnd, perMeteor, active } = budget;
  const put = (i, x, y, z, w) => { out[i * 4] = x; out[i * 4 + 1] = y; out[i * 4 + 2] = z; out[i * 4 + 3] = w; };

  for (let i = 0; i < active; i++) {
    if (i < flame) put(i, 0, 0, 0, 1);
    else if (i < shipEnd) { const p = shipPoint(rng); put(i, p[0], p[1], p[2], p[3]); }
    else if (i < ringEnd) {
      if (rng() < 0.7) {
        const j = rng() < 0.5 ? 0 : 1, t = rng() * TAU;
        put(i, Math.cos(t) * (2.2 + 0.3 * j), -0.42, Math.sin(t) * (1.7 + 0.25 * j), 0.5);
      } else {
        const s = Math.sqrt(rng()), t = rng() * TAU;
        put(i, Math.cos(t) * 2.2 * s, -0.42, Math.sin(t) * 1.7 * s, 0.14);
      }
    } else if (i < meteorEnd) {
      const s = ((i - ringEnd) / perMeteor) | 0;
      let dx = gauss(rng), dy = gauss(rng), dz = gauss(rng);
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const rr = 1 + 0.6 * (noise3(dx * 1.6 + s * 7.3, dy * 1.6, dz * 1.6) - 0.5) + (rng() - 0.5) * 0.1;
      const inside = rng() < 0.22 ? Math.cbrt(rng()) * 0.9 : 1;
      put(i, dx * rr * inside, dy * rr * inside, dz * rr * inside, inside < 1 ? 0.3 : 0.5 + rng() * 0.4);
    } else put(i, 0, 0, 0, 1);
  }
  return out;
}
