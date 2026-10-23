"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ImageDown, KeyRound, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlowButton } from "@/components/glow-button";
import { PageNav, timeAgo } from "@/components/inbox/bits";
import { SetupNotice } from "@/components/setup-notice";
import { Input } from "@/components/ui/input";
import { usePoll } from "@/hooks/use-poll";
import { api, type InboxMessage, type InboxSummary } from "@/lib/api";
import { loadInboxKey, loadPersona, saveInboxKey, slugify } from "@/lib/local-store";
import { renderLinkCard, renderMessageCard, shareImage } from "@/lib/share-card";
import { ensureGuestSession, isSupabaseConfigured } from "@/lib/supabase";

const POLL_MS = 8000;

export default function InboxPage() {
  const [inbox, setInbox] = useState<InboxSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await ensureGuestSession();
      setInbox(await api.myInbox());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  usePoll(load, undefined, isSupabaseConfigured);

  if (!isSupabaseConfigured) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SetupNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-20 pt-4 sm:px-8">
      <PageNav />
      {error && <p className="mt-10 text-center text-muted-foreground">{error}</p>}
      {inbox === undefined && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-orchid" />
        </div>
      )}
      {inbox === null && <Setup onDone={load} />}
      {inbox && <Dashboard inbox={inbox} refresh={load} />}
    </main>
  );
}

/* ---------------------------------------------------------------- setup */

