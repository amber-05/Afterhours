"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<typeof Button> & { loading?: boolean; tone?: "brand" | "ghost" };

/** Primary action: solid orchid pill. Secondary: hairline outline. */
export function GlowButton({ className, loading, tone = "brand", children, disabled, ...props }: Props) {
  return (
    <Button
      disabled={disabled || loading}
      className={cn(
        "h-12 rounded-full px-6 text-[0.95rem] font-medium transition active:scale-[0.98]",
        tone === "brand" && "bg-orchid text-[#2a0f1b] hover:bg-[#f6bccb]",
        tone === "ghost" && "border border-white/15 bg-transparent text-foreground hover:bg-white/[0.06]",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
