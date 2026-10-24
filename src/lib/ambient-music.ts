/**
 * Background music for Afterhours.
 *
 * 1. REAL TRACKS (best): drop royalty-free files into /public/music named after the vibe:
 *      friendly.mp3  fun.mp3  romantic.mp3  spicy.mp3   (mixed uses friendly.mp3)
 *    If the file for the current vibe exists it is played (looped, cross-faded when the vibe changes).
 *
 * 2. BUILT-IN SYNTH (fallback, no files needed): a composed loop, not random notes. Each vibe has a
 *    written A and B melody over a real chord progression, with bass, a soft arpeggio, a lo-fi
 *    drum groove and reverb. The room's game mode then shapes the energy (lobby relaxed,
 *    confessions hushed, Guess Who staccato, Friendship Test warm and slow).
 */
import type { GameId, Vibe } from "./types";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
type Note = number | null;

interface Chord {
  bass: number; // midi
  notes: number[]; // midi
}

interface Mood {
  bpm: number;
  chords: Chord[]; // one chord per bar, 4 bars
  phrases: [Note[], Note[]]; // two 4-bar melodies (32 eighth-note steps each)
  kick: "none" | "half" | "four";
  snare: boolean;
  shaker: number; // gain multiplier, 0 = off
  bassSteps: number[];
  bassOct: number[]; // bass steps played an octave up for movement
  bassGain: number;
  stabSteps: number[];
  arp: boolean;
  pad: boolean;
  density: number; // 1 = full melody, 0.5 = half, 0.25 = sparse
  decay: number; // melody note length multiplier
  echo: number; // echo feedback
}

const N = null;

const STYLES: Record<Exclude<Vibe, "mixed">, Mood> = {
  // Warm, singable, I–V–vi–IV in C
  friendly: {
    bpm: 100,
    chords: [
      { bass: 36, notes: [60, 64, 67] }, // C
      { bass: 43, notes: [55, 59, 62] }, // G
      { bass: 45, notes: [57, 60, 64] }, // Am
      { bass: 41, notes: [53, 57, 60] }, // F
    ],
    phrases: [
      [76, N, 79, N, 76, 74, 72, N, 74, N, 71, N, 74, 76, 79, N, 76, N, 81, N, 79, 76, 72, N, 77, N, 76, N, 74, 72, N, N],
      [79, N, 79, 81, 79, 76, N, 72, 74, 76, 79, N, 83, N, 79, N, 81, N, 79, 76, N, 76, 72, N, 77, 79, 81, N, 79, N, 77, N],
    ],
    kick: "half",
    snare: true,
    shaker: 1,
    bassSteps: [0, 3, 6],
    bassOct: [6],
    bassGain: 0.5,
    stabSteps: [2, 6],
    arp: true,
    pad: false,
    density: 1,
    decay: 1,
    echo: 0.3,
  },
  // Bouncy and bright, I–IV–V–IV
  fun: {
    bpm: 120,
    chords: [
      { bass: 36, notes: [60, 64, 67] }, // C
      { bass: 41, notes: [53, 57, 60] }, // F
      { bass: 43, notes: [55, 59, 62] }, // G
      { bass: 41, notes: [53, 57, 60] }, // F
    ],
    phrases: [
      [79, 79, N, 76, N, 79, 81, 79, 77, 77, N, 72, N, 77, 79, 77, 74, 74, N, 71, N, 74, 76, 74, 77, N, 81, N, 79, N, 77, N],
      [76, 79, 84, N, 81, 79, 76, N, 77, 81, 84, N, 81, 77, 72, N, 79, 83, 86, N, 83, 79, 74, N, 84, N, 81, N, 77, N, 72, N],
    ],
    kick: "four",
    snare: true,
    shaker: 1.3,
    bassSteps: [0, 3, 4, 6],
    bassOct: [3, 6],
    bassGain: 0.5,
    stabSteps: [2, 5, 7],
    arp: true,
    pad: false,
    density: 1,
    decay: 0.9,
    echo: 0.26,
  },
  // Slow, dreamy, long notes over a pad
  romantic: {
    bpm: 76,
    chords: [
      { bass: 41, notes: [57, 60, 64] }, // Fmaj7
      { bass: 40, notes: [55, 59, 62] }, // Em7
      { bass: 38, notes: [53, 57, 60] }, // Dm7
      { bass: 36, notes: [55, 59, 64] }, // Cmaj7
    ],
    phrases: [
      [81, N, N, N, 77, N, 79, N, 79, N, N, N, 76, N, 74, N, 77, N, N, N, 74, N, 77, N, 76, N, 79, N, 83, N, 79, N],
      [84, N, N, 81, N, N, 77, N, 83, N, N, 79, N, N, 76, N, 81, N, N, 77, N, N, 74, N, 79, N, 76, N, 72, N, N, N],
    ],
    kick: "none",
    snare: false,
    shaker: 0.3,
    bassSteps: [0, 4],
    bassOct: [],
    bassGain: 0.45,
    stabSteps: [],
    arp: false,
    pad: true,
    density: 1,
    decay: 1.7,
    echo: 0.42,
  },
  // Low, moody, minor with a dominant lift (Am–G–F–E)
  spicy: {
    bpm: 94,
    chords: [
      { bass: 45, notes: [57, 60, 64] }, // Am
      { bass: 43, notes: [55, 59, 62] }, // G
      { bass: 41, notes: [53, 57, 60] }, // F
      { bass: 40, notes: [56, 59, 64] }, // E
    ],
    phrases: [
      [69, N, 72, N, 76, N, 72, N, 79, N, 74, N, 71, N, 74, N, 72, N, 77, N, 81, N, 77, N, 76, N, 80, N, 83, N, 80, N],
      [81, N, 79, 76, N, 72, N, N, 79, N, 74, N, 71, N, N, N, 77, N, 76, N, 72, N, N, N, 80, N, 76, N, 71, N, N, N],
    ],
    kick: "half",
    snare: true,
    shaker: 0.8,
    bassSteps: [0, 3, 6, 7],
    bassOct: [7],
    bassGain: 0.65,
    stabSteps: [3, 7],
    arp: true,
    pad: false,
    density: 1,
    decay: 1.1,
    echo: 0.36,
  },
};

