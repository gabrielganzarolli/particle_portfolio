// The game's variant of src/shaders/simVelocity.frag: the hero's code plus the game's.
// Compiled lazily at the first game start (src/game/gpu.js) and only bound
// while a game runs; the hero itself never runs this program.

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

// Which end of the morph is the game (src/game/shaders/game.glsl, concatenated
// in ahead of this file). Both 0 on the hero: the game branch never runs.
uniform float uGameA;
uniform float uGameB;

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

  // The head's .w says how far each point follows the turn: all of the head,
  // less and less down the neck, so the neck twists and its base stays put.
  vec4 ta = texture2D(uTargetA, uv);
  vec4 tb = texture2D(uTargetB, uv);
  vec3 ga = mix(ta.xyz, uHeadPivot + uHeadRot * (ta.xyz - uHeadPivot), uHeadA * ta.w);
  vec3 gb = mix(tb.xyz, uHeadPivot + uHeadRot * (tb.xyz - uHeadPivot), uHeadB * tb.w);
  vec3 goal;
  float gw = 0.0; // how far this particle follows the game rather than a phrase
  GameGoal gg;
  if (uGameA + uGameB > 0.5) {
    gg = gameGoal(floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x));
    if (gg.free > 0.5) gg.pos = pos;
    gw = uGameA * (1.0 - m) + uGameB * m;
    goal = uGameA > 0.5 ? gb : ga;
  } else {
    goal = mix(ga, gb, m);
  }

  // The game's spring is the prototype's: stiffness by role, damped toward
  // the goal's own velocity so objects in motion are followed without lag.
  // A free particle (parked, or the ship after it blew up) only drags.
  vec3 gameForce = vec3(0.0);
  if (gw > 0.0) {
    float c = gg.k > 0.0 ? 1.9 * sqrt(gg.k) : 1.3;
    gameForce = (gg.pos - pos) * gg.k - c * (vel - gg.vel);
  }

  // Everything below is the phrase's pull, weighted by 1 - gw: with no game
  // in the morph that weight is exactly 1 and this is the hero as it was.
  float hw = 1.0 - gw;
  if (hw > 0.0) {
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
    vel *= pow(uDamping, uDt * 60.0 * hw);
    vel *= exp(-uDt * 6.3 * snap * hw);
    vel += force * (uDt * hw);
  }

  float maxSpeed = uMaxSpeed;
  if (gw > 0.0) {
    vel += gameForce * (uDt * gw);
    maxSpeed = 120.0;

    // The ship blows apart: one outward kick for the ship, flame and ring.
    if (uBurst > 0.5 && gg.role <= ROLE_RING) {
      float idx = floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);
      vec3 jitter = vec3(gameHash(idx, 8u), gameHash(idx, 9u), gameHash(idx, 10u)) - 0.5;
      vec3 dir = normalize(pos - vec3(uShip.xy, 0.0) + jitter * 0.4 + 1e-5);
      vel += dir * ((2.0 + 7.0 * gameHash(idx, 11u)) * gw);
    }
  }

  float speed = length(vel);
  if (speed > maxSpeed) {
    vel *= maxSpeed / speed;
    speed = maxSpeed;
  }

  gl_FragColor = vec4(vel, speed);
}
