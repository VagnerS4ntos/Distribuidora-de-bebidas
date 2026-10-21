begin;

-- A busca do membro atual por user_id ocorre em todas as telas protegidas.
create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id, organization_id);

-- Mantém a função auxiliar fora do schema exposto pela Data API.
create schema if not exists private;

create or replace function private.can_view_profile(profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members viewer
    join public.organization_members target
      on target.organization_id = viewer.organization_id
    where viewer.user_id = (select auth.uid())
      and target.user_id = profile_user_id
  );
$$;

revoke all on function private.can_view_profile(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

drop policy if exists profiles_select_organization_member on public.profiles;
create policy profiles_select_organization_member
  on public.profiles
  for select
  to authenticated
  using ((select private.can_view_profile(id)));

commit;
