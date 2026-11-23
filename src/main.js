import * as THREE from 'three';

import './styles.css';
import { ParticleField } from './ParticleField.js';
import { Pointer } from './pointer.js';
import { readyFonts, loadHeadMesh } from './textTargets.js';
import headMeshUrl from './images/head/head.bin?url';
import { backgroundOf } from './palette.js';
import { hidePreloader, showFatal } from './overlay.js';
import { createScrollWork } from './scrollWork.js';
import { storedLang, applyHomeLang, attachHomeToggle, onHomeSwitch } from './homeI18n.js';
import { PHRASES as ALL_PHRASES } from './home.pt.js';
import { LEVELS, detectLevel } from './quality.js';
import { createFluid } from './fluid.js';
import { createPost } from './post.js';
import { createDust } from './dust.js';
import { FIELD_DEFAULTS } from './ParticleField.js';
import { readSavedPreset, applyPreset } from './tuning.js';

const FOV = 50;
const FIELD_WIDTH = 10;
const FILL = 0.86; // fraction of the viewport width the phrase spans

// Margin around the phrase's own letterforms, in world units — the hover box is
// measured from the glyphs at build time, not from the raster box, which is far
// taller and wider than the word and made the hover trigger from empty space.
const HOVER_MARGIN = 0.12;
// Hysteresis, so a cursor resting on the boundary doesn't chatter.
const HOVER_SLACK = 0.18;

// Scroll-triggered morph. Scroll decides which phrase should be showing; the
// change itself runs on its own clock. A morph that tracked the scroll
// position finished only when the scroll did, and the particles need about a
// second after that to land, so at any brisk pace the section arrived over a
// half-formed word. Now a morph starts once the visitor is SCROLL_COMMIT of
// the way into it and runs at CHAIN_MS per phrase whatever the scroll does,
// and it reverses the same way when they scroll back.
// Every phrase change on the page runs on this one clock: the scroll morphs,
// the hover on the name and the language switch. It used to be 1300ms for the
// hover and scroll-tracked for the rest, so the same particles moved at three
// different speeds depending on what set them off.
const CHAIN_MS = 550;
const SCROLL_COMMIT = 0.03;

// After a scroll morph lands, the springs stiffen for a moment (uSnap in the
// velocity shader) so the letters settle in about half the time. It fades
// out after SNAP_HOLD_MS, so the cursor's push on a resting phrase keeps its
// usual give.
const SNAP_HOLD_MS = 1000;

// Each section's text waits until its phrase has settled this long, so the
// title and the list never come in over a word still forming. Scrolling past
// a phrase without stopping releases its section anyway.
const FORMED_MS = 400;

