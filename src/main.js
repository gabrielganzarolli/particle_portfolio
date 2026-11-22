import * as THREE from 'three';

import './styles.css';
import { ParticleField } from './ParticleField.js';
import { Pointer } from './pointer.js';
import { readyFonts } from './textTargets.js';
import { backgroundOf } from './palette.js';
import { hidePreloader, showFatal } from './overlay.js';
import { createScrollWork } from './scrollWork.js';
import { storedLang, applyHomeLang, attachHomeToggle } from './homeI18n.js';
import { PHRASES as ALL_PHRASES } from './home.pt.js';
import { LEVELS, detectLevel } from './quality.js';
import { createFluid } from './fluid.js';
import { createPost } from './post.js';
import { createDust } from './dust.js';

const FOV = 50;
const FIELD_WIDTH = 10;
const FILL = 0.86; // fraction of the viewport width the phrase spans

const MORPH_MS = 1300;

// Margin around the phrase's own letterforms, in world units — the hover box is
// measured from the glyphs at build time, not from the raster box, which is far
// taller and wider than the word and made the hover trigger from empty space.
const HOVER_MARGIN = 0.12;
// Hysteresis, so a cursor resting on the boundary doesn't chatter.
const HOVER_SLACK = 0.18;

// Scroll-linked morph. While the page is moving the phrase follows the scroll,
// smoothed so a mouse wheel's discrete steps don't come through as jumps. Once
// the scroll has been still for SETTLE_AFTER_MS, a half-formed phrase finishes
// on its own in the direction the visitor was going, at the hover morph's pace,
// so the field never rests as an unreadable cloud.
const FOLLOW_RATE = 7; // 1/s, exponential approach to the scroll position
const SETTLE_AFTER_MS = 160;
const SETTLE_COMMIT = 0.12; // how far into a morph counts as having started it

// Pointer parallax: the camera drifts with the cursor, in world units.
const PARALLAX_X = 0.55;
const PARALLAX_Y = 0.3;

// Fluid input, from the Cream v3 proof.
const FLUID_POINTER = 9;
const FLUID_SCROLL = 0.22;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

const REST = 0;
const HOVER = 1;
const WORK = 2;
const ABOUT = 3;
// Language is settled before anything is built. The field rasterises each
// phrase into a texture at construction, so picking the wrong set here would
// mean rebuilding it later; reading the stored choice first avoids that
// entirely, and a returning visitor never sees the other language flash past.
const lang = storedLang() ?? 'en';
applyHomeLang(lang);
attachHomeToggle(lang);

const PHRASES = ALL_PHRASES[lang] ?? ALL_PHRASES.en;

// The phrases scroll walks through, in order. Scroll position maps to a single
// scalar over this chain: 0..1 is REST -> WORK, 1..2 is WORK -> ABOUT. Because
// consecutive links share a phrase, handing off between them needs no
// unwinding — the end of one link and the start of the next are the same shape.
const CHAIN = [REST, WORK, ABOUT];
const CHAIN_MAX = CHAIN.length - 1;

// How far the particles fade out once the work grid is covering them.
const MAX_DIM = 0.7;

/**
 * easeInOutSine. Gentler than the cubic it replaced: no hard acceleration out
 * of rest and no abrupt deceleration into the end, which is most of what makes
 * a scrubbed morph feel mechanical.
 */
