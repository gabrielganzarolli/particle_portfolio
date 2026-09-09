const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// One dial for how fast everything scroll-linked feels. Every duration below is
// a fraction of viewport height, so raising this spreads each motion over more
// scroll without changing where any of them start. 1 = the earlier tuning.
const PACE = 2.0;

// Where an element flips to revealed, as a fraction of viewport height from the
// top. Reveals used to be scrubbed — transform and opacity recomputed from
// scroll offset every frame — which ties the motion to the scroll wheel's
// discrete steps and reads as juddery however gently it's eased. They are now a
// one-shot class toggle, with duration and travel handled by CSS transition, so
// the motion is smooth regardless of how the page is being scrolled.
const REVEAL_TRIGGER_VH = 0.92;

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
 * Reads scroll position once per frame and drives everything that depends on
 * it: the staggered reveals, the hero chrome fade, and the values main.js needs
 * back — how far each text morph has run, and how much solid content is
 * currently covering the canvas.
 */
export function createScrollWork() {
  const aboutSpace = document.querySelector('.about-space');
  const revealed = Array.from(document.querySelectorAll('.reveal'));
  const solids = Array.from(document.querySelectorAll('[data-solid]'));
  const chrome = Array.from(document.querySelectorAll('[data-fade-on-scroll]'));

  // Reused so the per-frame read pass doesn't allocate.
  const tops = new Float64Array(revealed.length);
  const solidTops = new Float64Array(solids.length);
  const solidBottoms = new Float64Array(solids.length);

  return {
    /** @returns {{ workProgress:number, aboutProgress:number, coverage:number }} */
    update() {
      const vh = window.innerHeight;
      const scrollY = window.scrollY;

      // --- read pass. Batched ahead of every write below, so the frame costs
      // one layout flush instead of one per element. ---
      for (let i = 0; i < revealed.length; i++) {
        tops[i] = revealed[i].getBoundingClientRect().top;
      }
      for (let i = 0; i < solids.length; i++) {
        const r = solids[i].getBoundingClientRect();
        solidTops[i] = r.top;
        solidBottoms[i] = r.bottom;
      }
      const aboutSpaceTop = aboutSpace ? aboutSpace.getBoundingClientRect().top : Infinity;

      // --- write pass ---
      // A one-way class toggle. Each element still staggers itself by its own
      // position on the page, so no per-element delays are needed, but the
      // motion itself is now CSS's job.
      for (let i = 0; i < revealed.length; i++) {
        if (tops[i] < vh * REVEAL_TRIGGER_VH) revealed[i].classList.add('is-in');
      }

      const chromeOpacity = 1 - clamp01(scrollY / (vh * CHROME_FADE_VH));
      for (const el of chrome) el.style.opacity = chromeOpacity.toFixed(3);

      // Largest share of the viewport that any one solid section is covering.
      // Drives the particle dim, and correctly drops back to 0 in the gap
      // between the sections where the field is meant to be visible again.
      let coverage = 0;
      for (let i = 0; i < solids.length; i++) {
        const visible = Math.min(solidBottoms[i], vh) - Math.max(solidTops[i], 0);
        if (visible > 0) coverage = Math.max(coverage, clamp01(visible / vh));
      }

      // Derived from the live rect rather than a hardcoded offset, so it stays
      // correct however tall the work grid ends up.
      const aboutStart = scrollY + aboutSpaceTop - vh * ABOUT_MORPH_START_VH;

      return {
        workProgress: clamp01(scrollY / (vh * TEXT_MORPH_VH)),
        aboutProgress: clamp01((scrollY - aboutStart) / (vh * ABOUT_MORPH_VH)),
        coverage,
      };
    },
  };
}
