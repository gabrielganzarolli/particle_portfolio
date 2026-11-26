// Hero click rules. Pure: decides what a click does, the caller performs it.
// s: {headOn, headFormed, onHead, onName, reducedMotion, gameActive}
export function clickAction(s) {
  if (s.gameActive) return 'none';
  if (s.headOn) {
    if (!s.headFormed) return s.onHead ? 'none' : 'toggle';
    if (s.onHead) return s.reducedMotion ? 'toggle' : 'startGame';
    return 'toggle';
  }
  return s.onName ? 'toggle' : 'none';
}
