// The game's variant of src/shaders/simPosition.frag: the hero's code plus the game's.
// Compiled lazily at the first game start (src/game/gpu.js) and only bound
// while a game runs; the hero itself never runs this program.

// src/game/shaders/game.glsl is concatenated in ahead of this file.

uniform float uDt;
uniform float uMorph;
uniform float uGameA;
uniform float uGameB;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(textureVelocity, uv);

  pos.xyz += vel.xyz * uDt;
  pos.w = vel.w; // carry speed through so the render pass can spark on motion

  // Once the morph has landed on the game, meteors and streaks sit exactly on
  // their destinations. A slot that respawns far ahead then jumps there,
  // instead of flying back through the whole scene on its spring.
  if ((uGameB > 0.5 && uMorph > 0.999) || (uGameA > 0.5 && uMorph < 0.001)) {
    GameGoal g = gameGoal(floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x));
    if (g.free < 0.5 && g.role >= ROLE_METEOR) pos.xyz = g.pos;
  }

  gl_FragColor = pos;
}
