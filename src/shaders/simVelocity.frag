// texturePosition and textureVelocity samplers are injected by
// GPUComputationRenderer from the declared variable dependencies — do not
// declare them here. `resolution` arrives as a #define.

uniform float uTime;
uniform float uDt;
uniform float uMorph;

uniform sampler2D uTargetA;
uniform sampler2D uTargetB;

uniform vec3  uMouse;
uniform vec3  uMouseVel;
uniform float uMouseActive;
uniform float uRepel;
uniform float uWake;
uniform float uRadius;

uniform float uSpring;
uniform float uDamping;
uniform float uTurbulence;
uniform float uNoiseScale;
uniform float uFlow;
uniform float uMaxSpeed;

#define PI 3.14159265359

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  // Each particle starts its flight at a slightly different moment. Without
  // this stagger the whole field slides across as one rigid sheet instead of
  // breaking into a swarm.
  float stagger = hash12(uv * 511.0) * 0.45;
  float m = smoothstep(stagger, stagger + 0.55, uMorph);

  vec3 goal = mix(texture2D(uTargetA, uv).xyz, texture2D(uTargetB, uv).xyz, m);

  // Peaks at the midpoint of a transition and is zero while a phrase is held.
  float energy = sin(PI * clamp(uMorph, 0.0, 1.0));

  // Slacken the spring mid-flight so particles overshoot and arc in.
  vec3 force = (goal - pos) * (uSpring * mix(1.0, 0.3, energy));

  vec3 swirl = curlNoise(pos * uNoiseScale + vec3(0.0, 0.0, uTime * uFlow));
  force += swirl * (uTurbulence * (1.0 + 7.0 * energy));

  // Cursor: a radial shove plus a push along the pointer's travel direction,
  // so it leaves a directional wake rather than a symmetric hole.
  vec3 d = pos - uMouse;
  d.z *= 0.35;
  float falloff = exp(-dot(d, d) / (uRadius * uRadius)) * uMouseActive;
  force += normalize(d + 1e-5) * (uRepel * falloff);
  force += uMouseVel * (uRepel * uWake * falloff);

  // Framerate-independent damping.
  vel *= pow(uDamping, uDt * 60.0);
  vel += force * uDt;

  float speed = length(vel);
  if (speed > uMaxSpeed) {
    vel *= uMaxSpeed / speed;
    speed = uMaxSpeed;
  }

  gl_FragColor = vec4(vel, speed);
}
