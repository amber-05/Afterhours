-- Afterhours — crush compatibility links.
--
-- Flow: the owner creates a link and sends it to friends. A friend opens it, enters their own name
-- and their crush's name, and instantly gets a fun compatibility score. The link's owner sees
-- every (name, crush, score) entry in their dashboard.
--
-- The public page tells the friend, up front, that the owner will see the names they enter.
-- The submitter's account id is stored only for rate-limiting and is never returned.
-- Tables are locked down; everything goes through RPCs.

create table public.crush_links (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  slug          text not null unique check (slug ~ '^[a-z0-9]{8}$'),
  owner_name    text check (char_length(owner_name) between 1 and 30),
  label         text not null default 'Crush compatibility check' check (char_length(label) between 1 and 60),
  created_at    timestamptz not null default now()
);
create index crush_links_owner_idx on public.crush_links (owner_user_id);

create table public.crush_entries (
  id                uuid primary key default gen_random_uuid(),
  link_id           uuid not null references public.crush_links (id) on delete cascade,
  submitter_user_id uuid not null,
  your_name         text not null check (char_length(your_name) between 1 and 30),
  crush_name        text not null check (char_length(crush_name) between 1 and 30),
  score             int  not null check (score between 0 and 100),
  created_at        timestamptz not null default now(),
  read_at           timestamptz
);
create index crush_entries_link_idx on public.crush_entries (link_id, created_at desc);
create index crush_entries_sender_idx on public.crush_entries (submitter_user_id, link_id, created_at);

alter table public.crush_links   enable row level security;
alter table public.crush_entries enable row level security;
revoke all on public.crush_links, public.crush_entries from anon, authenticated, public;

-- Deterministic and symmetric: the same two names always give the same result, in either order.
-- For fun only; it is not a real measure of anything.
create or replace function public._compat(p_a text, p_b text)
returns jsonb
language sql immutable set search_path = public
as $$
  with n as (
    select lower(btrim(p_a)) as a, lower(btrim(p_b)) as b
  ), h as (
    select md5(least(a, b) || '|' || greatest(a, b)) as x from n
  )
  select jsonb_build_object(
    'score',         52 + (('x' || substr(x, 1, 6))::bit(24)::int % 48),
    'chemistry',     40 + (('x' || substr(x, 7, 6))::bit(24)::int % 60),
    'communication', 40 + (('x' || substr(x, 13, 6))::bit(24)::int % 60),
    'vibe',          40 + (('x' || substr(x, 19, 6))::bit(24)::int % 60))
  from h
$$;

create or replace function public.create_crush_link(p_owner_name text default null, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_slug text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  if (select count(*) from public.crush_links where owner_user_id = v_uid) >= 5 then raise exception 'too_many_links'; end if;
  insert into public.crush_links (owner_user_id, slug, owner_name, label)
  values (v_uid, v_slug, nullif(btrim(p_owner_name), ''), coalesce(nullif(btrim(p_label), ''), 'Crush compatibility check'));
  return jsonb_build_object('slug', v_slug);
end $$;

create or replace function public.list_my_crush_links()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'slug', l.slug, 'label', l.label, 'owner_name', l.owner_name, 'created_at', l.created_at,
             'total', (select count(*) from public.crush_entries e where e.link_id = l.id),
             'unread', (select count(*) from public.crush_entries e where e.link_id = l.id and e.read_at is null))
           order by l.created_at desc)
      from public.crush_links l where l.owner_user_id = public._uid()
  ), '[]'::jsonb);
end $$;

create or replace function public.get_crush_link_public(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_l public.crush_links;
begin
  perform public._uid();
  select * into v_l from public.crush_links where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'label', v_l.label, 'owner_name', v_l.owner_name);
end $$;

-- Friend submits: gets the compatibility result back immediately.
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

  v_res := public._compat(v_me, v_crush);
  insert into public.crush_entries (link_id, submitter_user_id, your_name, crush_name, score)
  values (v_l.id, v_uid, v_me, v_crush, (v_res ->> 'score')::int);
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
                                        'score', e.score, 'created_at', e.created_at, 'unread', e.read_at is null)
                     order by e.created_at desc)
      from (select * from public.crush_entries where link_id = v_l.id order by created_at desc limit 200) e
  ), '[]'::jsonb);
end $$;

create or replace function public.mark_crush_read(p_slug text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.crush_entries e set read_at = now()
    from public.crush_links l
   where e.link_id = l.id and l.owner_user_id = public._uid()
     and l.slug = lower(btrim(coalesce(p_slug, ''))) and e.read_at is null;
end $$;

create or replace function public.delete_crush_entry(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.crush_entries e using public.crush_links l
   where e.id = p_id and e.link_id = l.id and l.owner_user_id = public._uid();
end $$;

create or replace function public.delete_crush_link(p_slug text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.crush_links where slug = lower(btrim(coalesce(p_slug, ''))) and owner_user_id = public._uid();
end $$;

revoke all on function public._compat(text, text),
                       public.create_crush_link(text, text),
                       public.list_my_crush_links(),
                       public.get_crush_link_public(text),
                       public.submit_crush(text, text, text),
                       public.list_crush_entries(text),
                       public.mark_crush_read(text),
                       public.delete_crush_entry(uuid),
                       public.delete_crush_link(text)
  from public, anon, authenticated;

grant execute on function public.create_crush_link(text, text),
                          public.list_my_crush_links(),
                          public.get_crush_link_public(text),
                          public.submit_crush(text, text, text),
                          public.list_crush_entries(text),
                          public.mark_crush_read(text),
                          public.delete_crush_entry(uuid),
                          public.delete_crush_link(text)
  to authenticated;
