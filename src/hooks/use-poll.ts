"use client";

import { useEffect } from "react";

/** Runs `fn` once right away, then every `ms` while the tab is visible (omit `ms` to run once). */
export function usePoll(fn: () => Promise<unknown>, ms?: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") void fn();
    };
    const first = setTimeout(run, 0);
    const id = ms ? setInterval(run, ms) : undefined;
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [fn, ms, enabled]);
}
