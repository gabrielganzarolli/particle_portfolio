import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Post-processing, as in the Cream v3 proof: bloom on the brightest particles,
 * then a fine grain and a vignette.
 *
 * Two details keep the canvas invisible at its edges, where the page sections
 * fade in over it. The vignette blends toward the page background instead of
 * multiplying toward black, so the canvas never gets darker than the CSS
 * colour beside it. And the grain is scaled by brightness, so the empty ground
 * stays within one 8-bit step of that colour while the bloom gets dithered.
 */
// A tight radius on purpose. The wide mips of UnrealBloom spread a grey veil
// over the whole viewport, which then showed as a band where the page's own
// background starts under the name; at 0.12 the glow stays on the letters and
// the screen edges measure the page colour exactly.
// Tuned by Gabriel in the #ajuste panel (2026-11-23).
export const POST_DEFAULTS = {
  bloom: 0.7,
  radius: 0.054,
  threshold: 0.36,
  grain: 0.022,
  vignette: 0.28,
};

export function createPost(renderer, scene, camera, { background, bloomScale = 1 }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    POST_DEFAULTS.bloom * bloomScale,
    POST_DEFAULTS.radius,
    POST_DEFAULTS.threshold
  );
  bloom.enabled = bloomScale > 0;
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const bg = new THREE.Color(background); // sRGB, compared after OutputPass
  const grain = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGrain: { value: POST_DEFAULTS.grain },
      uVignette: { value: POST_DEFAULTS.vignette },
      uBg: { value: new THREE.Vector3(bg.r, bg.g, bg.b) },
    },
    vertexShader:
      'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette; uniform vec3 uBg; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float v = smoothstep(0.95, 0.2, length(vUv - 0.5));
        c.rgb = mix(uBg, c.rgb, mix(1.0 - uVignette, 1.0, v));
        float lift = max(max(c.r, c.g), c.b) - max(max(uBg.r, uBg.g), uBg.b);
        c.rgb += (hash(vUv * 900.0) - 0.5) * uGrain * (0.12 + clamp(lift, 0.0, 1.0));
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grain);

  return {
    composer,
    bloom,
    grain,
    setBloomScale(scale) {
      bloom.strength = POST_DEFAULTS.bloom * scale;
      bloom.enabled = scale > 0;
    },
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    },
    render(dt, time) {
      grain.uniforms.uTime.value = time % 10;
      composer.render(dt);
    },
  };
}
