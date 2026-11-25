// The game's GPU programs: variants of the hero's velocity, position and
// points programs with the game's code in them (src/game/shaders). They live
// in the game chunk and are built and compiled at the first game start, so the
// hero's own programs stay exactly what they are without the game.
// ParticleField swaps them in while a game runs (useGameShaders).
import * as THREE from 'three';

import simplex from '../shaders/lib/simplex3d.glsl?raw';
import curl from '../shaders/lib/curl.glsl?raw';
import pointsFrag from '../shaders/points.frag?raw';
import game from './shaders/game.glsl?raw';
import simVelocity from './shaders/simVelocity.frag?raw';
import simPosition from './shaders/simPosition.frag?raw';
import pointsVert from './shaders/points.vert?raw';

const VELOCITY_SHADER = `${simplex}\n${curl}\n${game}\n${simVelocity}`;
const POSITION_SHADER = `${game}\n${simPosition}`;
const POINTS_VERT = `${simplex}\n${game}\n${pointsVert}`;

/**
 * Build and compile the game's three programs for `field`. Every uniform the
 * hero's materials have is shared by reference (the existing setters keep
 * working whichever program is bound), plus the field's game uniforms.
 *
 * @param {import('../ParticleField.js').ParticleField} field
 * @returns {Promise<{ velocity: THREE.ShaderMaterial, position: THREE.ShaderMaterial, points: THREE.ShaderMaterial }>}
 */
export async function buildGamePrograms(field) {
  const { gpu, velVar, posVar, renderer, gameUniforms, gameEnds, gameLook } = field;

  // As GPUComputationRenderer.addVariable() + init() build a variable's
  // material: the `resolution` define, and one sampler per dependency, whose
  // uniform entries gpu.compute() fills each step (shared with the hero's).
  const sim = (variable, source, extra) => {
    let shader = source;
    for (const dep of variable.dependencies) shader = `\nuniform sampler2D ${dep.name};\n${shader}`;
    return gpu.createShaderMaterial(shader, { ...variable.material.uniforms, ...extra });
  };
  const velocity = sim(velVar, VELOCITY_SHADER, { ...gameEnds, ...gameUniforms });
  const position = sim(posVar, POSITION_SHADER, { uMorph: velVar.material.uniforms.uMorph, ...gameEnds, ...gameUniforms });

  const hero = field.material;
  const points = new THREE.ShaderMaterial({
    uniforms: { ...hero.uniforms, uGame: gameLook, ...gameUniforms },
    vertexShader: POINTS_VERT,
    fragmentShader: pointsFrag,
    transparent: hero.transparent,
    depthWrite: hero.depthWrite,
    depthTest: hero.depthTest,
    blending: hero.blending,
  });

  // Compile now, off the frames: the sim programs as they run (into a float
  // render target, on a full-screen quad), the points as the field draws them
  // (into the post chain's render target). Any render target gives the same
  // program here; the screen would not.
  const camera = new THREE.Camera();
  // Position and uv only, like the FullScreenQuad gpu.compute() draws with:
  // a normal attribute alone would give a different program.
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(gpu.getAlternateRenderTarget(posVar));
  const ready = [
    renderer.compileAsync(new THREE.Mesh(quad, velocity), camera),
    renderer.compileAsync(new THREE.Mesh(quad, position), camera),
    renderer.compileAsync(new THREE.Points(field.points.geometry, points), camera, field.scene),
  ];
  renderer.setRenderTarget(previous);
  await Promise.all(ready);
  quad.dispose();

  return { velocity, position, points };
}
