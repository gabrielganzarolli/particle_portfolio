import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

import simplex from './shaders/lib/simplex3d.glsl?raw';
import curl from './shaders/lib/curl.glsl?raw';
import simVelocity from './shaders/simVelocity.frag?raw';
import simPosition from './shaders/simPosition.frag?raw';
import pointsVert from './shaders/points.vert?raw';
import pointsFrag from './shaders/points.frag?raw';

import { buildTarget, buildTargetInSlices, toDataTexture } from './textTargets.js';
import { createPaletteTexture } from './palette.js';

// No #include preprocessor here — the noise library is just concatenated in.
const VELOCITY_SHADER = `${simplex}\n${curl}\n${simVelocity}`;
const POINTS_VERT = `${simplex}\n${pointsVert}`;

// The damping term works out to c = -60*ln(damping) per second, so critical
// damping sits at spring = (c/2)^2 — about 8.0 at 0.91. Sitting just above it
// gives a soft arrival with the faintest overshoot, settling over ~0.8s. The
// earlier 16/0.88 pair was well above critical and snapped into place.
const DEFAULTS = {
  spring: 9.0,
  damping: 0.91,
  // Bigger, slower eddies. Amplitude came down because the weaker spring lets
  // the same force push further — displacement is force/spring, so holding
  // turbulence at 0.28 would have loosened the letterforms.
  turbulence: 0.24,
  noiseScale: 0.28,
  flow: 0.055,
  maxSpeed: 10.0,
  // Equilibrium displacement under the cursor is repel/spring world units, so
  // 8/9 keeps roughly the previous reach while the wider radius spreads it over
  // more of the field — a soft swell rather than a sharp dent.
  repel: 8.0,
  wake: 0.06,
  radius: 1.6,
  // ~2 device pixels per particle. Larger than that and 262k additive sprites
  // overdraw each other into a solid white slab with no letterforms left.
  pointSize: 0.008,
  // Lower than the 0.62 this ran at before the bloom pass: the field now
  // renders in linear light and is encoded on output, which lifts mid-tones,
  // and the bloom adds its own glow on top.
  opacity: 0.5,
  // Feature size of the hue field, in world units of ~1/colorScale. At 0.34 the
  // whole phrase fell inside one or two patches and read as flat tinting.
  colorScale: 1.1,
  colorSpread: 1.3,
  // Screen-space fluid, in world units of push per texel-per-step of fluid
  // velocity. The springs pull everything back, so this reads as a wave through
  // the letterforms that settles rather than as a smear. Above ~12 a fast swipe
  // tore the phrase apart into bright clumps.
  fluidForce: 9.0,
  // Depth of field. Particles away from the phrase's plane grow and dim, so
  // anything flying in depth during a morph reads as out-of-focus light.
  dof: 0.32,
};

