"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { ProfileFields } from "@/components/profile-fields";
import { useProfile } from "@/hooks/use-profile";
import { api } from "@/lib/api";

export function JoinForm({ code, onJoined }: { code: string; onJoined: () => Promise<void> }) {
  const profile = useProfile();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ host?: string; count?: number; full?: boolean } | null>(null);

  useEffect(() => {
    api
      .preview(code)
      .then((p) => setInfo({ host: p.host_name, count: p.player_count, full: p.full }))
      .catch(() => {});
  }, [code]);

  async function join() {
    if (!profile.name.trim()) return toast.error("Pick a name first");
    setBusy(true);
    try {
      await api.joinRoom(code, profile.name.trim(), profile.avatar);
      await onJoined();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="surface-raised w-full max-w-md rounded-2xl p-6 sm:p-8"
      >
        <p className="eyebrow text-center">You&apos;re invited</p>
        <h1 className="font-heading mt-2 text-center text-6xl tracking-[0.12em]">
          {code}
        </h1>
        {info?.host && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {info.host}&apos;s room · {info.count} {info.count === 1 ? "player" : "players"} inside
          </p>
        )}
        <div className="mt-6">
          <ProfileFields {...profile} />
        </div>
        <GlowButton className="mt-6 w-full" loading={busy} disabled={info?.full} onClick={join}>
          {info?.full ? "Room is full" : "Join the room"}
        </GlowButton>
      </motion.div>
    </main>
  );
}
