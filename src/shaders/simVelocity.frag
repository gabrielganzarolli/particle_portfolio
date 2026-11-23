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
uniform float uRepelScale;
uniform float uWake;
uniform float uRadius;

uniform float uSpring;
uniform float uDamping;
uniform float uTurbulence;
uniform float uNoiseScale;
uniform float uFlow;
uniform float uMaxSpeed;
uniform float uSnap;

// The head turns toward the pointer. Whichever end of the morph is the head
// (uHeadA, uHeadB) has its destinations rotated about the pivot, so the
// particles follow the turn on their springs, a beat behind.
uniform mat3 uHeadRot;
uniform vec3 uHeadPivot;
uniform float uHeadA;
uniform float uHeadB;

uniform sampler2D uFluid;
uniform float uFluidForce;
uniform mat4 uViewProj;

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
  // breaking into a swarm. The spread and the window sum to 1.0 so the last
  // particles still land exactly when uMorph reaches 1 — a wider spread reads
  // as the field flowing rather than translating.
  float stagger = hash12(uv * 511.0) * 0.55;
  float m = smoothstep(stagger, stagger + 0.45, uMorph);

  vec3 ta = texture2D(uTargetA, uv).xyz;
  vec3 tb = texture2D(uTargetB, uv).xyz;
  ta = mix(ta, uHeadPivot + uHeadRot * (ta - uHeadPivot), uHeadA);
  tb = mix(tb, uHeadPivot + uHeadRot * (tb - uHeadPivot), uHeadB);
  vec3 goal = mix(ta, tb, m);

  // Peaks at the midpoint of a transition and is zero while a phrase is held.
  float energy = sin(PI * clamp(uMorph, 0.0, 1.0));

  // Slacken the spring mid-flight so particles arc rather than track straight.
  // While a scroll morph lands (uSnap), the spring is four times as stiff near
  // the ends of the transition, so the letters settle in under half the time;
  // the extra damping below keeps that spring near critical (spring 36 wants
  // about 12/s of damping, the base gives 5.7), so it lands without bounce.
  float snap = uSnap * (1.0 - energy);
  vec3 force = (goal - pos) * (uSpring * mix(1.0, 0.45, energy) * (1.0 + 3.0 * snap));

  vec3 swirl = curlNoise(pos * uNoiseScale + vec3(0.0, 0.0, uTime * uFlow));
  force += swirl * (uTurbulence * (1.0 + 4.0 * energy));

  // Cursor: a radial shove plus a push along the pointer's travel direction,
  // so it leaves a directional wake rather than a symmetric hole.
  vec3 d = pos - uMouse;
  d.z *= 0.35;
  float falloff = exp(-dot(d, d) / (uRadius * uRadius)) * uMouseActive;
  float repel = uRepel * uRepelScale;
  force += normalize(d + 1e-5) * (repel * falloff);
  force += uMouseVel * (repel * uWake * falloff);

  // Screen-space fluid stirred by the pointer and the scroll. Sampled where the
  // particle currently sits on screen and applied in the camera's plane, so a
  // swirl drawn by the cursor curls the letters under it and then lets go.
  vec4 clip = uViewProj * vec4(pos, 1.0);
  vec2 fuv = clip.xy / max(clip.w, 1e-3) * 0.5 + 0.5;
  vec2 inside = step(vec2(0.0), fuv) * step(fuv, vec2(1.0));
  vec2 flow = texture2D(uFluid, fuv).xy * inside.x * inside.y;
  force.xy += flow * uFluidForce;

  // Framerate-independent damping.
  vel *= pow(uDamping, uDt * 60.0);
  vel *= exp(-uDt * 6.3 * snap);
  vel += force * uDt;

  float speed = length(vel);
  if (speed > uMaxSpeed) {
    vel *= uMaxSpeed / speed;
    speed = uMaxSpeed;
  }

  gl_FragColor = vec4(vel, speed);
}
