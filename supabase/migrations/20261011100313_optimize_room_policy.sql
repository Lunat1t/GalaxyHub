alter policy "Accounts create owned rooms" on public.project_rooms with check (owner_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','false')='false');