// Values the tuning panel (#ajuste) can change live. Parallax is how far the
// camera drifts with the cursor, in world units; the fluid values are the
// Cream v3 proof's.
const tune = {
  parallaxX: 0.55,
  parallaxY: 0.3,
  fluidPointer: 9,
  fluidScroll: 0.22,
  dissipation: 0.972,
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

const REST = 0;
const HOVER = 1;
const WORK = 2;
const ABOUT = 3;
// Gabriel's head in particles, shown by clicking the name (see the click below).
const HEAD = 4;
// How far the head turns toward the pointer, in radians, at the screen's edge.
const HEAD_YAW = 0.35;
const HEAD_PITCH = 0.3;
// The head is drawn as nodes joined by lines. Each node carries many
// particles, so it is lit to about HEAD_LIGHT particles' worth whatever the
// grid, and the bloom eases off.
const HEAD_POINT = 0.02;
const HEAD_LIGHT = 6;
// A small nod once the head has formed, and a tilt as it turns.
const HEAD_NOD = 0.14;
const HEAD_ROLL = 0.25;
// Language is settled before anything is built. The field rasterises each
// phrase into a texture at construction, so picking the wrong set here would
// mean rebuilding it later; reading the stored choice first avoids that
// entirely, and a returning visitor never sees the other language flash past.
const lang = storedLang() ?? 'en';
applyHomeLang(lang);
attachHomeToggle(lang);

// The head is the same object in both languages, so a language switch leaves it
// in place (ParticleField keeps any phrase that is identical in both sets).
let headMap = null;
const phrasesFor = (l) => [...(ALL_PHRASES[l] ?? ALL_PHRASES.en), ...(headMap ? [headMap] : [])];
let PHRASES = ALL_PHRASES[lang] ?? ALL_PHRASES.en;

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
  if (!location.hash || /^#(nivel|ajuste)/.test(location.hash)) window.scrollTo(0, 0);

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

  // The head loads alongside the fonts. Without it the page is the
  // same, minus the head.
  const [, map] = await Promise.all([readyFonts(), loadHeadMesh(headMeshUrl).catch(() => null)]);
  if (map) {
    // Sized to the screen it first opens on: about nine tenths of the view's
    // height, narrower than the view on a phone held upright.
    const halfFov = THREE.MathUtils.degToRad(FOV) / 2;
    const aspect = vw / vh;
    const z = Math.max(FIELD_WIDTH / FILL / (2 * Math.tan(halfFov) * aspect), (FIELD_WIDTH * 0.25) / FILL / (2 * Math.tan(halfFov)));
    const visH = 2 * z * Math.tan(halfFov);
    const visW = visH * aspect;
    const ratio = map.ratio;
    map.height = Math.min(visH * 0.9, (visW * 0.8) / ratio);
    headMap = map;
  }
  PHRASES = phrasesFor(lang);

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
  if (headMap) {
    field.setHead(HEAD, new THREE.Vector3(...headMap.points.pivot).multiplyScalar(headMap.height));
    field.setHeadNet(headMap.edges, headMap.points.fade);
  }

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


  /** Is the cursor on the word itself? Tested against its measured ink extent. */
  function pointerOverText() {
    if (!pointer.targetActive || !pointer.hasSample) return false;
    // Widen the box slightly once already inside, so resting on the edge
    // doesn't flip the state every frame.
    const slack = HOVER_MARGIN + (hovering ? HOVER_SLACK : 0);
    const p = pointer.target;
    const restBounds = field.boundsOf(REST);
    return (
      Math.abs(p.x) < restBounds.halfW + slack && Math.abs(p.y) < restBounds.halfH + slack
    );
  }

  /** Is the pointer on the head? Tested against its sampled extent. */
  function pointerOverHead() {
    if (!headMap || !pointer.targetActive || !pointer.hasSample) return false;
    return onHead(pointer.target);
  }

  const onHead = (p) => {
    const b = field.boundsOf(HEAD);
    return Math.abs(p.x) < b.halfW && Math.abs(p.y) < b.halfH;
  };
  const onName = (p) => {
    const b = field.boundsOf(REST);
    return Math.abs(p.x) < b.halfW + HOVER_MARGIN && Math.abs(p.y) < b.halfH + HOVER_MARGIN;
  };

  // Where a click lands on the plane the field lives on. Taken from the click
  // itself: on a touch screen the pointer has already lifted and left by the
  // time the click arrives, so the tracked pointer no longer has a position.
  const clickRay = new THREE.Vector3();
  const clickPoint = new THREE.Vector3();
  function worldAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    clickRay
      .set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    const t = -camera.position.z / clickRay.z;
    return clickPoint.copy(camera.position).addScaledVector(clickRay, t);
  }

  // Clicking the name turns it into Gabriel's head; clicking the head turns it
  // back. Only at the top of the page, where the name is the whole screen.
  // Touch devices have no hover, so a tap anywhere else on the hero still
  // toggles PRODUCT DESIGNER, as before.
  let headOn = false;
  let repelScale = 1;
  let tapped = false;
  window.addEventListener('click', (e) => {
    if (window.scrollY > 4 || chainShown > 0 || swap) return;
    if (e.target.closest?.('a, button, section, footer')) return;
    const at = worldAt(e.clientX, e.clientY);
    if (headMap && (headOn ? onHead(at) : onName(at))) {
      headOn = !headOn;
      tapped = false;
      if (headOn) {
        // From whatever is on screen (the name, or PRODUCT DESIGNER mid-hover).
        usePair(field.currentIndex === HOVER ? HOVER : REST, HEAD);
        morphT = 0;
      } else {
        // Back toward the name from the head.
        usePair(REST, HEAD);
      }
      if (reducedMotion) {
        field.jumpTo(headOn ? HEAD : REST);
        morphT = headOn ? 1 : 0;
      }
      return;
    }
    if (coarsePointer && !reducedMotion && !headOn) tapped = !tapped;
  });

  // The name and the head read as clickable: the cursor says so.
  let cursorHint = false;
  function updateCursor(atTop) {
    const want = Boolean(headMap) && atTop && (headOn ? pointerOverHead() : pointerOverText());
    if (want === cursorHint) return;
    cursorHint = want;
    document.body.style.cursor = want ? 'pointer' : '';
  }

  // Scroll morph state (see CHAIN_MS above) --------------------------------
  let chainShown = 0; // what the field displays, 0..CHAIN_MAX
  let lastScrollY = window.scrollY;
  let scrollDir = 1;
  let landedAt = -Infinity; // when the field last arrived on a phrase
  let snap = 0;

  // Language switch in place (see homeI18n.js). While `swap` is set the field
  // re-forms the phrase on screen in the new language, on the same clock and
  // with the same landing as every other phrase change.
  let swap = null;
  onHomeSwitch(async (next) => {
    if (swap) return;
    const phrases = phrasesFor(next);
    swap = { phase: 'preparing' };
    const index = field.currentIndex;
    await field.preparePhrases(phrases, [index, pairA, pairB]);
    field.beginSwap(index);
    swap = { phase: 'morphing', index, t: 0, phrases };
  });

  function finishSwap() {
    const { index, phrases } = swap;
    field.endSwap();
    if (reducedMotion) field.jumpTo(index);
    // The field now shows `index` in the new language; put the morph where
    // that is true for the current pair, so nothing moves on the handover.
    if (index === pairA || index === pairB) {
      morphT = index === pairA ? 0 : 1;
      field.setMorph(ease(morphT));
    }
    PHRASES = phrases;
    landedAt = performance.now();
    swap = null;
  }
  const released = { work: reducedMotion, about: reducedMotion };
  if (!reducedMotion) {
    scrollWork.setGate('work', false);
    scrollWork.setGate('about', false);
  }

  /** Which phrase the scroll asks for, given which way the visitor is going. */
  function chainTarget(mapped) {
    const link = Math.min(Math.floor(mapped), CHAIN_MAX - 1);
    const f = mapped - link;
    if (f <= 0.0005 || f >= 0.9995) return Math.round(mapped);
    if (scrollDir > 0) return link + (f > SCROLL_COMMIT ? 1 : 0);
    return link + (f < 1 - SCROLL_COMMIT ? 0 : 1);
  }

  /** Opens a section's text once its phrase has formed, or been passed. */
  function release(name) {
    if (released[name]) return;
    released[name] = true;
    scrollWork.setGate(name, true);
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
  let headYaw = 0;
  let headGlow = 0;
  let headLines = 0;
  let nodAt = -1e9;
  let leftHeadAt = -1e9;
  let wasHeadOn = false;
  let headPitch = 0;
  const headEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const headRot4 = new THREE.Matrix4();
  const headRot = new THREE.Matrix3();
  let camY = 0;
  let paused = false;

  function step(dt, now) {
    const { workProgress, aboutProgress, coverage, hidden } = scrollWork.update(vh);

    // Track scroll direction and idleness for the morph, even while paused.
    const sy = window.scrollY;
    const dS = sy - lastScrollY;
    if (Math.abs(dS) > 0.5) scrollDir = Math.sign(dS);
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
    if (probing && frames > 30 && !swap) {
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
        fluid.push(px / vw, 1 - py / vh, dx * tune.fluidPointer * strength, dy * tune.fluidPointer * strength, 0.0016);
      }
    }
    lastPx = px;
    lastPy = py;
    if (!reducedMotion && Math.abs(dS) > 0.5) {
      const v = THREE.MathUtils.clamp(dS / 80, -1, 1);
      fluid.push(Math.random(), 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.1 * Math.abs(v), v * tune.fluidScroll, 0.005);
    }
    fluid.step(dt, tune.dissipation);

    // Camera parallax with the pointer.
    if (!reducedMotion && px !== null) {
      const k = 1 - Math.exp(-dt * 2.2);
      camX += ((px / vw) * 2 - 1 - camX) * k;
      camY += (-((py / vh) * 2 - 1) - camY) * k;
    }
    camera.position.set(camX * tune.parallaxX, camY * tune.parallaxY, cameraZ);
    camera.lookAt(0, 0, 0);

    // The head looks toward the pointer. On a touch screen, with no pointer to
    // follow, it sways slowly on its own; under reduced motion it holds still.
    if (headMap) {
      let yaw = 0;
      let pitch = 0;
      if (!reducedMotion) {
        if (px !== null && !coarsePointer) {
          yaw = ((px / vw) * 2 - 1) * HEAD_YAW;
          pitch = ((py / vh) * 2 - 1) * HEAD_PITCH;
        } else {
          yaw = Math.sin(elapsed * 0.45) * 0.22;
          pitch = Math.sin(elapsed * 0.31) * 0.06;
        }
      }
      const kh = 1 - Math.exp(-dt * 3);
      headYaw += (yaw - headYaw) * kh;
      headPitch += (pitch - headPitch) * kh;
      const tn = (now - nodAt) / 1000;
      const nod = !reducedMotion && tn > 0 && tn < 2.5 ? HEAD_NOD * Math.sin(tn * Math.PI * 3) * Math.exp(-tn * 2.2) : 0;
      headEuler.set(headPitch + nod, headYaw, -headYaw * HEAD_ROLL);
      field.setHeadPose(headRot.setFromMatrix4(headRot4.makeRotationFromEuler(headEuler)));
    }
    camera.updateMatrixWorld();
    field.setCamera(camera);

    pointer.update(dt);
    field.setPointer(pointer);

    // The nodes dim as the head forms, and stay dim until the particles
    // leaving the head have landed: they leave each node in a tight bunch,
    // which under full light flashed white mid-flight.
    if (wasHeadOn && !headOn) leftHeadAt = now;
    wasHeadOn = headOn;
    const leaving = !headOn && now - leftHeadAt < CHAIN_MS + 150;
    const glowTarget = headOn ? morphT : leaving ? 1 : 0;
    headGlow += (glowTarget - headGlow) * Math.min(1, dt * (headOn || leaving ? 8 : 4));
    const nodes = headMap ? headMap.points.n : 1;
    const headLight = Math.min(1, (HEAD_LIGHT * nodes) / field.count);
    field.setDim(1 - (1 - coverage * MAX_DIM) * (1 - (1 - headLight) * headGlow));
    field.setHeadLook(headGlow, HEAD_POINT);
    // Lines only once the nodes have landed; they go first when the head leaves.
    const formed = headOn && morphT === 1;
    headLines += ((formed ? 1 : 0) - headLines) * Math.min(1, dt * (formed ? 2.5 : 12));
    field.setHeadLines(headLines * (1 - coverage));
    field.setHeadCalm(headLines);
    post.setBloomScale(L.bloom * (1 - 0.6 * headGlow));
    dust.material.uniforms.uOpacity.value = 1 - coverage * MAX_DIM;

    // One clock for every phrase change (CHAIN_MS).
    const rate = dt / (CHAIN_MS / 1000);
    let transitioning = false;

    if (swap?.phase === 'morphing') {
      if (reducedMotion) {
        finishSwap();
      } else {
        swap.t = Math.min(1, swap.t + rate);
        field.setMorph(ease(swap.t));
        transitioning = true;
        if (swap.t === 1) finishSwap();
      }
    } else if (reducedMotion) {
      if (headOn && window.scrollY > 4) {
        headOn = false;
        usePair(REST, HOVER);
        field.jumpTo(REST);
      }
      field.setMorph(headOn ? 1 : 0);
    } else {
      // Position along CHAIN. aboutProgress only leaves 0 long after
      // workProgress has reached 1, so this stays monotonic and continuous.
      const mapped = workProgress + aboutProgress;

      // A fixed-rate ramp rather than exponential smoothing: the shader staggers
      // each particle over smoothstep(s, s + 0.45, uMorph) with s up to 0.55, so
      // the last particles only land when uMorph reaches exactly 1. An
      // asymptotic approach would leave the phrase permanently half-formed.
      const target = chainTarget(mapped);
      const before = chainShown;
      const diff = target - chainShown;
      chainShown += Math.sign(diff) * Math.min(Math.abs(diff), rate);
      if (chainShown === target && before !== target) landedAt = now;

      const moving = chainShown !== target;
      const formed = !moving && now - landedAt > FORMED_MS;
      if (chainShown > 1 || (formed && chainShown === 1)) release('work');
      if (chainShown === 2 && formed) release('about');

      if (chainShown > 0.0005) {
        const link = Math.min(Math.floor(chainShown), CHAIN_MAX - 1);
        usePair(CHAIN[link], CHAIN[link + 1]);
        morphT = chainShown - link;
        hovering = false;
        // Scrolling away from the head: the particles fly from it straight
        // into the scroll's phrase, and the name is what comes back on return.
        headOn = false;
        transitioning = moving;
      } else if (headOn) {
        const was = morphT;
        morphT = Math.min(1, morphT + rate);
        if (morphT === 1 && was < 1) {
          landedAt = now;
          nodAt = now;
        }
        hovering = false;
        transitioning = morphT < 1;
      } else if (pairB !== HOVER) {
        // Leaving the chain for hover mode. Both show REST at zero, so this
        // only has to wait out any residual blend before swapping.
        chainShown = 0;
        const was = morphT;
        morphT = Math.max(morphT - rate, 0);
        if (morphT === 0) usePair(REST, HOVER);
        if (morphT === 0 && was > 0) landedAt = now;
        hovering = false;
        transitioning = morphT > 0;
      } else {
        hovering = coarsePointer ? tapped : pointerOverText();
        const was = morphT;
        morphT = THREE.MathUtils.clamp(morphT + (hovering ? rate : -rate), 0, 1);
        if (morphT !== was && (morphT === 0 || morphT === 1)) landedAt = now;
        transitioning = morphT > 0 && morphT < 1;
      }

      field.setMorph(ease(morphT));
    }

    updateCursor(!swap && chainShown === 0 && window.scrollY <= 4);

    // On the head the cursor steers the turn instead of pushing: any push
    // opened a hole in the face wherever the cursor rested.
    repelScale += ((headOn ? 0 : 1) - repelScale) * Math.min(1, dt * 4);
    field.setRepelScale(repelScale);

    // Stiffer springs while any phrase change lands, then the usual give.
    const settling = now - landedAt < SNAP_HOLD_MS;
    snap += ((transitioning || settling ? 1 : 0) - snap) * Math.min(1, dt * 5);
    field.setSnap(snap);

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

  // Tuning panel, only with #ajuste in the address.
  const tuningCtx = { tune, fieldDefaults: FIELD_DEFAULTS, field, post, dust, level: () => level };
  applyPreset(readSavedPreset(), tuningCtx);
  if (/ajuste/.test(location.hash)) {
    import('./tuning.js').then(({ attachTuning }) => attachTuning(tuningCtx)).catch(console.warn);
  }

  if (import.meta.env.DEV) {
    const label = (i) => (typeof PHRASES[i] === 'string' ? PHRASES[i] : 'HEAD');
    const snapshot = () => ({
      frames,
      level,
      paused,
      hovering,
      morphT: +morphT.toFixed(3),
      chainShown: +chainShown.toFixed(3),
      pair: `${label(pairA)} -> ${label(pairB)}`,
      phrase: label(field.currentIndex),
      headOn,
      scrollY: window.scrollY,
    });

    window.__pf = { renderer, camera, field, pointer, fluid, post, dust, state: snapshot };
  }
}

boot().catch((err) => {
  console.error(err);
  showFatal(err.message ?? 'Failed to start the particle field.');
});
