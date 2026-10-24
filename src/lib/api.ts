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
  inbox_exists: "You already have an inbox.",
  invalid_handle: "Use 3–20 letters, numbers or underscores.",
  handle_reserved: "That name is reserved. Try another.",
  handle_taken: "That name is taken. Try another.",
  inbox_not_found: "That inbox doesn't exist.",
  invalid_message: "Write something (up to 300 characters).",
  slow_down: "You've sent a few already. Try again in a bit.",
  inbox_busy: "This inbox is getting a lot of love. Try again later.",
  invalid_prompt: "Keep the prompt under 80 characters.",
  invalid_key: "That recovery key doesn't match.",
  too_many_links: "You have the maximum of 5 links. Delete one first.",
  invalid_names: "Enter both names using English letters (up to 30 characters each).",
  link_not_found: "That link doesn't exist or was deleted.",
  own_link: "This is your own link. Send it to a friend instead.",
  invalid_rounds: "Pick 1, 3, 4 or 5 rounds.",
  series_complete: "That was the last round of this game.",
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

export interface InboxSummary {
  handle: string;
  prompt: string;
  persona_title: string | null;
  persona_alias: string | null;
  total: number;
  unread: number;
}
export interface InboxMessage {
  id: string;
  body: string;
  created_at: string;
  unread: boolean;
}
export interface PublicInbox {
  found: boolean;
  handle?: string;
  prompt?: string;
  persona_title?: string | null;
  persona_alias?: string | null;
}

export interface CrushLinkSummary {
  slug: string;
  label: string;
  owner_name: string | null;
  created_at: string;
  total: number;
  unread: number;
}
export interface CrushEntry {
  id: string;
  your_name: string;
  crush_name: string;
  score: number;
  verdict: string | null;
  created_at: string;
  unread: boolean;
}
export interface CrushResult {
  score: number;
  /** T,R,U,E,L,O,V,E letter tallies across both names */
  counts: number[];
  /** every step of folding the tallies down to two digits */
  rows: number[][];
  flames: { code: string; label: string; remaining: number; eliminated: string[] };
  your_name: string;
  crush_name: string;
}

export const api = {
  // ---- crush compatibility links ----
  createCrushLink: (ownerName: string | null, label: string | null) =>
    rpc<{ slug: string }>("create_crush_link", { p_owner_name: ownerName, p_label: label }),
  myCrushLinks: () => rpc<CrushLinkSummary[]>("list_my_crush_links"),
  publicCrushLink: (slug: string) =>
    rpc<{ found: boolean; label?: string; owner_name?: string | null }>("get_crush_link_public", { p_slug: slug }),
  submitCrush: (slug: string, yourName: string, crushName: string) =>
    rpc<CrushResult>("submit_crush", { p_slug: slug, p_your_name: yourName, p_crush_name: crushName }),
  crushEntries: (slug: string) => rpc<CrushEntry[]>("list_crush_entries", { p_slug: slug }),
  markCrushRead: (slug: string) => rpc<void>("mark_crush_read", { p_slug: slug }),
  deleteCrushEntry: (id: string) => rpc<void>("delete_crush_entry", { p_id: id }),
  deleteCrushLink: (slug: string) => rpc<void>("delete_crush_link", { p_slug: slug }),

  // ---- anonymous inbox ----
  createInbox: (handle: string, prompt: string | null, persona?: { title?: string; alias?: string }) =>
    rpc<{ handle: string; key: string }>("create_inbox", {
      p_handle: handle,
      p_prompt: prompt,
      p_persona_title: persona?.title ?? null,
      p_persona_alias: persona?.alias ?? null,
    }),
  myInbox: () => rpc<InboxSummary | null>("get_my_inbox"),
  publicInbox: (handle: string) => rpc<PublicInbox>("get_inbox_public", { p_handle: handle }),
  updateInbox: (u: { prompt?: string; personaTitle?: string; personaAlias?: string }) =>
    rpc<void>("update_inbox", {
      p_prompt: u.prompt ?? null,
      p_persona_title: u.personaTitle ?? null,
      p_persona_alias: u.personaAlias ?? null,
    }),
  sendMessage: (handle: string, body: string) => rpc<void>("send_message", { p_handle: handle, p_body: body }),
  listMessages: () => rpc<InboxMessage[]>("list_messages", { p_limit: 100 }),
  markRead: () => rpc<void>("mark_messages_read"),
  deleteMessage: (id: string) => rpc<void>("delete_message", { p_id: id }),
  claimInbox: (handle: string, key: string) => rpc<void>("claim_inbox", { p_handle: handle, p_key: key }),

  // ---- rooms ----
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
  settings: (code: string, s: { vibe?: Vibe; revealAuthor?: boolean; rounds?: number }) =>
    rpc<void>("update_settings", {
      p_code: code,
      p_vibe: s.vibe ?? null,
      p_reveal_author: s.revealAuthor ?? null,
      p_rounds: s.rounds ?? null,
    }),
  startRound: (code: string, game: GameId | "room_decides") =>
    rpc<string>("start_round", { p_code: code, p_game: game }),
  nextInSeries: (code: string) => rpc<string>("next_in_series", { p_code: code }),
  advance: (code: string) => rpc<void>("host_advance", { p_code: code }),
  endGame: (code: string) => rpc<void>("end_game", { p_code: code }),
  vote: (code: string, targetPlayerId: string) =>
    rpc<void>("submit_entry", { p_code: code, p_target: targetPlayerId }),
  submitText: (code: string, content: string, anonymous = true) =>
    rpc<void>("submit_entry", { p_code: code, p_content: content, p_anonymous: anonymous }),
};
