"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageNav({ back = "/", label = "Back" }: { back?: string; label?: string }) {
  return (
    <nav className="flex items-center justify-between py-4">
      <Link href={back} className="eyebrow flex items-center gap-2 transition hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {label}
      </Link>
      <Link href="/" className="font-heading text-2xl">
        Afterhours<span className="text-orchid">.</span>
      </Link>
    </nav>
  );
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
