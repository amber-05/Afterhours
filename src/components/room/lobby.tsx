"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/player-avatar";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { ROUND_OPTIONS, VIBES } from "@/lib/games";
import { inviteLink } from "@/lib/invite";
import { cn } from "@/lib/utils";
import { GamePicker } from "./game-picker";
import { useRoomCtx } from "./room-context";

function Section({ n, title, aside, children }: { n: string; title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="eyebrow">
          <span className="text-orchid">{n}</span>&ensp;{title}
        </h2>
        {aside && <span className="eyebrow">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Lobby() {
  const { state, code, isHost, online, busy, run } = useRoomCtx();

  async function share() {
    const url = inviteLink(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my Afterhours room", text: `Room ${code} — come play`, url });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    toast.success("Invite link copied");
  }

  return (
    <div className="space-y-10">
      {/* invite */}
      <section className="surface-raised flex flex-col items-center rounded-2xl px-6 py-9 text-center">
        <p className="eyebrow">Room code</p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-heading mt-3 text-[3.5rem] leading-none tracking-[0.12em] sm:text-7xl"
        >
          {code}
        </motion.p>
        <p className="mt-3 text-sm text-muted-foreground">Share the code or the link. Friends join with just a name.</p>
        <button
          onClick={share}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-orchid px-5 py-2.5 text-sm font-medium text-[#2a0f1b] transition hover:bg-[#f6bccb] active:scale-95"
        >
          <Share2 className="size-4" /> Invite friends
        </button>
      </section>

      <Section n="01" title="In the room" aside={`${state.players.length} / 12`}>
        <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border hairline">
          <AnimatePresence initial={false}>
            {state.players.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-4 py-3"
              >
                <PlayerAvatar id={p.id} emoji={p.avatar} online={online.has(p.id)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.name}
                    {p.id === state.me.id && <span className="ml-2 text-sm font-normal text-muted-foreground">you</span>}
                  </p>
                </div>
                {p.is_host && (
                  <span className="eyebrow flex items-center gap-1.5 text-orchid">
                    <Crown className="size-3.5" /> Host
                  </span>
                )}
                {isHost && p.id !== state.me.id && (
                  <button
                    aria-label={`Remove ${p.name}`}
                    disabled={busy}
                    onClick={() => confirm(`Remove ${p.name}?`) && run(() => api.kick(code, p.id))}
                    className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-red-300"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Section>

      <Section n="02" title="The vibe">
        <div className="flex flex-wrap gap-2">
          {VIBES.map((v) => (
            <button
              key={v.id}
              disabled={!isHost || busy}
              onClick={() => run(() => api.settings(code, { vibe: v.id }))}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition",
                state.room.vibe === v.id
                  ? "border-orchid bg-orchid/15 text-orchid"
                  : "hairline text-muted-foreground",
                isHost && state.room.vibe !== v.id && "hover:bg-white/[0.06] hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border hairline px-4 py-3.5">
          <span>
            <span className="block text-sm font-medium">Rounds per game</span>
            <span className="block text-sm text-muted-foreground">Each game runs this many rounds in a row.</span>
          </span>
          <div className="flex gap-1.5">
            {ROUND_OPTIONS.map((n) => (
              <button
                key={n}
                disabled={!isHost || busy}
                onClick={() => run(() => api.settings(code, { rounds: n }))}
                aria-pressed={state.room.rounds_per_game === n}
                className={cn(
                  "size-9 rounded-full border text-sm transition",
                  state.room.rounds_per_game === n
                    ? "border-orchid bg-orchid/15 text-orchid"
                    : "hairline text-muted-foreground",
                  isHost && state.room.rounds_per_game !== n && "hover:bg-white/[0.06] hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border hairline px-4 py-3.5">
          <span>
            <span className="block text-sm font-medium">Reveal authors in Guess Who</span>
            <span className="block text-sm text-muted-foreground">Off keeps every statement a mystery.</span>
          </span>
          <Switch
            checked={state.room.reveal_author}
            disabled={!isHost || busy}
            onCheckedChange={(v) => run(() => api.settings(code, { revealAuthor: v }))}
          />
        </label>
      </Section>

      <Section n="03" title={isHost ? "Pick a game" : "Waiting for the host to pick"}>
        <GamePicker />
      </Section>
    </div>
  );
}
