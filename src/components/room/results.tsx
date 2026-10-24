"use client";

import { AnimatePresence, motion } from "framer-motion";
import { EyeOff, Trophy } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import type { Round, TallyEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRoomCtx } from "./room-context";

function Bars({ tally, highlight, unit = "vote" }: { tally: TallyEntry[]; highlight: Set<string>; unit?: string }) {
  const { state } = useRoomCtx();
  const votes = new Map(tally.map((t) => [t.player_id, t.votes]));
  const rows = state.players
    .map((p) => ({ p, v: votes.get(p.id) ?? 0 }))
    .sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name));
  const max = Math.max(1, ...rows.map((r) => r.v));

  return (
    <ul className="space-y-2.5">
      {rows.map(({ p, v }, i) => (
        <motion.li
          key={p.id}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.08 }}
          className="glass relative overflow-hidden rounded-2xl"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(v / max) * 100}%` }}
            transition={{ delay: 0.5 + i * 0.08, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className={cn("absolute inset-y-0 left-0", highlight.has(p.id) ? "bg-orchid/35" : "bg-white/[0.07]")}
          />
          <div className="relative flex items-center gap-3 p-3">
            <PlayerAvatar id={p.id} emoji={p.avatar} size="sm" />
            <span className="flex-1 truncate text-sm font-semibold">{p.name}</span>
            <span className="text-sm tabular-nums text-white/80">
              {v} {unit}
              {v === 1 ? "" : "s"}
            </span>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

/** Who's Most Likely — verdict + bars. Voters are never shown. */
export function VoteResults({
  round,
  eyebrow = "The room has spoken",
  footnote = "Votes are anonymous — only the totals are shown.",
}: {
  round: Round;
  eyebrow?: string;
  footnote?: string;
}) {
  const { playerById } = useRoomCtx();
  const winners = (round.payload.winners ?? []).map((id) => playerById(id)).filter(Boolean);
  const tally = round.payload.tally ?? [];

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="border-y hairline py-10 text-center"
      >
        <p className="eyebrow">{eyebrow}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-10">
          {winners.map((w) => (
            <div key={w!.id} className="flex flex-col items-center gap-3">
              <PlayerAvatar id={w!.id} emoji={w!.avatar} size="xl" />
              <span className="font-heading text-5xl sm:text-6xl">{w!.name}</span>
            </div>
          ))}
        </div>
        {winners.length > 1 && <p className="mt-4 text-sm text-muted-foreground">It&apos;s a tie.</p>}
      </motion.div>
      <Bars tally={tally} highlight={new Set(round.payload.winners ?? [])} />
      <p className="text-center text-xs text-muted-foreground">{footnote}</p>
    </div>
  );
}

/** Friendship Test: shown only if you and someone else picked each other. Never shown publicly. */
export function BondCard({ round }: { round: Round }) {
  const { playerById } = useRoomCtx();
  const friend = playerById(round.my_bond);
  if (!friend) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.1, duration: 0.6 }}
      className="surface-raised flex items-center gap-4 rounded-2xl border-orchid/40 p-5"
    >
      <PlayerAvatar id={friend.id} emoji={friend.avatar} size="lg" />
      <div>
        <p className="eyebrow text-orchid">A mutual bond</p>
        <p className="font-heading mt-1 text-3xl">You and {friend.name} picked each other.</p>
        <p className="mt-1 text-sm text-muted-foreground">Only the two of you can see this.</p>
      </div>
    </motion.div>
  );
}

/** Confessions & Truth or Spill — revealed one at a time, newest first. */
export function ItemsReveal({ round }: { round: Round }) {
  const { playerById } = useRoomCtx();
  const items = round.payload.items ?? [];
  const shown = items.slice(0, round.cursor).map((it, i) => ({ it, i })).reverse();

  return (
    <div className="space-y-3">
      <p className="text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
        {Math.min(round.cursor, items.length)} of {items.length} revealed
      </p>
      <AnimatePresence initial={false}>
        {shown.map(({ it, i }, idx) => {
          const author = playerById(it.player_id);
          const latest = idx === 0;
          return (
            <motion.article
              key={i}
              layout
              initial={{ opacity: 0, y: -30, scale: 0.9, filter: "blur(12px)" }}
              animate={{ opacity: latest ? 1 : 0.7, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              className={cn(
                "glass rounded-2xl p-5",
                latest && "glow-purple border-orchid/30",
              )}
            >
              <p className={cn("whitespace-pre-wrap break-words font-medium", latest ? "text-xl" : "text-base")}>
                “{it.text}”
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                {author ? (
                  <>
                    <PlayerAvatar id={author.id} emoji={author.avatar} size="sm" />
                    <span className="font-semibold text-foreground">{author.name}</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="size-4" /> Anonymous
                  </>
                )}
              </div>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Guess Who — result of the statement just guessed. */
export function GuessResultCard({ round }: { round: Round }) {
  const { playerById } = useRoomCtx();
  const res = round.payload.results?.[round.cursor];
  if (!res) return null;
  const author = playerById(res.author_id);
  const winners = res.correct_ids.map((id) => playerById(id)).filter(Boolean);

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, rotateX: -50 }}
        animate={{ opacity: 1, rotateX: 0 }}
        className="glass rounded-2xl p-5 text-center"
      >
        <p className="text-lg font-medium">“{res.text}”</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 14 }}
        className="glass glow-pink rounded-2xl p-6 text-center"
      >
        {author ? (
          <>
            <p className="eyebrow">It was…</p>
            <div className="mt-3 flex flex-col items-center gap-2">
              <PlayerAvatar id={author.id} emoji={author.avatar} size="xl" />
              <span className="font-heading text-2xl">{author.name}</span>
            </div>
            <p className="mt-3 text-sm text-white/70">
              {winners.length
                ? `Nailed it: ${winners.map((w) => w!.name).join(", ")}`
                : "Nobody guessed it."}
            </p>
          </>
        ) : (
          <>
            <p className="font-heading mt-2 text-xl">The author stays a mystery</p>
            <p className="mt-1 text-sm text-white/70">Here&apos;s where the room thought it came from:</p>
          </>
        )}
      </motion.div>

      <Bars tally={res.tally} highlight={new Set(res.author_id ? [res.author_id] : [])} unit="guess" />
    </div>
  );
}

export function GuessScoreboard({ round }: { round: Round }) {
  const { state, playerById } = useRoomCtx();
  const scores = round.payload.scores ?? [];
  const results = round.payload.results ?? [];
  const byPlayer = new Map(scores.map((s) => [s.player_id, s.correct]));
  const rows = state.players
    .map((p) => ({ p, c: byPlayer.get(p.id) ?? 0 }))
    .sort((a, b) => b.c - a.c || a.p.name.localeCompare(b.p.name));

  return (
    <div className="space-y-5">
      {state.room.reveal_author ? (
        <div className="glass rounded-2xl p-5">
          <h3 className="font-heading mb-3 flex items-center gap-2 text-lg">
            <Trophy className="size-5 text-amber-300" /> Best detectives
          </h3>
          <ul className="space-y-2">
            {rows.map(({ p, c }, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5"
              >
                <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
                <PlayerAvatar id={p.id} emoji={p.avatar} size="sm" />
                <span className="flex-1 truncate text-sm font-semibold">{p.name}</span>
                <span className="text-sm tabular-nums">{c} correct</span>
              </motion.li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="glass rounded-2xl p-5 text-center">
          <p className="mt-2 text-sm text-muted-foreground">Authors were hidden — every statement stays a mystery.</p>
        </div>
      )}
      <ul className="space-y-2">
        {results.map((r, i) => {
          const a = playerById(r.author_id);
          return (
            <li key={i} className="glass flex items-center gap-3 rounded-2xl p-3 text-sm">
              <span className="flex-1">“{r.text}”</span>
              {a && <PlayerAvatar id={a.id} emoji={a.avatar} size="sm" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
