-- Afterhours — "Hot Takes" (18+): a steamy agree / disagree game.
--
-- Everyone secretly votes Agree or Disagree on a spicy, adult take. The room sees the split;
-- individual votes stay private, EXCEPT a "lone wolf" (the only person on one side, against two
-- or more) who is called out by name. Always uses the spicy deck, and only joins "The Room
-- Decides" rotation in spicy / mixed rooms.

alter table public.rounds  drop constraint if exists rounds_game_check;
alter table public.prompts drop constraint if exists prompts_game_check;
alter table public.rounds  add constraint rounds_game_check  check (game in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test', 'hot_takes'));
alter table public.prompts add constraint prompts_game_check check (game in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test', 'hot_takes'));


create or replace function public._min_players(p_game text)
returns int language sql immutable
as $$ select case when p_game in ('most_likely', 'friendship_test', 'hot_takes') then 3 else 2 end $$;

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

create or replace function public._next_game(p_room uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_last text;
  v_game text;
  v_vibe text;
begin
  select vibe into v_vibe from public.rooms where id = p_room;
  select game into v_last from public.rounds where room_id = p_room order by round_no desc limit 1;
  select g into v_game
    from unnest(array['most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test', 'hot_takes']) g
    where g <> 'hot_takes' or v_vibe in ('spicy', 'mixed')
   order by (select count(*) from public.rounds r where r.room_id = p_room and r.game = g),
            (g = coalesce(v_last, '')),
            random()
   limit 1;
  return v_game;
end $$;

create or replace function public._create_round(p_room uuid, p_game text, p_series_no int, p_series_total int)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_room   public.rooms;
  v_prompt public.prompts;
  v_round  public.rounds;
  v_vibe   text;
begin
  select * into v_room from public.rooms where id = p_room;
  v_vibe := case when p_game = 'hot_takes' then 'spicy' else v_room.vibe end;

  -- Fresh prompt matching the vibe; fall back to repeats, then to any vibe.
  select * into v_prompt from public.prompts p
   where p.game = p_game and (v_vibe = 'mixed' or p.vibe = v_vibe)
     and not exists (select 1 from public.rounds r where r.room_id = v_room.id and r.prompt_id = p.id)
   order by random() limit 1;
  if not found then
    select * into v_prompt from public.prompts p
     where p.game = p_game and (v_vibe = 'mixed' or p.vibe = v_vibe)
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
  v_ag     int;
  v_dis    int;
  v_lone   uuid;
  v_side   text;
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

    elsif r.game = 'hot_takes' then
      select count(*) filter (where content = 'agree')::int, count(*) filter (where content = 'disagree')::int
        into v_ag, v_dis
        from public.entries where round_id = r.id and stage = 0;
      -- A lone wolf (the only one on their side, against 2+ others) is outed: that's the fun part.
      if v_ag = 1 and v_dis >= 2 then v_side := 'agree';
      elsif v_dis = 1 and v_ag >= 2 then v_side := 'disagree';
      end if;
      if v_side is not null then
        select player_id into v_lone from public.entries
         where round_id = r.id and stage = 0 and content = v_side limit 1;
      end if;
      update public.rounds
         set phase = 'reveal',
             payload = jsonb_build_object('agree', v_ag, 'disagree', v_dis, 'total_votes', v_n,
                                          'lone_wolf', v_lone, 'lone_side', v_side)
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

  if r.game = 'hot_takes' then
    v_content := lower(v_content);
    if v_content not in ('agree', 'disagree') then raise exception 'invalid_content'; end if;
    v_target := null;
    v_anon := true;
  elsif r.game in ('most_likely', 'friendship_test') or v_stage > 0 then
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
  if v_game not in ('most_likely', 'confessions', 'truth_or_spill', 'guess_who', 'friendship_test', 'hot_takes') then
    raise exception 'invalid_game';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count < public._min_players(v_game) then raise exception 'not_enough_players'; end if;

  v_id := public._create_round(v_room.id, v_game, 1, v_room.rounds_per_game);
  update public.rooms set auto_rotate = v_auto where id = v_room.id;
  return v_id;
end $$;


revoke all on function public._create_round(uuid, text, int, int), public.start_round(text, text)
  from public, anon, authenticated;
grant execute on function public.start_round(text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Hot Takes prompts (all spicy, adults only)
-- ---------------------------------------------------------------------------
insert into public.prompts (game, vibe, text) values
('hot_takes','spicy','Kissing in the first five minutes of a date is a green light, not a red flag.'),
('hot_takes','spicy','Texting "u up?" at 2am works more often than anyone admits.'),
('hot_takes','spicy','Chemistry matters more than compatibility.'),
('hot_takes','spicy','Sleeping with an ex is never a good idea. It is, however, a very tempting one.'),
('hot_takes','spicy','You can tell how someone is in bed from how they kiss.'),
('hot_takes','spicy','A hickey is still hot, and anyone who says otherwise is lying.'),
('hot_takes','spicy','Lights on beats lights off.'),
('hot_takes','spicy','Morning intimacy is better than night-time intimacy.'),
('hot_takes','spicy','Sexting someone you have not met yet is perfectly reasonable.'),
('hot_takes','spicy','Everyone here has had a crush on at least one person in this room.'),
('hot_takes','spicy','Jealousy is attractive. In small doses.'),
('hot_takes','spicy','Confidence is sexier than looks.'),
('hot_takes','spicy','Making the first move is the hottest thing a person can do.'),
('hot_takes','spicy','Dirty talk is awkward unless you commit to it completely.'),
('hot_takes','spicy','A one-night stand is better when you never see each other again.'),
('hot_takes','spicy','Friends with benefits always ends in feelings, always.'),
('hot_takes','spicy','A great neck kiss beats almost anything else.'),
('hot_takes','spicy','Matching energy in bed matters more than matching experience.'),
('hot_takes','spicy','Public displays of affection are hotter when it is a little risky.'),
('hot_takes','spicy','Roleplay is fun, but nobody has an honest answer on whether they have tried it.'),
('hot_takes','spicy','A bad kisser is a deal breaker, no second chances.'),
('hot_takes','spicy','Someone in a really good suit or dress is hotter than someone in lingerie.'),
('hot_takes','spicy','It is okay to have a type, and it is okay to be shallow about it.'),
('hot_takes','spicy','The best chemistry starts as an argument.'),
('hot_takes','spicy','Everyone has a secret kink they have never told a partner.'),
('hot_takes','spicy','Being teased all day is better than getting it straight away.'),
('hot_takes','spicy','Tipsy flirting is more honest than sober flirting.'),
('hot_takes','spicy','Your most memorable night happened with someone you barely knew.'),
('hot_takes','spicy','Lingering eye contact says more than any line you can say.'),
('hot_takes','spicy','If you can not hold a conversation, you can not hold my attention in bed either.'),
('hot_takes','spicy','Slow and sensual beats fast and wild.'),
('hot_takes','spicy','Sending a risky photo is fine as long as your face is not in it.');


-- ---------------------------------------------------------------------------
-- Hot Takes — couples edition (bolder, frank, still not graphic)
-- ---------------------------------------------------------------------------
insert into public.prompts (game, vibe, text) values
('hot_takes','spicy','Couples who say they never fantasise about anyone else are lying.'),
('hot_takes','spicy','Telling your partner exactly what you want in bed is hotter than hoping they guess.'),
('hot_takes','spicy','Being a little rough is hot, as long as you both want it.'),
('hot_takes','spicy','Spontaneous beats scheduled. A date night "for sex" kills the mood.'),
('hot_takes','spicy','Making out in a car like teenagers never gets old.'),
('hot_takes','spicy','The honeymoon phase is the best sex you will ever have.'),
('hot_takes','spicy','Once you are comfortable, the sex gets better, not boring.'),
('hot_takes','spicy','A partner who wants you in the middle of the day is the biggest turn-on there is.'),
('hot_takes','spicy','Sleeping in the same bed with no clothes on is the real relationship goal.'),
('hot_takes','spicy','Shower together is overrated. It looks hotter in movies.'),
('hot_takes','spicy','Being dominant in bed and being a pushover in real life can absolutely go together.'),
('hot_takes','spicy','Hearing your name moaned is the best compliment there is.'),
('hot_takes','spicy','Wanting your partner to be a little possessive is fine. Healthy, even.'),
('hot_takes','spicy','Teasing your partner in public when you can not do anything about it is peak foreplay.'),
('hot_takes','spicy','A massage should always end with a little more than a massage.'),
('hot_takes','spicy','Couples who never argue are not having good make-up sex.'),
('hot_takes','spicy','Telling your partner who you secretly find hot in this room is okay, if you are both honest.'),
('hot_takes','spicy','Sex toys in a relationship are a bonus, not an insult.'),
('hot_takes','spicy','Whispering something filthy in your partner''s ear in public is the best kind of mischief.'),
('hot_takes','spicy','Great sex with a bad relationship is better than good sex with a great one.'),
('hot_takes','spicy','Falling asleep right after is romantic, not rude.'),
('hot_takes','spicy','Being the one who gets chased is hotter than being the chaser.'),
('hot_takes','spicy','Role-playing a stranger meeting at a bar beats any couple''s dinner date.'),
('hot_takes','spicy','You should talk about your past partners openly. The details are half the fun.'),
('hot_takes','spicy','The best part of sex is the build-up, not the finish.'),
('hot_takes','spicy','A partner who knows exactly how to touch you without asking is worth more than a ring.'),
('hot_takes','spicy','Hotel rooms make everyone a little braver.'),
('hot_takes','spicy','You have thought about a threesome. Admit it.'),
('hot_takes','spicy','Sending your partner a filthy text in the middle of a meeting is a power move.'),
('hot_takes','spicy','Slow, deep eye contact during sex beats any position.'),
('hot_takes','spicy','Marks and scratches the next morning are a souvenir, not a problem.'),
('hot_takes','spicy','Cuddling after is more intimate than the sex itself.');
