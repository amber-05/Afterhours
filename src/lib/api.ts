import { ensureGuestSession, getSupabase } from "./supabase";
import type { GameId, RoomState, Vibe } from "./types";

const ERRORS: Record<string, string> = {
  not_authenticated: "Your guest session expired. Refresh the page.",
  room_not_found: "That room doesn't exist (or already closed).",
  not_member: "You're not in this room yet.",
  name_taken: "Someone already took that name — try another.",
  invalid_name: "Pick a name between 1 and 20 characters.",
  room_full: "This room is full (12 players max).",
  rate_limited: "Slow down — too many rooms created recently.",
  not_host: "Only the host can do that.",
  not_enough_players: "Not enough players for this game yet.",
  not_enough_statements: "Need at least 2 statements to play.",
  nothing_to_reveal: "Nobody has answered yet.",
  already_submitted: "You already answered.",
  invalid_content: "Write something (up to 280 characters).",
  invalid_target: "Pick someone else.",
  author_cannot_guess: "It's your statement — no guessing!",
  not_accepting_answers: "This round isn't taking answers right now.",
  no_more_items: "That's the last one.",
  round_over: "This round is over.",
  no_active_round: "No round is running.",
  cannot_kick_self: "You can't kick yourself.",
  anon_disabled:
    "Guest sign-ins are off. In Supabase: Authentication → Sign In / Providers → enable “Allow anonymous sign-ins”.",
  supabase_not_configured: "Supabase env vars are missing. See the README.",
};

export class ApiError extends Error {
  constructor(public code: string) {
    super(ERRORS[code] ?? "Something went wrong. Try again.");
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  await ensureGuestSession();
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) {
    const code = (error.message ?? "").trim();
    throw new ApiError(code in ERRORS ? code : "unknown");
  }
  return data as T;
}

export const api = {
  preview: (code: string) =>
    rpc<{ found: boolean; status?: string; player_count?: number; host_name?: string; full?: boolean }>(
      "room_preview",
      { p_code: code },
    ),
  createRoom: (name: string, avatar: string) =>
    rpc<{ code: string }>("create_room", { p_name: name, p_avatar: avatar }),
  joinRoom: (code: string, name: string, avatar: string) =>
    rpc<{ code: string }>("join_room", { p_code: code, p_name: name, p_avatar: avatar }),
  getState: (code: string) => rpc<RoomState>("get_room_state", { p_code: code }),
  leave: (code: string) => rpc<void>("leave_room", { p_code: code }),
  kick: (code: string, playerId: string) => rpc<void>("kick_player", { p_code: code, p_player: playerId }),
  settings: (code: string, s: { vibe?: Vibe; revealAuthor?: boolean }) =>
    rpc<void>("update_settings", {
      p_code: code,
      p_vibe: s.vibe ?? null,
      p_reveal_author: s.revealAuthor ?? null,
    }),
  startRound: (code: string, game: GameId | "room_decides") =>
    rpc<string>("start_round", { p_code: code, p_game: game }),
  advance: (code: string) => rpc<void>("host_advance", { p_code: code }),
  endGame: (code: string) => rpc<void>("end_game", { p_code: code }),
  vote: (code: string, targetPlayerId: string) =>
    rpc<void>("submit_entry", { p_code: code, p_target: targetPlayerId }),
  submitText: (code: string, content: string, anonymous = true) =>
    rpc<void>("submit_entry", { p_code: code, p_content: content, p_anonymous: anonymous }),
};
