begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.prevent_last_organization_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_count integer;
begin
  -- Alteracoes que nao removem um owner da organizacao de origem nao
  -- precisam disputar o bloqueio nem executar a contagem.
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'owner'
    and new.organization_id = old.organization_id
  then
    return new;
  end if;

  -- SHARE ROW EXCLUSIVE impede duas remocoes/rebaixamentos concorrentes de
  -- aprovarem a mesma contagem. Como alteracoes de equipe sao raras, o custo
  -- do bloqueio global e preferivel ao risco de deixar uma organizacao orfa.
  lock table public.organization_members in share row exclusive mode;

  select count(*)::integer
    into v_owner_count
  from public.organization_members member
  where member.organization_id = old.organization_id
    and member.role = 'owner';

  if v_owner_count <= 1 then
    raise exception using
      errcode = '23514',
      message = 'A organizacao precisa manter pelo menos um proprietario.',
      detail = 'Promova outro membro a proprietario antes de rebaixar ou remover o proprietario atual.',
      hint = 'Defina outro membro como owner e tente novamente.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function private.prevent_last_organization_owner_removal()
  from public, anon, authenticated, service_role;

drop trigger if exists organization_members_preserve_last_owner
  on public.organization_members;

create trigger organization_members_preserve_last_owner
before update of organization_id, role or delete
on public.organization_members
for each row
execute function private.prevent_last_organization_owner_removal();

comment on function private.prevent_last_organization_owner_removal() is
  'Impede que uma organizacao fique sem owner em updates, deletes e exclusoes em cascata do Auth.';

-- A migration falha por inteiro se a protecao nao tiver sido instalada.
do $$
begin
  if to_regprocedure('private.prevent_last_organization_owner_removal()') is null then
    raise exception 'Funcao de protecao do ultimo proprietario nao encontrada.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'organization_members'
      and t.tgname = 'organization_members_preserve_last_owner'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) then
    raise exception 'Trigger de protecao do ultimo proprietario nao encontrado ou desabilitado.';
  end if;
end;
$$;

commit;
