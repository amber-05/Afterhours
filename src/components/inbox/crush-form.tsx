"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { SetupNotice } from "@/components/setup-notice";
import { Input } from "@/components/ui/input";
import { api, type CrushResult } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PageNav } from "./bits";

const ease = [0.22, 1, 0.36, 1] as const;

function reading(score: number) {
  if (score >= 90) return { head: "Written in the stars.", body: "The kind of chemistry people write songs about. Say hi." };
  if (score >= 80) return { head: "Dangerously good.", body: "Easy conversations, loud laughs. Worth shooting your shot." };
  if (score >= 70) return { head: "Real potential.", body: "Different enough to stay interesting, similar enough to click." };
  if (score >= 60) return { head: "Slow burn.", body: "Not instant fireworks, but the good stuff takes time." };
  return { head: "Opposites attract?", body: "Could be chaos, could be a love story. Only one way to find out." };
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

  const owner = info?.owner_name || "The person who sent you this link";

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
              <p className="eyebrow">{info.label}</p>
              <h1 className="font-heading mt-3 text-balance text-[2.75rem] sm:text-6xl">
                Love <span className="text-orchid italic">calculator</span>
              </h1>
              <p className="mt-3 text-muted-foreground">
                Enter your name and your crush&apos;s name to calculate your love percentage.
              </p>

              <div className="mt-8 space-y-4">
                <label className="block space-y-2">
                  <span className="eyebrow">1 · Your name</span>
                  <Input
                    value={me}
                    maxLength={30}
                    onChange={(e) => setMe(e.target.value)}
                    placeholder="You"
                    className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="eyebrow">2 · Your crush&apos;s name</span>
                  <Input
                    value={crush}
                    maxLength={30}
                    onChange={(e) => setCrush(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Them"
                    className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
                  />
                </label>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-orchid/30 bg-orchid/[0.06] p-4 text-sm">
                <Eye className="mt-0.5 size-4 shrink-0 text-orchid" />
                <p>
                  <span className="font-medium">{owner} will see both names you enter here: yours and your crush&apos;s.</span>{" "}
                  <span className="text-muted-foreground">
                    Only the names and the score, never anything else about you. Use nicknames if you&apos;d rather.
                  </span>
                </p>
              </div>

              <GlowButton className="mt-5 w-full" loading={busy} disabled={!me.trim() || !crush.trim()} onClick={submit}>
                Calculate love percentage
              </GlowButton>
            </motion.section>
          ) : (
            <Result key="result" r={result} owner={info.owner_name} onAgain={() => setResult(null)} />
          )}
        </AnimatePresence>
      )}
    </main>
  );
}

function Result({ r, owner, onAgain }: { r: CrushResult; owner?: string | null; onAgain: () => void }) {
  const text = reading(r.score);
  const bars = [
    ["Chemistry", r.chemistry],
    ["Communication", r.communication],
    ["Vibe", r.vibe],
  ] as const;
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
      <motion.p
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 160, damping: 16 }}
        className="font-heading mt-4 text-[8rem] leading-none text-orchid sm:text-[10rem]"
      >
        {r.score}%
      </motion.p>
      <p className="eyebrow mt-2">Love percentage</p>
      <h1 className="font-heading mt-4 text-4xl">{text.head}</h1>
      <p className="mx-auto mt-2 max-w-xs text-muted-foreground">{text.body}</p>

      <ul className="mt-8 space-y-3 text-left">
        {bars.map(([label, v], i) => (
          <li key={label}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>{label}</span>
              <span className="tabular-nums text-muted-foreground">{v}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${v}%` }}
                transition={{ delay: 0.4 + i * 0.12, duration: 0.9, ease }}
                className="h-full rounded-full bg-orchid"
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-muted-foreground">
        Your love percentage is for fun. {owner || "The link owner"} can see both names you entered.
      </p>
      <div className="mx-auto mt-6 flex max-w-xs flex-col gap-3">
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
