import { cn } from "@/lib/utils";

// Muted, dark-friendly tints — one is picked per player id so the same person keeps their colour.
const TINTS = ["#3a1a26", "#2f1a33", "#3a2420", "#2b1a2e", "#40202a", "#262033"];

function tintFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function PlayerAvatar({
  id,
  emoji,
  size = "md",
  online,
  className,
}: {
  id: string;
  emoji: string;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}) {
  const dims = { sm: "size-8 text-base", md: "size-11 text-xl", lg: "size-14 text-2xl", xl: "size-20 text-4xl" }[size];
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn("inline-flex items-center justify-center rounded-full ring-1 ring-white/10", dims)}
        style={{ background: tintFor(id) }}
      >
        {emoji}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#14090f]",
            online ? "bg-emerald-400" : "bg-zinc-600",
          )}
        />
      )}
    </span>
  );
}
