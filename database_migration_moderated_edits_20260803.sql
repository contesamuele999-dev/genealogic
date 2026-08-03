-- Modifiche moderate agli alberi genealogici.
-- Eseguire una volta nel SQL Editor di Supabase.

alter table public.trees drop constraint if exists trees_edit_permission_check;
alter table public.trees add constraint trees_edit_permission_check check (
  edit_permission in ('owner', 'auth', 'specific', 'auth_moderated', 'public_moderated')
);

create table if not exists public.change_requests (
  id uuid default gen_random_uuid() primary key,
  tree_id uuid references public.trees(id) on delete cascade not null,
  proposer_id uuid references public.profiles(id) on delete set null,
  proposer_name text,
  operations jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  check (jsonb_typeof(operations) = 'array' and jsonb_array_length(operations) between 1 and 20),
  check (proposer_id is not null or length(trim(coalesce(proposer_name, ''))) between 2 and 80)
);

alter table public.change_requests enable row level security;
grant insert on public.change_requests to anon, authenticated;
grant select on public.change_requests to authenticated;

create or replace function public.can_propose_tree(target_tree_id uuid)
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
        (t.edit_permission = 'auth_moderated' and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.is_approved = true
        ))
        or t.edit_permission = 'public_moderated'
      )
  );
$$;

create policy "Invio proposte abilitate"
  on public.change_requests for insert
  to anon, authenticated
  with check (
    public.can_propose_tree(tree_id)
    and (proposer_id is null or proposer_id = auth.uid())
    and status = 'pending'
  );

create policy "Gestori leggono le proposte"
  on public.change_requests for select
  to authenticated
  using (public.can_write_tree(tree_id) and (
    exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  ));

create or replace function public.review_change_request(request_id uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.change_requests%rowtype;
  op jsonb;
  payload jsonb;
  op_id uuid;
begin
  select * into req from public.change_requests where id = request_id for update;
  if req.id is null or req.status <> 'pending' then
    raise exception 'Richiesta non trovata o già esaminata';
  end if;
  if not exists (select 1 from public.trees where id = req.tree_id and owner_id = auth.uid())
     and not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Operazione riservata al proprietario o a un amministratore';
  end if;

  if approve then
    for op in select value from jsonb_array_elements(req.operations) loop
      payload := op->'data';
      op_id := nullif(op->>'id', '')::uuid;
      case op->>'action'
        when 'add_person' then
          insert into public.people (id, tree_id, first_name, last_name, gender, birth_date, death_date, birth_place, illnesses, notes, avatar_url)
          values (coalesce(op_id, gen_random_uuid()), req.tree_id, payload->>'first_name', coalesce(payload->>'last_name',''), coalesce(payload->>'gender','M'), coalesce(payload->>'birth_date',''), coalesce(payload->>'death_date',''), coalesce(payload->>'birth_place',''), coalesce(payload->'illnesses','[]'::jsonb), coalesce(payload->>'notes',''), coalesce(payload->>'avatar_url',''));
        when 'update_person' then
          update public.people set first_name=payload->>'first_name', last_name=coalesce(payload->>'last_name',''), gender=coalesce(payload->>'gender','M'), birth_date=coalesce(payload->>'birth_date',''), death_date=coalesce(payload->>'death_date',''), birth_place=coalesce(payload->>'birth_place',''), illnesses=coalesce(payload->'illnesses','[]'::jsonb), notes=coalesce(payload->>'notes',''), avatar_url=coalesce(payload->>'avatar_url','') where id=op_id and tree_id=req.tree_id;
        when 'delete_person' then
          update public.unions set children_ids=array_remove(children_ids, op_id) where tree_id=req.tree_id and op_id=any(children_ids);
          delete from public.people where id=op_id and tree_id=req.tree_id;
        when 'add_union' then
          insert into public.unions (id, tree_id, partner1_id, partner2_id, children_ids, type)
          values (coalesce(op_id, gen_random_uuid()), req.tree_id, nullif(payload->>'partner1_id','')::uuid, nullif(payload->>'partner2_id','')::uuid, array(select jsonb_array_elements_text(coalesce(payload->'children_ids','[]'::jsonb))::uuid), coalesce(payload->>'type','relationship'));
        when 'update_union' then
          update public.unions set partner1_id=nullif(payload->>'partner1_id','')::uuid, partner2_id=nullif(payload->>'partner2_id','')::uuid, children_ids=array(select jsonb_array_elements_text(coalesce(payload->'children_ids','[]'::jsonb))::uuid), type=coalesce(payload->>'type','relationship') where id=op_id and tree_id=req.tree_id;
        when 'delete_union' then
          delete from public.unions where id=op_id and tree_id=req.tree_id;
        else raise exception 'Operazione non valida: %', op->>'action';
      end case;
    end loop;
  end if;

  update public.change_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(), reviewed_at=now() where id=request_id;
end;
$$;

revoke all on function public.review_change_request(uuid, boolean) from public;
grant execute on function public.review_change_request(uuid, boolean) to authenticated;
grant execute on function public.can_propose_tree(uuid) to anon, authenticated;
