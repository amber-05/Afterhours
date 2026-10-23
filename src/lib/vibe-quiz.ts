import type { GameId } from "./types";

export type PersonaId = "founder" | "confessor" | "twist" | "flame" | "menace" | "warm";

export interface Persona {
  id: PersonaId;
  title: string;
  tagline: string;
  compliment: string;
  power: string;
  kryptonite: string;
  game: GameId;
  gameWhy: string;
  pairsWith: PersonaId;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  founder: {
    id: "founder",
    title: "The Group Chat Founder",
    tagline: "Every great night starts with your “guys, listen.”",
    compliment:
      "You're the reason this friend group actually meets. You turn “we should hang out sometime” into a date, a place and a poll. Your energy makes showing up feel easy, and people feel it.",
    power: "Turning chaos into a plan",
    kryptonite: "Friends who reply “maybe” and never confirm",
    game: "most_likely",
    gameWhy: "You love seeing how the whole room sees everyone.",
    pairsWith: "confessor",
  },
  confessor: {
    id: "confessor",
    title: "The Midnight Confessor",
    tagline: "People tell you things they've never told anyone.",
    compliment:
      "You listen like nothing else exists. At 2am people feel safe with you, and that's rare. You remember the small details, and that's exactly how people feel seen.",
    power: "Making people feel heard",
    kryptonite: "Carrying everyone's secrets alone",
    game: "confessions",
    gameWhy: "You're the one the room trusts with the real stuff.",
    pairsWith: "twist",
  },
  twist: {
    id: "twist",
    title: "The Plot Twist",
    tagline: "Nobody knows what happens when you walk in. Including you.",
    compliment:
      "You're why the story is worth telling. You say yes while everyone else says maybe, and your friends' best memories have your fingerprints all over them.",
    power: "Turning ordinary nights legendary",
    kryptonite: "Phone at 2%, plan at 0%",
    game: "truth_or_spill",
    gameWhy: "You can't resist a question with a dangerous answer.",
    pairsWith: "founder",
  },
  flame: {
    id: "flame",
    title: "The Velvet Flame",
    tagline: "Charm on a first-name basis with everyone.",
    compliment:
      "You make people feel like the main character. Confident, warm, a little dangerous. A room gets brighter when you laugh, and you're braver with feelings than you give yourself credit for.",
    power: "Making anyone feel magnetic",
    kryptonite: "Replying too fast, or not at all",
    game: "guess_who",
    gameWhy: "You read people's tells better than they do.",
    pairsWith: "menace",
  },
  menace: {
    id: "menace",
    title: "The Quiet Menace",
    tagline: "Says four words. Ends the argument.",
    compliment:
      "You notice everything. Your humour is razor sharp and your loyalty is sharper. When you finally speak, the whole room stops, and usually laughs.",
    power: "Reading a room in three seconds",
    kryptonite: "Thinking of the perfect comeback after you've left",
    game: "guess_who",
    gameWhy: "Spotting who wrote what is basically your hobby.",
    pairsWith: "warm",
  },
  warm: {
    id: "warm",
    title: "The Warm Light",
    tagline: "Home is wherever you're standing.",
    compliment:
      "You're the friend people text when it all falls apart, and the first one they text when it goes right. Your kindness isn't loud. It's steady, and it changes people.",
    power: "Making any room feel like home",
    kryptonite: "Putting everyone else first. Again.",
    game: "truth_or_spill",
    gameWhy: "Your questions bring the whole room closer.",
    pairsWith: "flame",
  },
};

export interface Question {
  q: string;
  options: { text: string; persona: PersonaId }[];
}

export const QUESTIONS: Question[] = [
  {
    q: "It's 1am and plans just got cancelled. You…",
    options: [
      { text: "Rally everyone into a new plan within five minutes", persona: "founder" },
      { text: "Call the one friend who gets you and talk till sunrise", persona: "confessor" },
      { text: "Do something completely unplanned. Why not?", persona: "twist" },
      { text: "Check on everyone, make tea, and settle in", persona: "warm" },
    ],
  },
  {
    q: "In the group chat, you're the one who…",
    options: [
      { text: "Makes the plan (and the poll)", persona: "founder" },
      { text: "Sends the perfectly timed one-liner", persona: "menace" },
      { text: "Drops a 4-minute voice note with a full story", persona: "confessor" },
      { text: "Flirts with the pun nobody asked for", persona: "flame" },
    ],
  },
  {
    q: "Your perfect night out is…",
    options: [
      { text: "Rooftop, good music, deep conversation", persona: "confessor" },
      { text: "Dance floor until the lights come on", persona: "flame" },
      { text: "Somewhere weird nobody's heard of", persona: "twist" },
      { text: "At home with your people and great food", persona: "warm" },
    ],
  },
  {
    q: "A friend tells you a secret. You…",
    options: [
      { text: "Take it to the grave, no notes", persona: "menace" },
      { text: "Hug them and ask what they need", persona: "warm" },
      { text: "Gasp, then immediately want the full story", persona: "twist" },
      { text: "Remember every detail for perfect advice later", persona: "confessor" },
    ],
  },
  {
    q: "Your texting style is…",
    options: [
      { text: "Instant reply, always", persona: "founder" },
      { text: "Left on read for three days, then a paragraph", persona: "twist" },
      { text: "Dry one-liners", persona: "menace" },
      { text: "Long messages and way too many hearts", persona: "flame" },
    ],
  },
  {
    q: "What do your friends say about you?",
    options: [
      { text: "“You always know what to say.”", persona: "confessor" },
      { text: "“You make everything an adventure.”", persona: "twist" },
      { text: "“You make me feel like the main character.”", persona: "flame" },
      { text: "“You feel like home.”", persona: "warm" },
    ],
  },
  {
    q: "Your hidden talent is…",
    options: [
      { text: "Getting 12 people to agree on one restaurant", persona: "founder" },
      { text: "Reading a room in three seconds", persona: "menace" },
      { text: "Making anyone feel at ease", persona: "warm" },
      { text: "Making any night legendary", persona: "twist" },
    ],
  },
];

/** Picks the winning persona. Ties go to whichever tied persona was chosen most recently. */
export function scoreQuiz(answers: number[]): PersonaId {
  const score = new Map<PersonaId, number>();
  const lastSeen = new Map<PersonaId, number>();
  answers.forEach((optionIdx, qIdx) => {
    const p = QUESTIONS[qIdx].options[optionIdx].persona;
    score.set(p, (score.get(p) ?? 0) + 1);
    lastSeen.set(p, qIdx);
  });
  return [...score.entries()].sort((a, b) => b[1] - a[1] || (lastSeen.get(b[0]) ?? 0) - (lastSeen.get(a[0]) ?? 0))[0][0];
}

const ADJECTIVES = [
  "Velvet", "Midnight", "Neon", "Golden", "Electric", "Cosmic", "Smoky", "Honeyed",
  "Moonlit", "Scarlet", "Masala", "Sunset", "Silver", "Dizzy", "Cinematic", "Rooftop",
];
const NOUNS = [
  "Falcon", "Panther", "Comet", "Lantern", "Otter", "Mango", "Jaguar", "Orchid",
  "Echo", "Firefly", "Monsoon", "Saffron", "Cinder", "Owl", "Nova", "Marigold",
];

/** Same answers → same alias, so a retake with the same answers feels consistent. */
export function aliasFor(answers: number[]): string {
  let h = 7;
  for (const a of answers) h = (h * 31 + a + 1) >>> 0;
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${NOUNS[(h >>> 4) % NOUNS.length]}`;
}
