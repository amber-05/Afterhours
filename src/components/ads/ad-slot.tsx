"use client";

import { useEffect, useRef } from "react";
import { AD_SLOTS, ADSENSE_CLIENT, type AdPlacement } from "@/lib/ads";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** A responsive AdSense unit. Renders nothing until the publisher ID and slot ID are configured. */
export function AdSlot({ placement, className }: { placement: AdPlacement; className?: string }) {
  const slot = AD_SLOTS[placement];
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* blocked by an ad blocker — nothing to show */
    }
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <aside aria-label="Advertisement" className={cn("w-full overflow-hidden", className)}>
      <p className="eyebrow mb-1.5 text-center">Advertisement</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
