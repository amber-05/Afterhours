"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { GlowButton } from "@/components/glow-button";
import { SetupNotice } from "@/components/setup-notice";
import { useRoom } from "@/hooks/use-room";
import { isSupabaseConfigured } from "@/lib/supabase";
import { JoinForm } from "./join-form";
import { RoomProvider } from "./room-context";
import { RoomShell } from "./room-shell";

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center">{children}</main>;
}

export function RoomClient({ code }: { code: string }) {
  if (!isSupabaseConfigured) {
    return (
      <Center>
        <SetupNotice />
      </Center>
    );
  }
  return <Connected code={code} />;
}

function Connected({ code }: { code: string }) {
  const { state, status, error, online, refetch } = useRoom(code);

  if (status === "loading") {
    return (
      <Center>
        <Loader2 className="size-8 animate-spin text-orchid" />
        <p className="text-sm text-muted-foreground">Sneaking into room {code}…</p>
      </Center>
    );
  }

  if (status === "not_found" || status === "removed" || status === "error") {
    const title =
      status === "not_found" ? "This room doesn't exist" : status === "removed" ? "You left the room" : "Couldn't connect";
    const body =
      status === "not_found"
        ? "The code might be wrong, or the host closed the room."
        : status === "removed"
          ? "The host removed you, or the room was closed."
          : (error ?? "Something went wrong.");
    return (
      <Center>
        <p className="eyebrow">{status === "error" ? "Connection" : "Room"}</p>
        <h1 className="font-heading text-3xl">{title}</h1>
        <p className="max-w-sm text-muted-foreground">{body}</p>
        <Link href="/">
          <GlowButton>Back home</GlowButton>
        </Link>
      </Center>
    );
  }

  if (status === "needs_join" || !state) {
    return <JoinForm code={code} onJoined={refetch} />;
  }

  return (
    <RoomProvider state={state} online={online} refetch={refetch}>
      <RoomShell />
    </RoomProvider>
  );
}
