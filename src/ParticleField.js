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
    this.headIndex = -1;
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
    const phrases = this.phrases;
    for (let i = 0; i < phrases.length; i++) {
      if (this.targets[i]) continue;
      const { positions, jitter, bounds } = await buildTargetInSlices(phrases[i], {
        count: this.count,
        fieldWidth: this.fieldWidth,
      });
      // A language switch mid-build replaces the phrase set; drop the stale one.
      if (this.phrases !== phrases) return;
      if (!this.targets[i]) this.#store(i, positions, jitter, bounds);
    }
  }

  /**
   * Language switch, step 1: sample the new language's versions of the
   * phrases in `indices` (the one on screen and the two the current pair
   * needs), in slices between frames so the page keeps animating. The rest of
   * the set is built after the switch by buildRemaining(), or on demand if
   * scroll asks for one first.
   */
  async preparePhrases(phrases, indices) {
    const targets = new Array(phrases.length).fill(null);
    const bounds = new Array(phrases.length).fill(null);
    // A phrase that reads the same in both languages (the name) keeps its
    // texture. Resampling it would give every particle a new random spot in
    // the same word, and the whole field would shuffle sideways for nothing.
    for (let i = 0; i < phrases.length; i++) {
      if (phrases[i] === this.phrases[i] && this.targets[i]) {
        targets[i] = this.targets[i];
        bounds[i] = this.bounds[i];
      }
    }
    for (const i of new Set(indices)) {
      if (targets[i]) continue;
      const job = await buildTargetInSlices(phrases[i], { count: this.count, fieldWidth: this.fieldWidth });
      targets[i] = toDataTexture(job.positions, this.size);
      bounds[i] = job.bounds;
    }
    this.pending = { phrases, targets, bounds };
  }

  /**
   * Step 2: point the field from phrase `index` in the old language to the
   * same phrase in the new one. The caller drives setMorph() from 0 to 1, as
   * for any other transition, then calls endSwap().
   */
  beginSwap(index) {
    const u = this.velVar.material.uniforms;
    u.uTargetA.value = this.#target(index);
    u.uTargetB.value = this.pending.targets[index];
    u.uHeadA.value = u.uHeadB.value = index === this.headIndex ? 1 : 0;
    this.setMorph(0);
  }

  /** Step 3: the new set becomes the field's own; the old textures go. */
  endSwap() {
    const { phrases, targets, bounds } = this.pending;
    for (const t of this.targets) if (t && !targets.includes(t)) t.dispose();
    this.phrases = phrases;
    this.targets = targets;
    this.bounds = bounds;
    this.pending = null;
    this.#applyTargets();
    this.buildRemaining();
  }

  /**
   * Put every particle on phrase `index` at once, at rest. Reduced motion uses
   * this for the language switch, where the usual flight across the screen is
   * exactly the movement the visitor asked not to see.
   */
  jumpTo(index) {
    const target = this.#target(index);
    for (const rt of this.posVar.renderTargets) this.gpu.renderTexture(target, rt);
    if (!this.zeroTexture) {
      this.zeroTexture = this.gpu.createTexture();
      this.zeroTexture.image.data.fill(0);
      this.zeroTexture.needsUpdate = true;
    }
    for (const rt of this.velVar.renderTargets) this.gpu.renderTexture(this.zeroTexture, rt);
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
      uRepelScale: { value: 1 },
      uHeadRot: { value: new THREE.Matrix3() },
      uHeadPivot: { value: new THREE.Vector3() },
      uHeadA: { value: 0 },
      uHeadB: { value: 0 },
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
        uSizeScale: { value: 1 },
        uTint: { value: new THREE.Color(0.25, 0.75, 1.0) },
        uTintMix: { value: 0 },
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
    u.uHeadA.value = this.indexA === this.headIndex ? 1 : 0;
    u.uHeadB.value = this.indexB === this.headIndex ? 1 : 0;
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
    this.#target(index);
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

  /** Which phrase is the head, and the point (world units) it turns around. */
  setHead(index, pivot) {
    this.headIndex = index;
    this.velVar.material.uniforms.uHeadPivot.value.copy(pivot);
    this.#applyTargets();
  }

  /**
   * 0..1: how far the points have turned into the head's dots, `size` world
   * units across. The letters' grain scales with the grid; the dots don't.
   */
  setHeadLook(t, size) {
    const base = DEFAULTS.pointSize * (512 / this.size);
    this.material.uniforms.uSizeScale.value = 1 + (size / base - 1) * t;
    this.material.uniforms.uTintMix.value = t;
  }

  /**
   * The head's lines: each joins two particles by index and reads their
   * positions from the same texture the points do, so the lines move with the
   * nodes. `fade` dims lines toward the neck and the far side.
   */
  setHeadNet(edges, fade) {
    const n = edges.length;
    const refs = new Float32Array(n * 2);
    const fades = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const i = edges[k];
      refs[k * 2] = ((i % this.size) + 0.5) / this.size;
      refs[k * 2 + 1] = (((i / this.size) | 0) + 0.5) / this.size;
      fades[k] = fade[i] / 255;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    geometry.setAttribute('aFade', new THREE.BufferAttribute(fades, 1));
    this.lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null },
        uColor: { value: new THREE.Color(0.25, 0.75, 1.0) },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        uniform sampler2D uPositions;
        attribute vec2 aRef;
        attribute float aFade;
        varying float vFade;
        void main() {
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(texture2D(uPositions, aRef).xyz, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() { gl_FragColor = vec4(uColor, uOpacity * vFade); }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(geometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.scene.add(this.lines);
  }

  /**
   * 0..1: hold the particles still for the head. Turbulence, the fluid and
   * the depth of field all soften points, which the letters can take and a
   * wireframe can't: the nodes would swim off the lines that join them.
   */
  setHeadCalm(t) {
    const vu = this.velVar.material.uniforms;
    const pu = this.material.uniforms;
    if (t < 0.001 || !this.calmBase) {
      this.calmBase = { turb: vu.uTurbulence.value, fluid: vu.uFluidForce.value, dof: pu.uDof.value };
    }
    const b = this.calmBase;
    vu.uTurbulence.value = b.turb * (1 - 0.95 * t);
    vu.uFluidForce.value = b.fluid * (1 - t);
    pu.uDof.value = b.dof * (1 - t);
  }

  /** 0..1: how visible the head's lines are. */
  setHeadLines(alpha) {
    if (!this.lines) return;
    this.lineMaterial.uniforms.uOpacity.value = alpha * 0.42;
    this.lines.visible = alpha > 0.002;
  }

  /** The head's turn this frame, as a rotation matrix. */
  setHeadPose(matrix3) {
    this.velVar.material.uniforms.uHeadRot.value.copy(matrix3);
  }

  /** Multiplies the cursor's push; the head takes a gentler one. */
  setRepelScale(v) {
    this.velVar.material.uniforms.uRepelScale.value = v;
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
    if (this.lines) this.lineMaterial.uniforms.uPositions.value = this.material.uniforms.uPositions.value;
  }

  dispose() {
    this.gpu.dispose();
    this.points.geometry.dispose();
    this.lines?.geometry.dispose();
    this.lineMaterial?.dispose();
    this.material.dispose();
    for (const t of this.targets) t?.dispose();
    this.palette.dispose();
  }
}

export { DEFAULTS as FIELD_DEFAULTS };
