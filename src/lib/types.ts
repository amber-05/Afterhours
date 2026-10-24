export type GameId = "most_likely" | "friendship_test" | "confessions" | "truth_or_spill" | "guess_who";
export type Vibe = "friendly" | "fun" | "romantic" | "spicy" | "mixed";
export type Phase = "collecting" | "guessing" | "reveal" | "finished";

export interface Player {
  id: string;
  name: string;
  avatar: string;
  is_host: boolean;
}

export interface TallyEntry {
  player_id: string;
  votes: number;
}

export interface RevealItem {
  text: string;
  /** Only present for public Truth or Spill answers. */
  player_id: string | null;
}

export interface GuessResult {
  text: string;
  /** null when the host hid authors. */
  author_id: string | null;
  correct_ids: string[];
  tally: TallyEntry[];
}

export interface RoundPayload {
  // most_likely
  tally?: TallyEntry[];
  winners?: string[];
  total_votes?: number;
  // confessions / truth_or_spill
  items?: RevealItem[];
  // guess_who
  total?: number;
  current_text?: string;
  results?: GuessResult[];
  scores?: { player_id: string; correct: number }[];
}

export interface Round {
  id: string;
  round_no: number;
  game: GameId;
  prompt: string;
  phase: Phase;
  cursor: number;
  payload: RoundPayload;
  is_my_statement: boolean;
  series_no: number;
  series_total: number;
  /** Friendship Test: the player who also picked you (mutual), only ever shown to the two of you. */
  my_bond: string | null;
}

export interface MyEntry {
  content: string | null;
  target_player_id: string | null;
  anonymous: boolean;
}

export interface RoomState {
  room: {
    id: string;
    code: string;
    status: "lobby" | "playing";
    vibe: Vibe;
    auto_rotate: boolean;
    reveal_author: boolean;
    rounds_per_game: number;
    round_count: number;
  };
  me: Player;
  players: Player[];
  round: Round | null;
  /** player ids that already answered the current step */
  submitted: string[];
  my_entry: MyEntry | null;
}
