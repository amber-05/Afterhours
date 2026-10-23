"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Music2, VolumeX } from "lucide-react";
import { startMusic, stopMusic } from "@/lib/ambient-music";
import { cn } from "@/lib/utils";

const KEY = "afterhours:music";

/**
 * Floating background-music switch. Browsers block autoplay, so music starts only after a tap;
 * if you left it on last time it resumes on your first tap anywhere.
 */
export function MusicToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem(KEY) === "on";
    } catch {
      /* storage unavailable */
    }
    if (!wanted) return;
    const resume = () => {
      setOn(true);
      void startMusic();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => window.removeEventListener("pointerdown", resume);
  }, []);

  useEffect(() => () => stopMusic(), []);

  function toggle(e: React.PointerEvent | React.MouseEvent) {
    e.stopPropagation();
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (next) void startMusic();
    else stopMusic();
  }

  return (
    <motion.button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={toggle}
      whileTap={{ scale: 0.9 }}
      aria-pressed={on}
      aria-label={on ? "Turn music off" : "Turn music on"}
      title={on ? "Music on" : "Music off"}
      className={cn(
        "surface-raised fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full transition",
        on ? "glow-pink border-orchid/50 text-orchid" : "text-muted-foreground hover:text-white",
      )}
    >
      {on ? (
        <span className="flex h-5 items-end gap-[3px]" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-orchid"
              animate={{ height: ["30%", "100%", "45%", "85%", "30%"] }}
              transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
            />
          ))}
        </span>
      ) : (
        <>
          <Music2 className="size-5" />
          <VolumeX className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-[#14090f] p-0.5 text-muted-foreground" />
        </>
      )}
    </motion.button>
  );
}
