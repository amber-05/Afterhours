"use client";

import { Input } from "@/components/ui/input";
import { AVATARS } from "@/lib/games";
import { cn } from "@/lib/utils";

export function ProfileFields({
  name,
  avatar,
  setName,
  setAvatar,
}: {
  name: string;
  avatar: string;
  setName: (v: string) => void;
  setAvatar: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="display-name" className="eyebrow">
          Your name
        </label>
        <Input
          id="display-name"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder="What do your friends call you?"
          onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
        />
      </div>
      <div className="space-y-2">
        <span className="eyebrow">Your face</span>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-label={`Avatar ${a}`}
              aria-pressed={avatar === a}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full text-xl ring-1 transition",
                avatar === a
                  ? "bg-orchid/15 ring-orchid"
                  : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]",
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
