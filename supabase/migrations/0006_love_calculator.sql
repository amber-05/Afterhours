-- Afterhours — real name-based love calculator.
--
-- Replaces the hash-based score with two classic folk methods, so the result can be reproduced by hand:
--   1. TRUE LOVE count: tally the letters T,R,U,E,L,O,V,E across both names (8 numbers), then keep adding
--      neighbouring numbers (last digit only) until two digits remain. Those two digits are the percentage.
--   2. FLAMES: cross out letters the names share, count what's left, then eliminate F-L-A-M-E-S in a
--      circle by that count. The last letter standing: Friends, Lovers, Affection, Marriage, Enemies, Siblings.
-- Both are symmetric (name order doesn't matter). They're traditional name games, just for fun.

alter table public.crush_entries add column if not exists verdict text;

create or replace function public._clean(p text)
returns text
language sql immutable set search_path = public
as $$ select regexp_replace(lower(coalesce(p, '')), '[^a-z]', '', 'g') $$;

create or replace function public._compat(p_a text, p_b text)
returns jsonb
language plpgsql immutable set search_path = public
as $$
declare
  a         text := public._clean(p_a);
  b         text := public._clean(p_b);
  v_both    text;
  v_letters text[] := array['t', 'r', 'u', 'e', 'l', 'o', 'v', 'e'];
  v_counts  int[] := '{}';
  v_cur     int[];
  v_next    int[];
  v_rows    jsonb;
  v_score   int;
  v_ch      text;
  v_remain  int := 0;
  v_n       int;
  v_flames  text[] := array['F', 'L', 'A', 'M', 'E', 'S'];
  v_order   text[] := '{}';
  v_idx     int := 0;
  v_code    text;
  i         int;
begin
  if a = '' or b = '' then raise exception 'invalid_names'; end if;
  v_both := a || b;

  -- True Love count
  foreach v_ch in array v_letters loop
    v_counts := v_counts || (length(v_both) - length(replace(v_both, v_ch, '')));
  end loop;
  v_cur := v_counts;
  v_rows := jsonb_build_array(to_jsonb(v_cur));
  while array_length(v_cur, 1) > 2 loop
    v_next := '{}';
    for i in 1 .. array_length(v_cur, 1) - 1 loop
      v_next := v_next || ((v_cur[i] + v_cur[i + 1]) % 10);
    end loop;
    v_cur := v_next;
    v_rows := v_rows || jsonb_build_array(to_jsonb(v_cur));
  end loop;
  v_score := v_cur[1] * 10 + v_cur[2];

  -- FLAMES
  for v_ch in select chr(c) from generate_series(97, 122) c loop
    v_remain := v_remain + abs((length(a) - length(replace(a, v_ch, ''))) - (length(b) - length(replace(b, v_ch, ''))));
  end loop;
  v_n := case when v_remain = 0 then length(a) else v_remain end;   -- identical names: fall back to the name length
  while array_length(v_flames, 1) > 1 loop
    v_idx := (v_idx + v_n - 1) % array_length(v_flames, 1);
    v_order := v_order || v_flames[v_idx + 1];
    v_flames := v_flames[1:v_idx] || v_flames[v_idx + 2:array_length(v_flames, 1)];
    if v_idx >= array_length(v_flames, 1) then v_idx := 0; end if;
  end loop;
  v_code := v_flames[1];

  return jsonb_build_object(
    'score', v_score,
    'counts', to_jsonb(v_counts),
    'rows', v_rows,
    'flames', jsonb_build_object(
      'code', v_code,
      'label', case v_code when 'F' then 'Friends' when 'L' then 'Lovers' when 'A' then 'Affection'
                           when 'M' then 'Marriage' when 'E' then 'Enemies' else 'Siblings' end,
      'remaining', v_remain,
      'eliminated', to_jsonb(v_order)));
end $$;

create or replace function public.submit_crush(p_slug text, p_your_name text, p_crush_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := public._uid();
  v_l     public.crush_links;
  v_me    text := btrim(coalesce(p_your_name, ''));
  v_crush text := btrim(coalesce(p_crush_name, ''));
  v_res   jsonb;
begin
  if char_length(v_me) not between 1 and 30 or char_length(v_crush) not between 1 and 30 then
    raise exception 'invalid_names';
  end if;
  select * into v_l from public.crush_links where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then raise exception 'link_not_found'; end if;
  if v_l.owner_user_id = v_uid then raise exception 'own_link'; end if;

  if (select count(*) from public.crush_entries
       where link_id = v_l.id and submitter_user_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'slow_down';
  end if;
  if (select count(*) from public.crush_entries
       where link_id = v_l.id and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'inbox_busy';
  end if;

  v_res := public._compat(v_me, v_crush);   -- raises invalid_names if a name has no A–Z letters
  insert into public.crush_entries (link_id, submitter_user_id, your_name, crush_name, score, verdict)
  values (v_l.id, v_uid, v_me, v_crush, (v_res ->> 'score')::int, v_res -> 'flames' ->> 'label');
  return v_res || jsonb_build_object('your_name', v_me, 'crush_name', v_crush);
end $$;

create or replace function public.list_crush_entries(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_l public.crush_links;
begin
  select * into v_l from public.crush_links
   where slug = lower(btrim(coalesce(p_slug, ''))) and owner_user_id = public._uid();
  if not found then raise exception 'link_not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'your_name', e.your_name, 'crush_name', e.crush_name,
                                        'score', e.score, 'verdict', e.verdict,
                                        'created_at', e.created_at, 'unread', e.read_at is null)
                     order by e.created_at desc)
      from (select * from public.crush_entries where link_id = v_l.id order by created_at desc limit 200) e
  ), '[]'::jsonb);
end $$;

revoke all on function public._clean(text), public._compat(text, text) from public, anon, authenticated;
