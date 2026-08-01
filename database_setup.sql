-- ==========================================
-- SCRIPT DI CONFIGURAZIONE DATABASE SUPABASE
-- Alberi Genealogici di Famiglia
-- Copiare questo script nell'editor SQL di Supabase
-- ==========================================

-- 1. Disattiva temporaneamente i vincoli (se necessario ricominciare da zero)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.tree_editors;
drop table if exists public.unions;
drop table if exists public.people;
drop table if exists public.trees;
drop table if exists public.profiles;

-- 2. Tabella Profili Utente (agganciata a auth.users di Supabase)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  first_name text,
  last_name text,
  is_approved boolean default false,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Abilita RLS sui Profili
alter table public.profiles enable row level security;

-- Politiche RLS per Profiles
create policy "I profili sono visibili a tutti gli utenti registrati"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Gli utenti possono modificare il proprio profilo (tranne ruoli)"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trigger per creare automaticamente il profilo utente alla registrazione
create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_first_user boolean;
begin
  -- Controlla se è il primo utente registrato per renderlo Admin e Approvato automaticamente
  select not exists (select 1 from public.profiles) into is_first_user;
  
  insert into public.profiles (id, first_name, last_name, is_approved, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    is_first_user, -- Approvato se primo utente
    is_first_user  -- Admin se primo utente
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 3. Tabella Alberi Genealogici
create table public.trees (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  visibility text default 'public' check (visibility in ('public', 'restricted', 'private')),
  edit_permission text default 'owner' check (edit_permission in ('owner', 'auth', 'specific')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Abilita RLS su Trees
alter table public.trees enable row level security;

-- Politiche RLS per Trees
create policy "Lettura alberi basata su visibilità"
  on public.trees for select
  using (
    visibility = 'public'
    or (
      visibility = 'restricted' 
      and exists (
        select 1 from public.profiles 
        where profiles.id = auth.uid() and profiles.is_approved = true
      )
    )
    or owner_id = auth.uid()
  );

create policy "Creazione alberi per utenti approvati"
  on public.trees for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.is_approved = true
    )
  );

create policy "Modifica alberi riservata ai proprietari"
  on public.trees for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Cancellazione alberi riservata ai proprietari"
  on public.trees for delete
  to authenticated
  using (owner_id = auth.uid());


-- 4. Tabella Persone (Membri degli alberi)
create table public.people (
  id uuid default gen_random_uuid() primary key,
  tree_id uuid references public.trees(id) on delete cascade not null,
  first_name text not null,
  last_name text,
  gender text check (gender in ('M', 'F', 'Other')),
  birth_date text,
  death_date text,
  birth_place text,
  illnesses jsonb default '[]'::jsonb, -- Array di {name: string, notes: string, severity: 'lieve'|'moderata'|'grave'}
  notes text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Abilita RLS su People
alter table public.people enable row level security;

-- Funzione di supporto per verificare i permessi di lettura su un albero
create or replace function public.can_read_tree(tree_id uuid)
returns boolean as $$
declare
  t_visibility text;
  t_owner uuid;
begin
  select visibility, owner_id into t_visibility, t_owner from public.trees where id = tree_id;
  
  return (
    t_visibility = 'public'
    or (
      t_visibility = 'restricted'
      and exists (
        select 1 from public.profiles 
        where profiles.id = auth.uid() and profiles.is_approved = true
      )
    )
    or t_owner = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- Funzione di supporto per verificare i permessi di scrittura/modifica su un albero
create or replace function public.can_write_tree(tree_id uuid)
returns boolean as $$
declare
  t_owner uuid;
  t_edit_perm text;
begin
  select owner_id, edit_permission into t_owner, t_edit_perm from public.trees where id = tree_id;
  
  return (
    t_owner = auth.uid()
    or (
      t_edit_perm = 'auth'
      and exists (
        select 1 from public.profiles 
        where profiles.id = auth.uid() and profiles.is_approved = true
      )
    )
    or exists (
      select 1 from public.tree_editors 
      where tree_editors.tree_id = $1 and tree_editors.user_id = auth.uid()
    )
  );
end;
$$ language plpgsql security definer;

-- Politiche RLS per People
create policy "Lettura persone se l'albero è leggibile"
  on public.people for select
  using (public.can_read_tree(tree_id));

create policy "Inserimento persone se l'albero è modificabile"
  on public.people for insert
  to authenticated
  with check (public.can_write_tree(tree_id));

create policy "Modifica persone se l'albero è modificabile"
  on public.people for update
  to authenticated
  using (public.can_write_tree(tree_id))
  with check (public.can_write_tree(tree_id));

create policy "Cancellazione persone se l'albero è modificabile"
  on public.people for delete
  to authenticated
  using (public.can_write_tree(tree_id));


-- 5. Tabella Unioni / Relazioni Coppie
create table public.unions (
  id uuid default gen_random_uuid() primary key,
  tree_id uuid references public.trees(id) on delete cascade not null,
  partner1_id uuid references public.people(id) on delete cascade,
  partner2_id uuid references public.people(id) on delete cascade,
  children_ids uuid[] default '{}'::uuid[] not null,
  type text default 'relationship' check (type in ('marriage', 'relationship', 'divorced')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Abilita RLS su Unions
alter table public.unions enable row level security;

-- Politiche RLS per Unions
create policy "Lettura unioni se l'albero è leggibile"
  on public.unions for select
  using (public.can_read_tree(tree_id));

create policy "Inserimento unioni se l'albero è modificabile"
  on public.unions for insert
  to authenticated
  with check (public.can_write_tree(tree_id));

create policy "Modifica unioni se l'albero è modificabile"
  on public.unions for update
  to authenticated
  using (public.can_write_tree(tree_id))
  with check (public.can_write_tree(tree_id));

create policy "Cancellazione unioni se l'albero è modificabile"
  on public.unions for delete
  to authenticated
  using (public.can_write_tree(tree_id));


-- 6. Tabella Editori Specifici dell'Albero
create table public.tree_editors (
  tree_id uuid references public.trees(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (tree_id, user_id)
);

-- Abilita RLS su Tree Editors
alter table public.tree_editors enable row level security;

-- Politiche RLS per Tree Editors
create policy "Lettura editori se l'albero è leggibile"
  on public.tree_editors for select
  using (public.can_read_tree(tree_id));

create policy "Gestione editori riservata al proprietario dell'albero"
  on public.tree_editors for all
  to authenticated
  using (
    exists (
      select 1 from public.trees 
      where trees.id = tree_editors.tree_id and trees.owner_id = auth.uid()
    )
  );
