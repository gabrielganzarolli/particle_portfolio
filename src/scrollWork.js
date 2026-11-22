const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// One dial for how fast everything scroll-linked feels. Every duration below is
// a fraction of viewport height, so raising this spreads each motion over more
// scroll without changing where any of them start. 1 = the earlier tuning.
const PACE = 2.0;

// Scroll distance over which the particle text morphs into WORK. The phrase
// should land before the case list starts covering it.
const TEXT_MORPH_VH = 0.6 * PACE;

// The WORK -> ABOUT ME morph, triggered when the gap's top edge is this far
// down the viewport. The particle text sits at the vertical centre, so firing
// the instant the gap appeared ran the whole morph behind the work section.
//
// The WORK glyphs occupy roughly 0.34–0.66 of the viewport height, but the work
// section's bottom 22% is a gradient fade, so the word is already legible
// through it before the gap proper arrives. Triggering at 0.44 uses that fade
// rather than waiting the gap out — that wait was most of the dead scroll.
const ABOUT_MORPH_START_VH = 0.44;
const ABOUT_MORPH_VH = 0.36 * PACE;

// The hero chrome (bio, hint) is gone by the time the case list arrives.
const CHROME_FADE_VH = 0.45 * PACE;

/**
 * Reveals run on IntersectionObserver: the browser works out visibility off the
 * main thread and each element is dropped once shown. They used to be read with
 * getBoundingClientRect every frame, all fifteen of them, for the life of the
 * page. The trigger line sits 8% above the bottom edge, as before.
 */
function observeReveals() {
  const targets = Array.from(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0 }
  );
  targets.forEach((t) => io.observe(t));
}

/**
 * Reads scroll position once per frame and drives everything that depends on
 * it: the hero chrome fade and the values main.js needs back — how far each
 * text morph has run, how much solid content is covering the canvas, and
 * whether the canvas is hidden outright.
 *
 * `vh` comes from main.js rather than window.innerHeight. On a phone the
 * browser's toolbar collapses and returns as you scroll, which changes
 * innerHeight by about 10% each time; the CSS runway is sized in vh, which
 * does not change, so reading innerHeight made the morph jump on every toolbar
 * move.
 */
export function createScrollWork() {
  observeReveals();

  const aboutSpace = document.querySelector('.about-space');
  const solids = Array.from(document.querySelectorAll('[data-solid]'));
  const chrome = Array.from(document.querySelectorAll('[data-fade-on-scroll]'));

  // Each solid section declares the band of its height that is fully opaque —
  // its gradient edges are not. When one band covers the whole viewport the
  // canvas cannot be seen, so main.js stops simulating and drawing it.
  const opaque = solids.map((el) => [
    parseFloat(el.dataset.opaqueFrom ?? '0'),
    parseFloat(el.dataset.opaqueTo ?? '1'),
  ]);

  const solidTops = new Float64Array(solids.length);
  const solidBottoms = new Float64Array(solids.length);
  let lastChrome = -1;

  return {
    /** @returns {{ workProgress:number, aboutProgress:number, coverage:number, hidden:boolean }} */
    update(vh) {
      const scrollY = window.scrollY;

      // Read pass first, then writes, so the frame costs one layout flush.
      for (let i = 0; i < solids.length; i++) {
        const r = solids[i].getBoundingClientRect();
        solidTops[i] = r.top;
        solidBottoms[i] = r.bottom;
      }
      const aboutSpaceTop = aboutSpace ? aboutSpace.getBoundingClientRect().top : Infinity;
      const viewH = window.innerHeight;

      const chromeOpacity = 1 - clamp01(scrollY / (vh * CHROME_FADE_VH));
      if (chromeOpacity !== lastChrome) {
        lastChrome = chromeOpacity;
        for (const el of chrome) el.style.opacity = chromeOpacity.toFixed(3);
      }

      // Largest share of the viewport that any one solid section is covering.
      // Drives the particle dim, and correctly drops back to 0 in the gap
      // between the sections where the field is meant to be visible again.
      let coverage = 0;
      let hidden = false;
      for (let i = 0; i < solids.length; i++) {
        const top = solidTops[i];
        const h = solidBottoms[i] - top;
        const visible = Math.min(solidBottoms[i], viewH) - Math.max(top, 0);
        if (visible > 0) coverage = Math.max(coverage, clamp01(visible / viewH));

        const [from, to] = opaque[i];
        if (top + h * from <= 0 && top + h * to >= viewH) hidden = true;
      }

      // Derived from the live rect rather than a hardcoded offset, so it stays
      // correct however tall the work grid ends up.
      const aboutStart = scrollY + aboutSpaceTop - vh * ABOUT_MORPH_START_VH;

      return {
        workProgress: clamp01(scrollY / (vh * TEXT_MORPH_VH)),
        aboutProgress: clamp01((scrollY - aboutStart) / (vh * ABOUT_MORPH_VH)),
        coverage,
        hidden,
      };
    },
  };
}
