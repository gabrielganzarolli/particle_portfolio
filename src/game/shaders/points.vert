// The game's variant of src/shaders/points.vert: the hero's code plus the game's.
// Compiled lazily at the first game start (src/game/gpu.js) and only bound
// while a game runs; the hero itself never runs this program.

// snoise(vec3) and src/game/shaders/game.glsl are concatenated in ahead of this file.

uniform sampler2D uPositions;
uniform sampler2D uPalette;
uniform float uSize;
uniform float uPixelScale; // drawingBufferHeight / (2 * tan(fov/2))
uniform float uColorScale;
uniform float uColorSpread;
uniform float uFocus;      // camera distance to the phrase's plane
uniform float uDof;        // how fast particles off that plane defocus
uniform float uGame;       // 0: the hero's look, 1: the game's; blends between

attribute vec2  aRef;
attribute float aJitter;

varying vec3  vColor;
varying float vSpeed;
varying float vFocus;

// The game's look, ported from the CPU prototype's vertex shader and evalGoal
// (docs/superpowers/specs/2026-11-24-particle-ship-game-prototype.html).
// Brightness is per role; sizes are in world units, like uSize.
#define GAME_DOF 0.011
#define GAME_MIN_PX 1.15
// The prototype wrote each point's light straight to the canvas, so its
// numbers are display values; here the field renders in linear light and is
// encoded on output, which lifts faint light a lot. Each point's prototype
// intensity (GAME_ALPHA * brightness * comp / grow^2) is therefore taken to
// linear with GAME_GAMMA and divided by the base opacity the fragment shader
// multiplies back in. Without it, the thousands of faint, far streak dots
// piled up into a grey haze over the vanishing point. The prototype also drew
// a second, larger and fainter pass for glow; the site's bloom does that here.
#define GAME_ALPHA 0.8
#define GAME_GAMMA 1.8
#define GAME_OPACITY 0.52

vec3 heroColor(vec3 p) {
  // Hue follows world position, so neighbouring particles agree no matter which
  // phrase they are currently spelling. Two octaves: the coarse one sets the
  // color regions, the fine one keeps them from looking airbrushed.
  float n = snoise(p * uColorScale) * 0.7
          + snoise(p * uColorScale * 2.4 + 31.7) * 0.3;
  float t = clamp(n * uColorSpread + 0.5, 0.0, 1.0);
  return texture2D(uPalette, vec2(t, 0.5)).rgb * aJitter;
}

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
    return vec2(1.7 * w * smoothstep(-112.0, -88.0, p.z) * near, 0.02);
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
  vec3 hero = uGame < 0.999 ? heroColor(p.xyz) : white;
  // The hero sparks on speed; in the game everything moves, so it would all spark.
  vSpeed = p.w * (1.0 - uGame);

  // Much weaker depth of field than the hero's, so meteors far down the
  // corridor read as soft glows that sharpen on the way in.
  float defocus = abs(depth - uFocus) * mix(uDof, GAME_DOF, uGame);
  float grow = 1.0 + min(defocus, 3.0) * 1.1;
  float truePx = mix(uSize, look.y, uGame) * uPixelScale / depth * grow;
  float px = max(truePx, mix(1.0, GAME_MIN_PX, uGame));
  // Points held up at the minimum size give back only half their extra area
  // in brightness (comp, not comp squared). Full compensation made far
  // meteors and streak tails vanish.
  float comp = truePx / px;
  float game = pow(GAME_ALPHA * look.x * comp / (grow * grow), GAME_GAMMA) / GAME_OPACITY;

  // Alpha stays within 1; what is left goes into the color, which the
  // fragment shader caps.
  vFocus = mix(1.0 / (grow * grow), min(game, 1.0), uGame);
  vColor = mix(hero, white, uGame) * mix(1.0, max(game, 1.0), uGame);

  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
}

void main() {
  vec4 p = texture2D(uPositions, aRef);

  if (uGame > 0.001) {
    gameMain(p);
    return;
  }

  vColor = heroColor(p.xyz);
  vSpeed = p.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  float depth = max(-mv.z, 0.001);

  // Depth of field, as in the Cream v3 proof: a particle away from the
  // phrase's plane grows and loses brightness in proportion, so its light is
  // spread rather than added. At rest the field is within ±0.16 of the plane
  // and stays sharp; mid-morph, particles flung forward turn into bokeh.
  float defocus = abs(depth - uFocus) * uDof;
  float grow = 1.0 + min(defocus, 3.0) * 1.1;
  vFocus = 1.0 / (grow * grow);

  // Narrow viewports push the camera far enough back that points go sub-pixel,
  // where drivers clamp or drop them and the field turns to faint static.
  gl_PointSize = max(uSize * uPixelScale / depth * grow, 1.0);
  gl_Position = projectionMatrix * mv;
}
