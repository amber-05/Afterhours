"use client";

import { useState } from "react";
import { Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { Input } from "@/components/ui/input";
import { usePoll } from "@/hooks/use-poll";
import { getAccount, linkEmail, signInWithEmail, type AccountInfo } from "@/lib/account";

/** Dashboard card: back this inbox up with an email so it survives a new phone or cleared data. */
export function BackupCard() {
  const [acct, setAcct] = useState<AccountInfo | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // re-check on focus so it flips to "backed up" after the confirmation link is tapped
  usePoll(async () => setAcct(await getAccount().catch(() => null)), 5000);

  async function submit() {
    setBusy(true);
    try {
      await linkEmail(email);
      setSent(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!acct) return null;

  if (acct.email) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border hairline px-4 py-3 text-sm text-muted-foreground">
        <Check className="size-4 text-emerald-400" /> Backed up with <span className="text-foreground">{acct.email}</span>.
        Sign in with it on any device to get your inbox back.
      </p>
    );
  }

  const pending = sent || acct.pendingEmail;
  return (
    <div className="rounded-2xl border border-orchid/30 bg-orchid/[0.06] p-5">
      <p className="font-medium">Back up your inbox</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Right now your inbox lives only in this browser. Add your email once and you can sign back in from any phone, no
        code to remember.
      </p>
      {pending ? (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <Mail className="size-4 text-orchid" /> Check {acct.pendingEmail ?? email} and tap the link to finish.
        </p>
      ) : (
        <div className="mt-4 flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && submit()}
            placeholder="you@email.com"
            autoComplete="email"
            className="h-11 rounded-xl border-white/12 bg-transparent px-4"
          />
          <GlowButton className="h-11 px-5 text-sm" loading={busy} disabled={!email.includes("@")} onClick={submit}>
            Back up
          </GlowButton>
        </div>
      )}
    </div>
  );
}

/** Setup-screen alternative: returning on a new device. */
export function EmailSignIn({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-raised mt-8 space-y-4 rounded-2xl p-6">
      {sent ? (
        <p className="flex items-start gap-3 text-sm">
          <Mail className="mt-0.5 size-4 shrink-0 text-orchid" />
          We sent a sign-in link to {email}. Open it on this device and your inbox will be right here.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enter the email you used to back up your inbox. We&apos;ll send a one-tap sign-in link.
          </p>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && submit()}
            placeholder="you@email.com"
            autoComplete="email"
            className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
          />
          <GlowButton className="w-full" loading={busy} disabled={!email.includes("@")} onClick={submit}>
            <Mail /> Send me a sign-in link
          </GlowButton>
        </>
      )}
      <button onClick={onBack} className="eyebrow block w-full text-center transition hover:text-foreground">
        ← Create a new one
      </button>
    </div>
  );
}