function Setup({ onDone }: { onDone: () => Promise<void> }) {
  const persona = loadPersona();
  const [handle, setHandle] = useState(() => (persona ? slugify(persona.alias) : ""));
  const [prompt, setPrompt] = useState("send me anonymous messages");
  const [busy, setBusy] = useState(false);
  const [recover, setRecover] = useState(false);
  const [rHandle, setRHandle] = useState("");
  const [rKey, setRKey] = useState("");

  async function create() {
    setBusy(true);
    try {
      const res = await api.createInbox(handle, prompt, persona ? { title: persona.title, alias: persona.alias } : undefined);
      saveInboxKey(res.key);
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    try {
      await api.claimInbox(rHandle, rKey);
      saveInboxKey(rKey);
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="pt-8">
      <p className="eyebrow">Anonymous inbox</p>
      <h1 className="font-heading mt-3 text-balance text-[2.75rem] sm:text-6xl">
        Get <span className="text-orchid italic">honest</span> messages from friends.
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Make your link, post it on your Instagram story, and read what people really think. They stay anonymous. No
        accounts for anyone.
      </p>

      {!recover ? (
        <div className="surface-raised mt-8 space-y-4 rounded-2xl p-6">
          <label className="block space-y-2">
            <span className="eyebrow">Pick your link name</span>
            <div className="flex items-center rounded-xl border border-white/12 px-4">
              <span className="text-muted-foreground">/u/</span>
              <Input
                value={handle}
                maxLength={20}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="yourname"
                className="h-12 border-0 bg-transparent px-1 text-base focus-visible:ring-0"
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="eyebrow">What should people see?</span>
            <Input
              value={prompt}
              maxLength={80}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
            />
          </label>
          {persona && (
            <p className="text-sm text-muted-foreground">
              Your persona <span className="text-foreground">{persona.title}</span> will show on your page.
            </p>
          )}
          <GlowButton className="w-full" loading={busy} disabled={handle.length < 3 || !prompt.trim()} onClick={create}>
            Create my link
          </GlowButton>
          <button onClick={() => setRecover(true)} className="eyebrow block w-full pt-1 text-center transition hover:text-foreground">
            Already have a link? Recover it
          </button>
        </div>
      ) : (
        <div className="surface-raised mt-8 space-y-4 rounded-2xl p-6">
          <p className="text-sm text-muted-foreground">
            Enter your link name and the recovery key you saved when you created it.
          </p>
          <Input
            value={rHandle}
            onChange={(e) => setRHandle(e.target.value.toLowerCase().trim())}
            placeholder="link name"
            className="h-12 rounded-xl border-white/12 bg-transparent px-4 text-base"
          />
          <Input
            value={rKey}
            onChange={(e) => setRKey(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            className="h-12 rounded-xl border-white/12 bg-transparent px-4 font-mono text-base"
          />
          <GlowButton className="w-full" loading={busy} disabled={!rHandle || !rKey} onClick={claim}>
            <KeyRound /> Recover my inbox
          </GlowButton>
          <button onClick={() => setRecover(false)} className="eyebrow block w-full text-center transition hover:text-foreground">
            ← Create a new one
          </button>
        </div>
      )}
    </motion.section>
  );
}

/* ------------------------------------------------------------ dashboard */

function Dashboard({ inbox, refresh }: { inbox: InboxSummary; refresh: () => Promise<void> }) {
  const [messages, setMessages] = useState<InboxMessage[] | null>(null);
  const [key, setKey] = useState<string | null>(() => loadInboxKey());
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(inbox.prompt);

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/u/${inbox.handle}`;

  const fetchMessages = useCallback(async () => {
    try {
      const list = await api.listMessages();
      setMessages((prev) => {
        // keep "new" badges from the first load even after we mark everything read
        const seenNew = new Set((prev ?? []).filter((m) => m.unread).map((m) => m.id));
        return list.map((m) => ({ ...m, unread: m.unread || seenNew.has(m.id) }));
      });
      if (list.some((m) => m.unread)) void api.markRead();
    } catch {
      /* transient — next poll retries */
    }
  }, []);

  usePoll(fetchMessages, POLL_MS);

  function dismissKey() {
    saveInboxKey("");
    setKey(null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Long-press the link instead.");
    }
  }

  async function storyCard() {
    try {
      const blob = await renderLinkCard({
        eyebrow: "anonymous inbox",
        title: inbox.prompt,
        sub: "Be honest. I'll never know who sent it.",
        link,
      });
      const res = await shareImage(blob, "afterhours-link.png", `${inbox.prompt}`, link);
      if (res === "downloaded") toast.success("Saved. Add it to your story and paste the link sticker.");
    } catch {
      toast.error("Couldn't make the image");
    }
  }

  async function replyCard(m: InboxMessage) {
    try {
      const blob = await renderMessageCard(inbox.prompt, m.body, link);
      const res = await shareImage(blob, "afterhours-message.png", "Send me one", link);
      if (res === "downloaded") toast.success("Saved. Post it to your story.");
    } catch {
      toast.error("Couldn't make the image");
    }
  }

  async function remove(id: string) {
    setMessages((ms) => ms?.filter((m) => m.id !== id) ?? null);
    try {
      await api.deleteMessage(id);
    } catch (e) {
      toast.error((e as Error).message);
      void fetchMessages();
    }
  }

  async function savePrompt() {
    try {
      await api.updateInbox({ prompt });
      setEditing(false);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pt-6">
      <header>
        <p className="eyebrow">@{inbox.handle}</p>
        <h1 className="font-heading mt-2 text-5xl sm:text-6xl">Your inbox</h1>
      </header>

      {key && (
        <div className="rounded-2xl border border-orchid/30 bg-orchid/[0.06] p-5 text-sm">
          <p className="font-medium">Save your recovery key</p>
          <p className="mt-1 text-muted-foreground">
            Your inbox is tied to this browser. If you switch phones or clear data, this key is the only way to get it
            back. Screenshot it.
          </p>
          <button onClick={() => setShowKey((v) => !v)} className="eyebrow mt-3 text-orchid">
            {showKey ? "Hide key" : "Show key"}
          </button>
          {showKey && (
            <p className="mt-2 break-all font-mono text-base tracking-wider">{key.match(/.{1,5}/g)?.join("-")}</p>
          )}
          <button onClick={dismissKey} className="eyebrow ml-4 text-muted-foreground">
            I saved it
          </button>
        </div>
      )}

      <section className="surface-raised rounded-2xl p-5">
        <p className="eyebrow">Your link</p>
        <p className="mt-2 break-all font-mono text-sm">{link}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <GlowButton onClick={copy} className="h-10 px-4 text-sm">
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </GlowButton>
          <GlowButton onClick={storyCard} tone="ghost" className="h-10 px-4 text-sm">
            <Share2 /> Share to story
          </GlowButton>
        </div>
        <div className="mt-5 border-t hairline pt-4">
          {editing ? (
            <div className="flex gap-2">
              <Input
                value={prompt}
                maxLength={80}
                onChange={(e) => setPrompt(e.target.value)}
                className="h-10 rounded-xl border-white/12 bg-transparent"
              />
              <GlowButton className="h-10 px-4 text-sm" onClick={savePrompt}>
                Save
              </GlowButton>
            </div>
          ) : (
            <p className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                People see: <span className="text-foreground">“{inbox.prompt}”</span>
              </span>
              <button onClick={() => setEditing(true)} className="eyebrow shrink-0 hover:text-foreground">
                Edit
              </button>
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-3">Messages {messages ? `· ${messages.length}` : ""}</h2>
        {messages === null ? (
          <Loader2 className="mx-auto size-5 animate-spin text-orchid" />
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border hairline p-8 text-center">
            <p className="font-heading text-3xl">Quiet for now.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Post your link on your story. This refreshes on its own, so new messages just appear.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-2xl border p-5 ${m.unread ? "border-orchid/40 bg-orchid/[0.05]" : "hairline bg-white/[0.02]"}`}
                >
                  <p className="whitespace-pre-wrap break-words text-lg leading-snug">{m.body}</p>
                  <div className="mt-4 flex items-center gap-4">
                    <span className="eyebrow">
                      {m.unread && <span className="mr-2 text-orchid">New</span>}
                      {timeAgo(m.created_at)}
                    </span>
                    <span className="flex-1" />
                    <button
                      onClick={() => replyCard(m)}
                      className="eyebrow flex items-center gap-1.5 transition hover:text-foreground"
                    >
                      <ImageDown className="size-3.5" /> Story card
                    </button>
                    <button
                      onClick={() => remove(m.id)}
                      aria-label="Delete message"
                      className="text-muted-foreground transition hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </motion.div>
  );
}
