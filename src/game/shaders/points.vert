// The game's part of the points vertex program. src/game/shaderSource.js
// builds the full program from the hero's own src/shaders/points.vert, read as
// it is, with its main() renamed heroMain(), followed by this file:
//
//   snoise, src/game/shaders/game.glsl, the hero's points.vert, this file
//
// so the hero's uniforms, attributes, varyings and code are never copied here.
// At uGame <= 0.001 the program runs exactly the hero's main().

uniform float uGame;       // 0: the hero's look, 1: the game's; blends between
uniform float uOpacity;    // the hero's base opacity (points.frag multiplies it in)
uniform float uPixelRatio; // device pixels per CSS pixel (src/game/gpu.js sets it)
uniform float uGameLift;   // size and brightness lift while the bloom is off (src/game/gpu.js)

// The game's look, ported from the CPU prototype's vertex shader and evalGoal
// (docs/superpowers/specs/2026-11-24-particle-ship-game-prototype.html).
// Brightness is per role; sizes are in world units, like uSize.
#define GAME_DOF 0.011
// Smallest point, in CSS pixels (times uPixelRatio), as in the prototype.
#define GAME_MIN_PX 1.15
// The prototype wrote each point's light straight to the canvas, so its
// numbers are display values; here the field renders in linear light and is
// encoded on output, which lifts faint light a lot. Each point's prototype
// intensity (GAME_ALPHA * brightness * comp / grow^2) is therefore taken to
// linear with GAME_GAMMA and divided by the base opacity (uOpacity) the
// fragment shader multiplies back in. Without it, the thousands of faint, far
// streak dots piled up into a grey haze over the vanishing point. The prototype also drew
// a second, larger and fainter pass for glow; the site's bloom does that here.
#define GAME_ALPHA 0.8
#define GAME_GAMMA 1.8
// Depth band over which meteors fade in, far end to full: the prototype's
// values. Streaks use [-112, -85]; meteors deliberately end at -88, not -85.
#define GAME_METEOR_FADE_FAR -112.0
#define GAME_METEOR_FADE_FULL -88.0

// Per-role brightness and point size of particle `idx` at world position `p`.
// Brightness 0 means the particle is not drawn.
vec2 gameLook(float idx, vec3 p) {
  if (idx >= uGameActive) return vec2(0.0, 0.0); // parked
  float alive = step(0.5, uGameAlive);
  float far = smoothstep(-112.0, -85.0, p.z);
  float near = 1.0 - smoothstep(1.5, 5.0, p.z);

  if (idx < uGameEnds.x) {
    float phase;
    gameFlame(idx, phase);
    float b = pow(1.0 - phase, 1.4) * 1.1 + 0.06;
    return vec2(mix(max(0.0, 1.0 - uDeadFor * 0.55), b, alive), 0.024);
  }
  if (idx < uGameEnds.y) {
    float w = gameLocal(idx).w;
    return vec2(w * mix(max(0.0, 1.0 - uDeadFor * 0.55), 0.62, alive), 0.018);
  }
  if (idx < uGameEnds.z) {
    float w = gameLocal(idx).w;
    float shimmer = 0.8 + 0.2 * sin(uGameTime * 3.0 + gameHash(idx, 12u) * 20.0);
    return vec2(w * mix(max(0.0, 1.0 - uDeadFor * 1.2), shimmer, alive), 0.016);
  }
  if (idx < uGameEnds.w) {
    float w = gameLocal(idx).w;
    return vec2(1.7 * w * smoothstep(GAME_METEOR_FADE_FAR, GAME_METEOR_FADE_FULL, p.z) * near, 0.02);
  }
  int n = int(idx) - int(uGameEnds.w);
  int j = n / int(GAME_K);
  float k = float(n - j * int(GAME_K));
  GameStreak st = gameStreak(float(j));
  return vec2(3.2 * st.bright * pow(1.0 - k / GAME_K, 1.3) * far * near, 0.022);
}

void gameMain(vec4 p) {
  float res = float(textureSize(uPositions, 0).x);
  float idx = floor(aRef.y * res) * res + floor(aRef.x * res);
  vec2 look = gameLook(idx, p.xyz);

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  float depth = -mv.z;
  // Parked particles and those with no light are not drawn. A hero particle
  // counts as brightness 1, so the parked ones fade out as uGame rises.
  if (mix(1.0, look.x, uGame) <= 0.001 || depth < 0.15) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vSpeed = 0.0;
    vFocus = 0.0;
    return;
  }

  // Cold white with a quarter of the particles a touch warmer; the flame is
  // all warm. The hero's palette is only worked out while it still shows.
  float tone = idx < uGameEnds.x ? 1.0 : gameHash(idx, 13u) < 0.25 ? 1.0 : gameHash(idx, 14u) * 0.3;
  vec3 white = mix(vec3(0.92, 0.95, 1.0), vec3(1.0, 0.95, 0.88), tone);
  // While the hero's look still shows, its colour is whatever the hero's own
  // main() gives this particle; every output it writes is replaced below.
  vec3 hero = white;
  if (uGame < 0.999) {
    heroMain();
    hero = vColor;
  }
  // The hero sparks on speed; in the game everything moves, so it would all spark.
  vSpeed = p.w * (1.0 - uGame);

  // Much weaker depth of field than the hero's, so meteors far down the
  // corridor read as soft glows that sharpen on the way in.
  float defocus = abs(depth - uFocus) * mix(uDof, GAME_DOF, uGame);
  float grow = 1.0 + min(defocus, 3.0) * 1.1;
  float truePx = mix(uSize, look.y * uGameLift, uGame) * uPixelScale / depth * grow;
  float px = max(truePx, mix(1.0, GAME_MIN_PX * uPixelRatio, uGame));
  // A point held up at the minimum size is dimmed by comp, the ratio of its
  // true to its drawn diameter, not by the ratio of the areas (comp squared):
  // full compensation made far meteors and streak tails vanish. comp scales
  // the prototype's display-space intensity, so after the curve to linear
  // light below its effect is comp^GAME_GAMMA, as the prototype looked.
  float comp = truePx / px;
  float game = pow(GAME_ALPHA * uGameLift * look.x * comp / (grow * grow), GAME_GAMMA) / max(uOpacity, 0.01);

  // Alpha stays within 1; what is left goes into the color, which the
  // fragment shader caps.
  vFocus = mix(1.0 / (grow * grow), min(game, 1.0), uGame);
  vColor = mix(hero, white, uGame) * mix(1.0, max(game, 1.0), uGame);

  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
}

void main() {
  if (uGame > 0.001) {
    gameMain(texture2D(uPositions, aRef));
    return;
  }
  heroMain();
}
