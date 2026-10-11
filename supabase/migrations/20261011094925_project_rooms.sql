begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.project_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  invite_hash text not null check (invite_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_rooms_owner_idx on public.project_rooms(owner_id);

create table public.project_members (
  room_id uuid not null references public.project_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index project_members_user_idx on public.project_members(user_id, room_id);

create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.project_rooms(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_avatar text not null default '',
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index project_messages_room_time_idx on public.project_messages(room_id, created_at desc, id desc);
create index project_messages_author_time_idx on public.project_messages(author_id, created_at desc);

create table public.project_links (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.project_rooms(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  url text not null check (char_length(url) <= 1800 and url ~ '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now()
);
create index project_links_room_idx on public.project_links(room_id, created_at);
create index project_links_author_idx on public.project_links(added_by);

-- Narrow helpers avoid recursion in membership RLS; callers can only ask about themselves.
create function private.is_project_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.project_members where room_id=target and user_id=auth.uid()
  );
$$;
create function private.is_project_owner(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.project_rooms where id=target and owner_id=auth.uid()
  );
$$;
revoke all on function private.is_project_member(uuid), private.is_project_owner(uuid) from public, anon;
grant execute on function private.is_project_member(uuid), private.is_project_owner(uuid) to authenticated;

alter table public.project_rooms enable row level security;
alter table public.project_members enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_links enable row level security;
revoke all on public.project_rooms, public.project_members, public.project_messages, public.project_links from anon, authenticated;
grant select (id, owner_id, name, description, created_at, updated_at) on public.project_rooms to authenticated;
grant insert (owner_id, name, description, invite_hash) on public.project_rooms to authenticated;
grant update (name, description, invite_hash) on public.project_rooms to authenticated;
grant select, delete on public.project_members to authenticated;
grant select on public.project_messages to authenticated;
grant insert (id, room_id, author_id, content) on public.project_messages to authenticated;
grant select, delete on public.project_links to authenticated;
grant insert (room_id, added_by, label, url) on public.project_links to authenticated;

create policy "Room members read rooms" on public.project_rooms for select to authenticated
using (owner_id=(select auth.uid()) or private.is_project_member(id));
create policy "Accounts create owned rooms" on public.project_rooms for insert to authenticated
with check (owner_id=(select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy "Owners update rooms" on public.project_rooms for update to authenticated
using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy "Members read participants" on public.project_members for select to authenticated
using (user_id=(select auth.uid()) or private.is_project_member(room_id));
create policy "Members leave and owners remove" on public.project_members for delete to authenticated
using ((user_id=(select auth.uid()) or private.is_project_owner(room_id)) and
  user_id <> (select owner_id from public.project_rooms where id=room_id));
create policy "Members read messages" on public.project_messages for select to authenticated
using (private.is_project_member(room_id));
create policy "Members write own messages" on public.project_messages for insert to authenticated
with check (author_id=(select auth.uid()) and private.is_project_member(room_id));
create policy "Members read links" on public.project_links for select to authenticated
using (private.is_project_member(room_id));
create policy "Members add own links" on public.project_links for insert to authenticated
with check (added_by=(select auth.uid()) and private.is_project_member(room_id));
create policy "Authors or owners remove links" on public.project_links for delete to authenticated
using (private.is_project_member(room_id) and (added_by=(select auth.uid()) or private.is_project_owner(room_id)));

create function private.add_project_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.project_rooms where owner_id=new.owner_id)>20 then
    raise exception 'Room limit reached' using errcode='23514';
  end if;
  insert into public.project_members(room_id,user_id) values(new.id,new.owner_id);
  return new;
end;
$$;
revoke all on function private.add_project_owner() from public, anon, authenticated;
create trigger project_owner_created after insert on public.project_rooms for each row execute function private.add_project_owner();
create trigger project_room_updated before update on public.project_rooms for each row execute function public.touch_profile();

create function private.prepare_project_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare author public.profiles;
begin
  if auth.uid() is null or new.author_id is distinct from auth.uid() or not private.is_project_member(new.room_id) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.author_id::text,0));
  if exists(select 1 from public.project_messages where author_id=new.author_id and created_at>clock_timestamp()-interval '750 milliseconds') then
    raise exception 'Messages sent too frequently' using errcode='P0001';
  end if;
  select * into strict author from public.profiles where id=new.author_id;
  new.author_name := case when author.visible then author.name else 'Участник' end;
  new.author_avatar := case when author.visible then author.avatar else '' end;
  return new;
end;
$$;
revoke all on function private.prepare_project_message() from public, anon, authenticated;
create trigger project_message_created before insert on public.project_messages for each row execute function private.prepare_project_message();

-- Joining requires a real account and an unguessable invitation. Raw tokens are never stored.
create function private.join_project_room(target uuid, token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_hash text; current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not exists(select 1 from auth.users where id=current_user_id and is_anonymous=false) then
    raise exception 'Account required' using errcode='42501';
  end if;
  if token is null or token !~ '^[A-Za-z0-9_-]{32}$' then raise exception 'Invalid invitation' using errcode='42501'; end if;
  select invite_hash into saved_hash from public.project_rooms where id=target for update;
  if saved_hash is null or saved_hash <> encode(sha256(convert_to(token,'UTF8')),'hex') then
    raise exception 'Invalid invitation' using errcode='42501';
  end if;
  if not exists(select 1 from public.project_members where room_id=target and user_id=current_user_id) then
    if (select count(*) from public.project_members where room_id=target)>=50 then raise exception 'Room is full' using errcode='23514'; end if;
    insert into public.project_members(room_id,user_id) values(target,current_user_id);
  end if;
  return target;
end;
$$;
revoke all on function private.join_project_room(uuid,text) from public, anon;
grant execute on function private.join_project_room(uuid,text) to authenticated;
create function public.join_project_room(room_id uuid, invite_token text) returns uuid
language sql security invoker set search_path = '' as $$ select private.join_project_room(room_id,invite_token); $$;
revoke all on function public.join_project_room(uuid,text) from public, anon;
grant execute on function public.join_project_room(uuid,text) to authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.project_members,public.project_messages,public.project_links;
  end if;
end;
$$;

commit;
