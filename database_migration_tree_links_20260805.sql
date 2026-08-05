-- Innesti fra alberi genealogici.
-- Permette a un utente di creare un proprio albero (il "ramo") e agganciarlo a una
-- persona dell'albero di un altro utente, dichiarando che si tratta della stessa
-- persona reale. I due alberi restano distinti e ciascuno resta di proprietà del suo
-- autore: nessuno modifica l'albero altrui.
-- Eseguire una volta nel SQL Editor di Supabase.

-- ------------------------------------------------------------------
-- 1. Permesso di innesto sull'albero di destinazione
-- ------------------------------------------------------------------
alter table public.trees
  add column if not exists link_permission text not null default 'moderated';

alter table public.trees drop constraint if exists trees_link_permission_check;
alter table public.trees add constraint trees_link_permission_check check (
  link_permission in ('none', 'moderated', 'auth', 'all')
);

comment on column public.trees.link_permission is
  'Chi può agganciare il proprio albero a questo: none = nessuno, moderated = su richiesta con approvazione del proprietario, auth = utenti registrati e approvati senza approvazione, all = chiunque veda l''albero.';

-- ------------------------------------------------------------------
-- 2. Tabella degli innesti
-- ------------------------------------------------------------------
create table if not exists public.tree_links (
  id uuid default gen_random_uuid() primary key,
  -- Il ramo che si aggancia (di proprietà di chi richiede l'innesto)
  source_tree_id uuid references public.trees(id) on delete cascade not null,
  source_person_id uuid references public.people(id) on delete cascade not null,
  -- L'albero principale a cui ci si aggancia
  target_tree_id uuid references public.trees(id) on delete cascade not null,
  target_person_id uuid references public.people(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  -- Un albero non si aggancia a sé stesso
  constraint tree_links_distinct_trees check (source_tree_id <> target_tree_id),
  -- La stessa coppia di persone non si collega due volte
  constraint tree_links_unique_pair unique (source_person_id, target_person_id)
);

create index if not exists tree_links_source_tree_idx on public.tree_links(source_tree_id);
create index if not exists tree_links_target_tree_idx on public.tree_links(target_tree_id);
create index if not exists tree_links_status_idx on public.tree_links(status);

alter table public.tree_links enable row level security;
grant select, insert, update, delete on public.tree_links to authenticated;
grant select on public.tree_links to anon;

-- ------------------------------------------------------------------
-- 3. Chi può richiedere un innesto verso un dato albero
-- ------------------------------------------------------------------
create or replace function public.can_link_tree(target_tree_id uuid)
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
        t.owner_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.is_admin = true
        )
        or t.link_permission = 'all'
        or t.link_permission = 'moderated'
        or (t.link_permission = 'auth' and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.is_approved = true
        ))
      )
  );
$$;

grant execute on function public.can_link_tree(uuid) to anon, authenticated;

-- ------------------------------------------------------------------
-- 4. Auto-approvazione in base al permesso dell'albero di destinazione
--    Il client non decide mai lo stato: lo impone il database.
-- ------------------------------------------------------------------
create or replace function public.tree_links_set_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_owner uuid;
  t_permission text;
  is_admin boolean;
begin
  select owner_id, link_permission into t_owner, t_permission
  from public.trees where id = new.target_tree_id;

  select coalesce(bool_or(is_admin), false) into is_admin
  from public.profiles where id = auth.uid();

  -- Coerenza: le persone devono appartenere agli alberi dichiarati
  if not exists (select 1 from public.people where id = new.source_person_id and tree_id = new.source_tree_id) then
    raise exception 'La persona di origine non appartiene all''albero di origine.';
  end if;
  if not exists (select 1 from public.people where id = new.target_person_id and tree_id = new.target_tree_id) then
    raise exception 'La persona di destinazione non appartiene all''albero di destinazione.';
  end if;

  if t_permission = 'none' and t_owner <> auth.uid() and not is_admin then
    raise exception 'Questo albero non accetta innesti.';
  end if;

  new.requested_by := auth.uid();
  new.created_at := timezone('utc'::text, now());

  if t_owner = auth.uid() or is_admin or t_permission in ('auth', 'all') then
    new.status := 'approved';
    new.reviewed_by := auth.uid();
    new.reviewed_at := timezone('utc'::text, now());
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tree_links_set_status_trigger on public.tree_links;
create trigger tree_links_set_status_trigger
  before insert on public.tree_links
  for each row execute function public.tree_links_set_status();

-- ------------------------------------------------------------------
-- 5. Policy RLS
-- ------------------------------------------------------------------
drop policy if exists "Lettura innesti sugli alberi visibili" on public.tree_links;
create policy "Lettura innesti sugli alberi visibili"
  on public.tree_links for select
  to anon, authenticated
  using (public.can_read_tree(source_tree_id) or public.can_read_tree(target_tree_id));

-- Solo chi può scrivere sul proprio ramo può proporre l'innesto.
drop policy if exists "Richiesta innesto dal proprio ramo" on public.tree_links;
create policy "Richiesta innesto dal proprio ramo"
  on public.tree_links for insert
  to authenticated
  with check (
    public.can_write_tree(source_tree_id)
    and public.can_read_tree(target_tree_id)
    and public.can_link_tree(target_tree_id)
  );

-- Approvazione/rifiuto: solo chi gestisce l'albero di destinazione.
drop policy if exists "Approvazione innesti dal proprietario" on public.tree_links;
create policy "Approvazione innesti dal proprietario"
  on public.tree_links for update
  to authenticated
  using (public.can_write_tree(target_tree_id))
  with check (public.can_write_tree(target_tree_id));

-- Cancellazione: sia il proprietario del ramo sia quello dell'albero principale.
drop policy if exists "Rimozione innesto da entrambe le parti" on public.tree_links;
create policy "Rimozione innesto da entrambe le parti"
  on public.tree_links for delete
  to authenticated
  using (public.can_write_tree(source_tree_id) or public.can_write_tree(target_tree_id));

-- ------------------------------------------------------------------
-- 6. Registrazione della revisione
-- ------------------------------------------------------------------
create or replace function public.review_tree_link(link_id uuid, approve boolean)
returns public.tree_links
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.tree_links;
begin
  if not exists (
    select 1 from public.tree_links l
    where l.id = link_id and public.can_write_tree(l.target_tree_id)
  ) then
    raise exception 'Non hai i permessi per approvare questo innesto.';
  end if;

  update public.tree_links
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc'::text, now())
  where id = link_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.review_tree_link(uuid, boolean) to authenticated;
