// Master level. Deliberately low — this is texture under a visual, not a
// soundtrack, and it plays without the visitor having asked for it.
const MASTER = 0.14;

// Constant floor, so the idle curl drift still has a faint presence rather than
// the page snapping between silent and audible.
const IDLE = 0.05;

const STORAGE_KEY = 'pf.sound';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Two noise voices driven by the same quantities that drive the particles:
 *
 *   shimmer — a bandpass whose centre frequency and level track total field
 *             energy. This is the grain of the particles moving.
 *   body    — a lowpass swell that only opens during a morph, giving the
 *             transitions weight the shimmer alone can't carry.
 *
 * Nothing is fetched; the noise is generated at runtime so the page stays
 * self-contained and there is no audio asset to ship.
 */
export class FieldAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    // Persisted preference, defaulting to on. Audio still cannot start until a
    // real user gesture unlocks the context — see unlock().
    this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    this.shimmerLevel = 0;
    this.bodyLevel = 0;
  }

  /** Must be called from a genuine user gesture; autoplay policy blocks it otherwise. */
  unlock() {
    if (!this.ready) {
      try {
        this.#build();
      } catch {
        return; // no Web Audio — the page is still perfectly usable silently
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  #build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('no Web Audio');

    const ctx = new Ctx();
    this.ctx = ctx;

    // Two seconds of pink-ish noise on a loop. White noise reads as hiss; the
    // one-pole cascade tilts it about -3dB/octave, which sits under the visuals
    // instead of on top of them.
    const len = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    this.shimmer = ctx.createBiquadFilter();
    this.shimmer.type = 'bandpass';
    this.shimmer.frequency.value = 480;
    // Low Q on purpose. A narrow band sweeping upward whistles; this stays wide
    // and unpitched, which reads as texture rather than as a tone.
    this.shimmer.Q.value = 0.6;

    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0;

    this.body = ctx.createBiquadFilter();
    this.body.type = 'lowpass';
    this.body.frequency.value = 240;
    this.body.Q.value = 0.7;

    this.bodyGain = ctx.createGain();
    this.bodyGain.gain.value = 0;

    // Everything lands on a fixed lowpass before the master. Ear sensitivity
    // peaks around 2-4kHz, so without this the shimmer gets sibilant and
    // fatiguing exactly where it is loudest.
    this.tame = ctx.createBiquadFilter();
    this.tame.type = 'lowpass';
    this.tame.frequency.value = 1900;
    this.tame.Q.value = 0.5;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? MASTER : 0;

    source.connect(this.shimmer).connect(this.shimmerGain).connect(this.tame);
    source.connect(this.body).connect(this.bodyGain).connect(this.tame);
    this.tame.connect(this.master);
    this.master.connect(ctx.destination);

    source.start();
    this.source = source;
    this.ready = true;
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    if (!this.ready) return;
    // Ramp rather than jump, so toggling doesn't click.
    this.master.gain.setTargetAtTime(on ? MASTER : 0, this.ctx.currentTime, 0.06);
  }

  /** Suspend while the tab is hidden so we aren't burning battery in silence. */
  setPageVisible(visible) {
    if (!this.ready) return;
    if (visible) this.ctx.resume();
    else this.ctx.suspend();
  }

  /**
   * @param {number} morphEnergy 0..1 — how fast the phrase is currently morphing
   * @param {number} pointerEnergy 0..1 — how hard the cursor is stirring the field
   */
  update(morphEnergy, pointerEnergy) {
    if (!this.ready || this.ctx.state !== 'running') return;

    const energy = clamp01(IDLE + morphEnergy * 0.85 + pointerEnergy * 0.5);
    const now = this.ctx.currentTime;

    // Brighter and louder the more the field is moving — but the ceiling sits
    // well below the harsh band, and the longer time constants stop it from
    // chattering on fast cursor moves.
    this.shimmer.frequency.setTargetAtTime(360 + energy * 1150, now, 0.15);
    this.shimmerGain.gain.setTargetAtTime(0.04 + energy * 0.34, now, 0.13);

    // The swell is morph-only: a cursor sweep should sparkle, not rumble.
    this.body.frequency.setTargetAtTime(150 + morphEnergy * 620, now, 0.16);
    this.bodyGain.gain.setTargetAtTime(morphEnergy * 0.34, now, 0.14);
  }

  dispose() {
    if (!this.ready) return;
    this.source.stop();
    this.ctx.close();
    this.ready = false;
  }
}
