"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ImageDown, RotateCcw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { gameMeta } from "@/lib/games";
import { savePersona } from "@/lib/local-store";
import { renderPersonaCard, shareImage } from "@/lib/share-card";
import { aliasFor, PERSONAS, QUESTIONS, scoreQuiz } from "@/lib/vibe-quiz";

const ease = [0.22, 1, 0.36, 1] as const;

export default function VibeCheck() {
  const [answers, setAnswers] = useState<number[]>([]);
  const done = answers.length === QUESTIONS.length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-16 pt-6 sm:px-8">
      <nav className="flex items-center justify-between py-4">
        <Link href="/" className="eyebrow flex items-center gap-2 transition hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <span className="font-heading text-2xl">
          Afterhours<span className="text-orchid">.</span>
        </span>
      </nav>

      <AnimatePresence mode="wait">
        {done ? (
          <Result key="result" answers={answers} onRetake={() => setAnswers([])} />
        ) : (
          <Question
            key={answers.length}
            index={answers.length}
            onAnswer={(i) => setAnswers((a) => [...a, i])}
            onBack={answers.length ? () => setAnswers((a) => a.slice(0, -1)) : undefined}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function Question({ index, onAnswer, onBack }: { index: number; onAnswer: (i: number) => void; onBack?: () => void }) {
  const q = QUESTIONS[index];
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease }}
      className="flex flex-1 flex-col pt-8"
    >
      <div className="flex items-center gap-1.5" aria-label={`Question ${index + 1} of ${QUESTIONS.length}`}>
        {QUESTIONS.map((_, i) => (
          <span key={i} className={`h-0.5 flex-1 rounded-full ${i <= index ? "bg-orchid" : "bg-white/10"}`} />
        ))}
      </div>
      <p className="eyebrow mt-5">
        Vibe check · {index + 1} / {QUESTIONS.length}
      </p>
      <h1 className="font-heading mt-4 text-balance text-4xl sm:text-5xl">{q.q}</h1>

      <ul className="mt-9 space-y-3">
        {q.options.map((o, i) => (
          <motion.li key={o.text} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, ease }}>
            <button
              onClick={() => onAnswer(i)}
              className="surface-raised group flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition hover:border-orchid/50 hover:bg-white/[0.05] active:scale-[0.99]"
            >
              <span className="eyebrow w-5 text-orchid">{"ABCD"[i]}</span>
              <span className="flex-1 text-[1.02rem] leading-snug">{o.text}</span>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-orchid" />
            </button>
          </motion.li>
        ))}
      </ul>

      {onBack && (
        <button onClick={onBack} className="eyebrow mt-8 self-start transition hover:text-foreground">
          ← Previous question
        </button>
      )}
    </motion.section>
  );
}

function Result({ answers, onRetake }: { answers: number[]; onRetake: () => void }) {
  const persona = PERSONAS[scoreQuiz(answers)];
  const alias = aliasFor(answers);
  const pair = PERSONAS[persona.pairsWith];
  const game = gameMeta(persona.game);
  const GameIcon = game.icon;

  // remembered on this device so your anonymous inbox page can show it
  useEffect(() => {
    savePersona({ title: persona.title, alias, tagline: persona.tagline, compliment: persona.compliment });
  }, [persona, alias]);

  async function storyCard() {
    try {
      const blob = await renderPersonaCard({
        title: persona.title,
        alias,
        tagline: persona.tagline,
        compliment: persona.compliment,
        link: window.location.host + "/vibe",
      });
      const res = await shareImage(blob, "afterhours-persona.png", `I'm ${persona.title} on Afterhours`, window.location.href);
      if (res === "downloaded") toast.success("Saved. Add it to your story.");
    } catch {
      toast.error("Couldn't make the image");
    }
  }

  async function share() {
    const text = `I'm ${persona.title} — a.k.a. "${alias}" on Afterhours. ${persona.tagline} Find your vibe:`;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Afterhours vibe", text, url });
        return;
      } catch {
        /* cancelled — fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success("Copied. Send it to the group chat.");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease }}
      className="pt-10"
    >
      <p className="eyebrow">Your after-dark persona</p>
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.7, ease }}
        className="font-heading mt-4 text-balance text-5xl sm:text-7xl"
      >
        {persona.title}
      </motion.h1>
      <p className="font-heading mt-4 text-2xl italic text-orchid sm:text-3xl">{persona.tagline}</p>

      <div className="surface-raised mt-8 rounded-2xl p-6">
        <p className="eyebrow">Your alias</p>
        <p className="font-heading mt-1 text-4xl">{alias}</p>
        <p className="mt-5 leading-relaxed text-muted-foreground">{persona.compliment}</p>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border hairline p-5">
          <dt className="eyebrow">Superpower</dt>
          <dd className="mt-2">{persona.power}</dd>
        </div>
        <div className="rounded-2xl border hairline p-5">
          <dt className="eyebrow">Kryptonite</dt>
          <dd className="mt-2">{persona.kryptonite}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-4 rounded-2xl border hairline p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border hairline text-orchid">
          <GameIcon className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div>
          <p className="eyebrow">Your game</p>
          <p className="mt-1 font-medium">{game.title}</p>
          <p className="text-sm text-muted-foreground">{persona.gameWhy}</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Pairs well with <span className="text-foreground">{pair.title}</span>. Send them the quiz and compare.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <GlowButton onClick={storyCard}>
          <ImageDown /> Share to story
        </GlowButton>
        <GlowButton tone="ghost" onClick={share}>
          <Share2 /> Copy text
        </GlowButton>
        <Link href="/inbox">
          <GlowButton tone="ghost">
            Get anonymous messages <ArrowRight />
          </GlowButton>
        </Link>
        <Link href="/">
          <GlowButton tone="ghost">Play with friends</GlowButton>
        </Link>
        <GlowButton tone="ghost" onClick={onRetake}>
          <RotateCcw /> Retake
        </GlowButton>
      </div>
    </motion.section>
  );
}