export class ParticleField {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ size:number, fieldWidth:number, phrases:string[], palette:string, reducedMotion:boolean }} opts
   */
  constructor(renderer, opts) {
    this.renderer = renderer;
    this.size = opts.size;
    this.count = opts.size * opts.size;
    this.fieldWidth = opts.fieldWidth;
    this.phrases = opts.phrases;
    this.paletteName = opts.palette ?? 'editions';
    this.reducedMotion = !!opts.reducedMotion;

    this.scene = new THREE.Scene();

    this.#buildTargets();
    this.#buildCompute(opts.fluid);
    this.#buildPoints();

    // Invariant: at rest, morph is 0 and the field is showing indexA. `settle()`
    // restores that after every transition. Without it, a completed morph left
    // the field displaying indexB while indexA still named the previous phrase,
    // so the next advance() snapped a whole phrase forward and skipped one.
    this.morph = 0;
    this.indexA = 0;
    this.indexB = 0;
    this.#applyTargets();
  }

  // Only the two phrases the top of the page needs are built up front. Each
  // one rasterises a 2048×512 canvas and samples every particle from it, which
  // is roughly 90ms of main thread apiece; building all four before the first
  // frame was a 350ms stall behind the preloader. The rest are built in idle
  // time by buildRemaining(), or on demand if scroll gets there first.
  #buildTargets() {
    this.targets = new Array(this.phrases.length).fill(null);
    this.bounds = new Array(this.phrases.length).fill(null);
    this.jitter = null;

    this.#target(0);
    this.#target(1);

    this.firstPositions = this.targets[0].image.data;
  }

  #target(i) {
    if (this.targets[i]) return this.targets[i];
    const { positions, jitter, bounds } = buildTarget(this.phrases[i], {
      count: this.count,
      fieldWidth: this.fieldWidth,
    });
    this.#store(i, positions, jitter, bounds);
    return this.targets[i];
  }

  #store(i, positions, jitter, bounds) {
    // Brightness is assigned once and travels with the particle. Re-rolling it
    // per phrase would make the whole field flicker on every transition.
    if (!this.jitter) this.jitter = jitter;
    this.targets[i] = toDataTexture(positions, this.size);
    this.bounds[i] = bounds;
  }

  /**
   * Build the phrases not needed at the top of the page in slices between
   * frames. If scroll reaches one first, #target() builds it on the spot and
   * the slower copy is dropped when it arrives.
   */
  async buildRemaining() {
    for (let i = 0; i < this.phrases.length; i++) {
      if (this.targets[i]) continue;
      const { positions, jitter, bounds } = await buildTargetInSlices(this.phrases[i], {
        count: this.count,
        fieldWidth: this.fieldWidth,
      });
      if (!this.targets[i]) this.#store(i, positions, jitter, bounds);
    }
  }

  #buildCompute(fluid) {
    const gpu = new GPUComputationRenderer(this.size, this.size, this.renderer);
    gpu.setDataType(THREE.FloatType);

    const pos0 = gpu.createTexture();
    const vel0 = gpu.createTexture();

    // Start as a loose cloud so the first formation is a visible gather rather
    // than the phrase simply popping into existence. Under reduced motion that
    // gather is exactly the large movement the visitor asked not to see, so
    // the field starts already formed.
    const p = pos0.image.data;
    const v = vel0.image.data;
    if (this.reducedMotion) {
      p.set(this.firstPositions);
      v.fill(0);
    }
    for (let i = 0; i < this.count && !this.reducedMotion; i++) {
      const i4 = i * 4;
      const r = this.fieldWidth * (0.45 + Math.random() * 0.75);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      p[i4 + 0] = r * Math.sin(phi) * Math.cos(theta);
      p[i4 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.4;
      p[i4 + 2] = r * Math.cos(phi) * 0.12;
      p[i4 + 3] = 1;
      v[i4 + 0] = v[i4 + 1] = v[i4 + 2] = v[i4 + 3] = 0;
    }

    this.posVar = gpu.addVariable('texturePosition', simPosition, pos0);
    this.velVar = gpu.addVariable('textureVelocity', VELOCITY_SHADER, vel0);

    gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    const t = this.reducedMotion ? 0.02 : DEFAULTS.turbulence;

    this.posVar.material.uniforms.uDt = { value: 0 };

    Object.assign(this.velVar.material.uniforms, {
      uTime: { value: 0 },
      uDt: { value: 0 },
      uMorph: { value: 0 },
      uTargetA: { value: null },
      uTargetB: { value: null },
      uMouse: { value: new THREE.Vector3(1e6, 1e6, 0) },
      uMouseVel: { value: new THREE.Vector3() },
      uMouseActive: { value: 0 },
      uRepel: { value: DEFAULTS.repel },
      uWake: { value: DEFAULTS.wake },
      uRadius: { value: DEFAULTS.radius },
      uSpring: { value: DEFAULTS.spring },
      uDamping: { value: DEFAULTS.damping },
      uTurbulence: { value: t },
      uNoiseScale: { value: DEFAULTS.noiseScale },
      uFlow: { value: DEFAULTS.flow },
      uMaxSpeed: { value: DEFAULTS.maxSpeed },
      uSnap: { value: 0 },
      uFluid: { value: fluid?.texture ?? null },
      uFluidForce: { value: fluid ? DEFAULTS.fluidForce : 0 },
      uViewProj: { value: new THREE.Matrix4() },
    });
    this.fluid = fluid ?? null;

    for (const v2 of [this.posVar, this.velVar]) {
      v2.wrapS = THREE.ClampToEdgeWrapping;
      v2.wrapT = THREE.ClampToEdgeWrapping;
      v2.minFilter = THREE.NearestFilter;
      v2.magFilter = THREE.NearestFilter;
    }

    const error = gpu.init();
    if (error !== null) throw new Error(`GPUComputationRenderer: ${error}`);

    this.gpu = gpu;
  }

  #buildPoints() {
    const geometry = new THREE.BufferGeometry();

    const refs = new Float32Array(this.count * 2);
    const basePositions = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const x = i % this.size;
      const y = (i / this.size) | 0;
      refs[i * 2 + 0] = (x + 0.5) / this.size;
      refs[i * 2 + 1] = (y + 0.5) / this.size;

      basePositions[i * 3 + 0] = this.firstPositions[i * 4 + 0];
      basePositions[i * 3 + 1] = this.firstPositions[i * 4 + 1];
      basePositions[i * 3 + 2] = this.firstPositions[i * 4 + 2];
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(basePositions, 3));
    geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    geometry.setAttribute('aJitter', new THREE.BufferAttribute(this.jitter, 1));

    this.palette = createPaletteTexture(this.paletteName);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null },
        uPalette: { value: this.palette },
        // Halving the grid quarters the particle count, so each point has to
        // cover four times the area to keep the same coverage — double the
        // diameter. Without this the low-power path renders a threadbare field.
        uSize: { value: DEFAULTS.pointSize * (512 / this.size) },
        uPixelScale: { value: 1 },
        uOpacity: { value: DEFAULTS.opacity },
        uColorScale: { value: DEFAULTS.colorScale },
        uColorSpread: { value: DEFAULTS.colorSpread },
        uFocus: { value: 10 },
        uDof: { value: this.reducedMotion ? 0 : DEFAULTS.dof },
      },
      vertexShader: POINTS_VERT,
      fragmentShader: pointsFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    // Positions live in a texture, so the CPU-side bounds are meaningless.
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  #applyTargets() {
    const u = this.velVar.material.uniforms;
    u.uTargetA.value = this.#target(this.indexA);
    u.uTargetB.value = this.#target(this.indexB);
  }

  /**
   * Pin the two ends of the morph. Unlike advance()/settle(), which walk a
   * cycle forward, this leaves uMorph free to be driven back and forth between
   * a resting phrase (a) and a hover phrase (b).
   */
  setPair(a, b) {
    this.indexA = a;
    this.indexB = b;
    this.#applyTargets();
  }

  /** Begin a transition from the phrase on screen to the next one. */
  advance() {
    if (this.targets.length < 2) return;
    this.indexB = (this.indexA + 1) % this.targets.length;
    this.#applyTargets();
    // Reset the uniform in the same breath as the swap. Leaving it at 1 for
    // even one frame points every particle at the *next* phrase and jerks.
    this.setMorph(0);
  }

  /** Call when a transition completes: B becomes the phrase at rest. */
  settle() {
    this.indexA = this.indexB;
    this.#applyTargets();
    this.setMorph(0);
  }

  /** World-space half-extents of a phrase's letterforms, strays excluded. */
  boundsOf(index) {
    return this.bounds[index];
  }

  /** Index of the phrase currently on screen. */
  get currentIndex() {
    return this.morph >= 0.5 ? this.indexB : this.indexA;
  }

  setMorph(t) {
    this.morph = t;
    this.velVar.material.uniforms.uMorph.value = t;
  }

  setPointer({ position, velocity, active }) {
    const u = this.velVar.material.uniforms;
    u.uMouse.value.copy(position);
    u.uMouseVel.value.copy(velocity);
    u.uMouseActive.value = active;
  }

  setPixelScale(scale) {
    this.material.uniforms.uPixelScale.value = scale;
  }

  /** 0..1: how much stiffer the springs are while a scroll morph lands. */
  setSnap(v) {
    this.velVar.material.uniforms.uSnap.value = v;
  }

  /**
   * The camera moves with the pointer now, so the sim needs this frame's
   * view-projection to find each particle on the fluid, and the render pass
   * needs the distance to the phrase's plane to set the focus.
   */
  setCamera(camera) {
    this.velVar.material.uniforms.uViewProj.value.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.material.uniforms.uFocus.value = camera.position.length();
  }

  /** 0..1, relative to the configured base opacity. */
  setDim(amount) {
    this.material.uniforms.uOpacity.value = DEFAULTS.opacity * (1 - amount);
  }

  update(dt, elapsed) {
    const pu = this.posVar.material.uniforms;
    const vu = this.velVar.material.uniforms;

    pu.uDt.value = dt;
    vu.uDt.value = dt;
    vu.uTime.value = elapsed;
    if (this.fluid) vu.uFluid.value = this.fluid.texture;

    this.gpu.compute();
    this.material.uniforms.uPositions.value =
      this.gpu.getCurrentRenderTarget(this.posVar).texture;
  }

  dispose() {
    this.gpu.dispose();
    this.points.geometry.dispose();
    this.material.dispose();
    for (const t of this.targets) t?.dispose();
    this.palette.dispose();
  }
}

export { DEFAULTS as FIELD_DEFAULTS };
