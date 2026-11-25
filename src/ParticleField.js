import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

import simplex from './shaders/lib/simplex3d.glsl?raw';
import curl from './shaders/lib/curl.glsl?raw';
import game from './shaders/lib/game.glsl?raw';
import simVelocity from './shaders/simVelocity.frag?raw';
import simPosition from './shaders/simPosition.frag?raw';
import pointsVert from './shaders/points.vert?raw';
import pointsFrag from './shaders/points.frag?raw';

import { buildTarget, buildTargetInSlices, toDataTexture } from './textTargets.js';
import { createPaletteTexture } from './palette.js';

// No #include preprocessor here — the noise library is just concatenated in.
const VELOCITY_SHADER = `${simplex}\n${curl}\n${game}\n${simVelocity}`;
const POSITION_SHADER = `${game}\n${simPosition}`;
const POINTS_VERT = `${simplex}\n${pointsVert}`;

// The damping term works out to c = -60*ln(damping) per second, so critical
// damping sits at spring = (c/2)^2 — about 8.0 at 0.91. Sitting just above it
// gives a soft arrival with the faintest overshoot, settling over ~0.8s. The
// earlier 16/0.88 pair was well above critical and snapped into place.
// Tuned by Gabriel in the #ajuste panel (2026-11-23).
const DEFAULTS = {
  spring: 8.1,
  damping: 0.91,
  // Bigger, slower eddies. Displacement is force/spring, so a softer spring
  // lets the same turbulence loosen the letterforms more.
  turbulence: 0.28,
  noiseScale: 0.28,
  flow: 0.055,
  maxSpeed: 10.0,
  // Equilibrium displacement under the cursor is repel/spring world units:
  // about 0.6 here, spread over a radius of 1.27 — a soft swell rather than a
  // sharp dent.
  repel: 4.8,
  wake: 0.06,
  radius: 1.27,
  // ~2 device pixels per particle. Larger than that and 262k additive sprites
  // overdraw each other into a solid white slab with no letterforms left.
  pointSize: 0.0075,
  // Lower than the 0.62 this ran at before the bloom pass: the field now
  // renders in linear light and is encoded on output, which lifts mid-tones,
  // and the bloom adds its own glow on top.
  opacity: 0.52,
  // Feature size of the hue field, in world units of ~1/colorScale. At 0.34 the
  // whole phrase fell inside one or two patches and read as flat tinting.
  colorScale: 1.1,
  colorSpread: 1.3,
  // Screen-space fluid, in world units of push per texel-per-step of fluid
  // velocity. The springs pull everything back, so this reads as a wave through
  // the letterforms that settles rather than as a smear. Above ~12 a fast swipe
  // tore the phrase apart into bright clumps.
  fluidForce: 7.2,
  // Depth of field. Particles away from the phrase's plane grow and dim, so
  // anything flying in depth during a morph reads as out-of-focus light.
  dof: 0.33,
};

/**
 * The game's virtual phrase. Its destinations are not a texture but are
 * computed in the sim shaders from the game uniforms (src/shaders/lib/game.glsl).
 */
export const GAME_PHRASE = Object.freeze({ game: true });

