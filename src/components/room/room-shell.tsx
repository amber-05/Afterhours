"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, LogOut, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { setMusicMood } from "@/lib/ambient-music";
import { inviteLink } from "@/lib/invite";
import { Lobby } from "./lobby";
import { useRoomCtx } from "./room-context";
import { RoundView } from "./round-view";

export function RoomShell() {
  const { state, code, run } = useRoomCtx();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const inGame = state.room.status === "playing" && state.round;
  const vibe = state.room.vibe;
  const game = inGame ? state.round!.game : null;

  // The soundtrack follows the room: vibe sets the style, the current game sets the energy.
  useEffect(() => {
    setMusicMood(vibe, game);
  }, [vibe, game]);
  useEffect(() => () => setMusicMood(null, null, false), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — share the code instead");
    }
  }

  async function leave() {
    if (!confirm("Leave this room?")) return;
    const ok = await run(() => api.leave(code).then(() => true));
    if (ok) router.push("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-4 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="font-heading text-2xl">
          Afterhours<span className="text-orchid">.</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="glass flex items-center gap-2 rounded-full py-1.5 pl-4 pr-3 font-mono text-sm tracking-[0.2em] transition hover:bg-white/10"
            aria-label="Copy invite link"
          >
            {code}
            {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4 text-muted-foreground" />}
          </button>
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground">
            <Users className="size-4" /> {state.players.length}
          </span>
          <button
            onClick={leave}
            aria-label="Leave room"
            className="glass flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={inGame ? "game" : "lobby"}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="mt-6 flex flex-1 flex-col"
        >
          {inGame ? <RoundView /> : <Lobby />}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
