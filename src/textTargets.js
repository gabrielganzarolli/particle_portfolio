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
 * Load the head: a sculpted bald head made offline from a head scan
 * (scripts/head/surface.py; "Infinite, 3D Head Scan" by Lee Perry-Smith,
 * CC BY 3.0) and stored as a small binary. Vertices are normalised to a
 * height of 1 and centred. Each carries the ingredients of its particle
 * density (ambient occlusion, frontal light, how far it faces the camera, the
 * fade at the neck's base, and masks for the face, crown, ears and neck),
 * mixed here by mixHeadWeights so the tuning panel can change them live, and
 * how far it follows the head's turn. The occluder is the same mesh pulled
 * slightly inside, for hiding the far side. The pivot is where the head turns.
 */
export async function loadHeadMesh(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Head: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x33525348) throw new Error('Head: bad header'); // 'HSR3'
  const n = view.getUint32(4, true);
  const nf = view.getUint32(8, true);
  const pivot = [0, 1, 2].map((i) => view.getFloat32(12 + i * 4, true));
  let o = 24;
  const v = Float32Array.from(new Int16Array(buf, o, n * 3), (x) => x / 30000);
  o += n * 6;
  const ov = Float32Array.from(new Int16Array(buf, o, n * 3), (x) => x / 30000);
  o += n * 6;
  const ch = {};
  for (const name of ['ao', 'lam', 'nz', 'fade', 'face', 'crown', 'ear', 'neck', 'turn']) {
    ch[name] = new Uint8Array(buf, o, n);
    o += n;
  }
  o += o % 2;
  const faces = new Uint16Array(buf, o, nf * 3);

  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, v[i * 3]);
    maxX = Math.max(maxX, v[i * 3]);
  }
  const head = { mesh: { v, ch, turn: ch.turn, faces, pivot, w: new Float32Array(n) }, occluder: { v: ov, faces }, ratio: maxX - minX, height: 4 };
  mixHeadWeights(head, HEAD_LOOK);
  return head;
}

/**
 * The head's density mix, as Gabriel tuned it in the panel (2026-11-23). The
 * mix surface.py used to bake was shadows 0.85, floor 0.1, face 1.9, crown
 * 0.55, ears 0.9, neck 1.
 */
export const HEAD_LOOK = { shadows: 0.39, floor: 0.39, face: 1.5, crown: 0.85, ears: 1.2, neck: 1 };

/** Mix the head's density ingredients into one weight per vertex. */
export function mixHeadWeights(head, look) {
  const { ch, w } = head.mesh;
  const k = 1 / 255;
  for (let i = 0; i < w.length; i++) {
    const ao = ch.ao[i] * k;
    const light = (1 - look.shadows + look.shadows * ao ** 2.2) * (0.6 + 0.4 * ch.lam[i] * k);
    const facing = look.floor + (1 - look.floor) * ch.nz[i] * k;
    const part =
      1 +
      (look.face - 1) * ch.face[i] * k +
      (look.crown - 1) * ch.crown[i] * k +
      (look.ears - 1) * ch.ear[i] * k +
      (look.neck - 1) * ch.neck[i] * k;
    w[i] = Math.max(0, light * facing * ch.fade[i] * k * part);
  }
}

/**
 * Particle destinations on the head, in the same shape buildTarget returns,
 * spread over its surface the way the letters' ink is: triangles drawn by
 * area times light, each particle at its own point inside one. The lit planes
 * fill in and the hollows stay dark, which is all that draws the face; the
 * particles are the names' own grain.
 */
export function buildMeshTarget(head, { count, strayRatio = 0.03 }) {
  const { v, w, turn, faces } = head.mesh;
  const s = head.height;
  const nt = faces.length / 3;
  const cdf = new Float32Array(nt);
  let acc = 0;
  for (let t = 0; t < nt; t++) {
    const a = faces[t * 3] * 3;
    const b = faces[t * 3 + 1] * 3;
    const c = faces[t * 3 + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const vx = v[c] - v[a], vy = v[c + 1] - v[a + 1], vz = v[c + 2] - v[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    acc += Math.sqrt(cx * cx + cy * cy + cz * cz) * (w[faces[t * 3]] + w[faces[t * 3 + 1]] + w[faces[t * 3 + 2]]);
    cdf[t] = acc;
  }
  if (acc <= 0) throw new Error('Head mesh is empty');

  const positions = new Float32Array(count * 4);
  const jitter = new Float32Array(count);
  const bounds = { halfW: 0, halfH: 0 };
  for (let p = 0; p < count; p++) {
    const target = Math.random() * acc;
    let lo = 0;
    let hi = nt - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const a = faces[lo * 3] * 3;
    const b = faces[lo * 3 + 1] * 3;
    const c = faces[lo * 3 + 2] * 3;
    const r = Math.sqrt(Math.random());
    const r2 = Math.random();
    const wa = 1 - r, wb = r * (1 - r2), wc = r * r2;
    const x = (v[a] * wa + v[b] * wb + v[c] * wc) * s + (head.offsetX ?? 0);
    const y = (v[a + 1] * wa + v[b + 1] * wb + v[c + 1] * wc) * s + (head.offsetY ?? 0);
    const z = (v[a + 2] * wa + v[b + 2] * wb + v[c + 2] * wc) * s;

    const stray = Math.random() < strayRatio;
    const spread = stray ? s * 0.02 : 0;
    if (!stray) {
      bounds.halfW = Math.max(bounds.halfW, Math.abs(x));
      bounds.halfH = Math.max(bounds.halfH, Math.abs(y));
    }
    const i4 = p * 4;
    positions[i4 + 0] = x + gaussian() * spread;
    positions[i4 + 1] = y + gaussian() * spread;
    positions[i4 + 2] = z + gaussian() * spread;
    // How far this point follows the head's turn (simVelocity.frag).
    positions[i4 + 3] = (turn[faces[lo * 3]] * wa + turn[faces[lo * 3 + 1]] * wb + turn[faces[lo * 3 + 2]] * wc) / 255;
    const brightness = 0.5 + Math.random() * Math.random() * 0.85;
    jitter[p] = stray ? brightness * 0.55 : brightness;
  }
  return { positions, jitter, bounds };
}
