"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { SetupNotice } from "@/components/setup-notice";
import { Textarea } from "@/components/ui/textarea";
import { api, type PublicInbox } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PageNav } from "./bits";

const ease = [0.22, 1, 0.36, 1] as const;

export function SendForm({ handle }: { handle: string }) {
  const [inbox, setInbox] = useState<PublicInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    api
      .publicInbox(handle)
      .then(setInbox)
      .catch((e: Error) => setError(e.message));
  }, [handle]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.sendMessage(handle, text.trim());
      setText("");
      setSent((n) => n + 1);
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

      {!inbox && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-orchid" />
        </div>
      )}

      {error && <p className="mt-16 text-center text-muted-foreground">{error}</p>}

      {inbox && !inbox.found && (
        <div className="mt-16 text-center">
          <p className="eyebrow">Link not found</p>
          <h1 className="font-heading mt-3 text-5xl">Nobody lives here yet.</h1>
          <p className="mt-3 text-muted-foreground">The link may be mistyped, or the name is still up for grabs.</p>
          <Link href="/inbox" className="mt-8 inline-block">
            <GlowButton>Claim @{handle}</GlowButton>
          </Link>
        </div>
      )}

      {inbox?.found && (
        <AnimatePresence mode="wait">
          {sent === 0 || text ? (
            <motion.section
              key="form"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease }}
              className="pt-8"
            >
              <p className="eyebrow">@{inbox.handle}</p>
              <h1 className="font-heading mt-3 text-balance text-[2.75rem] sm:text-6xl">{inbox.prompt}</h1>
              {inbox.persona_title && (
                <p className="mt-3 text-sm text-muted-foreground">
                  They&apos;re <span className="text-foreground">{inbox.persona_title}</span>
                  {inbox.persona_alias ? <> · {inbox.persona_alias}</> : null}
                </p>
              )}

              <div className="relative mt-8">
                <Textarea
                  value={text}
                  maxLength={300}
                  rows={5}
                  autoFocus
                  placeholder="Say it. They'll never know it was you."
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-40 resize-none rounded-2xl border-white/12 bg-white/[0.03] p-5 text-base"
                />
                <span className="absolute bottom-3 right-4 text-xs text-muted-foreground">{text.length}/300</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Anonymous. They can&apos;t see who you are, and no account is needed.
              </p>
              <GlowButton className="mt-5 w-full" loading={busy} disabled={!text.trim()} onClick={send}>
                <Send /> Send anonymously
              </GlowButton>
            </motion.section>
          ) : (
            <motion.section
              key="thanks"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
              className="pt-12 text-center"
            >
              <p className="eyebrow text-orchid">Sent</p>
              <h1 className="font-heading mt-3 text-5xl sm:text-6xl">Delivered, quietly.</h1>
              <p className="mt-3 text-muted-foreground">Nobody will ever know it was you.</p>
              <div className="mx-auto mt-10 flex max-w-xs flex-col gap-3">
                <GlowButton tone="ghost" onClick={() => setSent(0)}>
                  Send another
                </GlowButton>
                <Link href="/inbox">
                  <GlowButton className="w-full">Get your own anonymous link</GlowButton>
                </Link>
                <Link href="/vibe" className="eyebrow pt-2 transition hover:text-foreground">
                  Or find your after-dark persona →
                </Link>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      )}
    </main>
  );
}
