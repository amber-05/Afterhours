"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Player, RoomState } from "@/lib/types";

interface RoomCtx {
  state: RoomState;
  code: string;
  isHost: boolean;
  online: Set<string>;
  busy: boolean;
  playerById: (id: string | null | undefined) => Player | undefined;
  /** Runs an API call with a busy flag + error toast, then refreshes the snapshot. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const Ctx = createContext<RoomCtx | null>(null);

export function RoomProvider({
  state,
  online,
  refetch,
  children,
}: {
  state: RoomState;
  online: Set<string>;
  refetch: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      setBusy(true);
      try {
        return await fn();
      } catch (e) {
        toast.error((e as Error).message);
        return undefined;
      } finally {
        setBusy(false);
        void refetch();
      }
    },
    [refetch],
  );

  const value = useMemo<RoomCtx>(() => {
    const map = new Map(state.players.map((p) => [p.id, p]));
    return {
      state,
      code: state.room.code,
      isHost: state.me.is_host,
      online,
      busy,
      playerById: (id) => (id ? map.get(id) : undefined),
      run,
    };
  }, [state, online, busy, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoomCtx() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoomCtx outside RoomProvider");
  return v;
}