const SLOTS = 10;

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
    this.gameIndex = -1;
    this.scoreIndex = -1;
    this.gameBudget = null;
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
    if (this.phrases[i]?.game === true) {
      this.targets[i] = this.#gameTarget();
      this.bounds[i] = { halfW: 0, halfH: 0 };
      return this.targets[i];
    }
    const { positions, jitter, bounds } = buildTarget(this.phrases[i], {
      count: this.count,
      fieldWidth: this.fieldWidth,
    });
    this.#store(i, positions, jitter, bounds);
    return this.targets[i];
  }

  // The sim reads the game's destinations from its uniforms; the texture only
  // fills the uTargetA/B slot on that end of the morph.
  #gameTarget() {
    if (!this.gameTexture) this.gameTexture = toDataTexture(new Float32Array(4), 1);
    return this.gameTexture;
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
      // The game has no texture to build; the score is built by setPhrase.
      if (this.targets[i] || phrases[i]?.game === true || i === this.scoreIndex) continue;
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
    u.uGameA.value = u.uGameB.value = 0;
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

    this.posVar = gpu.addVariable('texturePosition', POSITION_SHADER, pos0);
    this.velVar = gpu.addVariable('textureVelocity', VELOCITY_SHADER, vel0);

    gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    const t = this.reducedMotion ? 0.02 : DEFAULTS.turbulence;

    const uTime = { value: 0 };
    const uMorph = { value: 0 };
    // Game uniforms (src/shaders/lib/game.glsl). The same objects go into the
    // velocity, position and points materials, so one write reaches all three.
    this.gameUniforms = {
      uGameLocal: { value: null },
      uGameEnds: { value: new THREE.Vector4() },
      uGameActive: { value: 0 },
      uShip: { value: new Float32Array(4) },
      uShipRot: { value: new Float32Array([1, 0]) },
      uMeteor: { value: new Float32Array(SLOTS * 4) },
      uMeteorRot: { value: new Float32Array(SLOTS * 2) },
      uGameSpeed: { value: 0 },
      uGameDist: { value: 0 },
      uGameAlive: { value: 1 },
      uDeadFor: { value: 0 },
      uBurst: { value: 0 },
      uGameTime: uTime,
    };
    const ends = { uMorph, uGameA: { value: 0 }, uGameB: { value: 0 } };

    Object.assign(this.posVar.material.uniforms, { uDt: { value: 0 } }, ends, this.gameUniforms);

    Object.assign(this.velVar.material.uniforms, ends, this.gameUniforms, {
      uTime,
      uDt: { value: 0 },
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
        uPixelScale: { value: 1 },
        uOpacity: { value: DEFAULTS.opacity },
        uColorScale: { value: DEFAULTS.colorScale },
        uColorSpread: { value: DEFAULTS.colorSpread },
        uFocus: { value: 10 },
        uDof: { value: this.reducedMotion ? 0 : DEFAULTS.dof },
        ...this.gameUniforms,
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
    u.uGameA.value = this.phrases[this.indexA]?.game === true ? 1 : 0;
    u.uGameB.value = this.phrases[this.indexB]?.game === true ? 1 : 0;
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

  /** Sets the morph for the velocity and position passes (one shared uniform). */
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

  /**
   * Rebuild phrase `index`'s destinations now, after its source changed (the
   * head, from the tuning panel). Particles already headed there follow.
   */
  rebuildTarget(index) {
    const old = this.targets[index];
    this.targets[index] = null;
    this.#target(index);
    old?.dispose();
    this.#applyTargets();
  }

  /** Which phrase is the head, and the point (world units) it turns around. */
  setHead(index, pivot) {
    this.headIndex = index;
    this.velVar.material.uniforms.uHeadPivot.value.copy(pivot);
    this.#applyTargets();
  }

  /**
   * The head as a solid that only writes depth: drawn before the points, it
   * hides the grain on the far side, so the head reads as a surface rather
   * than a glass shell.
   */
  setHeadOccluder(v, faces, scale, turn, offsetY = 0, offsetX = 0) {
    if (this.occluder) {
      this.scene.remove(this.occluder);
      this.occluder.geometry.dispose();
      this.occluder.material.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(v, (x, i) => x * scale + (i % 3 === 1 ? offsetY : i % 3 === 0 ? offsetX : 0)), 3));
    geometry.setAttribute('aTurn', new THREE.BufferAttribute(Float32Array.from(turn, (t) => t / 255), 1));
    geometry.setIndex(new THREE.BufferAttribute(faces, 1));
    const vu = this.velVar.material.uniforms;
    // It bends the way the particles do: all of the head turns, the neck less
    // and less toward its base.
    const material = new THREE.ShaderMaterial({
      uniforms: { uHeadRot: { value: new THREE.Matrix3() }, uHeadPivot: vu.uHeadPivot },
      vertexShader: `
        uniform mat3 uHeadRot;
        uniform vec3 uHeadPivot;
        attribute float aTurn;
        void main() {
          vec3 p = mix(position, uHeadPivot + uHeadRot * (position - uHeadPivot), aTurn);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false,
      side: THREE.DoubleSide,
    });
    this.occluder = new THREE.Mesh(geometry, material);
    this.occluder.renderOrder = -1;
    this.occluder.visible = false;
    this.occluder.frustumCulled = false;
    this.scene.add(this.occluder);
  }

  /**
   * 0..1: how far the head is a solid. Above a third, the occluder writes depth
   * and the points test against it, so grain on the far side stays hidden.
   */
  setHeadSolid(t) {
    const solid = Boolean(this.occluder) && t > 0.3;
    if (this.occluder) this.occluder.visible = solid;
    this.material.depthTest = solid;
  }

  /** The head's turn this frame, as a rotation matrix. */
  setHeadPose(matrix3) {
    const u = this.velVar.material.uniforms;
    u.uHeadRot.value.copy(matrix3);
  }

  /**
   * The occluder's own turn. The particles reach a new pose a beat late, on
   * their springs; an occluder at the new pose would cover them on the way.
   */
  setOccluderPose(matrix3) {
    if (this.occluder) this.occluder.material.uniforms.uHeadRot.value.copy(matrix3);
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
  setCamera(camera, focus) {
    this.velVar.material.uniforms.uViewProj.value.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    // The game's chase camera is not looking at the origin; it passes its own.
    this.material.uniforms.uFocus.value = focus ?? camera.position.length();
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

    const g = this.gameUniforms;
    g.uDeadFor.value = g.uGameAlive.value > 0.5 ? 0 : g.uDeadFor.value + dt;

    this.gpu.compute();
    this.material.uniforms.uPositions.value =
      this.gpu.getCurrentRenderTarget(this.posVar).texture;
    // The burst is a one-frame impulse.
    g.uBurst.value = 0;
  }

  // ---------------------------------------------------------------- game

  /**
   * Mark which phrase indices are the game and its score. An index at or past
   * the end of the set appends GAME_PHRASE (or a placeholder score) to it.
   */
  setGame(gameIndex, scoreIndex) {
    const extend = (i, phrase) => {
      if (i < this.phrases.length) return;
      this.phrases[i] = phrase;
      this.targets[i] = null;
      this.bounds[i] = null;
    };
    extend(gameIndex, GAME_PHRASE);
    extend(scoreIndex, '0,0 s');
    this.gameIndex = gameIndex;
    this.scoreIndex = scoreIndex;
    this.#applyTargets();
  }

  /**
   * The game's particle budget (src/game/budget.js) and each particle's local
   * offset and base brightness (src/game/shapes.js, size×size RGBA).
   */
  setGameBudget(budget, local) {
    this.gameBudget = budget;
    const g = this.gameUniforms;
    g.uGameLocal.value?.dispose();
    g.uGameLocal.value = toDataTexture(local, this.size);
    g.uGameEnds.value.set(budget.flame, budget.shipEnd, budget.ringEnd, budget.meteorEnd);
    g.uGameActive.value = budget.active;
  }

  /** This frame's world, as gameUniforms() in src/game/world.js returns it. */
  setGameState(u) {
    const g = this.gameUniforms;
    g.uShip.value.set(u.ship);
    g.uShipRot.value.set(u.shipRot);
    g.uMeteor.value.set(u.meteors);
    g.uMeteorRot.value.set(u.meteorRot);
    g.uGameSpeed.value = u.speed;
    g.uGameDist.value = u.distance;
    g.uGameAlive.value = u.alive;
  }

  /** Kick the ship, flame and ring outward on the next frame. */
  pulseBurst() {
    this.gameUniforms.uBurst.value = 1;
  }

  /**
   * Replace phrase `index` with `text`, sampled in slices between frames. The
   * old destinations stay in use until the new ones are ready.
   */
  async setPhrase(index, text) {
    const token = {};
    (this.phraseJobs ??= new Map()).set(index, token);
    const { positions, jitter, bounds } = await buildTargetInSlices(text, {
      count: this.count,
      fieldWidth: this.fieldWidth,
    });
    // A newer call for the same index won; this result is stale.
    if (this.phraseJobs.get(index) !== token) return;
    this.phraseJobs.delete(index);
    const old = this.targets[index];
    this.phrases[index] = text;
    this.#store(index, positions, jitter, bounds);
    old?.dispose();
    this.#applyTargets();
  }

  /** The current particle positions (xyzw per particle). For checks only. */
  readPositions() {
    const out = new Float32Array(this.count * 4);
    const rt = this.gpu.getCurrentRenderTarget(this.posVar);
    this.renderer.readRenderTargetPixels(rt, 0, 0, this.size, this.size, out);
    return out;
  }

  dispose() {
    this.gpu.dispose();
    this.points.geometry.dispose();
    this.occluder?.geometry.dispose();
    this.material.dispose();
    for (const t of this.targets) t?.dispose();
    this.gameUniforms.uGameLocal.value?.dispose();
    this.gameTexture?.dispose();
    this.palette.dispose();
  }
}

export { DEFAULTS as FIELD_DEFAULTS };
