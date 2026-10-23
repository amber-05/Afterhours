import { Eye, Lock, MessagesSquare, Search, Shuffle, type LucideIcon } from "lucide-react";
import type { GameId, Vibe } from "./types";

export interface GameMeta {
  id: GameId | "room_decides";
  title: string;
  icon: LucideIcon;
  tagline: string;
  min: number;
}

export const GAMES: GameMeta[] = [
  {
    id: "most_likely",
    title: "Who's Most Likely?",
    icon: Eye,
    tagline: "Vote in secret. The room's verdict is public.",
    min: 3,
  },
  {
    id: "confessions",
    title: "Anonymous Confessions",
    icon: Lock,
    tagline: "Drop a secret. Nobody knows whose it is.",
    min: 2,
  },
  {
    id: "truth_or_spill",
    title: "Truth or Spill",
    icon: MessagesSquare,
    tagline: "Answer the question — hidden or out loud.",
    min: 2,
  },
  {
    id: "guess_who",
    title: "Guess Who?",
    icon: Search,
    tagline: "Whose statement is it? Trust no one.",
    min: 2,
  },
  {
    id: "room_decides",
    title: "The Room Decides",
    icon: Shuffle,
    tagline: "Rotates through the games on its own. Just keep going.",
    min: 3,
  },
];

export const gameMeta = (id: GameId) => GAMES.find((g) => g.id === id)!;

export const VIBES: { id: Vibe; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "fun", label: "Fun" },
  { id: "romantic", label: "Romantic" },
  { id: "spicy", label: "Spicy" },
  { id: "mixed", label: "Mixed" },
];

export const AVATARS = ["🦊", "🐼", "🦄", "🐙", "🐸", "🦋", "🐯", "🐲", "👻", "🦉", "🐺", "🪩"];

export const MAX_TEXT = 280;
