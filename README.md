# Afterhours 🌙

Private party-game rooms for friends — anonymous votes, confessions, truths and guessing games. No sign-up: everyone joins with a name through an invite link or a 6-letter code.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Framer Motion · Supabase (Postgres, RLS, Realtime, anonymous auth) · Vercel

## Games

| Game | How it works |
| --- | --- |
| 👀 **Who's Most Likely?** | Everyone votes for a friend (friendly / fun / romantic / spicy). Auto-reveals when all votes are in. Only totals are shown — never who voted for whom. |
| 🤫 **Anonymous Confessions** | Everyone submits a secret; they're shuffled and revealed one at a time with no authors. |
| 🫗 **Truth or Spill** | Answer a question anonymously *or* publicly (per-answer toggle). |
| 🕵️ **Guess Who?** | Everyone writes a statement; the room guesses the author of each. Host can hide authors entirely. |
| 🎲 **The Room Decides** | Auto-rotates between games (least-played first, never the same twice in a row) with a 15 s countdown between rounds. |

Host controls: pick games, set the vibe, toggle author reveal, force-advance a round, kick players, return to lobby. If the host leaves, the longest-present player becomes host.

## Beyond the rooms

| Page | What it does |
| --- | --- |
| `/vibe` | 7-question persona quiz → title, alias, compliment, best game. Shareable as an Instagram-story-sized image. |
| `/inbox` | NGL-style anonymous inbox. You get a link (`/u/yourname`) to post on your story; people send messages with no account; you read them and turn any into a story card. Optional email backup: add your email once and sign back in from any device with a one-tap link, no code to remember. |
| `/crush` | Love calculator links (`/c/xxxxxxxx`). A friend enters their name and their crush's name and gets a love percentage worked out with two classic name games: **True Love** (count the letters of T-R-U-E L-O-V-E across both names and fold the numbers down to two digits) and **FLAMES** (cross out shared letters, then eliminate F-L-A-M-E-S). The result page shows the working. The link's owner sees both names and the result. |

Senders' identities are never returned by any API, including to the inbox/link owner. Messages are rate-limited (5 per sender per hour per inbox).

## Setup (≈5 minutes)

### 1. Create a Supabase project
[supabase.com](https://supabase.com) → New project (free tier is fine).

### 2. Enable guest sign-ins
**Authentication → Sign In / Providers → "Allow anonymous sign-ins" → ON.**
Guest sessions are real Supabase anonymous users (a signed JWT in localStorage), which is what makes RLS and host permissions secure without accounts.
*Recommended for production:* enable CAPTCHA (Authentication → Attack Protection) to stop mass guest-account creation.

### 2b. Email backup (so inboxes survive a new phone)
**Authentication → URL Configuration:** set **Site URL** to your deployed address (e.g. `https://your-app.vercel.app`) and add it, plus `http://localhost:3000`, under **Redirect URLs**. Make sure the **Email** provider is enabled. Supabase's built-in mailer is rate-limited, so add your own SMTP (Authentication → SMTP) before real traffic.

### 3. Run the migrations
Either paste each file into **SQL Editor** in order, or use the CLI (`supabase link` then `supabase db push`):

1. [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) — tables, RLS, realtime publication
2. [`supabase/migrations/0002_functions.sql`](supabase/migrations/0002_functions.sql) — all game logic (RPCs) + privilege lockdown
3. [`supabase/migrations/0003_seed_prompts.sql`](supabase/migrations/0003_seed_prompts.sql) — question bank + the "friendly" vibe (add your own rows any time)
4. [`supabase/migrations/0004_inbox.sql`](supabase/migrations/0004_inbox.sql) — anonymous inbox ("send me anonymous messages")
5. [`supabase/migrations/0005_crush_links.sql`](supabase/migrations/0005_crush_links.sql) — crush links
6. [`supabase/migrations/0006_love_calculator.sql`](supabase/migrations/0006_love_calculator.sql) — FLAMES + True Love calculator

If the `supabase_realtime` publication didn't pick up the tables (Database → Replication), enable `rooms`, `players`, `rounds`, `round_submissions`. The app also polls every 6 s and refetches on focus, so it keeps working if realtime is off — just less snappy.

### 4. Configure env
```bash
cp .env.local.example .env.local
```
Fill in **Project URL** and **anon / publishable key** (Project Settings → API).

### 5. Run
```bash
npm install
npm run dev     # http://localhost:3000
```
Open it in two or three browser windows (use a private window for each — each one is a separate guest). Games need 2+ players (Who's Most Likely needs 3).

### Deploy to Vercel
Import the repo, add the same two env vars, deploy. Nothing else — there is no custom server.

## How anonymity & security work

- **No direct writes.** RLS is enabled everywhere and `INSERT/UPDATE/DELETE` privileges are revoked from `anon`/`authenticated`. Every mutation is a `SECURITY DEFINER` RPC that checks membership, host rights, the current phase, and input length.
- **Private entries.** Votes, confessions, answers and guesses live in `entries`, whose only policy is `user_id = auth.uid()` — you can read your own rows and nobody else's, not even through the API with a valid token.
- **Anonymised reveals.** At reveal time the server copies only the *public* result (tallies, shuffled texts, authors for public answers) into `rounds.payload`. Confession authors and voters are never written there.
- **Shared state is member-only.** `rooms`, `players`, `rounds`, `round_submissions` are readable only by players in that room (`is_room_member`), and Realtime respects the same policies.
- **Host checks live in the database**, not the UI. A non-host calling `start_round`, `kick_player`, etc. gets `not_host`.
- Room codes are 6 chars from a 32-letter alphabet; rooms cap at 12 players and a user can create ≤10 rooms/hour.

> Honest limits: the database owner (you) can technically read `entries`. Text isn't moderated. Anyone with the code can join, so treat the code like a key. Stale rooms aren't deleted automatically — schedule `select public.cleanup_stale_rooms();` with pg_cron.

## Project layout

```
supabase/migrations/   schema + RLS, RPC game logic, seed prompts
supabase/tests/        DB flow test (runs migrations in an in-process Postgres)
src/app/               landing page, /room/[code]
src/components/room/   lobby, round view, panels, results, host bar
src/hooks/use-room.ts  snapshot + realtime + presence + polling fallback
src/lib/               supabase client & guest session, typed RPC wrappers, game metadata
```

## Tests
```bash
npm run test:db   # full multi-player flow, RLS and privilege checks against the migrations
npm run lint && npm run build
```

## Adding a game
1. Add its id to the `check` constraints in `rooms/rounds/prompts` and seed prompts.
2. Add branches in `_advance` / `submit_entry` (SQL) for its collect → reveal flow.
3. Add metadata in `src/lib/games.ts` and a body in `src/components/room/round-view.tsx`.
