"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ensureGuestSession, getSupabase } from "@/lib/supabase";
import type { RoomState } from "@/lib/types";

export type RoomStatus = "loading" | "needs_join" | "ready" | "removed" | "not_found" | "error";

const POLL_MS = 6000;

/**
 * Loads a room snapshot and keeps it live:
 *  - Supabase Realtime (postgres_changes on rooms/players/rounds/round_submissions + presence)
 *    triggers an immediate refetch of the snapshot RPC,
 *  - a slow poll + refetch-on-focus is the safety net if a websocket drops.
 * The snapshot RPC is the single source of truth, so players can never see stale or private data.
 */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());

  const everReady = useRef(false);
  const inFlight = useRef(false);
  const dirty = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) {
      dirty.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        dirty.current = false;
        try {
          const next = await api.getState(code);
          everReady.current = true;
          setState(next);
          setStatus("ready");
          setError(null);
        } catch (e) {
          const c = e instanceof ApiError ? e.code : "unknown";
          if (c === "room_not_found") {
            setState(null);
            setStatus(everReady.current ? "removed" : "not_found");
          } else if (c === "not_member") {
            setState(null);
            setStatus(everReady.current ? "removed" : "needs_join");
          } else {
            setError((e as Error).message);
            if (!everReady.current) setStatus("error");
          }
        }
      } while (dirty.current);
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  // initial load
  useEffect(() => {
    let cancelled = false;
    ensureGuestSession()
      .then(() => {
        if (!cancelled) void refetch();
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(new ApiError(e.message).message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [refetch]);

  const roomId = state?.room.id;
  const meId = state?.me.id;

  // realtime
  useEffect(() => {
    if (!roomId || !meId) return;
    const supabase = getSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poke = () => {
      clearTimeout(timer);
      timer = setTimeout(refetch, 80);
    };

    const channel = supabase
      .channel(`room:${roomId}`, { config: { presence: { key: meId } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, poke)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, poke)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` }, poke)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_submissions", filter: `room_id=eq.${roomId}` },
        poke,
      )
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          channel.track({ at: Date.now() });
          poke(); // catch anything missed while connecting
        }
      });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [roomId, meId, refetch]);

  // safety net
  useEffect(() => {
    if (status !== "ready") return;
    const tick = () => document.visibilityState === "visible" && refetch();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [status, refetch]);

  return { state, status, error, online, refetch };
}
