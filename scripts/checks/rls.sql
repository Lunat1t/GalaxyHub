-- Run as database owner. Fixtures and every write are rolled back.
-- This tests database authorization, not real email confirmation or JWT issuance.
begin;
set local statement_timeout='15s';
insert into auth.users(id,raw_user_meta_data) values
('fa110001-0000-4000-8000-000000000001','{"name":"V1 A"}'),
('fa110001-0000-4000-8000-000000000002','{"name":"V1 B"}'),
('fa110001-0000-4000-8000-000000000003','{"name":"V1 C"}');
set local role authenticated;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';
insert into public.project_rooms(owner_id,name,invite_hash)
values(auth.uid(),'V1 rollback room',encode(sha256(convert_to(repeat('a',32),'UTF8')),'hex'));
do $$ begin
  if not exists(select 1 from public.project_members where user_id=auth.uid()) then raise exception 'Owner membership missing'; end if;
  begin
    perform invite_hash from public.project_rooms;
    raise exception 'Invitation hash exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('v1.room',(select id::text from public.project_rooms where owner_id='fa110001-0000-4000-8000-000000000001'),true);
set local role authenticated;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}';
do $$ begin
  if exists(select 1 from public.project_rooms where id=current_setting('v1.room')::uuid) then raise exception 'Outsider reads room'; end if;
  begin
    insert into public.project_messages(id,room_id,author_id,content) values(gen_random_uuid(),current_setting('v1.room')::uuid,auth.uid(),'Unauthorized');
    raise exception 'Outsider writes message';
  exception when insufficient_privilege then null; end;
  begin
    perform public.join_project_room(current_setting('v1.room')::uuid,repeat('b',32));
    raise exception 'Invalid invitation accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}';
select public.join_project_room(current_setting('v1.room')::uuid,repeat('a',32));
update public.profiles set visible=false where id=auth.uid();
insert into public.project_messages(id,room_id,author_id,content) values('fa110002-0000-4000-8000-000000000001',current_setting('v1.room')::uuid,auth.uid(),'V1 message');
insert into public.project_links(room_id,added_by,label,url) values(current_setting('v1.room')::uuid,auth.uid(),'V1 link','https://example.com');
do $$ begin
  if (select author_name from public.project_messages where id='fa110002-0000-4000-8000-000000000001') <> 'Участник' then raise exception 'Hidden name disclosed'; end if;
  begin
    insert into public.project_messages(id,room_id,author_id,content) values(gen_random_uuid(),current_setting('v1.room')::uuid,'fa110001-0000-4000-8000-000000000001','Spoofed');
    raise exception 'Author spoofing accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.project_messages(id,room_id,author_id,content) values(gen_random_uuid(),current_setting('v1.room')::uuid,auth.uid(),'Too fast');
    raise exception 'Chat throttle missing' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
end $$;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';
do $$ declare affected integer; begin
  update public.profiles set name='Spoofed' where id='fa110001-0000-4000-8000-000000000002';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another profile updated'; end if;
  if exists(select 1 from public.profiles where id='fa110001-0000-4000-8000-000000000002') then raise exception 'Hidden profile disclosed'; end if;
end $$;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}';
update public.profiles set visible=true where id=auth.uid();
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';
insert into public.safety_reports(reporter_id,kind,message_id,reason,details) values(auth.uid(),'project_message','fa110002-0000-4000-8000-000000000001','spam','V1 rollback report');
do $$ begin
  if (select evidence->>'content' from public.safety_reports where reporter_id=auth.uid()) <> 'V1 message' then raise exception 'Report evidence missing'; end if;
  begin
    insert into public.safety_reports(reporter_id,kind,message_id,reason) values(auth.uid(),'project_message','fa110002-0000-4000-8000-000000000001','spam');
    raise exception 'Duplicate report accepted';
  exception when unique_violation then null; end;
  begin
    update public.safety_reports set status='resolved' where reporter_id=auth.uid();
    raise exception 'User changed report status';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),'fa110001-0000-4000-8000-000000000002');
do $$ begin
  if exists(select 1 from public.profiles where id='fa110001-0000-4000-8000-000000000002') then raise exception 'Blocked profile visible'; end if;
  if exists(select 1 from public.project_messages where id='fa110002-0000-4000-8000-000000000001') then raise exception 'Blocked message visible'; end if;
  if exists(select 1 from public.project_links where room_id=current_setting('v1.room')::uuid) then raise exception 'Blocked link visible'; end if;
  if not exists(select 1 from public.project_members where room_id=current_setting('v1.room')::uuid and user_id='fa110001-0000-4000-8000-000000000002') then raise exception 'Blocking removed membership'; end if;
end $$;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}';
do $$ begin
  if exists(select 1 from public.safety_reports where reporter_id='fa110001-0000-4000-8000-000000000001') then raise exception 'Another report disclosed'; end if;
  if exists(select 1 from public.user_blocks where blocker_id='fa110001-0000-4000-8000-000000000001') then raise exception 'Another block disclosed'; end if;
end $$;
delete from public.project_members where room_id=current_setting('v1.room')::uuid and user_id=auth.uid();
do $$ begin
  begin
    perform public.join_project_room(current_setting('v1.room')::uuid,repeat('a',32));
    raise exception 'Blocked invite accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}';
delete from public.user_blocks where blocker_id=auth.uid();
do $$ begin
  if not exists(select 1 from public.project_messages where id='fa110002-0000-4000-8000-000000000001') then raise exception 'Unblock did not restore message'; end if;
end $$;
do $$ begin
  for n in 1..9 loop
    insert into public.safety_reports(reporter_id,kind,cafe_room_id,cafe_session_id,reason) values(auth.uid(),'cafe_player','V1 rollback',n::text,'spam');
  end loop;
  begin
    insert into public.safety_reports(reporter_id,kind,cafe_room_id,cafe_session_id,reason) values(auth.uid(),'cafe_player','V1 rollback','limit','spam');
    raise exception 'Report hourly limit missing' using errcode='XX000';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),auth.uid());
    raise exception 'Self block accepted';
  exception when check_violation then null; end;
end $$;
set local request.jwt.claims='{"sub":"fa110001-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}';
do $$ begin
  begin
    insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),'fa110001-0000-4000-8000-000000000003');
    raise exception 'Anonymous account can block';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform id from public.profiles;
    raise exception 'Anon can read profiles';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'RLS assertions passed' as result,
  (select count(*) from auth.users where id in('fa110001-0000-4000-8000-000000000001','fa110001-0000-4000-8000-000000000002','fa110001-0000-4000-8000-000000000003')) as fixtures_remaining;
