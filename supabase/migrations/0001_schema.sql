-- Afterhours — core schema, RLS and realtime.
--
-- Security model
--   * Every visitor gets a Supabase *anonymous* auth session (a real JWT, so auth.uid() works).
--   * Clients can only READ shared tables (rooms/players/rounds/round_submissions) of rooms
--     they belong to, and their OWN rows of `entries`. Nobody can write to any table directly.
--   * All writes go through SECURITY DEFINER functions (0002_functions.sql) which enforce
--     host permissions, phases and validation.
--   * `entries` holds the sensitive stuff (who voted for whom, who wrote which confession).
--     It is never readable by other players, so identities stay protected. Only the
--     anonymised result computed at reveal time is copied into `rounds.payload`.

create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id     uuid not null,
  status           text not null default 'lobby' check (status in ('lobby', 'playing')),
  vibe             text not null default 'fun'   check (vibe in ('fun', 'romantic', 'spicy', 'mixed')),
  auto_rotate      boolean not null default false,  -- "The Room Decides"
  reveal_author    boolean not null default true,   -- Guess Who: reveal the author after guesses
  current_round_id uuid,
  round_count      int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null,
  name      text not null check (char_length(name) between 1 and 20),
  avatar    text not null default '🌙',
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create unique index players_room_name_uniq on public.players (room_id, lower(name));
create index players_user_idx on public.players (user_id);

create table public.prompts (
  id   uuid primary key default gen_random_uuid(),
  game text not null check (game in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who')),
  vibe text not null check (vibe in ('fun', 'romantic', 'spicy')),
  text text not null
);
create index prompts_game_vibe_idx on public.prompts (game, vibe);

create table public.rounds (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms (id) on delete cascade,
  round_no  int  not null,
  game      text not null check (game in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who')),
  prompt_id uuid references public.prompts (id) on delete set null,
  prompt    text not null,
  phase     text not null default 'collecting' check (phase in ('collecting', 'guessing', 'reveal', 'finished')),
  cursor    int  not null default 0,
  payload   jsonb not null default '{}'::jsonb,   -- public, anonymised reveal data
  created_at timestamptz not null default now(),
  unique (room_id, round_no)
);

alter table public.rooms
  add constraint rooms_current_round_fk
  foreign key (current_round_id) references public.rounds (id) on delete set null;

-- Public "who has already answered" markers. Contains NO content and NO target.
create table public.round_submissions (
  round_id  uuid not null references public.rounds (id) on delete cascade,
  room_id   uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  stage     int  not null default 0,
  primary key (round_id, player_id, stage)
);
create index round_submissions_room_idx on public.round_submissions (room_id);

-- PRIVATE: votes, confessions, answers, statements, guesses.
create table public.entries (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.rounds (id) on delete cascade,
  room_id          uuid not null references public.rooms (id) on delete cascade,
  user_id          uuid not null,
  player_id        uuid references public.players (id) on delete set null,
  stage            int  not null default 0,        -- 0 = main submission, n>0 = guess for statement n-1
  content          text,
  target_player_id uuid references public.players (id) on delete set null,
  anonymous        boolean not null default true,
  sort_key         double precision not null default random(),  -- shuffles reveal order
  created_at       timestamptz not null default now(),
  unique (round_id, user_id, stage)
);
create index entries_round_idx on public.entries (round_id, stage);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.players where room_id = p_room and user_id = auth.uid());
$$;

alter table public.rooms             enable row level security;
alter table public.players           enable row level security;
alter table public.rounds            enable row level security;
alter table public.round_submissions enable row level security;
alter table public.entries           enable row level security;
alter table public.prompts           enable row level security;

create policy rooms_select  on public.rooms             for select to authenticated using (public.is_room_member(id));
create policy players_select on public.players          for select to authenticated using (public.is_room_member(room_id));
create policy rounds_select on public.rounds            for select to authenticated using (public.is_room_member(room_id));
create policy subs_select   on public.round_submissions for select to authenticated using (public.is_room_member(room_id));
create policy entries_own   on public.entries           for select to authenticated using (user_id = auth.uid());
create policy prompts_read  on public.prompts           for select to authenticated using (true);

-- No insert/update/delete policies exist => direct writes are impossible.
-- Also strip table privileges so that is true even if someone adds a policy by mistake.
revoke all on public.rooms, public.players, public.rounds, public.round_submissions,
              public.entries, public.prompts from anon, authenticated, public;
grant select on public.rooms, public.players, public.rounds, public.round_submissions,
                public.entries, public.prompts to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes respects the RLS policies above)
-- ---------------------------------------------------------------------------
alter table public.players           replica identity full;
alter table public.round_submissions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.rooms, public.players, public.rounds, public.round_submissions;
  end if;
end $$;
