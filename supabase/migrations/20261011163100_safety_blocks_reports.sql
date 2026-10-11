begin;
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Участник',
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);
create index user_blocks_target_idx on public.user_blocks(blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon,authenticated;
grant select,delete on public.user_blocks to authenticated;
grant insert(blocker_id,blocked_id) on public.user_blocks to authenticated;
create policy "Read own blocks" on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy "Create own blocks" on public.user_blocks for insert to authenticated with check(blocker_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','false')='false');
create policy "Remove own blocks" on public.user_blocks for delete to authenticated using(blocker_id=(select auth.uid()));

create function private.prepare_user_block() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.blocker_id is distinct from auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.blocker_id::text,1));
  if (select count(*) from public.user_blocks where blocker_id=new.blocker_id)>=200 then raise exception 'Block limit reached' using errcode='23514'; end if;
  select case when visible then name else 'Участник' end into new.label from public.profiles where id=new.blocked_id;
  return new;
end; $$;
revoke all on function private.prepare_user_block() from public,anon,authenticated;
create trigger user_block_created before insert on public.user_blocks for each row execute function private.prepare_user_block();

-- Restrictive policies keep existing visibility and room membership checks.
create policy "Hide blocked profiles" on public.profiles as restrictive for select to authenticated
using(id not in(select blocked_id from public.user_blocks where blocker_id=(select auth.uid())));
create policy "Hide blocked project messages" on public.project_messages as restrictive for select to authenticated
using(author_id is null or author_id not in(select blocked_id from public.user_blocks where blocker_id=(select auth.uid())));
create policy "Hide blocked project links" on public.project_links as restrictive for select to authenticated
using(added_by is null or added_by not in(select blocked_id from public.user_blocks where blocker_id=(select auth.uid())));

