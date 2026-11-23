import * as THREE from 'three';

// Swap this one line to restyle every phrase. A heavy grotesk is deliberate:
// thin serif strokes don't survive particle sampling — they read as dotted
// scribble rather than letterforms.
export const FONT_FAMILY = '"Archivo", "Helvetica Neue", "Arial Black", Arial, sans-serif';
export const FONT_WEIGHT = 800;

const RASTER_W = 2048;
const RASTER_H = 512;

/** Ensure the webfont is actually loaded before we rasterize anything. */
export async function readyFonts() {
  const probe = `${FONT_WEIGHT} 100px ${FONT_FAMILY}`;
  try {
    await document.fonts.load(probe, 'GABRIELĂÃO');
  } catch {
    /* falls back to the system stack */
  }
  await document.fonts.ready;
}

function rasterize(phrase) {
  const canvas = document.createElement('canvas');
  canvas.width = RASTER_W;
  canvas.height = RASTER_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const padX = RASTER_W * 0.04;
  const maxW = RASTER_W - padX * 2;
  const maxH = RASTER_H * 0.62;

  // Fit by measuring once at a reference size and scaling — measureText is
  // linear in font size, so a single measurement is enough.
  const ref = 200;
  ctx.font = `${FONT_WEIGHT} ${ref}px ${FONT_FAMILY}`;
  const m = ctx.measureText(phrase);
  const refH = (m.actualBoundingBoxAscent || ref * 0.72) + (m.actualBoundingBoxDescent || 0);
  const size = Math.min((maxW / m.width) * ref, (maxH / refH) * ref);

  ctx.font = `${FONT_WEIGHT} ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${size * 0.02}px`;
  ctx.fillStyle = '#fff';
  ctx.fillText(phrase, RASTER_W / 2, RASTER_H / 2);

  return ctx.getImageData(0, 0, RASTER_W, RASTER_H).data;
}

/**
 * Rasterize `phrase` and draw `count` particle destinations from it.
 *
 * Sampling walks a prefix sum over pixel alpha and binary-searches it, which
 * gives ink-weighted coverage in O(count log n) with no unbounded rejection
 * loop — important because at 262k particles a reject-and-retry sampler stalls
 * badly on sparse phrases.
 */
/** Standard normal via Box–Muller, for the dispersed fringe. */
function gaussian() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function newJob(pixels, { count, fieldWidth, depth = 0.32, strayRatio = 0.14 }) {
  return {
    pixels,
    n: RASTER_W * RASTER_H,
    cdf: new Float32Array(RASTER_W * RASTER_H),
    acc: 0,
    count,
    fieldWidth,
    depth,
    strayRatio,
    fieldHeight: (fieldWidth * RASTER_H) / RASTER_W,
    positions: new Float32Array(count * 4),
    // Per-particle luminance only. Hue is a shader-side function of world
    // position — see createPaletteTexture in palette.js.
    jitter: new Float32Array(count),
    // Extent of the glyphs themselves, strays excluded. Callers use this to
    // hit-test against the word rather than against the raster box, which is
    // much larger than the letterforms.
    bounds: { halfW: 0, halfH: 0 },
  };
}

/** Prefix sum over pixel alpha, for pixels [from, to). */
function accumulate(job, from, to) {
  const { pixels, cdf } = job;
  let acc = job.acc;
  for (let i = from; i < to; i++) {
    acc += pixels[i * 4 + 3] / 255;
    cdf[i] = acc;
  }
  job.acc = acc;
}

function checkInk(job, phrase) {
  if (job.acc <= 0) {
    // Nothing was drawn (missing glyphs). Fail visibly rather than silently
    // emitting a NaN field that takes the whole simulation down.
    throw new Error(`Phrase "${phrase}" rasterized to an empty mask`);
  }
}

function prepare(phrase, opts) {
  const job = newJob(rasterize(phrase), opts);
  accumulate(job, 0, job.n);
  checkInk(job, phrase);
  return job;
}

function sampleRange(job, from, to) {
  const { n, cdf, acc, fieldWidth, fieldHeight, depth, strayRatio, positions, jitter, bounds } = job;

  for (let p = from; p < to; p++) {
    const target = Math.random() * acc;

    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }

    const px = lo % RASTER_W;
    const py = (lo / RASTER_W) | 0;

    // Jitter inside the pixel so the field isn't visibly gridded.
    const u = (px + Math.random()) / RASTER_W;
    const v = (py + Math.random()) / RASTER_H;

    // A fraction of the field is thrown clear of the glyphs. Without this the
    // phrase sits on the page as a hard-edged block; the reference always has
    // a haze of strays around the dense core.
    const stray = Math.random() < strayRatio;
    const spread = stray ? fieldWidth * 0.028 : 0;

    const i4 = p * 4;
    const x = (u - 0.5) * fieldWidth;
    const y = (0.5 - v) * fieldHeight;

    if (!stray) {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if (ax > bounds.halfW) bounds.halfW = ax;
      if (ay > bounds.halfH) bounds.halfH = ay;
    }

    positions[i4 + 0] = x + gaussian() * spread;
    positions[i4 + 1] = y + gaussian() * spread;
    positions[i4 + 2] = (Math.random() - 0.5) * depth;
    positions[i4 + 3] = 1;

    // Speckle comes from luminance variance; the squared random biases toward
    // dim so the bright ones read as sparks rather than as a flat wash.
    const brightness = 0.5 + Math.random() * Math.random() * 0.85;
    jitter[p] = stray ? brightness * 0.55 : brightness; // strays read as atmosphere
  }
}

