-- Migrazione non distruttiva per database Genealogic già esistenti.
-- Applicare nell'editor SQL di Supabase. Non elimina dati.

begin;

revoke update on table public.profiles from authenticated;
grant update (first_name, last_name) on table public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('genealogic-first-user'));
  select not exists (select 1 from public.profiles) into is_first_user;

  insert into public.profiles (id, first_name, last_name, is_approved, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    is_first_user,
    is_first_user
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.approve_user(target_user_id uuid)
returns void as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Operazione riservata agli amministratori';
  end if;

  update public.profiles
  set is_approved = true
  where id = target_user_id;

  if not found then
    raise exception 'Utente non trovato';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.approve_user(uuid) from public;
grant execute on function public.approve_user(uuid) to authenticated;

create or replace function public.can_read_tree(tree_id uuid)
returns boolean as $$
declare
  t_visibility text;
  t_owner uuid;
begin
  select visibility, owner_id
  into t_visibility, t_owner
  from public.trees
  where id = tree_id;

  return (
    t_visibility = 'public'
    or (
      t_visibility = 'restricted'
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and is_approved = true
      )
    )
    or t_owner = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.can_write_tree(tree_id uuid)
returns boolean as $$
declare
  t_owner uuid;
  t_edit_perm text;
begin
  select owner_id, edit_permission
  into t_owner, t_edit_perm
  from public.trees
  where id = tree_id;

  return (
    t_owner = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
    or (
      t_edit_perm = 'auth'
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and is_approved = true
      )
    )
    or exists (
      select 1 from public.tree_editors
      where tree_editors.tree_id = $1 and tree_editors.user_id = auth.uid()
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

drop policy if exists "Lettura alberi basata su visibilità" on public.trees;
create policy "Lettura alberi basata su visibilità"
  on public.trees for select
  using (
    visibility = 'public'
    or (
      visibility = 'restricted'
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and is_approved = true
      )
    )
    or owner_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Modifica alberi riservata ai proprietari" on public.trees;
create policy "Modifica alberi riservata ai proprietari"
  on public.trees for update
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Cancellazione alberi riservata ai proprietari" on public.trees;
create policy "Cancellazione alberi riservata ai proprietari"
  on public.trees for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Gestione editori riservata al proprietario dell'albero" on public.tree_editors;
create policy "Gestione editori riservata al proprietario dell'albero"
  on public.tree_editors for all
  to authenticated
  using (
    exists (
      select 1 from public.trees
      where trees.id = tree_editors.tree_id and trees.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.trees
      where trees.id = tree_editors.tree_id and trees.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

commit;
