-- Afterhours — anonymous inbox ("send me anonymous messages").
--
-- Privacy model
--   * Tables are locked down completely (RLS on, no policies, no grants): everything goes through RPCs.
--   * The sender's id is stored only for rate-limiting and is never returned to anyone, including the owner.
--   * The owner is the (anonymous) auth user that created the inbox. A one-time recovery key lets them
--     reclaim it from another browser/device; only its SHA-256 hash is stored.

create table public.inboxes (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique,
  handle        text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  prompt        text not null default 'send me anonymous messages' check (char_length(prompt) between 1 and 80),
  persona_title text check (char_length(persona_title) <= 40),
  persona_alias text check (char_length(persona_alias) <= 40),
  key_hash      bytea not null,
  created_at    timestamptz not null default now()
);

create table public.inbox_messages (
  id             uuid primary key default gen_random_uuid(),
  inbox_id       uuid not null references public.inboxes (id) on delete cascade,
  sender_user_id uuid not null,
  body           text not null check (char_length(body) between 1 and 300),
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);
create index inbox_messages_inbox_idx on public.inbox_messages (inbox_id, created_at desc);
create index inbox_messages_sender_idx on public.inbox_messages (sender_user_id, inbox_id, created_at);

alter table public.inboxes        enable row level security;
alter table public.inbox_messages enable row level security;
revoke all on public.inboxes, public.inbox_messages from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_inbox(
  p_handle text, p_prompt text default null, p_persona_title text default null, p_persona_alias text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := public._uid();
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  v_key    text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
begin
  if exists (select 1 from public.inboxes where owner_user_id = v_uid) then raise exception 'inbox_exists'; end if;
  if v_handle !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid_handle'; end if;
  if v_handle in ('admin', 'api', 'room', 'rooms', 'vibe', 'inbox', 'u', 'afterhours', 'support', 'help', 'login') then
    raise exception 'handle_reserved';
  end if;

  begin
    insert into public.inboxes (owner_user_id, handle, prompt, persona_title, persona_alias, key_hash)
    values (v_uid, v_handle,
            coalesce(nullif(btrim(p_prompt), ''), 'send me anonymous messages'),
            nullif(btrim(p_persona_title), ''), nullif(btrim(p_persona_alias), ''),
            sha256(convert_to(v_key, 'UTF8')));
  exception when unique_violation then
    raise exception 'handle_taken';
  end;
  return jsonb_build_object('handle', v_handle, 'key', v_key);
end $$;

create or replace function public.get_my_inbox()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_in  public.inboxes;
begin
  select * into v_in from public.inboxes where owner_user_id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'handle', v_in.handle, 'prompt', v_in.prompt,
    'persona_title', v_in.persona_title, 'persona_alias', v_in.persona_alias,
    'total', (select count(*) from public.inbox_messages where inbox_id = v_in.id),
    'unread', (select count(*) from public.inbox_messages where inbox_id = v_in.id and read_at is null));
end $$;

create or replace function public.get_inbox_public(p_handle text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_in public.inboxes;
begin
  perform public._uid();
  select * into v_in from public.inboxes where handle = lower(btrim(coalesce(p_handle, '')));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'handle', v_in.handle, 'prompt', v_in.prompt,
                            'persona_title', v_in.persona_title, 'persona_alias', v_in.persona_alias);
end $$;

create or replace function public.update_inbox(
  p_prompt text default null, p_persona_title text default null, p_persona_alias text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public._uid();
begin
  if p_prompt is not null and char_length(btrim(p_prompt)) not between 1 and 80 then raise exception 'invalid_prompt'; end if;
  update public.inboxes
     set prompt = coalesce(nullif(btrim(p_prompt), ''), prompt),
         persona_title = coalesce(nullif(btrim(p_persona_title), ''), persona_title),
         persona_alias = coalesce(nullif(btrim(p_persona_alias), ''), persona_alias)
   where owner_user_id = v_uid;
  if not found then raise exception 'inbox_not_found'; end if;
end $$;

create or replace function public.send_message(p_handle text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_in   public.inboxes;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 1 and 300 then raise exception 'invalid_message'; end if;
  select * into v_in from public.inboxes where handle = lower(btrim(coalesce(p_handle, '')));
  if not found then raise exception 'inbox_not_found'; end if;

  -- Throttle: 5 per sender per inbox per hour, 60 per inbox per hour.
  if (select count(*) from public.inbox_messages
       where inbox_id = v_in.id and sender_user_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'slow_down';
  end if;
  if (select count(*) from public.inbox_messages
       where inbox_id = v_in.id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'inbox_busy';
  end if;

  insert into public.inbox_messages (inbox_id, sender_user_id, body) values (v_in.id, v_uid, v_body);
end $$;

-- Owner only. The sender column is deliberately never selected.
create or replace function public.list_messages(p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_in  public.inboxes;
begin
  select * into v_in from public.inboxes where owner_user_id = v_uid;
  if not found then raise exception 'inbox_not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'created_at', m.created_at,
                                        'unread', m.read_at is null) order by m.created_at desc)
      from (select * from public.inbox_messages where inbox_id = v_in.id
             order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) m
  ), '[]'::jsonb);
end $$;

create or replace function public.mark_messages_read()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.inbox_messages m set read_at = now()
   from public.inboxes i
   where m.inbox_id = i.id and i.owner_user_id = public._uid() and m.read_at is null;
end $$;

create or replace function public.delete_message(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.inbox_messages m
   using public.inboxes i
   where m.id = p_id and m.inbox_id = i.id and i.owner_user_id = public._uid();
end $$;

-- Recover an inbox on a new device/browser with the key shown at creation.
create or replace function public.claim_inbox(p_handle text, p_key text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public._uid();
  v_in  public.inboxes;
  v_key text := upper(regexp_replace(coalesce(p_key, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if exists (select 1 from public.inboxes where owner_user_id = v_uid) then raise exception 'inbox_exists'; end if;
  select * into v_in from public.inboxes where handle = lower(btrim(coalesce(p_handle, '')));
  if not found or v_in.key_hash <> sha256(convert_to(v_key, 'UTF8')) then raise exception 'invalid_key'; end if;
  update public.inboxes set owner_user_id = v_uid where id = v_in.id;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.create_inbox(text, text, text, text),
                       public.get_my_inbox(),
                       public.get_inbox_public(text),
                       public.update_inbox(text, text, text),
                       public.send_message(text, text),
                       public.list_messages(int),
                       public.mark_messages_read(),
                       public.delete_message(uuid),
                       public.claim_inbox(text, text)
  from public, anon, authenticated;

grant execute on function public.create_inbox(text, text, text, text),
                          public.get_my_inbox(),
                          public.get_inbox_public(text),
                          public.update_inbox(text, text, text),
                          public.send_message(text, text),
                          public.list_messages(int),
                          public.mark_messages_read(),
                          public.delete_message(uuid),
                          public.claim_inbox(text, text)
  to authenticated;