/**
 * Rasterize `phrase` and draw `count` particle destinations from it.
 *
 * Sampling walks a prefix sum over pixel alpha and binary-searches it, which
 * gives ink-weighted coverage in O(count log n) with no unbounded rejection
 * loop — important because at 262k particles a reject-and-retry sampler stalls
 * badly on sparse phrases.
 */
export function buildTarget(phrase, opts) {
  // A phrase can also be the head (see loadHeadMesh).
  if (typeof phrase !== 'string') return buildMeshTarget(phrase, opts);
  const job = prepare(phrase, opts);
  sampleRange(job, 0, job.count);
  return job;
}

const nextIdle = () =>
  new Promise((resolve) =>
    window.requestIdleCallback
      ? window.requestIdleCallback(resolve, { timeout: 500 })
      : setTimeout(() => resolve(null), 16)
  );

/**
 * The same result as buildTarget, sampled in slices between frames. Building a
 * whole phrase in one go took 150–230ms, long enough to stutter the opening
 * gather that is playing at the time; slices stay inside each idle period.
 */
export async function buildTargetInSlices(phrase, opts) {
  await nextIdle();
  // The head samples a small mesh, a few tens of milliseconds on a laptop:
  // one idle slot rather than a sliced build.
  if (typeof phrase !== 'string') return buildMeshTarget(phrase, opts);
  const job = newJob(rasterize(phrase), opts);

  // Every stage, the prefix sum over a million pixels included, runs in slices
  // that fit the idle time the browser reports, so no frame waits on it.
  const sliced = async (total, step, work) => {
    let i = 0;
    while (i < total) {
      const deadline = await nextIdle();
      const start = performance.now();
      const budget = deadline?.timeRemaining ? Math.max(deadline.timeRemaining() - 1, 4) : 8;
      do {
        const to = Math.min(i + step, total);
        work(i, to);
        i = to;
      } while (i < total && performance.now() - start < budget);
    }
  };

  await sliced(job.n, 65536, (from, to) => accumulate(job, from, to));
  checkInk(job, phrase);
  await sliced(job.count, 4096, (from, to) => sampleRange(job, from, to));
  return job;
}

/** Wrap a positions array from buildTarget in a DataTexture the sim can read. */
export function toDataTexture(positions, size) {
  const tex = new THREE.DataTexture(positions, size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Load the head: a point cloud of Gabriel in the manner of a depth-camera scan,
 * made offline from a frontal photo (scripts/head/scan.py) and stored as a
 * small binary. Points are normalised to a height of 1, centred on the face,
 * and placed where the photo is bright. Each carries how much it follows the
 * head's turn: 1 on the head, 0 on the shoulders. The pivot is the point the
 * head turns around, at the neck.
 */
export async function loadHeadMesh(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Head: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x53545048) throw new Error('Head: bad header'); // 'HPTS'
  const n = view.getUint32(4, true);
  const pivot = [0, 1, 2].map((i) => view.getFloat32(12 + i * 4, true));
  const q = new Int16Array(buf, 24, n * 3);
  const turn = new Uint8Array(buf, 24 + n * 6, n);
  const v = Float32Array.from(q, (x) => x / 30000);

  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, v[i * 3]);
    maxX = Math.max(maxX, v[i * 3]);
  }
  return { points: { v, turn, pivot }, ratio: maxX - minX, height: 4 };
}

/**
 * Particle destinations on the head, in the same shape buildTarget returns.
 * The head is drawn as `head.dots` separate dots, like the scan it comes from:
 * the particles share those spots, unevenly, so some dots carry many and shine
 * and others carry few. The field enlarges and dims them while the head is on
 * screen. The fourth component of each destination is how much it turns with
 * the head (see simVelocity.frag).
 */
export function buildMeshTarget(head, { count }) {
  const { v, turn } = head.points;
  const n = turn.length;
  const s = head.height;
  const dots = Math.min(count, head.dots ?? n, n);
  const positions = new Float32Array(count * 4);
  const jitter = new Float32Array(count);
  const bounds = { halfW: 0, halfH: 0 };

  // The points were drawn in random order, so the first `dots` are as good a
  // sample as any.
  for (let p = 0; p < dots; p++) {
    const x = v[p * 3] * s;
    const y = v[p * 3 + 1] * s;
    const i4 = p * 4;
    positions[i4 + 0] = x;
    positions[i4 + 1] = y;
    positions[i4 + 2] = v[p * 3 + 2] * s;
    positions[i4 + 3] = turn[p] / 255;
    bounds.halfW = Math.max(bounds.halfW, Math.abs(x));
    bounds.halfH = Math.max(bounds.halfH, Math.abs(y));
    jitter[p] = 0.5 + Math.random() * Math.random() * 0.85;
  }
  for (let p = dots; p < count; p++) {
    const from = Math.floor(dots * Math.random() ** 1.2) * 4;
    positions.copyWithin(p * 4, from, from + 4);
  }

  return { positions, jitter, bounds };
}
