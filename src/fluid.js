import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * A small screen-space fluid on the GPU, ported from the Cream v3 proof.
 *
 * The pointer and the scroll push velocity into it; it advects, loses a little
 * energy each frame and is kept divergence-free by a Jacobi pressure solve. The
 * particle simulation samples the resulting velocity at each particle's screen
 * position and takes it as a force, so the cursor leaves swirls that drift and
 * curl before the springs pull the letterforms back together.
 *
 * Velocity is in texels per step, x to the right and y up, matching UV space.
 */
export function createFluid(renderer, { res = 128, iterations = 14 } = {}) {
  const texel = new THREE.Vector2(1 / res, 1 / res);
  const rtOpts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  };

  const pingPong = () => {
    let read = new THREE.WebGLRenderTarget(res, res, rtOpts);
    let write = new THREE.WebGLRenderTarget(res, res, rtOpts);
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        [read, write] = [write, read];
      },
      dispose() {
        read.dispose();
        write.dispose();
      },
    };
  };

  const velocity = pingPong();
  const pressure = pingPong();
  const divergence = new THREE.WebGLRenderTarget(res, res, rtOpts);

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mat = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader,
      uniforms: { tx: { value: texel }, ...uniforms },
      depthTest: false,
      depthWrite: false,
    });

  const advect = mat(
    `uniform sampler2D uV; uniform vec2 tx; uniform float dt, dissipation; varying vec2 vUv;
     void main(){
       vec2 back = vUv - dt * texture2D(uV, vUv).xy * tx;
       vec2 v = dissipation * texture2D(uV, back).xy;
       float m = length(v);
       if (m > 1.4) v *= 1.4 / m;
       if (m != m) v = vec2(0.0);
       gl_FragColor = vec4(v, 0.0, 1.0);
     }`,
    { uV: { value: null }, dt: { value: 0 }, dissipation: { value: 0.972 } }
  );

  const splat = mat(
    `uniform sampler2D uV; uniform vec2 point, force; uniform float radius, aspect; varying vec2 vUv;
     void main(){
       vec2 p = vUv - point;
       p.x *= aspect;
       float g = exp(-dot(p, p) / radius);
       gl_FragColor = vec4(texture2D(uV, vUv).xy + force * g, 0.0, 1.0);
     }`,
    {
      uV: { value: null },
      point: { value: new THREE.Vector2() },
      force: { value: new THREE.Vector2() },
      radius: { value: 0.002 },
      aspect: { value: 1 },
    }
  );

  const divergenceMat = mat(
    `uniform sampler2D uV; uniform vec2 tx; varying vec2 vUv;
     void main(){
       float L = texture2D(uV, vUv - vec2(tx.x, 0.0)).x;
       float R = texture2D(uV, vUv + vec2(tx.x, 0.0)).x;
       float B = texture2D(uV, vUv - vec2(0.0, tx.y)).y;
       float T = texture2D(uV, vUv + vec2(0.0, tx.y)).y;
       gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
     }`,
    { uV: { value: null } }
  );

  // Keeps most of last frame's pressure as the starting guess, so fewer Jacobi
  // iterations converge to the same field.
  const fade = mat(
    `uniform sampler2D uP; uniform float k; varying vec2 vUv;
     void main(){ gl_FragColor = vec4(texture2D(uP, vUv).x * k, 0.0, 0.0, 1.0); }`,
    { uP: { value: null }, k: { value: 0.8 } }
  );

  const jacobi = mat(
    `uniform sampler2D uP, uD; uniform vec2 tx; varying vec2 vUv;
     void main(){
       float L = texture2D(uP, vUv - vec2(tx.x, 0.0)).x;
       float R = texture2D(uP, vUv + vec2(tx.x, 0.0)).x;
       float B = texture2D(uP, vUv - vec2(0.0, tx.y)).x;
       float T = texture2D(uP, vUv + vec2(0.0, tx.y)).x;
       gl_FragColor = vec4((L + R + B + T - texture2D(uD, vUv).x) * 0.25, 0.0, 0.0, 1.0);
     }`,
    { uP: { value: null }, uD: { value: divergence.texture } }
  );

  const gradient = mat(
    `uniform sampler2D uP, uV; uniform vec2 tx; varying vec2 vUv;
     void main(){
       float L = texture2D(uP, vUv - vec2(tx.x, 0.0)).x;
       float R = texture2D(uP, vUv + vec2(tx.x, 0.0)).x;
       float B = texture2D(uP, vUv - vec2(0.0, tx.y)).x;
       float T = texture2D(uP, vUv + vec2(0.0, tx.y)).x;
       gl_FragColor = vec4(texture2D(uV, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
     }`,
    { uP: { value: null }, uV: { value: null } }
  );

  const quad = new FullScreenQuad(advect);
  const run = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  };

  const queue = [];
  let iters = iterations;

  return {
    get texture() {
      return velocity.read.texture;
    },

    set iterations(n) {
      iters = n;
    },

    /** Push velocity in at a UV point. Forces are in texels per step. */
    push(x, y, fx, fy, radius = 0.0018) {
      if (queue.length < 12) queue.push([x, y, fx, fy, radius]);
    },

    step(dt, dissipation = 0.972) {
      const prevTarget = renderer.getRenderTarget();

      advect.uniforms.uV.value = velocity.read.texture;
      advect.uniforms.dt.value = dt * res * 0.9;
      advect.uniforms.dissipation.value = dissipation;
      run(advect, velocity.write);
      velocity.swap();

      splat.uniforms.aspect.value = window.innerWidth / window.innerHeight;
      for (const [x, y, fx, fy, r] of queue) {
        splat.uniforms.uV.value = velocity.read.texture;
        splat.uniforms.point.value.set(x, y);
        splat.uniforms.force.value.set(fx, fy);
        splat.uniforms.radius.value = r;
        run(splat, velocity.write);
        velocity.swap();
      }
      queue.length = 0;

      divergenceMat.uniforms.uV.value = velocity.read.texture;
      run(divergenceMat, divergence);

      fade.uniforms.uP.value = pressure.read.texture;
      run(fade, pressure.write);
      pressure.swap();

      for (let i = 0; i < iters; i++) {
        jacobi.uniforms.uP.value = pressure.read.texture;
        run(jacobi, pressure.write);
        pressure.swap();
      }

      gradient.uniforms.uP.value = pressure.read.texture;
      gradient.uniforms.uV.value = velocity.read.texture;
      run(gradient, velocity.write);
      velocity.swap();

      renderer.setRenderTarget(prevTarget);
    },

    dispose() {
      velocity.dispose();
      pressure.dispose();
      divergence.dispose();
      quad.dispose();
      for (const m of [advect, splat, divergenceMat, fade, jacobi, gradient]) m.dispose();
    },
  };
}
