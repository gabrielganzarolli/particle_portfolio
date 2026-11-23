const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// One dial for how fast everything scroll-linked feels. Every duration below is
// a fraction of viewport height, so raising this spreads each motion over more
// scroll without changing where any of them start. 1 = the earlier tuning.
const PACE = 2.0;

// Each phrase has to be fully formed, and seen alone for a moment, before the
// section it introduces comes up from the bottom of the screen. So the end of
// each morph is derived from where that section's title sits, not from a fixed
// scroll distance: the morph finishes HOLD_VH of scroll before the title's top
// reaches the bottom edge, and the phrase holds alone for that stretch.
//
// Before this, REST -> WORK ran over a fixed 1.2 screens of scroll and was
// only ~96% done when "Selected work" and the first case were already on
// screen; the letters land at exactly 100%, so WORK never read as a word
// before the list covered it.
const HOLD_VH = 0.35;

// The WORK -> ABOUT ME morph starts when the gap's top edge is this far down
// the viewport. The WORK glyphs occupy roughly 0.34–0.66 of the viewport
// height, but the work section's bottom 22% is a gradient fade, so the word is
// already legible through it before the gap proper arrives.
const ABOUT_MORPH_START_VH = 0.75;

// A morph never gets squeezed into less scroll than this, whatever the layout.
const MIN_MORPH_VH = 0.3;

// The hero chrome (bio, hint) is gone by the time the case list arrives.
const CHROME_FADE_VH = 0.45 * PACE;

/**
 * Reveals run on IntersectionObserver: the browser works out visibility off the
 * main thread and each element is dropped once shown. They used to be read with
 * getBoundingClientRect every frame, all fifteen of them, for the life of the
 * page. The trigger line sits 8% above the bottom edge, as before.
 */
function observeReveals(gates) {
  const targets = Array.from(document.querySelectorAll('.reveal'));
  // Text inside a gated section waits for its gate (see setGate below).
  const gateOf = (el) => (el.closest('.work') ? 'work' : el.closest('.about') ? 'about' : null);
  const waiting = { work: [], about: [] };

  const show = (el) => {
    const g = gateOf(el);
    if (g && !gates[g]) waiting[g].push(el);
    else el.classList.add('is-in');
  };

  if (!('IntersectionObserver' in window)) {
    targets.forEach(show);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 }
    );
    targets.forEach((t) => io.observe(t));
  }

  return (name) => {
    // Everything that came into view while the gate was shut, in page order,
    // a short beat apart so the list still reads top to bottom.
    waiting[name].forEach((el, i) => setTimeout(() => el.classList.add('is-in'), i * 70));
    waiting[name].length = 0;
  };
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
  // Gates start open: if the particle field never starts, nothing waits.
  const gates = { work: true, about: true };
  const flush = observeReveals(gates);

  const main = document.querySelector('main');
  const aboutSpace = document.querySelector('.about-space');
  const workTitle = document.querySelector('.work-title');
  const aboutTitle = document.querySelector('.about-title');
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
    /**
     * Hold a section's text back until its phrase has formed, then let it in.
     * main.js shuts both gates at start and opens each when its word settles.
     */
    setGate(name, open) {
      gates[name] = open;
      if (open) flush(name);
    },

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

      // Document positions of the two section titles. offsetTop, not the
      // bounding rect: the titles carry the reveal's 18px offset until they are
      // shown, and the morph's end must not move when that offset goes away.
      const mainTop = main.getBoundingClientRect().top + scrollY;
      const enters = (el) => (el ? mainTop + el.offsetTop - vh : Infinity);

      const workEnd = Math.max(enters(workTitle) - vh * HOLD_VH, vh * MIN_MORPH_VH);

      // Derived from the live rect rather than a hardcoded offset, so it stays
      // correct however tall the work grid ends up.
      const aboutStart = scrollY + aboutSpaceTop - vh * ABOUT_MORPH_START_VH;
      const aboutEnd = Math.max(enters(aboutTitle) - vh * HOLD_VH, aboutStart + vh * MIN_MORPH_VH);

      return {
        workProgress: clamp01(scrollY / workEnd),
        aboutProgress: clamp01((scrollY - aboutStart) / (aboutEnd - aboutStart)),
        coverage,
        hidden,
      };
    },
  };
}
