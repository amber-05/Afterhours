"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AVATARS } from "@/lib/games";

const KEY = "afterhours:profile";
const EVENT = "afterhours:profile-changed";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

/** Remembers the guest's display name + avatar on this device (never sent anywhere until they join). */
export function useProfile() {
  const raw = useSyncExternalStore(subscribe, read, () => "");

  const { name, avatar } = useMemo(() => {
    try {
      const saved = JSON.parse(raw || "null");
      return {
        name: typeof saved?.name === "string" ? saved.name.slice(0, 20) : "",
        avatar: typeof saved?.avatar === "string" ? saved.avatar : AVATARS[0],
      };
    } catch {
      return { name: "", avatar: AVATARS[0] };
    }
  }, [raw]);

  const save = (next: { name: string; avatar: string }) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the form still works for this visit */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return {
    name,
    avatar,
    setName: (n: string) => save({ name: n, avatar }),
    setAvatar: (a: string) => save({ name, avatar: a }),
  };
}
