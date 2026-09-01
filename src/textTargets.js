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

export function buildTarget(phrase, { count, fieldWidth, depth = 0.32, strayRatio = 0.14 }) {
  const pixels = rasterize(phrase);
  const n = RASTER_W * RASTER_H;

  const cdf = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += pixels[i * 4 + 3] / 255;
    cdf[i] = acc;
  }

  const positions = new Float32Array(count * 4);
  // Per-particle luminance only. Hue is a shader-side function of world
  // position — see createPaletteTexture in palette.js.
  const jitter = new Float32Array(count);

  if (acc <= 0) {
    // Nothing was drawn (missing glyphs). Fail visibly rather than silently
    // emitting a NaN field that takes the whole simulation down.
    throw new Error(`Phrase "${phrase}" rasterized to an empty mask`);
  }

  const fieldHeight = (fieldWidth * RASTER_H) / RASTER_W;

  // Extent of the glyphs themselves, strays excluded. Callers use this to hit-
  // test against the word rather than against the raster box, which is much
  // larger than the letterforms.
  let inkHalfW = 0;
  let inkHalfH = 0;

  for (let p = 0; p < count; p++) {
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
      if (ax > inkHalfW) inkHalfW = ax;
      if (ay > inkHalfH) inkHalfH = ay;
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

  return { positions, jitter, bounds: { halfW: inkHalfW, halfH: inkHalfH } };
}

/** Wrap a positions array from buildTarget in a DataTexture the sim can read. */
export function toDataTexture(positions, size) {
  const tex = new THREE.DataTexture(positions, size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
