import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

import simplex from './shaders/lib/simplex3d.glsl?raw';
import curl from './shaders/lib/curl.glsl?raw';
import simVelocity from './shaders/simVelocity.frag?raw';
import simPosition from './shaders/simPosition.frag?raw';
import pointsVert from './shaders/points.vert?raw';
import pointsFrag from './shaders/points.frag?raw';

import { buildTarget, toDataTexture } from './textTargets.js';
import { createPaletteTexture } from './palette.js';

// No #include preprocessor here — the noise library is just concatenated in.
const VELOCITY_SHADER = `${simplex}\n${curl}\n${simVelocity}`;
const POINTS_VERT = `${simplex}\n${pointsVert}`;

// The damping term works out to c = -60*ln(damping) per second, so critical
// damping sits at spring = (c/2)^2 — about 14.7 at 0.88. Sitting just above it
// gives a crisp arrival with a trace of overshoot, and settles in ~0.5s.
const DEFAULTS = {
  spring: 16.0,
  damping: 0.88,
  turbulence: 0.28,
  noiseScale: 0.42,
  flow: 0.09,
  maxSpeed: 14.0,
  // Equilibrium displacement under the cursor is repel/spring world units, so
  // 13/16 pushes the field about a third of a text-height aside — a clear wake that
  // still leaves the letters readable. At 62 it punched a hole and piled the
  // displaced particles into a blown-out crescent.
  repel: 13.0,
  wake: 0.08,
  radius: 1.35,
  // ~2 device pixels per particle. Larger than that and 262k additive sprites
  // overdraw each other into a solid white slab with no letterforms left.
  pointSize: 0.008,
  opacity: 0.62,
  // Feature size of the hue field, in world units of ~1/colorScale. At 0.34 the
  // whole phrase fell inside one or two patches and read as flat tinting.
  colorScale: 1.1,
  colorSpread: 1.3,
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
    this.#buildCompute();
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

  #buildTargets() {
    this.targets = [];
    this.bounds = [];
    let jitter = null;

    for (const phrase of this.phrases) {
      const { positions, jitter: j, bounds } = buildTarget(phrase, {
        count: this.count,
        fieldWidth: this.fieldWidth,
      });
      // Brightness is assigned once and travels with the particle. Re-rolling it
      // per phrase would make the whole field flicker on every transition.
      if (!jitter) jitter = j;
      this.targets.push(toDataTexture(positions, this.size));
      this.bounds.push(bounds);
    }

    this.jitter = jitter;
    this.firstPositions = this.targets[0].image.data;
  }

  #buildCompute() {
    const gpu = new GPUComputationRenderer(this.size, this.size, this.renderer);
    gpu.setDataType(THREE.FloatType);

    const pos0 = gpu.createTexture();
    const vel0 = gpu.createTexture();

    // Start as a loose cloud so the first formation is a visible gather rather
    // than the phrase simply popping into existence.
    const p = pos0.image.data;
    const v = vel0.image.data;
    for (let i = 0; i < this.count; i++) {
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
    });

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
    u.uTargetA.value = this.targets[this.indexA];
    u.uTargetB.value = this.targets[this.indexB];
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

    this.gpu.compute();
    this.material.uniforms.uPositions.value =
      this.gpu.getCurrentRenderTarget(this.posVar).texture;
  }

  dispose() {
    this.gpu.dispose();
    this.points.geometry.dispose();
    this.material.dispose();
    for (const t of this.targets) t.dispose();
    this.palette.dispose();
  }
}

export { DEFAULTS as FIELD_DEFAULTS };
