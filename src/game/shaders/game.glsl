// The game's per-particle destination, ported from evalGoal in the CPU
// prototype (docs/superpowers/specs/2026-11-24-particle-ship-game-prototype.html).
//
// Every particle has a fixed role by its index (src/game/budget.js):
//   flame [0, flame), hull [flame, shipEnd), ring [shipEnd, ringEnd),
//   meteors [ringEnd, meteorEnd), streaks [meteorEnd, active), parked beyond.
// Hull, ring and meteor offsets come from uGameLocal (src/game/shapes.js);
// flame and streak parameters are hashed from the index here.

uniform sampler2D uGameLocal; // xyz local offset, w base brightness
uniform vec4 uGameEnds;       // flame, shipEnd, ringEnd, meteorEnd
uniform float uGameActive;
uniform vec4 uShip;           // x, y, vx, vy
uniform vec2 uShipRot;        // cos, sin of the bank
uniform vec4 uMeteor[10];     // x, y, z, radius per slot
uniform vec2 uMeteorRot[10];  // cos, sin of each slot's spin about y
uniform float uGameSpeed;
uniform float uGameDist;      // distance travelled, modulo GAME_LOOP
uniform float uGameAlive;
uniform float uDeadFor;       // seconds since the ship blew up
uniform float uBurst;         // 1 on the frame the ship blows up
uniform float uGameTime;

#define GAME_SLOTS 10
#define GAME_K 10.0
#define GAME_LOOP 120.0
#define GAME_FAR -112.0

#define ROLE_FLAME 0.0
#define ROLE_HULL 1.0
#define ROLE_RING 2.0
#define ROLE_METEOR 3.0
#define ROLE_STREAK 4.0
#define ROLE_PARKED 5.0

struct GameGoal {
  vec3 pos;
  vec3 vel;
  float k;    // spring stiffness; 0 when free
  float free; // 1: no destination, the caller keeps the particle where it is
  float role;
};

struct GameStreak {
  vec2 xy;
  float z0;
  float len;
  float bright;
};

// Integer hash (lowbias32); values in [0, 1].
float gameHash(float n, uint seed) {
  uint x = uint(n) * 0x9e3779b9u + seed * 0x85ebca6bu;
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return float(x) / 4294967295.0;
}

GameStreak gameStreak(float j) {
  float th = gameHash(j, 1u) * 6.2832;
  float r = 3.5 + 24.0 * pow(gameHash(j, 2u), 1.8);
  float l = gameHash(j, 4u);
  return GameStreak(
    vec2(r * cos(th), r * sin(th) * 0.8),
    gameHash(j, 3u) * GAME_LOOP,
    0.22 + l * l * 1.7,
    0.45 + gameHash(j, 5u) * 0.55
  );
}

// The flame's local offset; `phase` runs 0 -> 1 from the nozzle outward.
vec3 gameFlame(float idx, out float phase) {
  float a = gameHash(idx, 6u);
  float b = gameHash(idx, 7u);
  phase = fract(b + uGameTime * 2.6);
  float side = a < 0.5 ? -0.42 : 0.42;
  float ang = a * 40.0;
  float rad = 0.12 * (1.0 - phase * 0.85) * (0.4 + b * 0.6);
  return vec3(side + cos(ang) * rad, -0.02 + sin(ang) * rad, 1.15 + phase * 1.5);
}

vec4 gameLocal(float idx) {
  int w = textureSize(uGameLocal, 0).x;
  int i = int(idx);
  return texelFetch(uGameLocal, ivec2(i % w, i / w), 0);
}

// A loose cloud, as the page's first frame has it: the field's width (10) times
// 0.45 to 1.2, flattened in y and thin in z.
vec3 gameCloud(float idx) {
  float r = 10.0 * (0.45 + gameHash(idx, 20u) * 0.75);
  float th = gameHash(idx, 21u) * 6.2832;
  float ph = acos(2.0 * gameHash(idx, 22u) - 1.0);
  return vec3(r * sin(ph) * cos(th), r * sin(ph) * sin(th) * 0.4, r * cos(ph) * 0.12);
}

GameGoal gameGoal(float idx) {
  GameGoal g = GameGoal(vec3(0.0), vec3(0.0), 0.0, 1.0, ROLE_PARKED);
  if (idx >= uGameActive) {
    // Parked particles hold still, hidden, while the ship flies: wherever the
    // game started they are, which from the head is the head's shape. Once the
    // ship has blown up they gather into a loose cloud, still hidden (the look
    // stays the game's until the score phase), so that when the hero's look
    // comes back they show as a haze that condenses into the score, not as the
    // shape they were frozen in.
    if (uGameAlive < 0.5) {
      g.pos = gameCloud(idx);
      g.k = 8.0;
      g.free = 0.0;
    }
    return g;
  }

  vec3 shipVel = vec3(uShip.zw, 0.0);

  if (idx < uGameEnds.y) {
    g.role = idx < uGameEnds.x ? ROLE_FLAME : ROLE_HULL;
    if (uGameAlive < 0.5) return g;
    float phase;
    vec3 l = g.role == ROLE_FLAME ? gameFlame(idx, phase) : gameLocal(idx).xyz;
    vec2 r = uShipRot;
    g.pos = vec3(uShip.x + l.x * r.x - l.y * r.y, uShip.y + l.x * r.y + l.y * r.x, l.z);
    g.vel = shipVel;
    g.k = 70.0;
    g.free = 0.0;
    return g;
  }

  if (idx < uGameEnds.z) {
    g.role = ROLE_RING;
    if (uGameAlive < 0.5) return g;
    vec3 l = gameLocal(idx).xyz;
    float pulse = 1.0 + 0.04 * sin(uGameTime * 2.2);
    g.pos = vec3(uShip.x + l.x * pulse, uShip.y + l.y, l.z * pulse);
    g.vel = shipVel;
    g.k = 40.0;
    g.free = 0.0;
    return g;
  }

  g.free = 0.0;
  g.vel = vec3(0.0, 0.0, uGameSpeed);

  if (idx < uGameEnds.w) {
    g.role = ROLE_METEOR;
    int per = int(uGameEnds.w - uGameEnds.z) / GAME_SLOTS;
    int s = min((int(idx) - int(uGameEnds.z)) / per, GAME_SLOTS - 1);
    vec4 m = uMeteor[s];
    vec2 r = uMeteorRot[s];
    vec3 l = gameLocal(idx).xyz;
    g.pos = vec3(m.x + m.w * (l.x * r.x - l.z * r.y), m.y + m.w * l.y, m.z + m.w * (l.x * r.y + l.z * r.x));
    g.k = 18.0;
    return g;
  }

  g.role = ROLE_STREAK;
  // Integer division: a float n / 10.0 can land just under a whole number.
  int n = int(idx) - int(uGameEnds.w);
  int j = n / int(GAME_K);
  float k = float(n - j * int(GAME_K));
  GameStreak st = gameStreak(float(j));
  float head = GAME_FAR + mod(st.z0 + uGameDist, GAME_LOOP);
  g.pos = vec3(st.xy, head - k * (0.09 + 0.018 * uGameSpeed) * st.len);
  g.k = 30.0;
  return g;
}
