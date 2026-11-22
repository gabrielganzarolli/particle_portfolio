import * as THREE from 'three';

/**
 * Living dust, from the Cream v3 proof: a few thousand faint motes spread in
 * depth in front of and behind the phrase. They drift upward slowly, ride the
 * fluid when the cursor stirs it, and go out of focus the further they sit
 * from the phrase's plane, which is what gives the field a sense of air.
 */
export function createDust(count, { fieldWidth, reducedMotion }) {
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  const warm = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Biased toward the far side so the near, large, blurred motes stay rare.
    const z = -9 + Math.pow(Math.random(), 0.8) * 13; // -9 .. +4
    const spread = fieldWidth * (0.7 + (4 - z) * 0.07);
    pos[i * 3 + 0] = (Math.random() * 2 - 1) * spread;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * spread * 0.5;
    pos[i * 3 + 2] = z;
    rnd[i] = Math.random();
    warm[i] = Math.random() < 0.2 ? 1 : 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  geometry.setAttribute('aWarm', new THREE.BufferAttribute(warm, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uPixelScale: { value: 1 },
      uFocus: { value: 12 },
      uFluid: { value: null },
      uFluidShift: { value: 0.04 },
      uOpacity: { value: 1 },
      uRise: { value: fieldWidth * 0.55 },
    },
    vertexShader: `
      attribute float aRnd; attribute float aWarm;
      uniform float uTime, uMotion, uPixelScale, uFocus, uFluidShift, uOpacity, uRise;
      uniform sampler2D uFluid;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec3 p = position;
        float t = uTime * uMotion;
        float ph = aRnd * 6.2831;
        p.y = mod(p.y + uRise + t * (0.05 + aRnd * 0.08), uRise * 2.0) - uRise;
        p += vec3(sin(t * 0.31 + ph), cos(t * 0.27 + ph * 1.3), sin(t * 0.23 + ph * 0.7)) * 0.08 * uMotion;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;
        vec2 flow = texture2D(uFluid, ndc * 0.5 + 0.5).xy;
        float depth = -mv.z;
        mv.xy += flow * uFluidShift * depth;
        gl_Position = projectionMatrix * mv;

        float defocus = abs(depth - uFocus) * 0.16;
        // World-sized, like the phrase particles: uPixelScale / depth turns
        // world units into device pixels.
        gl_PointSize = max((0.011 + aRnd * 0.011) * uPixelScale / max(depth, 0.5) * (1.0 + min(defocus, 3.0) * 1.3), 1.0);
        float lit = 1.0 + min(length(flow) * 1.4, 1.0) * 0.8;
        vAlpha = uOpacity * lit * (0.22 + aRnd * 0.2) / (1.0 + defocus * defocus * 0.6);
        vColor = mix(vec3(0.94, 0.95, 1.0), vec3(1.0, 0.86, 0.7), aWarm);
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
      }`,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
