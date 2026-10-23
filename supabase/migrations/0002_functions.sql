-- Afterhours — game logic. Every write the client can make is one of the public RPCs below.
-- All are SECURITY DEFINER with a pinned search_path; execute is granted to `authenticated`
-- (anonymous guest sessions are `authenticated` too) and revoked from everyone else.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._uid()
returns uuid
language plpgsql stable set search_path = public
as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated'; end if;
  return v;
end $$;

create or replace function public._gen_room_code()
returns text
language plpgsql volatile set search_path = public
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(c_alphabet, 1 + floor(random() * length(c_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function public._min_players(p_game text)
returns int language sql immutable
as $$ select case when p_game = 'most_likely' then 3 else 2 end $$;

-- Which stage of submissions is currently open for this round?
-- Stage 0 = the main answer. Guess Who guesses use stage = statement index + 1.
create or replace function public._stage(r public.rounds)
returns int language sql immutable
as $$ select case when r.game = 'guess_who' and r.phase in ('guessing', 'reveal') then r.cursor + 1 else 0 end $$;

-- ---------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------

-- Moves a round to its next step. No permission check: callers (host_advance /
-- _check_complete) are responsible.
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

    if r.game = 'most_likely' then
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
      -- Shuffled (sort_key is random). Author id is only included for public Truth or Spill answers.
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

-- Auto-advances a round once every expected player has answered.
create or replace function public._check_complete(p_round uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r          public.rounds;
  v_total    int;
  v_done     int;
  v_expected int;
  v_e        public.entries;
begin
  select * into r from public.rounds where id = p_round;
  if not found then return; end if;
  select count(*) into v_total from public.players where room_id = r.room_id;
  if v_total = 0 then return; end if;

  if r.phase = 'collecting' then
    select count(*) into v_done from public.round_submissions where round_id = r.id and stage = 0;
    if v_done >= v_total and (r.game <> 'guess_who' or v_done >= 2) then
      perform public._advance(r.id);
    end if;

  elsif r.phase = 'guessing' then
    select * into v_e from public.entries where id = (r.payload -> 'order' ->> r.cursor)::uuid;
    v_expected := v_total - case when v_e.player_id is not null then 1 else 0 end;  -- the author doesn't guess
    select count(*) into v_done from public.round_submissions where round_id = r.id and stage = r.cursor + 1;
    if v_done >= v_expected then
      perform public._advance(r.id);
    end if;
  end if;
end $$;

-- Picks the least-played game in the room (never repeating the last one when avoidable).
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
    from unnest(array['most_likely', 'confessions', 'truth_or_spill', 'guess_who']) g
   order by (select count(*) from public.rounds r where r.room_id = p_room and r.game = g),
            (g = coalesce(v_last, '')),
            random()
   limit 1;
  return v_game;
end $$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------
create or replace function public.room_preview(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_room public.rooms;
begin
  perform public._uid();
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object(
    'found', true,
    'status', v_room.status,
    'player_count', (select count(*) from public.players where room_id = v_room.id),
    'host_name', (select name from public.players where room_id = v_room.id and user_id = v_room.host_user_id),
    'full', (select count(*) from public.players where room_id = v_room.id) >= 12);
end $$;

create or replace function public.create_room(p_name text, p_avatar text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_room public.rooms;
begin
  if char_length(v_name) not between 1 and 20 then raise exception 'invalid_name'; end if;
  if (select count(*) from public.rooms where host_user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.rooms (code, host_user_id) values (public._gen_room_code(), v_uid) returning * into v_room;
  insert into public.players (room_id, user_id, name, avatar)
  values (v_room.id, v_uid, v_name, coalesce(nullif(btrim(p_avatar), ''), '🌙'));
  return jsonb_build_object('code', v_room.code);
end $$;

create or replace function public.join_room(p_code text, p_name text, p_avatar text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;

  -- Already in the room (e.g. refreshed or reopened the invite link): just let them back in.
  if exists (select 1 from public.players where room_id = v_room.id and user_id = v_uid) then
    return jsonb_build_object('code', v_room.code);
  end if;

  if char_length(v_name) not between 1 and 20 then raise exception 'invalid_name'; end if;
  if (select count(*) from public.players where room_id = v_room.id) >= 12 then raise exception 'room_full'; end if;

  begin
    insert into public.players (room_id, user_id, name, avatar)
    values (v_room.id, v_uid, v_name, coalesce(nullif(btrim(p_avatar), ''), '🌙'));
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  return jsonb_build_object('code', v_room.code);
end $$;

-- Everything the client renders, in one consistent snapshot. Never includes
-- other players' private entries.
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
      v_round := jsonb_build_object(
        'id', r.id, 'round_no', r.round_no, 'game', r.game, 'prompt', r.prompt,
        'phase', r.phase, 'cursor', r.cursor,
        'payload', r.payload - 'order',      -- entry ids are never needed client-side
        'is_my_statement', v_is_mine);
    end if;
  end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status, 'vibe', v_room.vibe,
      'auto_rotate', v_room.auto_rotate, 'reveal_author', v_room.reveal_author,
      'round_count', v_room.round_count),
    'me', jsonb_build_object('id', v_me.id, 'name', v_me.name, 'avatar', v_me.avatar,
                             'is_host', v_me.user_id = v_room.host_user_id),
    'players', v_players,
    'round', v_round,
    'submitted', v_subs,
    'my_entry', v_mine);
end $$;

create or replace function public.leave_room(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_room public.rooms;
  v_me   public.players;
  v_next uuid;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then return; end if;
  select * into v_me from public.players where room_id = v_room.id and user_id = v_uid;
  if not found then return; end if;

  delete from public.players where id = v_me.id;

  select user_id into v_next from public.players where room_id = v_room.id order by joined_at limit 1;
  if v_next is null then
    delete from public.rooms where id = v_room.id;
    return;
  end if;
  if v_room.host_user_id = v_uid then
    update public.rooms set host_user_id = v_next where id = v_room.id;   -- host migration
  end if;
  update public.rooms set updated_at = now() where id = v_room.id;
  if v_room.current_round_id is not null then
    perform public._check_complete(v_room.current_round_id);
  end if;
end $$;

create or replace function public.kick_player(p_code text, p_player uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_room public.rooms;
  v_t    public.players;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'not_host'; end if;
  select * into v_t from public.players where id = p_player and room_id = v_room.id;
  if not found then raise exception 'player_not_found'; end if;
  if v_t.user_id = v_uid then raise exception 'cannot_kick_self'; end if;

  delete from public.players where id = v_t.id;
  update public.rooms set updated_at = now() where id = v_room.id;
  if v_room.current_round_id is not null then
    perform public._check_complete(v_room.current_round_id);
  end if;
end $$;

create or replace function public.update_settings(p_code text, p_vibe text default null, p_reveal_author boolean default null)
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
  if p_vibe is not null and p_vibe not in ('fun', 'romantic', 'spicy', 'mixed') then raise exception 'invalid_vibe'; end if;

  update public.rooms
     set vibe = coalesce(p_vibe, vibe),
         reveal_author = coalesce(p_reveal_author, reveal_author),
         updated_at = now()
   where id = v_room.id;
end $$;

-- Host starts a round. p_game = null / 'room_decides' lets the room pick (and keeps auto-rotating).
create or replace function public.start_round(p_code text, p_game text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := public._uid();
  v_room   public.rooms;
  v_game   text;
  v_auto   boolean;
  v_prompt public.prompts;
  v_round  public.rounds;
  v_count  int;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'not_host'; end if;

  v_auto := p_game is null or p_game = 'room_decides';
  v_game := case when v_auto then public._next_game(v_room.id) else p_game end;
  if v_game not in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who') then raise exception 'invalid_game'; end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count < public._min_players(v_game) then raise exception 'not_enough_players'; end if;

  -- Fresh prompt matching the vibe; fall back to repeats, then to any vibe.
  select * into v_prompt from public.prompts p
   where p.game = v_game and (v_room.vibe = 'mixed' or p.vibe = v_room.vibe)
     and not exists (select 1 from public.rounds r where r.room_id = v_room.id and r.prompt_id = p.id)
   order by random() limit 1;
  if not found then
    select * into v_prompt from public.prompts p
     where p.game = v_game and (v_room.vibe = 'mixed' or p.vibe = v_room.vibe)
     order by random() limit 1;
  end if;
  if not found then
    select * into v_prompt from public.prompts p where p.game = v_game order by random() limit 1;
  end if;
  if not found then raise exception 'no_prompts'; end if;

  insert into public.rounds (room_id, round_no, game, prompt_id, prompt)
  values (v_room.id, v_room.round_count + 1, v_game, v_prompt.id, v_prompt.text)
  returning * into v_round;

  update public.rooms
     set status = 'playing', current_round_id = v_round.id, round_count = v_room.round_count + 1,
         auto_rotate = v_auto, updated_at = now()
   where id = v_room.id;
  return v_round.id;
end $$;

-- Host pushes the round forward (force reveal, next confession, next statement…).
create or replace function public.host_advance(p_code text)
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
  if v_room.current_round_id is null then raise exception 'no_active_round'; end if;
  perform public._advance(v_room.current_round_id);
end $$;

create or replace function public.end_game(p_code text)
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
  update public.rooms set status = 'lobby', current_round_id = null, updated_at = now() where id = v_room.id;
end $$;

-- One RPC for every kind of player input:
--   Most Likely vote            -> p_target
--   Confession                  -> p_content
--   Truth or Spill answer       -> p_content + p_anonymous
--   Guess Who statement         -> p_content
--   Guess Who guess             -> p_target
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

  if r.game = 'most_likely' or v_stage > 0 then
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

-- Housekeeping: run from pg_cron / a scheduled function (service role only).
create or replace function public.cleanup_stale_rooms(p_older_than interval default interval '1 day')
returns int
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  delete from public.rooms where updated_at < now() - p_older_than;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges: nothing is callable by default; open up only the public API.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_room_member(uuid) to authenticated;   -- used inside RLS policies
grant execute on function public.room_preview(text) to authenticated;
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.get_room_state(text) to authenticated;
grant execute on function public.leave_room(text) to authenticated;
grant execute on function public.kick_player(text, uuid) to authenticated;
grant execute on function public.update_settings(text, text, boolean) to authenticated;
grant execute on function public.start_round(text, text) to authenticated;
grant execute on function public.host_advance(text) to authenticated;
grant execute on function public.end_game(text) to authenticated;
grant execute on function public.submit_entry(text, text, uuid, boolean) to authenticated;
