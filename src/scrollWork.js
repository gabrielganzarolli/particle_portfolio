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
 * Text arrives as it crosses a line 10% above the bottom of the screen. Checked
 * in the frame loop main.js already runs, against only the elements still
 * waiting, so the cost falls to nothing once everything is shown. An
 * IntersectionObserver did this for a while, but it only reports crossings it
 * sees: a jump that carries an element from below the screen to above it in one
 * go (the scrollbar, the End key) left it invisible above the reader.
 */
function createReveals(gates) {
  const waiting = Array.from(document.querySelectorAll('.reveal'));
  // Text inside a gated section waits for its gate (see setGate below).
  const gateOf = (el) => (el.closest('.work') ? 'work' : el.closest('.about') ? 'about' : null);
  const held = { work: [], about: [] };

  return {
    /** Call once per frame, in the read phase. */
    update(viewH) {
      const line = viewH * 0.9;
      for (let i = waiting.length - 1; i >= 0; i--) {
        const el = waiting[i];
        if (el.getBoundingClientRect().top >= line) continue;
        waiting.splice(i, 1);
        const g = gateOf(el);
        if (g && !gates[g]) held[g].push(el);
        else el.classList.add('is-in');
      }
    },
    /** Everything that came into view while a gate was shut, in page order. */
    flush(name) {
      held[name]
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .forEach((el, i) => setTimeout(() => el.classList.add('is-in'), i * 70));
      held[name].length = 0;
    },
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
  const reveals = createReveals(gates);

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
      if (open) reveals.flush(name);
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
      reveals.update(viewH);

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
