"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { SetupNotice } from "@/components/setup-notice";
import { Input } from "@/components/ui/input";
import { api, type CrushResult } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PageNav } from "./bits";

const ease = [0.22, 1, 0.36, 1] as const;

const FLAMES_TEXT: Record<string, string> = {
  F: "A friendship that feels like home. Easy, loyal, and no pretending.",
  L: "Real romantic spark. This is the one the classic game gets excited about.",
  A: "Deep affection. The caring, quietly-obsessed kind of love.",
  M: "The game says marriage. Start saving for the wedding.",
  E: "Enemies, says FLAMES. Sparks fly, just not the sweet kind. Or is that the best kind?",
  S: "Sibling energy. Close, protective, and absolutely roasting each other.",
};

function scoreLine(score: number) {
  if (score >= 90) return "Off the charts.";
  if (score >= 75) return "Seriously strong.";
  if (score >= 60) return "Real potential.";
  if (score >= 40) return "A slow burn.";
  if (score >= 20) return "Opposites attract?";
  return "The numbers are shy. The heart decides.";
}

export function CrushForm({ slug }: { slug: string }) {
  const [info, setInfo] = useState<{ found: boolean; label?: string; owner_name?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState("");
  const [crush, setCrush] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CrushResult | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    api
      .publicCrushLink(slug)
      .then(setInfo)
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  async function submit() {
    if (!me.trim() || !crush.trim()) return toast.error("Enter both names");
    setBusy(true);
    try {
      setResult(await api.submitCrush(slug, me.trim(), crush.trim()));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SetupNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pb-14 pt-4">
      <PageNav />

      {!info && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-orchid" />
        </div>
      )}
      {error && <p className="mt-16 text-center text-muted-foreground">{error}</p>}

      {info && !info.found && (
        <div className="mt-16 text-center">
          <p className="eyebrow">Link not found</p>
          <h1 className="font-heading mt-3 text-5xl">This link has gone cold.</h1>
          <p className="mt-3 text-muted-foreground">It may have been deleted by whoever shared it.</p>
        </div>
      )}

      {info?.found && (
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.section
              key="form"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease }}
              className="pt-8"
            >
              <p className="eyebrow">Name-based · FLAMES + True Love</p>
              <h1 className="font-heading mt-3 text-balance text-[2.75rem] sm:text-6xl">
                Love <span className="text-orchid italic">calculator</span>
              </h1>
              <p className="mt-3 text-muted-foreground">
                Two classic name games, played in classrooms for generations. Enter two names and see what the letters
                say.
              </p>

              <div className="mt-8 space-y-4">
                <label className="block space-y-2">
                  <span className="eyebrow">Your name</span>
                  <Input
                    value={me}
                    maxLength={30}
                    onChange={(e) => setMe(e.target.value)}
                    placeholder="Your name"
                    className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="eyebrow">Your crush&apos;s name</span>
                  <Input
                    value={crush}
                    maxLength={30}
                    onChange={(e) => setCrush(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Their name"
                    className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
                  />
                </label>
              </div>

              <GlowButton className="mt-6 w-full" loading={busy} disabled={!me.trim() || !crush.trim()} onClick={submit}>
                Calculate love percentage
              </GlowButton>
            </motion.section>
          ) : (
            <Result key="result" r={result} onAgain={() => setResult(null)} />
          )}
        </AnimatePresence>
      )}
    </main>
  );
}

const TRUE_LOVE = ["T", "R", "U", "E", "L", "O", "V", "E"];

function Result({ r, onAgain }: { r: CrushResult; onAgain: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="pt-10 text-center"
    >
      <p className="eyebrow">
        {r.your_name} + {r.crush_name}
      </p>
      <p className="eyebrow mt-6">True Love score</p>
      <motion.p
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 160, damping: 16 }}
        className="font-heading text-[8rem] leading-none text-orchid sm:text-[10rem]"
      >
        {r.score}%
      </motion.p>
      <p className="font-heading text-3xl">{scoreLine(r.score)}</p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, ease }}
        className="surface-raised mt-8 rounded-2xl p-6"
      >
        <p className="eyebrow">FLAMES says</p>
        <p className="font-heading mt-2 text-5xl">{r.flames.label}</p>
        <div className="mt-4 flex justify-center gap-1.5" aria-label="FLAMES elimination">
          {["F", "L", "A", "M", "E", "S"].map((ch) => {
            const out = r.flames.eliminated.indexOf(ch);
            const won = ch === r.flames.code;
            return (
              <motion.span
                key={ch}
                initial={{ opacity: 1 }}
                animate={{ opacity: won ? 1 : 0.28 }}
                transition={{ delay: 0.9 + (won ? 1.6 : out * 0.28) }}
                className={`flex size-10 items-center justify-center rounded-full border text-sm font-medium ${
                  won ? "border-orchid bg-orchid text-[#2a0f1b]" : "hairline"
                }`}
              >
                {ch}
              </motion.span>
            );
          })}
        </div>
        <p className="mx-auto mt-4 max-w-xs text-sm text-muted-foreground">{FLAMES_TEXT[r.flames.code]}</p>
      </motion.div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="eyebrow mt-6 inline-flex items-center gap-1.5 transition hover:text-foreground"
        aria-expanded={open}
      >
        How was this calculated? <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden text-left"
          >
            <div className="mt-4 space-y-5 rounded-2xl border hairline p-5 text-sm">
              <div>
                <p className="font-medium">True Love count</p>
                <p className="mt-1 text-muted-foreground">
                  Count how many times each letter of <span className="text-foreground">T-R-U-E L-O-V-E</span> appears
                  across both names. Then keep adding neighbouring numbers (keeping the last digit) until two digits are
                  left. Those two digits are your percentage.
                </p>
                <div className="mt-3 flex justify-center gap-1.5">
                  {TRUE_LOVE.map((ch, i) => (
                    <span key={i} className="flex w-9 flex-col items-center rounded-lg border hairline py-1.5">
                      <span className="text-[10px] text-muted-foreground">{ch}</span>
                      <span className="tabular-nums">{r.counts[i]}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-center font-mono text-sm tabular-nums text-muted-foreground">
                  {r.rows.slice(1).map((row, i) => (
                    <p key={i} className={i === r.rows.length - 2 ? "text-orchid" : ""}>
                      {row.join("  ")}
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium">FLAMES</p>
                <p className="mt-1 text-muted-foreground">
                  Cross out letters both names share. {r.flames.remaining} letter{r.flames.remaining === 1 ? "" : "s"}{" "}
                  were left, so count {r.flames.remaining || "around"} places at a time through F-L-A-M-E-S, removing
                  each letter you land on:{" "}
                  <span className="text-foreground">{r.flames.eliminated.join(" → ")}</span>. The last letter standing,{" "}
                  <span className="text-orchid">{r.flames.code}</span>, is your answer.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Folk name games, not science. Great for fun, terrible for planning a wedding.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3">
        <GlowButton tone="ghost" onClick={onAgain}>
          Try another name
        </GlowButton>
        <Link href="/crush">
          <GlowButton className="w-full">Make your own link</GlowButton>
        </Link>
      </div>
    </motion.section>
  );
}
