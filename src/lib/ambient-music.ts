/**
 * Procedural, mood-aware background music (Web Audio, no audio files).
 *
 *  - The room's VIBE picks the style: key, tempo, chords and instruments.
 *      friendly → warm major groove · fun → faster and bouncier · romantic → slow, soft, pad-led ·
 *      spicy → minor, low and sparse
 *  - The GAME MODE shapes the energy on top: lobby is relaxed, confessions are hushed,
 *    Who's Most Likely is full groove, Guess Who is staccato and curious.
 * Changing mood while playing glides over at the next step; no restart needed.
 */
import type { GameId, Vibe } from "./types";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  bass: number; // midi
  notes: number[]; // midi
}

interface Mood {
  bpm: number;
  chords: Chord[];
  scale: number[]; // midi, melody pool
  kick: "none" | "half" | "four";
  shaker: number; // gain multiplier, 0 = off
  bassSteps: number[];
  bassGain: number;
  stabSteps: number[];
  pad: boolean;
  melodyProb: number;
  decay: number; // melody note length multiplier
  echo: number; // echo feedback
}

const STYLES: Record<Exclude<Vibe, "mixed">, Mood> = {
  friendly: {
    bpm: 104,
    chords: [
      { bass: 36, notes: [60, 64, 67] }, // C
      { bass: 43, notes: [55, 59, 62] }, // G
      { bass: 45, notes: [57, 60, 64] }, // Am
      { bass: 41, notes: [53, 57, 60] }, // F
    ],
    scale: [72, 74, 76, 79, 81, 84],
    kick: "half",
    shaker: 1,
    bassSteps: [0, 3, 6],
    bassGain: 0.5,
    stabSteps: [2, 5, 7],
    pad: false,
    melodyProb: 0.55,
    decay: 1,
    echo: 0.3,
  },
  fun: {
    bpm: 122,
    chords: [
      { bass: 36, notes: [60, 64, 67] }, // C
      { bass: 41, notes: [53, 57, 60] }, // F
      { bass: 43, notes: [55, 59, 62] }, // G
      { bass: 41, notes: [53, 57, 60] }, // F
    ],
    scale: [72, 74, 76, 79, 81, 84],
    kick: "four",
    shaker: 1.3,
    bassSteps: [0, 3, 4, 6],
    bassGain: 0.5,
    stabSteps: [2, 5, 7],
    pad: false,
    melodyProb: 0.7,
    decay: 0.9,
    echo: 0.28,
  },
  romantic: {
    bpm: 78,
    chords: [
      { bass: 41, notes: [57, 60, 64] }, // Fmaj7-ish
      { bass: 40, notes: [55, 59, 62] }, // Em7
      { bass: 38, notes: [53, 57, 60] }, // Dm7
      { bass: 36, notes: [55, 59, 64] }, // Cmaj7
    ],
    scale: [67, 69, 72, 74, 76, 79],
    kick: "none",
    shaker: 0.3,
    bassSteps: [0, 4],
    bassGain: 0.45,
    stabSteps: [],
    pad: true,
    melodyProb: 0.35,
    decay: 1.6,
    echo: 0.42,
  },
  spicy: {
    bpm: 98,
    chords: [
      { bass: 45, notes: [57, 60, 64] }, // Am
      { bass: 43, notes: [55, 59, 62] }, // G
      { bass: 41, notes: [53, 57, 60] }, // F
      { bass: 40, notes: [56, 59, 64] }, // E
    ],
    scale: [69, 72, 74, 76, 79, 81],
    kick: "half",
    shaker: 0.8,
    bassSteps: [0, 3, 6, 7],
    bassGain: 0.65,
    stabSteps: [3, 7],
    pad: false,
    melodyProb: 0.32,
    decay: 1.1,
    echo: 0.36,
  },
};

/** vibe + game → final mood. game = null means "in the lobby / not in a round". */
export function moodFor(vibe: Vibe | null, game: GameId | null): Mood {
  const base = STYLES[vibe && vibe !== "mixed" ? vibe : "friendly"];
  const m: Mood = { ...base };
  switch (game) {
    case null: // lobby: relaxed, waiting for the host
      m.kick = "none";
      m.shaker *= 0.5;
      m.melodyProb *= 0.65;
      m.bpm *= 0.93;
      break;
    case "most_likely": // full energy
      m.bpm *= 1.04;
      break;
    case "confessions": // hushed and secretive
      m.kick = "none";
      m.shaker *= 0.15;
      m.stabSteps = [];
      m.pad = true;
      m.melodyProb *= 0.45;
      m.decay *= 1.5;
      m.echo = Math.max(m.echo, 0.45);
      m.bpm *= 0.82;
      break;
    case "guess_who": // curious, staccato
      m.decay *= 0.45;
      m.melodyProb = Math.min(0.85, m.melodyProb * 1.4);
      m.bpm *= 1.05;
      break;
    case "truth_or_spill": // playful middle ground
      break;
  }
  return m;
}

