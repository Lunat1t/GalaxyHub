begin;

create function public.valid_profile_interests(items text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(items) <= 10 and not exists (
    select 1 from unnest(items) as item
    where item is null or char_length(btrim(item)) not between 1 and 40
  );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  avatar text not null default '👤' check (avatar in ('👤', '👩‍💻', '👨‍💻', '🤖', '🐱', '🚀')),
  bio text not null default '' check (char_length(bio) <= 300),
  interests text[] not null default '{}' check (public.valid_profile_interests(interests)),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, avatar, bio, interests, visible) on public.profiles to authenticated;

create policy "Read own or visible profiles" on public.profiles for select to authenticated
using ((select auth.uid()) = id or visible = true);
create policy "Update own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 50), ''), 'Участник'));
  return new;
end;
$$;
revoke all on function public.create_profile_for_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_user();

create function public.touch_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger on_profile_updated before update on public.profiles
for each row execute function public.touch_profile();

-- Accounts that existed before this migration also receive a profile.
insert into public.profiles (id, name)
select id, coalesce(nullif(left(btrim(raw_user_meta_data ->> 'name'), 50), ''), 'Участник')
from auth.users on conflict (id) do nothing;

commit;