/** vibe + game → final mood. game = null means "in the lobby / not in a round". */
export function moodFor(vibe: Vibe | null, game: GameId | null): Mood {
  const base = STYLES[vibe && vibe !== "mixed" ? vibe : "friendly"];
  const m: Mood = { ...base };
  switch (game) {
    case null: // lobby: relaxed while everyone arrives
      m.kick = "none";
      m.snare = false;
      m.shaker *= 0.5;
      m.density = 0.5;
      m.bpm *= 0.94;
      break;
    case "most_likely": // full energy
      m.bpm *= 1.03;
      break;
    case "friendship_test": // warm and sincere
      m.kick = "none";
      m.snare = false;
      m.shaker *= 0.3;
      m.stabSteps = [];
      m.arp = false;
      m.pad = true;
      m.density = 0.5;
      m.decay *= 1.3;
      m.bpm *= 0.88;
      break;
    case "confessions": // hushed and secretive
      m.kick = "none";
      m.snare = false;
      m.shaker *= 0.15;
      m.stabSteps = [];
      m.arp = false;
      m.pad = true;
      m.density = 0.25;
      m.decay *= 1.5;
      m.echo = Math.max(m.echo, 0.45);
      m.bpm *= 0.82;
      break;
    case "guess_who": // curious, staccato
      m.decay *= 0.5;
      m.bpm *= 1.04;
      break;
    case "truth_or_spill": // playful middle ground
      break;
  }
  return m;
}

const VOLUME = 0.22;
const FILE_VOLUME = 0.5;
const STEPS_PER_BAR = 8;

let mood: Mood = STYLES.friendly; // default outside rooms
let vibeKey: Exclude<Vibe, "mixed"> = "friendly";
let gameKey: GameId | null = null;
let wantPlaying = false;

/* ======================================================================= *
 *  Synth engine
 * ======================================================================= */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null; // melodic instruments → dry + reverb
let echo: DelayNode | null = null;
let feedback: GainNode | null = null;
let noise: AudioBuffer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextStepAt = 0;
let step = 0;

const stepSeconds = () => 60 / mood.bpm / 2;

