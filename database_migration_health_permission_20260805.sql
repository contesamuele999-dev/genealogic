-- Visibilità separata dei dati clinici (malattie ereditarie e rischio della prole).
-- Le informazioni sanitarie NON seguono la visibilità dell'albero ufficiale: hanno un
-- permesso dedicato, per default riservato al solo proprietario.
-- Eseguire una volta nel SQL Editor di Supabase.

alter table public.trees
  add column if not exists health_permission text not null default 'owner';

alter table public.trees drop constraint if exists trees_health_permission_check;
alter table public.trees add constraint trees_health_permission_check check (
  health_permission in ('owner', 'editors', 'auth', 'all')
);

comment on column public.trees.health_permission is
  'Chi può vedere i dati clinici: owner = solo proprietario/admin, editors = chi può modificare l''albero, auth = utenti registrati e approvati, all = chiunque veda l''albero.';

-- Verifica se l'utente corrente può accedere ai dati clinici di un albero.
-- Presuppone l'esistenza di public.can_read_tree e public.can_write_tree
-- (create dagli script database_setup.sql / database_migration_moderated_edits_20260803.sql).
create or replace function public.can_view_health_tree(target_tree_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trees t
    where t.id = target_tree_id
      and public.can_read_tree(t.id)
      and (
        -- Proprietario dell'albero
        t.owner_id = auth.uid()
        -- Amministratore della piattaforma
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.is_admin = true
        )
        -- Chi ha i permessi di modifica sull'albero
        or (t.health_permission = 'editors' and public.can_write_tree(t.id))
        -- Qualsiasi utente registrato e approvato
        or (t.health_permission = 'auth' and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.is_approved = true
        ))
        -- Chiunque riesca a leggere l'albero
        or t.health_permission = 'all'
      )
  );
$$;

grant execute on function public.can_view_health_tree(uuid) to anon, authenticated;