create table public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in('profile','project_message','project_room','project_member','cafe_message','cafe_player')),
  target_user_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.project_rooms(id) on delete set null,
  message_id uuid references public.project_messages(id) on delete set null,
  cafe_room_id text check(char_length(cafe_room_id) between 1 and 64),
  cafe_session_id text check(char_length(cafe_session_id) between 1 and 64),
  cafe_message_id uuid,
  reason text not null check(reason in('spam','harassment','offensive','other')),
  details text not null default '' check(char_length(details)<=2000),
  evidence jsonb not null default '{}' check(pg_column_size(evidence)<=12000),
  subject_key text not null,
  report_day date not null default (now() at time zone 'UTC')::date,
  status text not null default 'new' check(status in('new','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique(reporter_id,subject_key,report_day)
);
create index safety_reports_queue_idx on public.safety_reports(status,created_at);
create index safety_reports_reporter_time_idx on public.safety_reports(reporter_id,created_at desc);
create index safety_reports_target_idx on public.safety_reports(target_user_id);
create index safety_reports_room_idx on public.safety_reports(room_id);
create index safety_reports_message_idx on public.safety_reports(message_id);
alter table public.safety_reports enable row level security;
revoke all on public.safety_reports from anon,authenticated;
grant select on public.safety_reports to authenticated;
grant insert(reporter_id,kind,target_user_id,room_id,message_id,cafe_room_id,cafe_session_id,cafe_message_id,reason,details,evidence) on public.safety_reports to authenticated;
create policy "Read own reports" on public.safety_reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy "Submit own reports" on public.safety_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','false')='false');

create function private.prepare_safety_report() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.profiles; m public.project_messages; r public.project_rooms;
begin
  if new.reporter_id is distinct from auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.reporter_id::text,2));
  if (select count(*) from public.safety_reports where reporter_id=new.reporter_id and created_at>now()-interval '1 hour')>=10 then raise exception 'Report limit reached' using errcode='P0001'; end if;
  new.report_day:=(now() at time zone 'UTC')::date;
  if new.kind='profile' then
    select * into p from public.profiles where id=new.target_user_id;
    if not found or not p.visible or p.id=new.reporter_id then raise exception 'Profile unavailable' using errcode='42501'; end if;
    new.subject_key:='profile:'||p.id::text;
    new.evidence:=jsonb_build_object('name',p.name,'bio',p.bio);
    new.room_id:=null; new.message_id:=null;
  elsif new.kind='project_message' then
    select * into m from public.project_messages where id=new.message_id;
    if not found or not private.is_project_member(m.room_id) or m.author_id=new.reporter_id then raise exception 'Message unavailable' using errcode='42501'; end if;
    new.room_id:=m.room_id; new.target_user_id:=m.author_id;
    new.subject_key:='message:'||m.id::text;
    new.evidence:=jsonb_build_object('content',m.content,'author',m.author_name,'created_at',m.created_at);
  elsif new.kind='project_member' then
    if new.target_user_id is null or new.target_user_id=new.reporter_id or not private.is_project_member(new.room_id) or not exists(select 1 from public.project_members where room_id=new.room_id and user_id=new.target_user_id) then raise exception 'Member unavailable' using errcode='42501'; end if;
    select * into p from public.profiles where id=new.target_user_id;
    new.subject_key:='member:'||new.room_id::text||':'||new.target_user_id::text;
    new.evidence:=jsonb_build_object('name',case when p.visible then p.name else 'Участник' end);
    new.message_id:=null;
  elsif new.kind='project_room' then
    select * into r from public.project_rooms where id=new.room_id;
    if not found or not private.is_project_member(r.id) or r.owner_id=new.reporter_id then raise exception 'Room unavailable' using errcode='42501'; end if;
    new.target_user_id:=r.owner_id; new.message_id:=null;
    new.subject_key:='room:'||r.id::text;
    new.evidence:=jsonb_build_object('name',r.name,'description',r.description);
  else
    if new.cafe_room_id is null or new.cafe_session_id is null or (new.kind='cafe_message' and new.cafe_message_id is null) or new.target_user_id=new.reporter_id then raise exception 'Invalid Cafe context' using errcode='23514'; end if;
    new.room_id:=null; new.message_id:=null;
    new.subject_key:=new.kind||':'||new.cafe_room_id||':'||case when new.kind='cafe_message' then new.cafe_message_id::text else new.cafe_session_id end;
    -- Cafe history lives in memory. This snapshot is submitted evidence, not
    -- an automatic verdict; the reviewer must assess it as a user allegation.
    new.evidence:=jsonb_build_object('submitted_context',new.evidence);
  end if;
  if new.kind not in('cafe_message','cafe_player') then new.cafe_room_id:=null; new.cafe_session_id:=null; new.cafe_message_id:=null; end if;
  return new;
end; $$;
revoke all on function private.prepare_safety_report() from public,anon,authenticated;
create trigger safety_report_created before insert on public.safety_reports for each row execute function private.prepare_safety_report();

create or replace function private.join_project_room(target uuid, token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved_hash text; room_owner uuid; current_user_id uuid:=auth.uid();
begin
  if current_user_id is null or not exists(select 1 from auth.users where id=current_user_id and is_anonymous=false) then raise exception 'Account required' using errcode='42501'; end if;
  if token is null or token !~ '^[A-Za-z0-9_-]{32}$' then raise exception 'Invalid invitation' using errcode='42501'; end if;
  select invite_hash,owner_id into saved_hash,room_owner from public.project_rooms where id=target for update;
  if saved_hash is null or saved_hash<>encode(sha256(convert_to(token,'UTF8')),'hex') then raise exception 'Invalid invitation' using errcode='42501'; end if;
  if exists(select 1 from public.user_blocks where (blocker_id=current_user_id and blocked_id=room_owner) or (blocker_id=room_owner and blocked_id=current_user_id)) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.project_members where room_id=target and user_id=current_user_id) then
    if (select count(*) from public.project_members where room_id=target)>=50 then raise exception 'Room is full' using errcode='23514'; end if;
    insert into public.project_members(room_id,user_id) values(target,current_user_id);
  end if;
  return target;
end; $$;
commit;
