import * as THREE from 'three';

// Sampled off the Shopify Editions hero: a near-black violet ground with
// green / magenta / cream speckle. Weights control how often each hue shows up
// — cream dominates so the letterforms stay readable, the hues are seasoning.
export const PALETTES = {
  editions: {
    background: '#07060c',
    // Ordered as a ramp, not a set — consecutive stops are adjacent in the
    // gradient, so interpolating between them stays in gamut instead of passing
    // through mud. The two ends are the neutrals on purpose: the noise driving
    // the lookup is bell-shaped, so its tails clip, and clipping into cream and
    // sand is invisible where clipping into vivid magenta would not be.
    //
    // Weighted toward hues over neutrals: additive blending sums overlapping
    // particles toward white, so a cream-dominant mix reads as a grey slab once
    // the letterforms get dense.
    stops: [
      { color: '#ffffff', weight: 0.20 }, // white
      { color: '#f4ecdc', weight: 0.16 }, // cream
      { color: '#7ce495', weight: 0.17 }, // spring green
      { color: '#4ec9a0', weight: 0.07 }, // teal
      { color: '#b79cf0', weight: 0.07 }, // lilac
      { color: '#f277d2', weight: 0.15 }, // magenta
      { color: '#fff2f7', weight: 0.18 }, // near-white pink
    ],
  },
  // All-white. The stops still vary slightly in temperature — a single flat
  // #ffffff reads as a dead sheet under additive blending, because every
  // particle then differs only in luminance. A few degrees of warm/cool drift
  // keeps the field looking lit rather than printed.
  white: {
    background: '#07060c',
    stops: [
      { color: '#eef1f8', weight: 0.22 }, // cool white
      { color: '#ffffff', weight: 0.42 }, // pure white
      { color: '#fff6ea', weight: 0.24 }, // warm white
      { color: '#ffffff', weight: 0.12 }, // pure white again at the warm end
    ],
  },

  mono: {
    background: '#08080a',
    stops: [
      { color: '#8e8e99', weight: 0.25 },
      { color: '#cfcfd6', weight: 0.35 },
      { color: '#ffffff', weight: 0.4 },
    ],
  },
};

/**
 * Build a 1D gradient LUT through the palette, weighted by each stop's share.
 *
 * The shader looks this up with a noise value derived from the particle's
 * *world* position, which is the whole point: hue has to be a function of where
 * a particle currently is, not of which phrase built it. Baking color per
 * particle at target-build time only stays coherent for the one phrase whose
 * layout generated it — every subsequent phrase scrambles the patches and
 * additive blending sums the mixed hues back to grey.
 *
 * Stops sit at the midpoint of their weighted band and the ramp lerps between
 * them, so the field reads as smooth color regions rather than hard bands —
 * much like sampling a photograph, which is what the reference actually does.
 */
export function createPaletteTexture(name = 'editions', size = 256) {
  const palette = PALETTES[name] ?? PALETTES.editions;
  const stops = palette.stops;

  const total = stops.reduce((a, s) => a + s.weight, 0);
  const anchors = [];
  let acc = 0;
  for (const s of stops) {
    anchors.push({ at: (acc + s.weight / 2) / total, color: new THREE.Color(s.color) });
    acc += s.weight;
  }

  const data = new Uint8Array(size * 4);
  const c = new THREE.Color();

  for (let i = 0; i < size; i++) {
    const t = (i + 0.5) / size;

    let hi = 0;
    while (hi < anchors.length - 1 && anchors[hi].at < t) hi++;
    const lo = Math.max(hi - 1, 0);

    const a = anchors[lo];
    const b = anchors[hi];
    const span = b.at - a.at;
    const k = span > 1e-6 ? THREE.MathUtils.clamp((t - a.at) / span, 0, 1) : 0;

    c.copy(a.color).lerp(b.color, k);

    data[i * 4 + 0] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function backgroundOf(name = 'editions') {
  return (PALETTES[name] ?? PALETTES.editions).background;
}
