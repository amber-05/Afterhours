/**
 * AdSense config. Everything is opt-in via env: with no publisher ID set, no script
 * loads and every <AdSlot> renders nothing. Create one ad unit per placement in AdSense
 * and paste its numeric slot ID into the matching env var.
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

export const AD_SLOTS = {
  home: process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME ?? "",
  lobby: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LOBBY ?? "",
} as const;

export type AdPlacement = keyof typeof AD_SLOTS;
