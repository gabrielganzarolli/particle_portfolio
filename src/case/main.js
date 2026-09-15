import './case.css';
import { attachCompare } from './compare.js';

/**
 * Interactive behaviour only. The case text and images are already in the HTML
 * that the server sends — see scripts/build-cases.mjs — so this script adds the
 * scroll reveal and the comparison slider, and nothing else. Nothing here is
 * required to read the page.
 */

// Gate the hidden-until-revealed styles. If this module fails to load or
// throws, `.reveal` never gets its opacity: 0 and the page reads as plain
// content rather than a blank screen.
document.documentElement.classList.add('js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

attachCompare();

// A looping video is motion the visitor did not ask for. Under reduced-motion
// it stays on its poster until played deliberately; otherwise it plays only
// while on screen, which keeps it off the battery for the rest of the page.
// Without script it simply autoplays, and `controls` still makes it stoppable.
for (const v of document.querySelectorAll('.case-video video')) {
  if (reducedMotion) {
    v.autoplay = false;
    v.pause();
    v.currentTime = 0;
    continue;
  }
  if (!('IntersectionObserver' in window)) continue;

  // Once the visitor uses the controls, stop second-guessing them. The flag is
  // needed because scrolling away pauses the video too, and that must not be
  // mistaken for the visitor pausing it.
  let manual = false;
  let programmatic = false;
  const drive = (fn) => {
    programmatic = true;
    fn();
    // Cleared after the event has been dispatched, not synchronously.
    setTimeout(() => (programmatic = false), 0);
  };
  for (const evt of ['pause', 'play']) {
    v.addEventListener(evt, () => {
      if (!programmatic) manual = true;
    });
  }

  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (manual) return;
        if (e.isIntersecting) drive(() => v.play().catch(() => {}));
        else drive(() => v.pause());
      }
    },
    { threshold: 0.2 }
  ).observe(v);
}

// Reveal on scroll. The home page drives this from its rAF loop because it
// already runs one for the particle field; a content page has no loop to
// piggyback on, so IntersectionObserver is both cheaper and smoother here —
// the browser does the intersection work off the main thread and CSS handles
// the transition.
const targets = Array.from(document.querySelectorAll('.reveal'));
const showAll = () => targets.forEach((t) => t.classList.add('is-in'));

if (reducedMotion || !('IntersectionObserver' in window)) {
  showAll();
} else {
  let fired = false;

  const io = new IntersectionObserver(
    (entries) => {
      fired = true;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target); // reveal once, then stop paying for it
      }
    },
    // Fire a little before the element reaches the bottom edge, so content is
    // already settled by the time it is comfortably in view.
    { rootMargin: '0px 0px -12% 0px', threshold: 0.01 }
  );
  for (const t of targets) io.observe(t);

  // Chrome defers IntersectionObserver callbacks while a tab is hidden, and a
  // page loaded in a background tab would otherwise sit at opacity 0 with no
  // way back. An unrevealed page is a far worse failure than an unanimated one,
  // so if nothing has fired shortly after load, just show everything.
  setTimeout(() => {
    if (fired) return;
    showAll();
    io.disconnect();
  }, 1200);
}
