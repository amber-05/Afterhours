-- Afterhours — multi-round "series" + the Friendship Test game.
--
--  * rooms.rounds_per_game (1, 3, 4 or 5): the host chooses how many rounds each game runs for.
--    After a round ends, the host (or the auto-rotate countdown) continues the series with
--    next_in_series(); when the series is over the room moves on as before.
--  * New game `friendship_test`: an emotional statement ("Who would you trust with your biggest
--    secret?"); everyone picks one friend privately. The group sees only totals. A mutual pick
--    (A picked B and B picked A) is revealed ONLY to those two people, never publicly, and a
--    non-mutual pick is never revealed to anyone.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.rounds  drop constraint if exists rounds_game_check;
alter table public.prompts drop constraint if exists prompts_game_check;
alter table public.rounds  add constraint rounds_game_check
  check (game in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test'));
alter table public.prompts add constraint prompts_game_check
  check (game in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test'));

alter table public.rooms  add column if not exists rounds_per_game int not null default 3;
alter table public.rooms  drop constraint if exists rooms_rounds_per_game_check;
alter table public.rooms  add constraint rooms_rounds_per_game_check check (rounds_per_game in (1, 3, 4, 5));
alter table public.rounds add column if not exists series_no    int not null default 1;
alter table public.rounds add column if not exists series_total int not null default 1;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._min_players(p_game text)
returns int language sql immutable
as $$ select case when p_game in ('most_likely', 'friendship_test') then 3 else 2 end $$;

create or replace function public._next_game(p_room uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_last text;
  v_game text;
begin
  select game into v_last from public.rounds where room_id = p_room order by round_no desc limit 1;
  select g into v_game
    from unnest(array['most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test']) g
   order by (select count(*) from public.rounds r where r.room_id = p_room and r.game = g),
            (g = coalesce(v_last, '')),
            random()
   limit 1;
  return v_game;
end $$;

-- Creates a round (any game, any position in a series) and makes it the room's current round.
-- Caller must already hold the room lock and have checked host rights + player count.
create or replace function public._create_round(p_room uuid, p_game text, p_series_no int, p_series_total int)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_room   public.rooms;
  v_prompt public.prompts;
  v_round  public.rounds;
begin
  select * into v_room from public.rooms where id = p_room;

  -- Fresh prompt matching the vibe; fall back to repeats, then to any vibe.
  select * into v_prompt from public.prompts p
   where p.game = p_game and (v_room.vibe = 'mixed' or p.vibe = v_room.vibe)
     and not exists (select 1 from public.rounds r where r.room_id = v_room.id and r.prompt_id = p.id)
   order by random() limit 1;
  if not found then
    select * into v_prompt from public.prompts p
     where p.game = p_game and (v_room.vibe = 'mixed' or p.vibe = v_room.vibe)
     order by random() limit 1;
  end if;
  if not found then
    select * into v_prompt from public.prompts p where p.game = p_game order by random() limit 1;
  end if;
  if not found then raise exception 'no_prompts'; end if;

  insert into public.rounds (room_id, round_no, game, prompt_id, prompt, series_no, series_total)
  values (v_room.id, v_room.round_count + 1, p_game, v_prompt.id, v_prompt.text, p_series_no, p_series_total)
  returning * into v_round;

  update public.rooms
     set status = 'playing', current_round_id = v_round.id, round_count = v_room.round_count + 1, updated_at = now()
   where id = v_room.id;
  return v_round.id;
end $$;

-- ---------------------------------------------------------------------------
-- State machine: friendship_test reveals exactly like most_likely
-- ---------------------------------------------------------------------------
create or replace function public._advance(p_round uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r        public.rounds;
  v_room   public.rooms;
  v_n      int;
  v_items  jsonb;
  v_tally  jsonb;
  v_win    jsonb;
  v_order  jsonb;
  v_e      public.entries;
  v_correct jsonb;
  v_res    jsonb;
  v_text   text;
  v_scores jsonb;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found then raise exception 'no_active_round'; end if;
  select * into v_room from public.rooms where id = r.room_id;

  if r.phase = 'collecting' then
    select count(*) into v_n from public.entries where round_id = r.id and stage = 0;
    if v_n = 0 then raise exception 'nothing_to_reveal'; end if;

    if r.game in ('most_likely', 'friendship_test') then
      select coalesce(jsonb_agg(jsonb_build_object('player_id', t.pid, 'votes', t.c) order by t.c desc, t.pid), '[]')
        into v_tally
        from (select target_player_id pid, count(*)::int c
                from public.entries
               where round_id = r.id and stage = 0 and target_player_id is not null
               group by 1) t;
      select coalesce(jsonb_agg(e -> 'player_id'), '[]') into v_win
        from jsonb_array_elements(v_tally) e
       where jsonb_array_length(v_tally) > 0
         and (e ->> 'votes')::int = (v_tally -> 0 ->> 'votes')::int;
      update public.rounds
         set phase = 'reveal',
             payload = jsonb_build_object('tally', v_tally, 'winners', v_win, 'total_votes', v_n)
       where id = r.id;

    elsif r.game in ('confessions', 'truth_or_spill') then
      select jsonb_agg(jsonb_build_object(
               'text', e.content,
               'player_id', case when r.game = 'truth_or_spill' and not e.anonymous then e.player_id end)
             order by e.sort_key)
        into v_items
        from public.entries e where e.round_id = r.id and e.stage = 0;
      update public.rounds
         set phase = 'reveal', cursor = 1, payload = jsonb_build_object('items', v_items)
       where id = r.id;

    elsif r.game = 'guess_who' then
      if v_n < 2 then raise exception 'not_enough_statements'; end if;
      select jsonb_agg(e.id order by e.sort_key) into v_order
        from public.entries e where e.round_id = r.id and e.stage = 0;
      select e.content into v_text from public.entries e where e.id = (v_order ->> 0)::uuid;
      update public.rounds
         set phase = 'guessing', cursor = 0,
             payload = jsonb_build_object('total', v_n, 'order', v_order,
                                          'current_text', v_text, 'results', '[]'::jsonb)
       where id = r.id;
    end if;

  elsif r.phase = 'guessing' then
    select * into v_e from public.entries where id = (r.payload -> 'order' ->> r.cursor)::uuid;
    select coalesce(jsonb_agg(jsonb_build_object('player_id', t.pid, 'votes', t.c) order by t.c desc, t.pid), '[]')
      into v_tally
      from (select target_player_id pid, count(*)::int c
              from public.entries
             where round_id = r.id and stage = r.cursor + 1 and target_player_id is not null
             group by 1) t;
    select coalesce(jsonb_agg(g.player_id), '[]') into v_correct
      from public.entries g
     where g.round_id = r.id and g.stage = r.cursor + 1
       and v_e.player_id is not null and g.target_player_id = v_e.player_id
       and g.player_id is not null;
    v_res := jsonb_build_object(
      'text', v_e.content,
      'author_id', case when v_room.reveal_author then v_e.player_id end,
      'correct_ids', case when v_room.reveal_author then v_correct else '[]'::jsonb end,
      'tally', v_tally);
    update public.rounds
       set phase = 'reveal',
           payload = jsonb_set(r.payload, '{results}', coalesce(r.payload -> 'results', '[]'::jsonb) || jsonb_build_array(v_res))
     where id = r.id;

  elsif r.phase = 'reveal' then
    if r.game in ('confessions', 'truth_or_spill') then
      if r.cursor >= jsonb_array_length(r.payload -> 'items') then raise exception 'no_more_items'; end if;
      update public.rounds set cursor = cursor + 1 where id = r.id;

    elsif r.game = 'guess_who' then
      if r.cursor + 1 < (r.payload ->> 'total')::int then
        select e.content into v_text from public.entries e
         where e.id = (r.payload -> 'order' ->> (r.cursor + 1))::uuid;
        update public.rounds
           set phase = 'guessing', cursor = cursor + 1,
               payload = r.payload || jsonb_build_object('current_text', v_text)
         where id = r.id;
      else
        if v_room.reveal_author then
          select coalesce(jsonb_agg(jsonb_build_object('player_id', s.pid, 'correct', s.c) order by s.c desc, s.pid), '[]')
            into v_scores
            from (select g.player_id pid, count(*)::int c
                    from public.entries g
                    join public.entries st on st.id = (r.payload -> 'order' ->> (g.stage - 1))::uuid
                   where g.round_id = r.id and g.stage >= 1
                     and g.player_id is not null and st.player_id is not null
                     and g.target_player_id = st.player_id
                   group by 1) s;
        else
          v_scores := '[]'::jsonb;
        end if;
        update public.rounds
           set phase = 'finished', payload = r.payload || jsonb_build_object('scores', v_scores)
         where id = r.id;
      end if;
    else
      raise exception 'round_over';
    end if;

  else
    raise exception 'round_over';
  end if;

  update public.rooms set updated_at = now() where id = r.room_id;
end $$;

-- ---------------------------------------------------------------------------
-- Player input: friendship_test is a vote, like most_likely
-- ---------------------------------------------------------------------------
create or replace function public.submit_entry(
  p_code text, p_content text default null, p_target uuid default null, p_anonymous boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid     uuid := public._uid();
  v_room    public.rooms;
  v_me      public.players;
  r         public.rounds;
  v_stage   int;
  v_content text := btrim(coalesce(p_content, ''));
  v_anon    boolean := coalesce(p_anonymous, true);
  v_target  uuid := p_target;
  v_e       public.entries;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'room_not_found'; end if;
  select * into v_me from public.players where room_id = v_room.id and user_id = v_uid;
  if not found then raise exception 'not_member'; end if;
  if v_room.current_round_id is null then raise exception 'no_active_round'; end if;

  select * into r from public.rounds where id = v_room.current_round_id for update;  -- serialises submissions
  if r.phase = 'collecting' then
    v_stage := 0;
  elsif r.phase = 'guessing' and r.game = 'guess_who' then
    v_stage := r.cursor + 1;
  else
    raise exception 'not_accepting_answers';
  end if;

  if exists (select 1 from public.round_submissions where round_id = r.id and player_id = v_me.id and stage = v_stage) then
    raise exception 'already_submitted';
  end if;

  if r.game in ('most_likely', 'friendship_test') or v_stage > 0 then
    if v_target is null or v_target = v_me.id
       or not exists (select 1 from public.players where id = v_target and room_id = v_room.id) then
      raise exception 'invalid_target';
    end if;
    if v_stage > 0 then
      select * into v_e from public.entries where id = (r.payload -> 'order' ->> r.cursor)::uuid;
      if v_e.user_id = v_uid then raise exception 'author_cannot_guess'; end if;
    end if;
    v_content := null;
  else
    if char_length(v_content) not between 1 and 280 then raise exception 'invalid_content'; end if;
    v_target := null;
    if r.game <> 'truth_or_spill' then v_anon := true; end if;
  end if;

  insert into public.entries (round_id, room_id, user_id, player_id, stage, content, target_player_id, anonymous)
  values (r.id, v_room.id, v_uid, v_me.id, v_stage, nullif(v_content, ''), v_target, v_anon);
  insert into public.round_submissions (round_id, room_id, player_id, stage)
  values (r.id, v_room.id, v_me.id, v_stage);

  perform public._check_complete(r.id);
end $$;

-- ---------------------------------------------------------------------------
-- Snapshot: adds series info, rounds_per_game, and the private mutual-pick ("bond")
-- ---------------------------------------------------------------------------
create or replace function public.get_room_state(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid     uuid := public._uid();
  v_room    public.rooms;
  v_me      public.players;
  r         public.rounds;
  v_e       public.entries;
  v_stage   int;
  v_players jsonb;
  v_subs    jsonb := '[]'::jsonb;
  v_mine    jsonb;
  v_round   jsonb;
  v_is_mine boolean := false;
  v_bond    uuid;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'room_not_found'; end if;
  select * into v_me from public.players where room_id = v_room.id and user_id = v_uid;
  if not found then raise exception 'not_member'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'avatar', p.avatar,
           'is_host', p.user_id = v_room.host_user_id) order by p.joined_at), '[]')
    into v_players
    from public.players p where p.room_id = v_room.id;

  if v_room.current_round_id is not null then
    select * into r from public.rounds where id = v_room.current_round_id;
    if found then
      v_stage := public._stage(r);
      select coalesce(jsonb_agg(player_id), '[]') into v_subs
        from public.round_submissions where round_id = r.id and stage = v_stage;
      select jsonb_build_object('content', e.content, 'target_player_id', e.target_player_id, 'anonymous', e.anonymous)
        into v_mine
        from public.entries e where e.round_id = r.id and e.user_id = v_uid and e.stage = v_stage;
      if r.game = 'guess_who' and r.phase in ('guessing', 'reveal') then
        select * into v_e from public.entries where id = (r.payload -> 'order' ->> r.cursor)::uuid;
        v_is_mine := coalesce(v_e.user_id = v_uid, false);
      end if;
      -- Friendship Test: only a MUTUAL pick is ever surfaced, and only to the two people in it.
      if r.game = 'friendship_test' and r.phase = 'reveal' then
        select m.target_player_id into v_bond
          from public.entries m
          join public.entries t on t.round_id = m.round_id and t.stage = 0
                               and t.player_id = m.target_player_id
                               and t.target_player_id = m.player_id
         where m.round_id = r.id and m.user_id = v_uid and m.stage = 0;
      end if;
      v_round := jsonb_build_object(
        'id', r.id, 'round_no', r.round_no, 'game', r.game, 'prompt', r.prompt,
        'phase', r.phase, 'cursor', r.cursor,
        'series_no', r.series_no, 'series_total', r.series_total,
        'payload', r.payload - 'order',
        'is_my_statement', v_is_mine,
        'my_bond', v_bond);
    end if;
  end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status, 'vibe', v_room.vibe,
      'auto_rotate', v_room.auto_rotate, 'reveal_author', v_room.reveal_author,
      'rounds_per_game', v_room.rounds_per_game, 'round_count', v_room.round_count),
    'me', jsonb_build_object('id', v_me.id, 'name', v_me.name, 'avatar', v_me.avatar,
                             'is_host', v_me.user_id = v_room.host_user_id),
    'players', v_players,
    'round', v_round,
    'submitted', v_subs,
    'my_entry', v_mine);
end $$;

-- ---------------------------------------------------------------------------
-- Host actions
-- ---------------------------------------------------------------------------
drop function if exists public.update_settings(text, text, boolean);
create or replace function public.update_settings(
  p_code text, p_vibe text default null, p_reveal_author boolean default null, p_rounds int default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'not_host'; end if;
  if p_vibe is not null and p_vibe not in ('friendly', 'fun', 'romantic', 'spicy', 'mixed') then
    raise exception 'invalid_vibe';
  end if;
  if p_rounds is not null and p_rounds not in (1, 3, 4, 5) then raise exception 'invalid_rounds'; end if;

  update public.rooms
     set vibe = coalesce(p_vibe, vibe),
         reveal_author = coalesce(p_reveal_author, reveal_author),
         rounds_per_game = coalesce(p_rounds, rounds_per_game),
         updated_at = now()
   where id = v_room.id;
end $$;

create or replace function public.start_round(p_code text, p_game text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := public._uid();
  v_room  public.rooms;
  v_game  text;
  v_auto  boolean;
  v_count int;
  v_id    uuid;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'not_host'; end if;

  v_auto := p_game is null or p_game = 'room_decides';
  v_game := case when v_auto then public._next_game(v_room.id) else p_game end;
  if v_game not in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test') then
    raise exception 'invalid_game';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count < public._min_players(v_game) then raise exception 'not_enough_players'; end if;

  v_id := public._create_round(v_room.id, v_game, 1, v_room.rounds_per_game);
  update public.rooms set auto_rotate = v_auto where id = v_room.id;
  return v_id;
end $$;

-- Next round of the current game's series (same game, new prompt).
create or replace function public.next_in_series(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := public._uid();
  v_room  public.rooms;
  r       public.rounds;
  v_count int;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'not_host'; end if;
  if v_room.current_round_id is null then raise exception 'no_active_round'; end if;

  select * into r from public.rounds where id = v_room.current_round_id;
  if r.series_no >= r.series_total then raise exception 'series_complete'; end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count < public._min_players(r.game) then raise exception 'not_enough_players'; end if;

  return public._create_round(v_room.id, r.game, r.series_no + 1, r.series_total);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public._create_round(uuid, text, int, int),
                       public.update_settings(text, text, boolean, int),
                       public.next_in_series(text),
                       public.start_round(text, text)
  from public, anon, authenticated;
grant execute on function public.update_settings(text, text, boolean, int),
                          public.next_in_series(text),
                          public.start_round(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Prompts: Friendship Test statements + more confessions so a 5-round series stays fresh
-- ---------------------------------------------------------------------------
insert into public.prompts (game, vibe, text) values
-- ===== Friendship Test — friendly
('friendship_test','friendly','Who would you trust with your biggest secret?'),
('friendship_test','friendly','Who would you call first if your life fell apart tonight?'),
('friendship_test','friendly','Who makes you feel the most understood?'),
('friendship_test','friendly','Who would stand by you even if everyone else walked away?'),
('friendship_test','friendly','Who would tell you a hard truth, but kindly?'),
('friendship_test','friendly','Who here makes you feel safest being yourself?'),
('friendship_test','friendly','Who would you want next to you on the worst day of your life?'),
('friendship_test','friendly','Who do you feel closest to right now?'),
('friendship_test','friendly','Who do you think has been quietly carrying more than they show?'),
('friendship_test','friendly','Who would you like to spend more time with this year?'),
-- ===== Friendship Test — fun
('friendship_test','fun','Who would you trust to hold your unlocked phone?'),
('friendship_test','fun','Who would you trust to pick your outfit for the biggest day of your life?'),
('friendship_test','fun','Who would you trust to text your crush for you?'),
('friendship_test','fun','Who would you trust to plan your surprise party without ruining it?'),
('friendship_test','fun','Who would be brutally honest about your haircut?'),
('friendship_test','fun','Who would you trust to keep a secret for a whole year?'),
('friendship_test','fun','Who would you trust to drive you home after a long night?'),
('friendship_test','fun','Who would you trust with your last slice of pizza?'),
-- ===== Friendship Test — romantic
('friendship_test','romantic','Who would you trust most with your heart?'),
('friendship_test','romantic','Who would you ask for honest advice about someone you like?'),
('friendship_test','romantic','Who would you want to meet your future partner first?'),
('friendship_test','romantic','Who would you call after a breakup, no questions asked?'),
('friendship_test','romantic','Who understands your love life best?'),
('friendship_test','romantic','Who would tell you when someone is not good for you?'),
('friendship_test','romantic','Who would you want to give the speech at your wedding?'),
('friendship_test','romantic','Who do you think will always be in your life, whoever comes and goes?'),
-- ===== Friendship Test — spicy
('friendship_test','spicy','Who would keep your wildest night a secret forever?'),
('friendship_test','spicy','Who would never leak a screenshot of your chat?'),
('friendship_test','spicy','Who would cover for you without asking why?'),
('friendship_test','spicy','Who would you trust to hide your biggest mistake?'),
('friendship_test','spicy','Who would show up with no judgment at 3am?'),
('friendship_test','spicy','Who would you tell first if you did something you regret?'),
('friendship_test','spicy','Who is the most loyal when nobody is watching?'),
('friendship_test','spicy','Who in this group knows the most about you?'),

-- ===== more Confessions (for 4–5 round series)
('confessions','friendly','Confess a time you were jealous of someone in this group, then got over it.'),
('confessions','friendly','Confess something you appreciate about this group that you rarely say out loud.'),
('confessions','friendly','Confess a moment you almost reached out to a friend but did not.'),
('confessions','friendly','Confess the kindest thing a friend did for you without realising it.'),
('confessions','fun','Confess your most cringe memory from school that nobody here knows.'),
('confessions','fun','Confess the weirdest thing you have ever searched for.'),
('confessions','fun','Confess a rule you break all the time.'),
('confessions','fun','Confess the worst excuse you have used to skip plans.'),
('confessions','romantic','Confess the most embarrassing thing you did to get someone''s attention.'),
('confessions','romantic','Confess a feeling you hid because you did not want to ruin a friendship.'),
('confessions','romantic','Confess what you really thought on your last first date.'),
('confessions','romantic','Confess the song that reminds you of someone you should not text.'),
('confessions','spicy','Confess the biggest lie you told in a relationship.'),
('confessions','spicy','Confess the most reckless thing you did for someone you liked.'),
('confessions','spicy','Confess something you would deny in court.'),
('confessions','spicy','Confess a rumour about you that was actually true.');
