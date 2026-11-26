// Builds the game's shader variants from the hero's own shader text, and
// guards the one variant that cannot be built that way. Pure string work, no
// three.js: src/game/gpu.js uses it with the ?raw imports, and
// shaderSource.test.js with the files read from disk.
//
// - points.vert:      the hero's file with main() renamed heroMain(), then the
//                     game's part (src/game/shaders/points.vert).
// - simPosition.frag: the game's part ahead of the hero's file, and a
//                     gameSnap(pos) call spliced in before its output.
// - simVelocity.frag: the game weighting is interleaved with the hero's body,
//                     so src/game/shaders/simVelocity.frag is a full variant.
//                     mirrorDrift() checks, under npm test, that it still
//                     carries every line of the hero's, in order.

/** Replace the one occurrence of `find` in `text`; throws if it is not exactly one. */
function spliceOnce(text, find, replace, what) {
  const parts = text.split(find);
  if (parts.length !== 2) {
    throw new Error(`${what}: expected exactly one ${JSON.stringify(find)} in the hero shader, found ${parts.length - 1}`);
  }
  return parts[0] + replace + parts[1];
}

/** The game's points vertex program body: hero (main renamed), then the game's part. */
export function gamePointsVert(heroVert, gamePart) {
  return `${spliceOnce(heroVert, 'void main()', 'void heroMain()', 'points.vert')}\n${gamePart}`;
}

/** The game's position program body: the game's part, then the hero with gameSnap spliced in. */
export function gamePositionFrag(heroFrag, gamePart) {
  const hero = spliceOnce(heroFrag, 'gl_FragColor = pos;', 'gameSnap(pos);\n  gl_FragColor = pos;', 'simPosition.frag');
  return `${gamePart}\n${hero}`;
}

/**
 * The hero lines that src/game/shaders/simVelocity.frag deliberately replaces
 * (trimmed). Each must still be in the hero exactly as written here, so a
 * change to one of them is reported as drift too.
 */
export const VELOCITY_REPLACED = [
  'vec3 goal = mix(ga, gb, m);',
  'vel *= pow(uDamping, uDt * 60.0);',
  'vel *= exp(-uDt * 6.3 * snap);',
  'vel += force * uDt;',
  'if (speed > uMaxSpeed) {',
  'vel *= uMaxSpeed / speed;',
  'speed = uMaxSpeed;',
];

// Trimmed code lines: blank lines and whole-line comments dropped.
const codeLines = (text) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('//'));

/**
 * Does `variant` still mirror `hero`? Every code line of the hero, except the
 * `replaced` ones, must appear in the variant in the same order (indentation
 * aside). Returns a list of problems; empty means no drift.
 */
export function mirrorDrift(hero, variant, replaced = []) {
  const problems = [];
  const lines = codeLines(hero);
  for (const r of replaced) {
    const n = lines.filter((l) => l === r).length;
    if (n !== 1) problems.push(`replaced line ${JSON.stringify(r)} is in the hero ${n} times (1)`);
  }
  const want = lines.filter((l) => !replaced.includes(l));
  const have = codeLines(variant);
  let j = 0;
  for (const line of want) {
    while (j < have.length && have[j] !== line) j++;
    if (j === have.length) {
      problems.push(`hero line not mirrored (in order) in the variant: ${JSON.stringify(line)}`);
      break;
    }
    j++;
  }
  return problems;
}
