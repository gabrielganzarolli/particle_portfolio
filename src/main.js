import * as THREE from 'three';

import './styles.css';
import { ParticleField } from './ParticleField.js';
import { Pointer } from './pointer.js';
import { readyFonts } from './textTargets.js';
import { backgroundOf } from './palette.js';
import { createOverlay, hidePreloader, showFatal } from './overlay.js';
import { createScrollWork } from './scrollWork.js';
import { FieldAudio } from './audio.js';

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

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

const REST = 0;
const HOVER = 1;
const WORK = 2;
const ABOUT = 3;
const PHRASES = ['GABRIEL GANZAROLLI', 'PRODUCT DESIGNER', 'WORK', 'ABOUT ME'];

// The phrases scroll walks through, in order. Scroll position maps to a single
// scalar over this chain: 0..1 is REST -> WORK, 1..2 is WORK -> ABOUT. Because
// consecutive links share a phrase, handing off between them needs no
// unwinding — the end of one link and the start of the next are the same shape.
const CHAIN = [REST, WORK, ABOUT];

// How far the particles fade out once the work grid is covering them.
const MAX_DIM = 0.7;

function chooseSize() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || weak ? 256 : 512;
}

/** easeInOutCubic — slow departure, slow arrival, fast through the middle. */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function boot() {
  // The hero is the whole point of the page; restoring a reload to mid-scroll
  // drops you into the card grid with the intro already over.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  const canvas = document.getElementById('scene');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // pointless for points, and it costs real fill rate
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('This GPU does not support float render targets.');
  }

  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 10);

  await readyFonts();

  const field = new ParticleField(renderer, {
    size: chooseSize(),
    fieldWidth: FIELD_WIDTH,
    phrases: PHRASES,
    palette: 'white',
    reducedMotion,
  });

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

  createOverlay({ reducedMotion, coarsePointer });
  const scrollWork = createScrollWork();

  // Audio ---------------------------------------------------------------
  const audio = new FieldAudio();
  const soundBtn = document.querySelector('.sound-toggle');

  function paintSoundBtn() {
    if (!soundBtn) return;
    soundBtn.textContent = audio.enabled ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(audio.enabled));
  }
  paintSoundBtn();

  // Autoplay policy: the context can only start inside a real gesture. Scroll
  // does not count, so this listens for the ones that do.
  const unlock = () => audio.unlock();
  for (const evt of ['pointerdown', 'keydown', 'touchend']) {
    window.addEventListener(evt, unlock, { once: true, passive: true });
  }

  soundBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.unlock();
    audio.setEnabled(!audio.enabled);
    paintSoundBtn();
  });

  document.addEventListener('visibilitychange', () => {
    audio.setPageVisible(document.visibilityState === 'visible');
  });

  const pointer = new Pointer(canvas, camera);
  // Timer, not the deprecated Clock. Core's Timer has no max-delta setting, so
  // the clamp below stays manual.
  const timer = new THREE.Timer();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);

    camera.aspect = w / h;

    // Pull the camera back until the phrase fills FILL of the frame. Check the
    // vertical fit too, otherwise the field overflows on portrait windows.
    const halfFov = THREE.MathUtils.degToRad(FOV) / 2;
    const fieldHeight = FIELD_WIDTH * 0.25;
    const byWidth = FIELD_WIDTH / FILL / (2 * Math.tan(halfFov) * camera.aspect);
    const byHeight = fieldHeight / FILL / (2 * Math.tan(halfFov));
    camera.position.z = Math.max(byWidth, byHeight);
    camera.updateProjectionMatrix();

    // gl_PointSize is in device pixels; convert world-space size to pixels.
    field.setPixelScale(renderer.domElement.height / (2 * Math.tan(halfFov)));
  }

  resize();
  window.addEventListener('resize', resize);

  // Set by the DEV block below; a no-op in production.
  let hudUpdate = () => {};

  // Hover ---------------------------------------------------------------
  let hovering = false;
  let morphT = 0; // raw 0..1 ramp; ease() is applied on the way to the shader
  let prevMorph = 0; // previous frame's morphT, for the audio energy signal

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

  // Touch devices have no hover, so a tap toggles instead. Only wired up for
  // coarse pointers — on a mouse it would fight the hover state.
  let tapped = false;
  if (coarsePointer && !reducedMotion) {
    // On window for the same reason the pointer listeners are: the scrolling
    // content sits above the canvas. Card links keep their own behaviour.
    window.addEventListener('click', (e) => {
      if (e.target.closest?.('a')) return;
      tapped = !tapped;
    });
  }

  // Frame loop ----------------------------------------------------------
  let elapsed = 0;
  let frames = 0;

  function step(dt) {
    elapsed += dt;
    frames++;

    pointer.update(dt);
    field.setPointer(pointer);

    const { workProgress, aboutProgress, coverage } = scrollWork.update();
    field.setDim(coverage * MAX_DIM);

    if (reducedMotion) {
      field.setMorph(0);
    } else {
      // Position along CHAIN. aboutProgress only leaves 0 long after
      // workProgress has reached 1, so this stays monotonic and continuous.
      const chainT = workProgress + aboutProgress;
      const scrolling = chainT > 0.001;

      // A fixed-rate ramp rather than exponential smoothing: the shader staggers
      // each particle over smoothstep(s, s + 0.55, uMorph) with s up to 0.45, so
      // the last particles only land when uMorph reaches exactly 1. An
      // asymptotic approach would leave the phrase permanently half-formed.
      const rate = dt / (MORPH_MS / 1000);

      if (scrolling) {
        const link = Math.min(Math.floor(chainT), CHAIN.length - 2);
        usePair(CHAIN[link], CHAIN[link + 1]);
        morphT = chainT - link; // scrubbed directly by scroll position
        hovering = false;
      } else if (pairB !== HOVER) {
        // Leaving the chain for hover mode. Both show REST at zero, so this
        // only has to wait out any residual blend before swapping.
        morphT = Math.max(morphT - rate, 0);
        if (morphT === 0) usePair(REST, HOVER);
        hovering = false;
      } else {
        hovering = coarsePointer ? tapped : pointerOverText();
        morphT = THREE.MathUtils.clamp(morphT + (hovering ? rate : -rate), 0, 1);
      }

      field.setMorph(ease(morphT));
    }

    // Sound is driven by the same two quantities that drive the particles, so
    // it tracks the motion exactly rather than approximating it on a timer.
    // Reading actual speeds back off the GPU would stall the pipeline.
    const morphEnergy = dt > 0 ? Math.min(Math.abs(morphT - prevMorph) / dt / 1.5, 1) : 0;
    prevMorph = morphT;
    const pointerEnergy = Math.min(pointer.velocity.length() / 7, 1) * pointer.active;
    audio.update(morphEnergy, pointerEnergy);

    field.update(dt, elapsed);
    renderer.render(field.scene, camera);
    hudUpdate();
  }

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    // A backgrounded tab produces one enormous delta on return; unclamped it
    // detonates the field and the spring never pulls it back.
    step(Math.min(timer.getDelta(), 1 / 30));
  });

  document.body.style.background = backgroundOf('white');
  hidePreloader();

  if (import.meta.env.DEV) {
    // Dev-only scroll readout. Scroll to the moment you want something to
    // happen and read `gapTop` off the corner — that number is exactly what
    // ABOUT_MORPH_START_VH in scrollWork.js takes. Stripped from the
    // production build along with the rest of this block.
    const hud = document.createElement('div');
    hud.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:99;font:11px ui-monospace,monospace;' +
      'color:#9fe8b4;background:rgba(0,0,0,.72);padding:5px 8px;border-radius:4px;' +
      'pointer-events:none;white-space:pre;letter-spacing:.04em';
    document.body.appendChild(hud);

    const gapEl = document.querySelector('.about-space');
    let tick = 0;
    hudUpdate = () => {
      if (++tick % 6) return;
      const vh = window.innerHeight;
      const gapTop = gapEl ? gapEl.getBoundingClientRect().top / vh : NaN;
      hud.textContent =
        `gapTop ${gapTop.toFixed(3)}   morphT ${morphT.toFixed(2)}   ${PHRASES[field.currentIndex]}`;
    };

    const snapshot = () => ({
      frames,
      hovering,
      morphT: +morphT.toFixed(3),
      pair: `${PHRASES[pairA]} -> ${PHRASES[pairB]}`,
      phrase: PHRASES[field.currentIndex],
      scrollY: window.scrollY,
    });

    // requestAnimationFrame is suspended in hidden tabs, which makes the scene
    // unverifiable under browser automation. This lets a driver pump frames.
    window.__pf = {
      renderer,
      camera,
      field,
      pointer,
      audio,
      step,
      pump: (n = 60, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) step(dt);
        return snapshot();
      },
      state: snapshot,
    };
  }
}

boot().catch((err) => {
  console.error(err);
  showFatal(err.message ?? 'Failed to start the particle field.');
});
