// Particle budget. Cumulative indices:
// flame [0,flame), hull [flame,shipEnd), ring [shipEnd,ringEnd),
// meteors [ringEnd,meteorEnd), streaks [meteorEnd,active).
export const SLOTS = 10;
export const STREAK_POINTS = 10;
export const LEVEL_ACTIVE = { 1: 25000, 2: 40000, 3: 70000 };

export function gameBudget(level) {
  const n = LEVEL_ACTIVE[level];
  const ship = Math.floor(n * 0.12);
  const flame = Math.floor(ship * 0.14);
  const ring = Math.floor(n * 0.035);
  const perMeteor = Math.floor((n * 0.43) / SLOTS);
  const shipEnd = ship;
  const ringEnd = shipEnd + ring;
  const meteorEnd = ringEnd + perMeteor * SLOTS;
  const streakCount = Math.floor((n - meteorEnd) / STREAK_POINTS);
  return {
    active: meteorEnd + streakCount * STREAK_POINTS,
    flame,
    shipEnd,
    ringEnd,
    perMeteor,
    meteorEnd,
    streakCount,
  };
}
