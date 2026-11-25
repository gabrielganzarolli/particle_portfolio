// The game's part of the position program. src/game/shaderSource.js builds
// the full program from the hero's own src/shaders/simPosition.frag, read as
// it is, with this file ahead of it and a call to gameSnap(pos) inserted just
// before its `gl_FragColor = pos;`:
//
//   src/game/shaders/game.glsl, this file, the hero's simPosition.frag
//
// so the hero's code is never copied here.

uniform float uMorph;
uniform float uGameA;
uniform float uGameB;

// Once the morph has landed on the game, meteors and streaks sit exactly on
// their destinations. A slot that respawns far ahead then jumps there,
// instead of flying back through the whole scene on its spring.
void gameSnap(inout vec4 pos) {
  if ((uGameB > 0.5 && uMorph > 0.999) || (uGameA > 0.5 && uMorph < 0.001)) {
    GameGoal g = gameGoal(floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x));
    if (g.free < 0.5 && g.role >= ROLE_METEOR) pos.xyz = g.pos;
  }
}
