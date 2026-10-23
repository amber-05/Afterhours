"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { GAMES } from "@/lib/games";
import { cn } from "@/lib/utils";
import { useRoomCtx } from "./room-context";

/** Host picks a game; everyone else sees the same list, read-only. */
export function GamePicker({ compact = false }: { compact?: boolean }) {
  const { state, code, isHost, busy, run } = useRoomCtx();
  const count = state.players.length;

  return (
    <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border hairline">
      {GAMES.map((g, i) => {
        const tooFew = count < g.min;
        const disabled = !isHost || busy || tooFew;
        const Icon = g.icon;
        return (
          <motion.li key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => run(() => api.startRound(code, g.id))}
              className={cn(
                "group flex w-full items-center gap-4 px-4 py-4 text-left transition sm:px-5",
                !disabled && "hover:bg-white/[0.04]",
                tooFew && "opacity-50",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border hairline text-orchid">
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{g.title}</span>
                {!compact && <span className="block text-sm text-muted-foreground">{g.tagline}</span>}
              </span>
              {tooFew ? (
                <span className="eyebrow shrink-0">needs {g.min}+</span>
              ) : isHost ? (
                <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition group-hover:text-orchid" />
              ) : null}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}
