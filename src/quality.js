/**
 * Quality levels, the same three-step scheme as the Cream v3 proof.
 *
 * Level 3 is the full look: the 512² field, bloom, the 128² fluid and the most
 * dust. Level 2 keeps every effect at a lower cost. Level 1 drops bloom and
 * halves the field, for phones and weak machines. A frame probe in main.js can
 * still step a level 3 or 2 machine down if it turns out slower than it looked.
 *
 * `#nivel1`, `#nivel2` or `#nivel3` in the address forces a level, for testing.
 */

export const LEVELS = {
  1: { grid: 256, dprCap: 1, bloom: 0, fluidRes: 64, fluidIter: 6, dust: 900 },
  2: { grid: 384, dprCap: 1.25, bloom: 0.75, fluidRes: 96, fluidIter: 10, dust: 2200 },
  // 1.5, not 2: measured on an M-series MacBook, the bloom at a full retina
  // buffer dropped the hero to ~50fps; at 1.5 it holds 60 and the difference
  // in the particles is not visible.
  3: { grid: 512, dprCap: 1.5, bloom: 1, fluidRes: 128, fluidIter: 14, dust: 4200 },
};

export function detectLevel(renderer) {
  const forced = location.hash.match(/nivel([123])/);
  if (forced) return +forced[1];

  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 1;

  const touch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  const mem = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;

  if (touch) return mem >= 6 && cores >= 6 ? 2 : 1;
  if (mem < 4 || cores < 4) return 2;
  return 3;
}