function impulse(c: AudioContext, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

function build(c: AudioContext) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 4;
  comp.connect(c.destination);

  master = c.createGain();
  master.gain.value = 0;
  master.connect(comp);

  // melodic bus: dry + a soft reverb so notes sit in a room instead of beeping
  bus = c.createGain();
  bus.connect(master);
  const verb = c.createConvolver();
  verb.buffer = impulse(c, 2.4);
  const wet = c.createGain();
  wet.gain.value = 0.38;
  bus.connect(verb).connect(wet).connect(master);

  echo = c.createDelay(2);
  echo.delayTime.value = stepSeconds() * 1.5;
  feedback = c.createGain();
  feedback.gain.value = mood.echo;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2800;
  echo.connect(feedback).connect(tone).connect(echo);
  tone.connect(bus);

  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function env(g: GainNode, at: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function kick(c: AudioContext, at: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(120, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  env(g, at, 0.5, 0.004, 0.26);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.35);
}

function snare(c: AudioContext, at: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 0.8;
  const g = c.createGain();
  env(g, at, 0.1, 0.002, 0.12);
  src.connect(bp).connect(g);
  g.connect(master!);
  g.connect(bus!);
  src.start(at);
  src.stop(at + 0.2);
}

function shaker(c: AudioContext, at: number, accent: boolean) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = c.createGain();
  env(g, at, (accent ? 0.06 : 0.03) * mood.shaker, 0.004, 0.05);
  src.connect(hp).connect(g).connect(master!);
  src.start(at);
  src.stop(at + 0.1);
}

function bass(c: AudioContext, midi: number, at: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.value = mtof(midi);
  env(g, at, mood.bassGain, 0.012, 0.32);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.45);
}

/** Soft electric-piano-ish tone: sine + a quiet octave partial through a gentle low-pass. */
function keys(c: AudioContext, midi: number, at: number, gain: number, length: number) {
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.connect(bus!);
  for (const [mult, g0, dec] of [
    [1, gain, length],
    [2, gain * 0.28, length * 0.55],
  ] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = mtof(midi) * mult;
    env(g, at, g0, 0.006, dec);
    o.connect(g).connect(lp);
    g.connect(echo!);
    o.start(at);
    o.stop(at + dec + 0.1);
  }
}

function stab(c: AudioContext, notes: number[], at: number) {
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  lp.connect(bus!);
  for (const n of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = mtof(n);
    env(g, at, 0.07, 0.01, 0.2);
    o.connect(g).connect(lp);
    o.start(at);
    o.stop(at + 0.3);
  }
}

function pad(c: AudioContext, notes: number[], at: number, len: number) {
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1000;
  lp.connect(bus!);
  for (const n of notes) {
    for (const detune of [-6, 6]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.value = mtof(n - 12);
      o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.06, at + len * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, at + len * 1.2);
      o.connect(g).connect(lp);
      o.start(at);
      o.stop(at + len * 1.25);
    }
  }
}

function melodyPlays(inBar: number): boolean {
  if (mood.density >= 1) return true;
  if (mood.density >= 0.5) return inBar % 2 === 0;
  return inBar === 0 || inBar === 4;
}

function playStep(c: AudioContext, s: number, t: number) {
  const inBar = s % STEPS_PER_BAR;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const chord = mood.chords[bar % mood.chords.length];
  const phrase = mood.phrases[Math.floor(bar / 4) % 2];
  const swing = inBar % 2 === 1 ? stepSeconds() * 0.1 : 0;
  const at = t + swing;

  // drums
  if (mood.kick === "four" ? inBar % 2 === 0 : mood.kick === "half" && (inBar === 0 || inBar === 4)) kick(c, t);
  if (mood.snare && inBar === 4) snare(c, t);
  if (mood.shaker > 0.05) shaker(c, at, inBar % 2 === 1);

  // harmony
  if (mood.bassSteps.includes(inBar)) bass(c, chord.bass + (mood.bassOct.includes(inBar) ? 12 : 0), t);
  if (mood.stabSteps.includes(inBar)) stab(c, chord.notes, at);
  if (mood.pad && inBar === 0) pad(c, chord.notes, t, stepSeconds() * STEPS_PER_BAR);
  if (mood.arp && inBar % 2 === 0) {
    keys(c, chord.notes[(inBar / 2) % chord.notes.length] - 12, at, 0.045, stepSeconds() * 2.2);
  }

  // the written melody
  const note = phrase[(bar % 4) * STEPS_PER_BAR + inBar];
  if (note != null && melodyPlays(inBar)) keys(c, note, at, 0.15, 0.55 * mood.decay);
}

