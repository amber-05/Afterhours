"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, EyeOff, Lock, Send } from "lucide-react";
import { GlowButton } from "@/components/glow-button";
import { PlayerAvatar } from "@/components/player-avatar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MAX_TEXT } from "@/lib/games";
import { cn } from "@/lib/utils";
import { useRoomCtx } from "./room-context";

/** Row of everyone in the room, lit up once they've answered the current step. */
export function ProgressRow({ skip }: { skip?: boolean }) {
  const { state } = useRoomCtx();
  const done = new Set(state.submitted);
  const total = state.players.length;
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>{skip ? "Guessing" : "Answered"}</span>
        <span>
          {done.size}/{total}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {state.players.map((p) => (
          <motion.span
            key={p.id}
            animate={{ opacity: done.has(p.id) ? 1 : 0.35, scale: done.has(p.id) ? 1 : 0.92 }}
            className="relative"
            title={p.name}
          >
            <PlayerAvatar id={p.id} emoji={p.avatar} size="sm" />
            {done.has(p.id) && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-emerald-500">
                <Check className="size-3 text-white" strokeWidth={3} />
              </span>
            )}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

export function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass flex items-center gap-3 rounded-2xl border-emerald-400/30 p-4 text-sm"
    >
      <Lock className="size-5 shrink-0 text-emerald-400" />
      <div>{children}</div>
    </motion.div>
  );
}

/** Tap a friend, confirm. Used for votes and for Guess Who guesses. */
export function PlayerPicker({
  confirmLabel,
  onConfirm,
  lockedTarget,
  lockedText,
}: {
  confirmLabel: string;
  onConfirm: (playerId: string) => Promise<unknown>;
  lockedTarget?: string | null;
  lockedText: string;
}) {
  const { state, busy } = useRoomCtx();
  const [picked, setPicked] = useState<string | null>(null);
  const others = state.players.filter((p) => p.id !== state.me.id);
  const locked = Boolean(lockedTarget);
  const active = lockedTarget ?? picked;

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {others.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <button
              type="button"
              disabled={locked}
              onClick={() => setPicked(p.id)}
              aria-pressed={active === p.id}
              className={cn(
                "glass flex w-full flex-col items-center gap-2 rounded-2xl p-4 transition",
                active === p.id
                  ? "border-orchid bg-orchid/10"
                  : !locked && "hover:bg-white/10",
                locked && active !== p.id && "opacity-40",
              )}
            >
              <PlayerAvatar id={p.id} emoji={p.avatar} size="lg" />
              <span className="max-w-full truncate text-sm font-semibold">{p.name}</span>
            </button>
          </motion.li>
        ))}
      </ul>
      {locked ? (
        <LockedNote>{lockedText}</LockedNote>
      ) : (
        <GlowButton className="w-full" disabled={!picked || busy} loading={busy} onClick={() => picked && onConfirm(picked)}>
          <Send /> {confirmLabel}
        </GlowButton>
      )}
    </div>
  );
}

/** Text box for confessions / truths / statements. */
export function TextPanel({
  placeholder,
  confirmLabel,
  allowPublic,
  mine,
  lockedText,
  onSubmit,
}: {
  placeholder: string;
  confirmLabel: string;
  allowPublic?: boolean;
  mine: { content: string | null; anonymous: boolean } | null;
  lockedText: string;
  onSubmit: (text: string, anonymous: boolean) => Promise<unknown>;
}) {
  const { busy } = useRoomCtx();
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(true);

  if (mine) {
    return (
      <div className="space-y-3">
        <div className="glass rounded-2xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            What you wrote{allowPublic ? (mine.anonymous ? " · anonymous" : " · public") : ""}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words">{mine.content}</p>
        </div>
        <LockedNote>{lockedText}</LockedNote>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          value={text}
          maxLength={MAX_TEXT}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          className="min-h-32 resize-none rounded-2xl border-white/10 bg-white/5 p-5 text-base"
        />
        <span className="absolute bottom-3 right-4 text-xs text-muted-foreground">
          {text.length}/{MAX_TEXT}
        </span>
      </div>
      {allowPublic && (
        <label className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <span className="flex items-center gap-2 text-sm">
            <EyeOff className="size-4 text-orchid" />
            {anon ? "Anonymous — nobody will know it's you" : "Public — your name will be shown"}
          </span>
          <Switch checked={anon} onCheckedChange={setAnon} />
        </label>
      )}
      <GlowButton
        className="w-full"
        disabled={!text.trim() || busy}
        loading={busy}
        onClick={() => onSubmit(text.trim(), anon)}
      >
        <Send /> {confirmLabel}
      </GlowButton>
    </div>
  );
}

export function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass flex items-center justify-center gap-3 rounded-2xl p-4 text-sm text-muted-foreground">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-orchid opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-orchid" />
      </span>
      <AnimatePresence mode="wait">
        <motion.span key={String(children)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {children}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
