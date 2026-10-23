"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Copy, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { PageNav, timeAgo } from "@/components/inbox/bits";
import { SetupNotice } from "@/components/setup-notice";
import { Input } from "@/components/ui/input";
import { usePoll } from "@/hooks/use-poll";
import { api, type CrushEntry, type CrushLinkSummary } from "@/lib/api";
import { renderLinkCard, shareImage } from "@/lib/share-card";
import { ensureGuestSession, isSupabaseConfigured } from "@/lib/supabase";

const POLL_MS = 8000;
const linkFor = (slug: string) => `${window.location.origin}/c/${slug}`;

export default function CrushPage() {
  const [links, setLinks] = useState<CrushLinkSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await ensureGuestSession();
      setLinks(await api.myCrushLinks());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  usePoll(load, POLL_MS, isSupabaseConfigured);

  if (!isSupabaseConfigured) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SetupNotice />
      </main>
    );
  }

  const current = links?.find((l) => l.slug === open);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-20 pt-4 sm:px-8">
      <PageNav />
      {error && <p className="mt-10 text-center text-muted-foreground">{error}</p>}
      {links === null && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-orchid" />
        </div>
      )}
      {links && !current && <List links={links} onOpen={setOpen} reload={load} />}
      {current && <Entries link={current} onBack={() => setOpen(null)} reload={load} />}
    </main>
  );
}

function List({ links, onOpen, reload }: { links: CrushLinkSummary[]; onOpen: (s: string) => void; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const { slug } = await api.createCrushLink(name.trim() || null, null);
      await reload();
      onOpen(slug);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pt-6">
      <header>
        <p className="eyebrow">Love calculator</p>
        <h1 className="font-heading mt-3 text-balance text-[2.75rem] sm:text-6xl">
          Who&apos;s <span className="text-orchid italic">everyone</span> into?
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          Send a link. Your friend enters their own name and their crush&apos;s name to calculate a love percentage. You see
          both names and the score here.
        </p>
      </header>

      <div className="surface-raised space-y-3 rounded-2xl p-5">
        <label className="block space-y-2">
          <span className="eyebrow">Your name (so they know it&apos;s from you)</span>
          <Input
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aman"
            className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
          />
        </label>
        <GlowButton className="w-full" loading={busy} disabled={links.length >= 5} onClick={create}>
          <Plus /> Create a new link
        </GlowButton>
        {links.length >= 5 && <p className="text-sm text-muted-foreground">You&apos;ve hit the 5-link limit. Delete one first.</p>}
      </div>

      {links.length > 0 && (
        <section>
          <h2 className="eyebrow mb-3">Your links</h2>
          <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border hairline">
            {links.map((l) => (
              <li key={l.slug}>
                <button
                  onClick={() => onOpen(l.slug)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.owner_name ? `From ${l.owner_name}` : "Crush link"}</p>
                    <p className="font-mono text-xs text-muted-foreground">/c/{l.slug}</p>
                  </div>
                  <span className="eyebrow">
                    {l.unread > 0 && <span className="mr-2 text-orchid">{l.unread} new</span>}
                    {l.total} {l.total === 1 ? "entry" : "entries"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </motion.div>
  );
}

function Entries({ link, onBack, reload }: { link: CrushLinkSummary; onBack: () => void; reload: () => Promise<void> }) {
  const [entries, setEntries] = useState<CrushEntry[] | null>(null);
  const [copied, setCopied] = useState(false);
  const url = linkFor(link.slug);

  const fetchEntries = useCallback(async () => {
    try {
      const list = await api.crushEntries(link.slug);
      setEntries((prev) => {
        const seenNew = new Set((prev ?? []).filter((e) => e.unread).map((e) => e.id));
        return list.map((e) => ({ ...e, unread: e.unread || seenNew.has(e.id) }));
      });
      if (list.some((e) => e.unread)) void api.markCrushRead(link.slug).then(reload);
    } catch {
      /* next poll retries */
    }
  }, [link.slug, reload]);

  usePoll(fetchEntries, POLL_MS);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Long-press the link instead.");
    }
  }

  async function story() {
    try {
      const blob = await renderLinkCard({
        eyebrow: "crush compatibility",
        title: "Who's your crush?",
        sub: "Enter their name. See how well you match.",
        link: url,
      });
      const res = await shareImage(blob, "afterhours-crush.png", "Who's your crush? Check your compatibility", url);
      if (res === "downloaded") toast.success("Saved. Add it to your story with the link.");
    } catch {
      toast.error("Couldn't make the image");
    }
  }

  async function removeEntry(id: string) {
    setEntries((es) => es?.filter((e) => e.id !== id) ?? null);
    try {
      await api.deleteCrushEntry(id);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
      void fetchEntries();
    }
  }

  async function removeLink() {
    if (!confirm("Delete this link and everything entered through it?")) return;
    try {
      await api.deleteCrushLink(link.slug);
      await reload();
      onBack();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pt-4">
      <button onClick={onBack} className="eyebrow flex items-center gap-2 transition hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All links
      </button>

      <header>
        <p className="eyebrow">{link.owner_name ? `From ${link.owner_name}` : "Crush link"}</p>
        <h1 className="font-heading mt-2 text-5xl sm:text-6xl">The crush list</h1>
      </header>

      <section className="surface-raised rounded-2xl p-5">
        <p className="eyebrow">Send this to a friend</p>
        <p className="mt-2 break-all font-mono text-sm">{url}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <GlowButton onClick={copy} className="h-10 px-4 text-sm">
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </GlowButton>
          <GlowButton onClick={story} tone="ghost" className="h-10 px-4 text-sm">
            <Share2 /> Share to story
          </GlowButton>
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-3">Entries {entries ? `· ${entries.length}` : ""}</h2>
        {entries === null ? (
          <Loader2 className="mx-auto size-5 animate-spin text-orchid" />
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border hairline p-8 text-center">
            <p className="font-heading text-3xl">Nobody has confessed yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Share the link. New entries show up here on their own.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {entries.map((e) => (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center gap-4 rounded-2xl border p-5 ${e.unread ? "border-orchid/40 bg-orchid/[0.05]" : "hairline bg-white/[0.02]"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-snug">
                      <span className="font-medium">{e.your_name}</span>
                      <span className="text-muted-foreground"> + </span>
                      <span className="font-medium text-orchid">{e.crush_name}</span>
                    </p>
                    <p className="eyebrow mt-2">
                      {e.verdict && <span className="mr-2 text-foreground">{e.verdict}</span>}
                      {e.unread && <span className="mr-2 text-orchid">New</span>}
                      {timeAgo(e.created_at)}
                    </p>
                  </div>
                  <span className="font-heading text-4xl text-orchid">{e.score}%</span>
                  <button
                    onClick={() => removeEntry(e.id)}
                    aria-label="Delete entry"
                    className="text-muted-foreground transition hover:text-red-300"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <button onClick={removeLink} className="eyebrow transition hover:text-red-300">
        Delete this link
      </button>
    </motion.div>
  );
}