function schedule() {
  if (!ctx) return;
  const horizon = ctx.currentTime + 0.5;
  while (nextStepAt < horizon) {
    playStep(ctx, step, nextStepAt);
    step++;
    nextStepAt += stepSeconds();
  }
}

async function startSynth() {
  if (!ctx) {
    ctx = new AudioContext();
    build(ctx);
  }
  await ctx.resume();
  const now = ctx.currentTime;
  master!.gain.cancelScheduledValues(now);
  master!.gain.setValueAtTime(master!.gain.value, now);
  master!.gain.linearRampToValueAtTime(VOLUME, now + 1.2);
  if (!timer) {
    step = 0;
    nextStepAt = now + 0.1;
    timer = setInterval(schedule, 100);
    schedule();
  }
}

function stopSynth() {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0, now + 0.6);
  if (timer) clearInterval(timer);
  timer = null;
  const c = ctx;
  setTimeout(() => {
    if (!timer) void c.suspend();
  }, 700);
}

/* ======================================================================= *
 *  Real-track engine (files in /public/music)
 * ======================================================================= */
const trackUrl = (v: string) => `/music/${v}.mp3`;
const trackExists = new Map<string, Promise<boolean>>();
let audio: HTMLAudioElement | null = null;
let audioVibe: string | null = null;

function hasTrack(v: string): Promise<boolean> {
  let p = trackExists.get(v);
  if (!p) {
    p = fetch(trackUrl(v), { method: "HEAD" })
      .then((r) => r.ok && (r.headers.get("content-type") ?? "").startsWith("audio"))
      .catch(() => false);
    trackExists.set(v, p);
  }
  return p;
}

function fileVolume() {
  // the game shapes loudness a little: hushed for confessions / friendship, calmer in the lobby
  const f = gameKey === "confessions" ? 0.55 : gameKey === "friendship_test" ? 0.7 : gameKey === null ? 0.75 : 1;
  return FILE_VOLUME * f;
}

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume;
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}

async function playFile(v: string) {
  if (audio && audioVibe === v) {
    fade(audio, fileVolume(), 600);
    if (audio.paused) await audio.play().catch(() => {});
    return;
  }
  const old = audio;
  const el = new Audio(trackUrl(v));
  el.loop = true;
  el.volume = 0;
  audio = el;
  audioVibe = v;
  await el.play().catch(() => {});
  fade(el, fileVolume(), 1200);
  if (old) fade(old, 0, 1200, () => old.pause());
}

function stopFile() {
  if (!audio) return;
  const el = audio;
  fade(el, 0, 500, () => el.pause());
}

/* ======================================================================= *
 *  Public API
 * ======================================================================= */
async function apply() {
  if (!wantPlaying) return;
  const v = vibeKey;
  if (await hasTrack(v)) {
    stopSynth();
    await playFile(v);
  } else {
    stopFile();
    await startSynth();
  }
}

/** Call whenever the room's vibe or current game changes. Safe to call before music starts. */
export function setMusicMood(vibe: Vibe | null, game: GameId | null, inRoom = true) {
  vibeKey = inRoom && vibe && vibe !== "mixed" ? vibe : "friendly";
  gameKey = inRoom ? game : null;
  mood = inRoom ? moodFor(vibe, game) : STYLES.friendly;
  if (ctx && echo && feedback) {
    echo.delayTime.setTargetAtTime(stepSeconds() * 1.5, ctx.currentTime, 0.2);
    feedback.gain.setTargetAtTime(mood.echo, ctx.currentTime, 0.2);
  }
  if (wantPlaying) void apply();
}

export async function startMusic() {
  if (typeof window === "undefined") return;
  wantPlaying = true;
  await apply();
}

export function stopMusic() {
  wantPlaying = false;
  stopSynth();
  stopFile();
}
