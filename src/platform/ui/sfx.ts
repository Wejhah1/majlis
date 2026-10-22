// Tiny synthesized sound effects: no audio files to download. Muted state is per device.
const KEY = 'majlis-muted';
let ctx: AudioContext | null = null;

export function isMuted() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    // Not persisted.
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.18) {
  const a = ctx!;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
  osc.connect(g).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + duration + 0.05);
}

const SOUNDS = {
  buzz: () => {
    tone(220, 0, 0.18, 'square', 0.08);
    tone(330, 0.06, 0.2, 'square', 0.08);
  },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle')),
  wrong: () => {
    tone(160, 0, 0.35, 'sawtooth', 0.07);
    tone(120, 0.12, 0.4, 'sawtooth', 0.07);
  },
  flip: () => tone(880, 0, 0.08, 'triangle', 0.08),
  reveal: () => [392, 523].forEach((f, i) => tone(f, i * 0.12, 0.4, 'sine')),
  dusk: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.22, 0.7, 'sine', 0.12)),
  dawn: () => [262, 330, 392, 523].forEach((f, i) => tone(f, i * 0.16, 0.6, 'triangle', 0.12)),
  strike: () => {
    tone(90, 0, 0.5, 'sawtooth', 0.12);
    tone(60, 0.05, 0.7, 'sine', 0.2);
  },
  shield: () => [659, 988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.6, 'sine', 0.1)),
  gavel: () => {
    tone(140, 0, 0.12, 'square', 0.12);
    tone(140, 0.25, 0.12, 'square', 0.12);
  },
};

export function play(name: keyof typeof SOUNDS) {
  if (isMuted() || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    SOUNDS[name]();
  } catch {
    // Audio is a nicety; never break the game for it.
  }
}
