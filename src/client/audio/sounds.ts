// Audio cues (GDD §12.3), synthesised with Web Audio so there is no sound file to
// download or precache. The context is created on the first user gesture: browsers
// refuse to start audio before one.

export type Cue =
  | 'shuffle' | 'dealTick' | 'bidPop' | 'pass' | 'trumpReveal' | 'cardPlace'
  | 'cut' | 'trickSweep' | 'made' | 'failed' | 'kot' | 'yourTurn';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let volume = 0.7;

function makeNoise(c: Ctx): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Creates or resumes the context. Call from a user gesture. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noise = makeNoise(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Unlock on the first pointer or key press, then stop listening. */
export function bindAudioUnlock(target: Window = window) {
  const once = () => {
    unlockAudio();
    if (ctx) for (const t of ['pointerdown', 'keydown'] as const) target.removeEventListener(t, once, true);
  };
  for (const t of ['pointerdown', 'keydown'] as const) target.addEventListener(t, once, true);
}

/** 0..1 master volume. */
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

// ---- building blocks ----

function env(c: Ctx, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(master!);
  return g;
}

function tone(c: Ctx, at: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
  o.connect(env(c, at, peak, attack, decay));
  o.start(at);
  o.stop(at + attack + decay + 0.02);
}

function hiss(c: Ctx, at: number, filter: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack: number, decay: number) {
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, at + attack + decay);
  s.connect(f).connect(env(c, at, peak, attack, decay));
  s.start(at, Math.random() * 0.5);
  s.stop(at + attack + decay + 0.02);
}

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77, C6: 1046.5, E6: 1318.5 };

function render(c: Ctx, cue: Cue, at: number) {
  switch (cue) {
    case 'shuffle':
      for (let i = 0; i < 9; i++) hiss(c, at + i * 0.035, 'bandpass', 2500 + i * 150, 3200, 1.2, 0.18, 0.004, 0.03);
      break;
    case 'dealTick':
      hiss(c, at, 'highpass', 3000, 3000, 0.7, 0.12, 0.002, 0.025);
      break;
    case 'bidPop':
      tone(c, at, 'sine', 520, 880, 0.3, 0.008, 0.09);
      break;
    case 'pass':
      tone(c, at, 'sine', 330, 260, 0.14, 0.01, 0.1);
      break;
    case 'trumpReveal':
      tone(c, at, 'triangle', NOTE.E5, NOTE.E5, 0.28, 0.01, 0.35);
      tone(c, at + 0.11, 'triangle', NOTE.B5, NOTE.B5, 0.24, 0.01, 0.5);
      break;
    case 'cardPlace':
      hiss(c, at, 'lowpass', 1800, 600, 0.8, 0.35, 0.003, 0.06);
      tone(c, at, 'sine', 180, 120, 0.12, 0.003, 0.05);
      break;
    case 'cut': // "kaat": a sharp slice
      tone(c, at, 'sawtooth', 1100, 280, 0.16, 0.004, 0.12);
      hiss(c, at, 'highpass', 4000, 1500, 0.9, 0.22, 0.002, 0.08);
      break;
    case 'trickSweep':
      hiss(c, at, 'bandpass', 600, 2400, 1.5, 0.22, 0.05, 0.18);
      break;
    case 'made':
      [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => tone(c, at + i * 0.09, 'triangle', f, f, 0.26, 0.01, 0.35));
      break;
    case 'failed':
      tone(c, at, 'sine', 120, 55, 0.5, 0.01, 0.35);
      hiss(c, at, 'lowpass', 400, 150, 0.7, 0.2, 0.005, 0.15);
      break;
    case 'kot':
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(c, at + i * 0.12, 'square', f, f, 0.12, 0.01, 0.3));
      tone(c, at + 0.48, 'triangle', NOTE.C6, NOTE.C6, 0.3, 0.02, 0.9);
      tone(c, at + 0.48, 'triangle', NOTE.E6, NOTE.E6, 0.18, 0.02, 0.9);
      break;
    case 'yourTurn':
      tone(c, at, 'sine', NOTE.E6, NOTE.E6, 0.18, 0.005, 0.18);
      break;
  }
}

/** Plays a cue `delayMs` from now. Silent until unlocked, and while the tab is hidden. */
export function playCue(cue: Cue, delayMs = 0) {
  if (!ctx || !master || ctx.state !== 'running') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    render(ctx, cue, ctx.currentTime + 0.005 + delayMs / 1000);
  } catch {
    // a failed cue never breaks the game
  }
}
