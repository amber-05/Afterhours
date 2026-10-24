"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Crown, Pause, Play, Sparkles } from "lucide-react";
import { GlowButton } from "@/components/glow-button";
import { api } from "@/lib/api";
import type { Round } from "@/lib/types";
import { GamePicker } from "./game-picker";
import { Waiting } from "./panels";
import { useRoomCtx } from "./room-context";

const AUTO_SECONDS = 15;

export function roundComplete(r: Round) {
  if (r.game === "most_likely" || r.game === "friendship_test") return r.phase === "reveal";
  if (r.game === "guess_who") return r.phase === "finished";
  return r.phase === "reveal" && r.cursor >= (r.payload.items?.length ?? 0);
}

function advanceLabel(r: Round): string {
  if (r.phase === "collecting") return r.game === "guess_who" ? "Start guessing" : "Reveal now";
  if (r.phase === "guessing") return "Reveal the answer";
  if (r.game === "confessions") return "Next confession";
  if (r.game === "truth_or_spill") return "Next answer";
  return r.cursor + 1 < (r.payload.total ?? 0) ? "Next statement" : "See the scores";
}

/** Everything under the game body: host controls, or a waiting note for guests. */
export function HostBar({ round }: { round: Round }) {
  const { isHost, state } = useRoomCtx();
  const complete = roundComplete(round);

  if (!complete) {
    return isHost ? <AdvanceButton round={round} /> : null;
  }
  if (!isHost) {
    const moreRounds = round.series_no < round.series_total;
    return (
      <Waiting>
        {moreRounds
          ? state.room.auto_rotate
            ? "Next round starting soon…"
            : "Host is starting the next round…"
          : state.room.auto_rotate
            ? "Next game starting soon…"
            : "Host is picking the next game…"}
      </Waiting>
    );
  }
  return <NextRound key={round.id} round={round} />;
}

function AdvanceButton({ round }: { round: Round }) {
  const { code, run, busy, state } = useRoomCtx();
  const collecting = round.phase === "collecting";
  const answered = state.submitted.length;
  const total = state.players.length;

  return (
    <div className="space-y-2">
      <GlowButton className="w-full" loading={busy} onClick={() => run(() => api.advance(code))}>
        <Crown /> {advanceLabel(round)}
        <ArrowRight />
      </GlowButton>
      {(collecting || round.phase === "guessing") && (
        <p className="text-center text-xs text-muted-foreground">
          Host only · {answered}/{total} answered — it also advances automatically once everyone has.
        </p>
      )}
    </div>
  );
}

function NextRound({ round }: { round: Round }) {
  const { state, code, run, busy } = useRoomCtx();
  const auto = state.room.auto_rotate;
  const moreRounds = round.series_no < round.series_total;
  const [paused, setPaused] = useState(false);
  const [pickGame, setPickGame] = useState(false);
  const [secs, setSecs] = useState(AUTO_SECONDS);

  const go = () => run(() => (moreRounds ? api.nextInSeries(code) : api.startRound(code, "room_decides")));

  useEffect(() => {
    if (!auto || paused) return;
    if (secs <= 0) {
      void go();
      return;
    }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, paused, secs]);

  if (auto && !paused) {
    return (
      <div className="glass space-y-3 rounded-2xl p-5 text-center">
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-orchid" />
          {moreRounds ? `Round ${round.series_no + 1} of ${round.series_total} in` : "The Room Decides — next game in"}
        </p>
        <p className="font-heading text-gradient text-5xl tabular-nums">{Math.max(secs, 0)}</p>
        <div className="flex gap-2">
          <GlowButton className="flex-1" loading={busy} onClick={go}>
            <Play /> Go now
          </GlowButton>
          <GlowButton tone="ghost" onClick={() => setPaused(true)}>
            <Pause /> Wait
          </GlowButton>
        </div>
      </div>
    );
  }

  if (moreRounds && !pickGame) {
    return (
      <div className="space-y-3">
        <GlowButton className="w-full" loading={busy} onClick={go}>
          Next round · {round.series_no + 1} of {round.series_total} <ArrowRight />
        </GlowButton>
        <div className="flex gap-2">
          <GlowButton tone="ghost" className="flex-1" onClick={() => setPickGame(true)}>
            Switch game
          </GlowButton>
          <GlowButton tone="ghost" className="flex-1" disabled={busy} onClick={() => run(() => api.endGame(code))}>
            Back to lobby
          </GlowButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">What&apos;s next?</h3>
      <GamePicker compact />
      <GlowButton tone="ghost" className="w-full" disabled={busy} onClick={() => run(() => api.endGame(code))}>
        Back to lobby
      </GlowButton>
    </div>
  );
}
