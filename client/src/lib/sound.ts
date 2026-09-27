/** Tiny synthesized sound effects (no audio files), in the spirit of skribbl.io's blips. */

const MUTE_KEY = 'scribble:muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.12) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    /* audio not available */
  }
}

export const sounds = {
  join: () => tone(660, 0, 0.12, 'triangle'),
  leave: () => tone(330, 0, 0.15, 'triangle'),
  correct: () => {
    tone(784, 0, 0.12, 'square', 0.06);
    tone(1047, 0.1, 0.2, 'square', 0.06);
  },
  tick: () => tone(1200, 0, 0.05, 'square', 0.04),
  turnStart: () => {
    tone(523, 0, 0.1, 'triangle');
    tone(659, 0.08, 0.14, 'triangle');
  },
  turnEnd: () => {
    tone(523, 0, 0.12, 'sawtooth', 0.05);
    tone(392, 0.12, 0.2, 'sawtooth', 0.05);
  },
  gameOver: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, 'triangle')),
};
