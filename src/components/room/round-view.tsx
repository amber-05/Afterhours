"use client";

import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { gameMeta } from "@/lib/games";
import type { Round } from "@/lib/types";
import { HostBar } from "./host-bar";
import { LockedNote, PlayerPicker, ProgressRow, TextPanel, Waiting } from "./panels";
import { BondCard, GuessResultCard, GuessScoreboard, ItemsReveal, VoteResults } from "./results";
import { useRoomCtx } from "./room-context";

export function RoundView() {
  const { state } = useRoomCtx();
  const round = state.round!;
  const meta = gameMeta(round.game);
  const showPrompt = round.phase !== "finished";
  // Key by step so each phase/statement/reveal animates in fresh.
  const stepKey = `${round.id}:${round.phase}:${round.game === "guess_who" ? round.cursor : 0}`;

  return (
    <div className="space-y-8">
      <div>
        <div className="eyebrow flex items-center justify-between border-b hairline pb-3">
          <span className="flex items-center gap-2">
            <meta.icon className="size-3.5 text-orchid" strokeWidth={2} /> {meta.title}
          </span>
          <span>
            {round.series_total > 1 ? `Round ${round.series_no} of ${round.series_total}` : `Round ${round.round_no}`}
          </span>
        </div>

        {showPrompt && (
          <motion.div
            key={`prompt-${round.id}-${round.game === "guess_who" ? round.phase : ""}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="pt-8"
          >
            <h1 className="font-heading text-balance text-[2.5rem] sm:text-6xl">
              {round.game === "guess_who" && round.phase !== "collecting" ? "Who wrote this?" : round.prompt}
            </h1>
            {round.game === "guess_who" && round.phase === "guessing" && (
              <p className="eyebrow mt-4">
                Statement {round.cursor + 1} of {round.payload.total}
              </p>
            )}
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <Body round={round} />
        </motion.div>
      </AnimatePresence>

      <HostBar round={round} />
    </div>
  );
}

function Body({ round }: { round: Round }) {
  const { state, code, run } = useRoomCtx();
  const mine = state.my_entry;
  const answered = state.submitted.length;
  const total = state.players.length;

  // ---- Who's Most Likely ----
  if (round.game === "most_likely") {
    if (round.phase === "reveal") return <VoteResults round={round} />;
    return (
      <>
        <PlayerPicker
          confirmLabel="Lock in my vote"
          lockedTarget={mine?.target_player_id}
          lockedText="Vote locked in. Nobody will ever know it was you."
          onConfirm={(id) => run(() => api.vote(code, id))}
        />
        <ProgressRow />
      </>
    );
  }

  // ---- Friendship Test ----
  if (round.game === "friendship_test") {
    if (round.phase === "reveal") {
      return (
        <>
          <VoteResults
            round={round}
            eyebrow="The group's pick"
            footnote="Picks are private. Only the totals are shown."
          />
          <BondCard round={round} />
        </>
      );
    }
    return (
      <>
        <PlayerPicker
          confirmLabel="Lock in my pick"
          lockedTarget={mine?.target_player_id}
          lockedText="Locked in. Your pick stays private. If they picked you too, you'll both see it."
          onConfirm={(id) => run(() => api.vote(code, id))}
        />
        <ProgressRow />
      </>
    );
  }

  // ---- Confessions / Truth or Spill ----
  if (round.game === "confessions" || round.game === "truth_or_spill") {
    if (round.phase === "reveal") return <ItemsReveal round={round} />;
    const confession = round.game === "confessions";
    return (
      <>
        <TextPanel
          placeholder={confession ? "Type your confession…" : "Type your answer…"}
          confirmLabel={confession ? "Drop it anonymously" : "Submit my answer"}
          allowPublic={!confession}
          mine={mine}
          lockedText={`Submitted. Waiting on ${total - answered} more…`}
          onSubmit={(text, anon) => run(() => api.submitText(code, text, confession ? true : anon))}
        />
        <ProgressRow />
      </>
    );
  }

  // ---- Guess Who ----
  if (round.phase === "collecting") {
    return (
      <>
        <TextPanel
          placeholder="Write something only you could say…"
          confirmLabel="Submit anonymously"
          mine={mine}
          lockedText={`Locked in. Waiting on ${total - answered} more…`}
          onSubmit={(text) => run(() => api.submitText(code, text, true))}
        />
        <ProgressRow />
      </>
    );
  }
  if (round.phase === "guessing") {
    return (
      <>
        <motion.blockquote
          initial={{ opacity: 0, rotateX: -40 }}
          animate={{ opacity: 1, rotateX: 0 }}
          className="glass rounded-2xl border-orchid/30 p-6 text-center text-xl font-medium"
        >
          “{round.payload.current_text}”
        </motion.blockquote>
        {round.is_my_statement ? (
          <>
            <LockedNote>That one&apos;s yours. Keep a straight face.</LockedNote>
            <Waiting>Everyone else is guessing…</Waiting>
          </>
        ) : (
          <>
            <PlayerPicker
              confirmLabel="Lock in my guess"
              lockedTarget={mine?.target_player_id}
              lockedText="Guess locked in. Waiting for the others…"
              onConfirm={(id) => run(() => api.vote(code, id))}
            />
          </>
        )}
        <ProgressRow skip />
      </>
    );
  }
  if (round.phase === "reveal") return <GuessResultCard round={round} />;
  return <GuessScoreboard round={round} />;
}
