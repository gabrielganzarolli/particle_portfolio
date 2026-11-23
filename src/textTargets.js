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
  // A phrase can also be a portrait map (see loadImageMap).
  if (typeof phrase !== 'string') return buildImageTarget(phrase, opts);
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
  // A portrait is a small image, about 60ms to sample on a laptop: one idle
  // slot rather than a sliced build.
  if (typeof phrase !== 'string') return buildImageTarget(phrase, opts);
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
 * Load a portrait map for buildImageTarget: an image whose red channel is
 * particle density and whose green channel is depth toward the camera. The
 * map for the head is made offline from a photo (cut out, contrast and edges
 * folded into density, a rounded volume into depth), so the browser only
 * samples it.
 */
export async function loadImageMap(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), height: 4 };
}

/**
 * Particle destinations from a portrait map, in the same shape buildTarget
 * returns. `map.height` is the portrait's height in world units; width follows
 * the image. Depth lifts the face toward the camera by up to `relief`, so the
 * pointer parallax turns the head slightly and the depth of field softens the
 * nearest features.
 */
export function buildImageTarget(map, { count, relief = 0.9, strayRatio = 0.05 }) {
  const { data, width, height } = map.image;
  const n = width * height;
  const cdf = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += data[i * 4] / 255;
    cdf[i] = acc;
  }
  if (acc <= 0) throw new Error('Portrait map is empty');

  const worldH = map.height;
  const worldW = (worldH * width) / height;
  const positions = new Float32Array(count * 4);
  const jitter = new Float32Array(count);
  const bounds = { halfW: 0, halfH: 0 };

  for (let p = 0; p < count; p++) {
    const target = Math.random() * acc;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const px = lo % width;
    const py = (lo / width) | 0;
    const x = ((px + Math.random()) / width - 0.5) * worldW;
    const y = (0.5 - (py + Math.random()) / height) * worldH;
    const z = (data[lo * 4 + 1] / 255 - 0.45) * relief;

    const stray = Math.random() < strayRatio;
    const spread = stray ? worldW * 0.03 : 0;
    if (!stray) {
      bounds.halfW = Math.max(bounds.halfW, Math.abs(x));
      bounds.halfH = Math.max(bounds.halfH, Math.abs(y));
    }

    const i4 = p * 4;
    positions[i4 + 0] = x + gaussian() * spread;
    positions[i4 + 1] = y + gaussian() * spread;
    positions[i4 + 2] = z + (Math.random() - 0.5) * 0.04;
    positions[i4 + 3] = 1;

    const brightness = 0.5 + Math.random() * Math.random() * 0.85;
    jitter[p] = stray ? brightness * 0.55 : brightness;
  }

  return { positions, jitter, bounds };
}
