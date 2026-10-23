"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GlowButton } from "@/components/glow-button";
import { ProfileFields } from "@/components/profile-fields";
import { SetupNotice } from "@/components/setup-notice";
import { useProfile } from "@/hooks/use-profile";
import { api } from "@/lib/api";
import { GAMES } from "@/lib/games";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function Home() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
});

function Landing() {
  const router = useRouter();
  const params = useSearchParams();
  const profile = useProfile();
  const [code, setCode] = useState(() =>
    (params.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
  );
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const needName = () => {
    if (!profile.name.trim()) {
      toast.error("Pick a name first");
      document.getElementById("display-name")?.focus();
      return true;
    }
    return false;
  };

  async function create() {
    if (needName()) return;
    setBusy("create");
    try {
      const { code } = await api.createRoom(profile.name.trim(), profile.avatar);
      router.push(`/room/${code}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  async function join() {
    if (needName()) return;
    if (code.trim().length < 6) return toast.error("Room codes are 6 characters");
    setBusy("join");
    try {
      const res = await api.joinRoom(code.trim(), profile.name.trim(), profile.avatar);
      router.push(`/room/${res.code}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-20 pt-6 sm:px-10">
      <nav className="flex items-center justify-between py-4">
        <span className="font-heading text-2xl">
          Afterhours<span className="text-orchid">.</span>
        </span>
        <div className="flex items-center gap-6">
          <Link href="/vibe" className="eyebrow transition hover:text-foreground">
            Vibe check
          </Link>
          <Link href="/inbox" className="eyebrow hidden transition hover:text-foreground sm:block">
            Anonymous inbox
          </Link>
          <Link href="/crush" className="eyebrow hidden transition hover:text-foreground sm:block">
            Crush check
          </Link>
          <span className="eyebrow hidden sm:block">Private rooms · No sign-up</span>
        </div>
      </nav>

      <div className="grid flex-1 items-center gap-14 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:pt-16">
        <div>
          <motion.p {...rise(0)} className="eyebrow">
            Party games for people you actually know
          </motion.p>
          <motion.h1
            {...rise(0.08)}
            className="font-heading mt-5 text-[3.4rem] sm:text-7xl lg:text-[6.25rem]"
          >
            The night gets
            <br />
            <span className="text-orchid italic">honest</span> after dark.
          </motion.h1>
          <motion.p {...rise(0.16)} className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Open a room, send the link, and play. Vote in secret, confess without a name, and guess who said what.
          </motion.p>

          <motion.ol {...rise(0.28)} className="mt-12 max-w-md divide-y divide-white/[0.08] border-y hairline">
            {GAMES.filter((g) => g.id !== "room_decides").map((g, i) => (
              <li key={g.id} className="flex items-start gap-4 py-4">
                <span className="eyebrow mt-1 w-6">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-medium">{g.title}</p>
                  <p className="text-sm text-muted-foreground">{g.tagline}</p>
                </div>
              </li>
            ))}
          </motion.ol>

          <motion.div {...rise(0.36)} className="mt-6 max-w-md">
            <Link
              href="/vibe"
              className="group flex items-center gap-4 rounded-2xl border border-orchid/30 bg-orchid/[0.06] p-5 transition hover:bg-orchid/10"
            >
              <div className="flex-1">
                <p className="eyebrow text-orchid">New · 1 minute</p>
                <p className="font-heading mt-1 text-2xl">What&apos;s your after-dark persona?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Answer seven questions. Get a title, an alias, and a compliment you can screenshot.
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-orchid transition group-hover:translate-x-1" />
            </Link>
          </motion.div>
          <motion.div {...rise(0.42)} className="mt-3 max-w-md">
            <Link
              href="/inbox"
              className="group flex items-center gap-4 rounded-2xl border border-orchid/30 bg-orchid/[0.06] p-5 transition hover:bg-orchid/10"
            >
              <div className="flex-1">
                <p className="eyebrow text-orchid">New · Share on Instagram</p>
                <p className="font-heading mt-1 text-2xl">Get anonymous messages</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Make a link, post it to your story, and read what friends really think.
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-orchid transition group-hover:translate-x-1" />
            </Link>
          </motion.div>
          <motion.div {...rise(0.48)} className="mt-3 max-w-md">
            <Link
              href="/crush"
              className="group flex items-center gap-4 rounded-2xl border border-orchid/30 bg-orchid/[0.06] p-5 transition hover:bg-orchid/10"
            >
              <div className="flex-1">
                <p className="eyebrow text-orchid">New · Crush check</p>
                <p className="font-heading mt-1 text-2xl">Who are your friends into?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send a link. They enter their crush, get a compatibility score, and you see the names.
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-orchid transition group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>

        {!isSupabaseConfigured ? (
          <SetupNotice />
        ) : (
          <motion.section {...rise(0.2)} className="surface-raised rounded-2xl p-6 sm:p-8">
            <p className="eyebrow">Step 1</p>
            <h2 className="font-heading mt-2 mb-5 text-3xl">Who&apos;s in?</h2>
            <ProfileFields {...profile} />

            <div className="mt-7 space-y-4">
              <GlowButton className="w-full" loading={busy === "create"} disabled={busy !== null} onClick={create}>
                Create a room <ArrowRight />
              </GlowButton>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <span className="eyebrow">or join one</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                  placeholder="CODE"
                  inputMode="text"
                  autoCapitalize="characters"
                  aria-label="Room code"
                  className="h-12 flex-1 rounded-full border-white/12 bg-transparent px-5 text-center font-mono text-base tracking-[0.4em] uppercase"
                />
                <GlowButton tone="ghost" loading={busy === "join"} disabled={busy !== null} onClick={join}>
                  Join
                </GlowButton>
              </div>
            </div>
          </motion.section>
        )}
      </div>
    </main>
  );
}
