// Game phase state machine. Pure: no three, no DOM.
// Every transition is guarded so mashed inputs (Esc, clicks, double clicks)
// can never skip the score screen or wedge the machine.

export const PHASE = Object.freeze({
  IDLE: 'idle',
  ENTER: 'enter',
  PLAY: 'play',
  DYING: 'dying',
  SCORE: 'score',
  EXIT: 'exit',
});

export const ENTER_S = 1.5;
export const DYING_S = 1.5;
export const SCORE_RESTART_S = 1.7;
export const EXIT_S = 1.5;

export function createPhases() {
  const go = (s, next) => {
    s.phase = next;
    s.t = 0;
  };

  return {
    phase: PHASE.IDLE,
    t: 0, // seconds spent in the current phase

    begin() {
      if (this.phase === PHASE.IDLE || (this.phase === PHASE.SCORE && this.canRestart())) {
        go(this, PHASE.ENTER);
      }
    },

    tick(dt) {
      this.t += dt;
      if (this.phase === PHASE.ENTER && this.t >= ENTER_S) go(this, PHASE.PLAY);
      else if (this.phase === PHASE.DYING && this.t >= DYING_S) go(this, PHASE.SCORE);
      else if (this.phase === PHASE.EXIT && this.t >= EXIT_S) go(this, PHASE.IDLE);
    },

    die() {
      if (this.phase === PHASE.PLAY) go(this, PHASE.DYING);
    },

    exit() {
      const p = this.phase;
      if (p === PHASE.ENTER || p === PHASE.PLAY || p === PHASE.DYING || p === PHASE.SCORE) {
        go(this, PHASE.EXIT);
      }
    },

    canRestart() {
      return this.phase === PHASE.SCORE && this.t >= SCORE_RESTART_S;
    },
  };
}