function ease(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * The height CSS means by 100vh: the viewport with the browser's toolbar
 * collapsed. The runway is sized in vh, so scroll maths and the canvas use this
 * rather than innerHeight, which changes every time a phone's toolbar moves.
 */
function createViewportProbe() {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  return () => Math.max(probe.offsetHeight, window.innerHeight);
}

async function boot() {
  // Gates the hidden-until-revealed styles. If this module fails to load, the
  // .reveal elements never get opacity: 0 and the page still reads.
  document.documentElement.classList.add('js');

  // The hero is the whole point of the page, so a plain reload starts at the
  // top. A link to a section (#work from a case page) still lands on it: the
  // browser applies the hash after this runs.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash || location.hash.startsWith('#nivel')) window.scrollTo(0, 0);

  const canvas = document.getElementById('scene');
  const background = backgroundOf('white');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // pointless for points, and it costs real fill rate
    powerPreference: 'high-performance',
  });

  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('This GPU does not support float render targets.');
  }

  let level = detectLevel(renderer);
  let L = LEVELS[level];
  const pixelRatio = () => Math.min(window.devicePixelRatio, L.dprCap);

  const viewportHeight = createViewportProbe();
  let vw = window.innerWidth;
  let vh = viewportHeight();

  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(vw, vh);

  const camera = new THREE.PerspectiveCamera(FOV, vw / vh, 0.1, 200);
  camera.position.set(0, 0, 10);
  let cameraZ = 10;

  await readyFonts();

  const fluid = createFluid(renderer, { res: L.fluidRes, iterations: L.fluidIter });

  const field = new ParticleField(renderer, {
    size: L.grid,
    fieldWidth: FIELD_WIDTH,
    phrases: PHRASES,
    palette: 'white',
    reducedMotion,
    fluid,
  });
  field.scene.background = new THREE.Color(background);

  const dust = createDust(L.dust, { fieldWidth: FIELD_WIDTH, reducedMotion });
  dust.material.uniforms.uFluid.value = fluid.texture;
  field.scene.add(dust);

  const post = createPost(renderer, field.scene, camera, { background, bloomScale: L.bloom });

  // At the top of the page the morph runs REST -> PRODUCT DESIGNER under hover;
  // once scrolling starts it hands over to the scroll chain.
  let pairA = REST;
  let pairB = HOVER;
  field.setPair(pairA, pairB);

  function usePair(a, b) {
    if (a === pairA && b === pairB) return;
    pairA = a;
    pairB = b;
    field.setPair(a, b);
  }

  const scrollWork = createScrollWork();

  const pointer = new Pointer(canvas, camera);
  // Timer, not the deprecated Clock. Core's Timer has no max-delta setting, so
  // the clamp below stays manual.
  const timer = new THREE.Timer();

  function resize() {
    vw = window.innerWidth;
    vh = viewportHeight();

    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(vw, vh);
    post.setSize(vw, vh, pixelRatio());

    camera.aspect = vw / vh;

    // Pull the camera back until the phrase fills FILL of the frame. Check the
    // vertical fit too, otherwise the field overflows on portrait windows.
    const halfFov = THREE.MathUtils.degToRad(FOV) / 2;
    const fieldHeight = FIELD_WIDTH * 0.25;
    const byWidth = FIELD_WIDTH / FILL / (2 * Math.tan(halfFov) * camera.aspect);
    const byHeight = fieldHeight / FILL / (2 * Math.tan(halfFov));
    cameraZ = Math.max(byWidth, byHeight);
    camera.position.z = cameraZ;
    camera.updateProjectionMatrix();

    // gl_PointSize is in device pixels; convert world-space size to pixels.
    const pixelScale = renderer.domElement.height / (2 * Math.tan(halfFov));
    field.setPixelScale(pixelScale);
    dust.material.uniforms.uPixelScale.value = pixelScale;
  }

  resize();

  // A phone's toolbar sliding in or out fires resize with only the height
  // changed. The canvas is already sized to the tall viewport, so that case is
  // ignored; reallocating the drawing buffer on every toolbar move was a visible
  // hitch and nudged the phrase's size.
  window.addEventListener('resize', () => {
    if (window.innerWidth === vw && viewportHeight() === vh) return;
    resize();
  });

  // Screen-space pointer, for the fluid and the parallax. The Pointer class
  // keeps the world-space position the hover test and the repel use.
  let px = null;
  let py = null;
  let lastPx = null;
  let lastPy = null;
  window.addEventListener(
    'pointermove',
    (e) => {
      px = e.clientX;
      py = e.clientY;
    },
    { passive: true }
  );

  // Hover ---------------------------------------------------------------
  let hovering = false;
  let morphT = 0; // raw 0..1 ramp for hover; ease() is applied on the way to the shader

  const restBounds = field.boundsOf(REST);

  /** Is the cursor on the word itself? Tested against its measured ink extent. */
  function pointerOverText() {
    if (!pointer.targetActive || !pointer.hasSample) return false;
    // Widen the box slightly once already inside, so resting on the edge
    // doesn't flip the state every frame.
    const slack = HOVER_MARGIN + (hovering ? HOVER_SLACK : 0);
    const p = pointer.target;
    return (
      Math.abs(p.x) < restBounds.halfW + slack && Math.abs(p.y) < restBounds.halfH + slack
    );
  }

  // Touch devices have no hover, so a tap on the hero toggles instead. Only
  // while the hero is showing: a tap anywhere further down, on the case list or
  // the about text, used to flip the phrase waiting at the top.
  let tapped = false;
  if (coarsePointer && !reducedMotion) {
    window.addEventListener('click', (e) => {
      if (window.scrollY > 4) return;
      if (e.target.closest?.('a, button, section, footer')) return;
      tapped = !tapped;
    });
  }

  // Scroll morph state (see FOLLOW_RATE above) ------------------------------
  let chainShown = 0; // what the field displays, 0..CHAIN_MAX
  let lastScrollY = window.scrollY;
  let lastScrollAt = -Infinity;
  let scrollDir = 1;

  /** Where an idle morph should come to rest, given which way the visitor went. */
  function settleTarget(mapped) {
    const link = Math.min(Math.floor(mapped), CHAIN_MAX - 1);
    const f = mapped - link;
    if (f <= 0.0005 || f >= 0.9995) return mapped;
    if (scrollDir > 0) return link + (f > SETTLE_COMMIT ? 1 : 0);
    return link + (f < 1 - SETTLE_COMMIT ? 0 : 1);
  }

  // Frame probe: steps the quality level down if frames run long ----------
  const probe = [];
  let probing = level > 1 && !/nivel/.test(location.hash);

  function stepDown() {
    level -= 1;
    L = LEVELS[level];
    fluid.iterations = L.fluidIter;
    post.setBloomScale(L.bloom);
    dust.geometry.setDrawRange(0, L.dust);
    resize();
    probe.length = 0;
    probing = level > 1;
  }

  // Frame loop ----------------------------------------------------------
  let elapsed = 0;
  let frames = 0;
  let camX = 0;
  let camY = 0;
  let paused = false;

  function step(dt, now) {
    const { workProgress, aboutProgress, coverage, hidden } = scrollWork.update(vh);

    // Track scroll direction and idleness for the morph, even while paused.
    const sy = window.scrollY;
    const dS = sy - lastScrollY;
    if (Math.abs(dS) > 0.5) {
      scrollDir = Math.sign(dS);
      lastScrollAt = now;
    }
    lastScrollY = sy;

    // Nothing of the canvas shows while an opaque section fills the screen, so
    // neither simulate nor draw it. The particles hold their shape and pick up
    // where they were when the gap opens again.
    paused = hidden;
    if (paused) {
      // Forget the pointer's travel while hidden, or the first frame back would
      // push the whole distance moved meanwhile into the fluid at once.
      lastPx = px;
      lastPy = py;
      return;
    }

    elapsed += dt;
    frames++;

    // A median test let a machine sit at 45fps for good, since half its frames
    // still made 60. This steps down when more than a quarter of 150 frames
    // miss 60fps by a clear margin.
    if (probing && frames > 30) {
      probe.push(dt);
      if (probe.length >= 150) {
        const slow = probe.filter((d) => d > 0.021).length / probe.length;
        if (slow > 0.25) stepDown();
        else probing = false;
      }
    }

    // Fluid: the pointer stirs it, the scroll pushes it upward or downward.
    const strength = reducedMotion ? 0.4 : 1;
    if (px !== null && lastPx !== null) {
      const dx = (px - lastPx) / vw;
      const dy = -(py - lastPy) / vh;
      if (Math.abs(dx) + Math.abs(dy) > 1e-4) {
        fluid.push(px / vw, 1 - py / vh, dx * FLUID_POINTER * strength, dy * FLUID_POINTER * strength, 0.0016);
      }
    }
    lastPx = px;
    lastPy = py;
    if (!reducedMotion && Math.abs(dS) > 0.5) {
      const v = THREE.MathUtils.clamp(dS / 80, -1, 1);
      fluid.push(Math.random(), 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.1 * Math.abs(v), v * FLUID_SCROLL, 0.005);
    }
    fluid.step(dt);

    // Camera parallax with the pointer.
    if (!reducedMotion && px !== null) {
      const k = 1 - Math.exp(-dt * 2.2);
      camX += ((px / vw) * 2 - 1 - camX) * k;
      camY += (-((py / vh) * 2 - 1) - camY) * k;
    }
    camera.position.set(camX * PARALLAX_X, camY * PARALLAX_Y, cameraZ);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    field.setCamera(camera);

    pointer.update(dt);
    field.setPointer(pointer);

    field.setDim(coverage * MAX_DIM);
    dust.material.uniforms.uOpacity.value = 1 - coverage * MAX_DIM;

    if (reducedMotion) {
      field.setMorph(0);
    } else {
      // Position along CHAIN. aboutProgress only leaves 0 long after
      // workProgress has reached 1, so this stays monotonic and continuous.
      const mapped = workProgress + aboutProgress;
      const idle = now - lastScrollAt > SETTLE_AFTER_MS;

      // A fixed-rate ramp rather than exponential smoothing: the shader staggers
      // each particle over smoothstep(s, s + 0.45, uMorph) with s up to 0.55, so
      // the last particles only land when uMorph reaches exactly 1. An
      // asymptotic approach would leave the phrase permanently half-formed.
      const rate = dt / (MORPH_MS / 1000);

      if (!idle) {
        // Follow the scroll, but never back away from a phrase that already
        // settled ahead of it in the direction of travel.
        const target = scrollDir > 0 ? Math.max(chainShown, mapped) : Math.min(chainShown, mapped);
        const k = 1 - Math.exp(-dt * FOLLOW_RATE);
        chainShown += (target - chainShown) * k;
        if (Math.abs(target - chainShown) < 0.0005) chainShown = target;
      } else {
        const target = settleTarget(mapped);
        const diff = target - chainShown;
        chainShown += Math.sign(diff) * Math.min(Math.abs(diff), rate);
      }

      if (chainShown > 0.0005) {
        const link = Math.min(Math.floor(chainShown), CHAIN_MAX - 1);
        usePair(CHAIN[link], CHAIN[link + 1]);
        morphT = chainShown - link;
        hovering = false;
      } else if (pairB !== HOVER) {
        // Leaving the chain for hover mode. Both show REST at zero, so this
        // only has to wait out any residual blend before swapping.
        chainShown = 0;
        morphT = Math.max(morphT - rate, 0);
        if (morphT === 0) usePair(REST, HOVER);
        hovering = false;
      } else {
        hovering = coarsePointer ? tapped : pointerOverText();
        morphT = THREE.MathUtils.clamp(morphT + (hovering ? rate : -rate), 0, 1);
      }

      field.setMorph(ease(morphT));
    }

    field.update(dt, elapsed);
    dust.material.uniforms.uTime.value = elapsed;
    dust.material.uniforms.uFocus.value = field.material.uniforms.uFocus.value;
    post.render(dt, elapsed);
  }

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    // A backgrounded tab produces one enormous delta on return; unclamped it
    // detonates the field and the spring never pulls it back.
    step(Math.min(timer.getDelta(), 1 / 30), time);
  });

  document.body.style.background = background;
  hidePreloader();
  field.buildRemaining();

  if (import.meta.env.DEV) {
    const snapshot = () => ({
      frames,
      level,
      paused,
      hovering,
      morphT: +morphT.toFixed(3),
      chainShown: +chainShown.toFixed(3),
      pair: `${PHRASES[pairA]} -> ${PHRASES[pairB]}`,
      phrase: PHRASES[field.currentIndex],
      scrollY: window.scrollY,
    });

    window.__pf = { renderer, camera, field, pointer, fluid, post, dust, state: snapshot };
  }
}

boot().catch((err) => {
  console.error(err);
  showFatal(err.message ?? 'Failed to start the particle field.');
});