const VOLUME = 0.2;
const STEPS_PER_BAR = 8;

let mood: Mood = STYLES.friendly; // default outside rooms: the full friendly groove

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let echo: DelayNode | null = null;
let feedback: GainNode | null = null;
let noise: AudioBuffer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextStepAt = 0;
let step = 0;
let melodyIdx = 2;

const stepSeconds = () => 60 / mood.bpm / 2;

/** Call whenever the room's vibe or current game changes. Safe to call before music starts. */
export function setMusicMood(vibe: Vibe | null, game: GameId | null, inRoom = true) {
  mood = inRoom ? moodFor(vibe, game) : STYLES.friendly;
  if (ctx && echo && feedback) {
    echo.delayTime.setTargetAtTime(stepSeconds() * 1.5, ctx.currentTime, 0.2);
    feedback.gain.setTargetAtTime(mood.echo, ctx.currentTime, 0.2);
  }
}

function build(c: AudioContext) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(c.destination);

  master = c.createGain();
  master.gain.value = 0;
  master.connect(comp);

  echo = c.createDelay(2);
  echo.delayTime.value = stepSeconds() * 1.5;
  feedback = c.createGain();
  feedback.gain.value = mood.echo;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  echo.connect(feedback).connect(tone).connect(echo);
  tone.connect(master);

  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.1), c.sampleRate);
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
  o.frequency.setValueAtTime(130, at);
  o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  env(g, at, 0.5, 0.005, 0.22);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.3);
}

function shaker(c: AudioContext, at: number, accent: boolean) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const g = c.createGain();
  env(g, at, (accent ? 0.07 : 0.035) * mood.shaker, 0.004, 0.06);
  src.connect(hp).connect(g).connect(master!);
  src.start(at);
  src.stop(at + 0.1);
}

function bass(c: AudioContext, midi: number, at: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.value = mtof(midi);
  env(g, at, mood.bassGain, 0.01, 0.28);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.4);
}

function stab(c: AudioContext, notes: number[], at: number) {
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  lp.connect(master!);
  for (const n of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = mtof(n);
    env(g, at, 0.1, 0.01, 0.22);
    o.connect(g).connect(lp);
    o.start(at);
    o.stop(at + 0.35);
  }
}

/** Slow, soft sustained chord (used for romantic and for hushed games). */
function pad(c: AudioContext, notes: number[], at: number, len: number) {
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1100;
  lp.connect(master!);
  for (const n of notes) {
    for (const detune of [-5, 5]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.value = mtof(n - 12);
      o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.07, at + len * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, at + len * 1.15);
      o.connect(g).connect(lp);
      o.start(at);
      o.stop(at + len * 1.2);
    }
  }
}

function marimba(c: AudioContext, midi: number, at: number) {
  const freq = mtof(midi);
  for (const [mult, peak, decay] of [
    [1, 0.16, 0.5 * mood.decay],
    [4, 0.04, 0.12 * mood.decay],
  ] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    env(g, at, peak, 0.004, decay);
    o.connect(g);
    g.connect(master!);
    g.connect(echo!);
    o.start(at);
    o.stop(at + decay + 0.1);
  }
}

function playStep(c: AudioContext, s: number, t: number) {
  const inBar = s % STEPS_PER_BAR;
  const chord = mood.chords[Math.floor(s / STEPS_PER_BAR) % mood.chords.length];
  const swing = inBar % 2 === 1 ? stepSeconds() * 0.12 : 0;
  const at = t + swing;

  if (mood.kick === "four" ? inBar % 2 === 0 : mood.kick === "half" && (inBar === 0 || inBar === 4)) kick(c, t);
  if (mood.shaker > 0.05) shaker(c, at, inBar % 2 === 1);
  if (mood.bassSteps.includes(inBar)) bass(c, chord.bass, t);
  if (mood.stabSteps.includes(inBar)) stab(c, chord.notes, at);
  if (mood.pad && inBar === 0) pad(c, chord.notes, t, stepSeconds() * STEPS_PER_BAR);

  if (inBar === 0 || Math.random() < mood.melodyProb) {
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    melodyIdx = Math.min(mood.scale.length - 1, Math.max(0, melodyIdx + move));
    marimba(c, mood.scale[melodyIdx], at);
  }
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

export async function startMusic() {
  if (typeof window === "undefined") return;
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

export function stopMusic() {
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
