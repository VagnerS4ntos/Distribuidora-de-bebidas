-- ============================================================
-- SANTO GOLE - LIMPEZA DOS DADOS DA APLICACAO
-- ============================================================
-- Uso: cole todo este arquivo no SQL Editor do Supabase e execute.
--
-- Remove os registros das tabelas da aplicacao no schema public, mas
-- recria e preserva a identidade administrativa principal:
--   - Auth: vagner.dev@outlook.com (nao e removido)
--   - Perfil: Vagner Santos
--   - Empresa: Santo Gole Ltda.
--   - Papel: owner
--
-- O schema, as migrations, as politicas RLS, as funcoes, os triggers e
-- as configuracoes do Supabase permanecem inalterados.

begin;

do $cleanup$
declare
  v_owner_id uuid;
  v_organization_id uuid;
  v_organization_trade_name text;
  v_organization_cnpj text;
  v_organization_phone text;
  v_organization_email text;
  v_organization_created_at timestamptz;
  v_profile_phone text;
  v_profile_created_at timestamptz;
  v_membership_created_at timestamptz;
  v_table_list text;
begin
  -- O usuario do Auth precisa existir antes de qualquer dado ser apagado.
  select auth_user.id
    into v_owner_id
  from auth.users as auth_user
  where lower(auth_user.email) = 'vagner.dev@outlook.com'
  order by auth_user.created_at
  limit 1;

  if v_owner_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'O usuario vagner.dev@outlook.com nao foi encontrado no Supabase Auth.',
      hint = 'Crie ou confirme o usuario no menu Authentication antes de executar a limpeza.';
  end if;

  -- Preserva o ID e os dados complementares da empresa atual, quando
  -- existirem. O vinculo owner do usuario tem prioridade sobre o nome.
  select
    organization.id,
    organization.trade_name,
    organization.cnpj,
    organization.phone,
    organization.email,
    organization.created_at
  into
    v_organization_id,
    v_organization_trade_name,
    v_organization_cnpj,
    v_organization_phone,
    v_organization_email,
    v_organization_created_at
  from public.organizations as organization
  left join public.organization_members as member
    on member.organization_id = organization.id
   and member.user_id = v_owner_id
   and member.role = 'owner'
  where member.user_id is not null
     or lower(organization.name) = lower('Santo Gole Ltda.')
     or lower(coalesce(organization.trade_name, '')) = lower('Santo Gole')
  order by
    case when member.user_id is not null then 0 else 1 end,
    organization.created_at
  limit 1;

  select profile.phone, profile.created_at
    into v_profile_phone, v_profile_created_at
  from public.profiles as profile
  where profile.id = v_owner_id;

  select member.created_at
    into v_membership_created_at
  from public.organization_members as member
  where member.user_id = v_owner_id
    and member.role = 'owner'
  order by member.created_at
  limit 1;

  v_organization_id := coalesce(v_organization_id, gen_random_uuid());

  -- Inclui somente tabelas comuns e particionadas do schema public e
  -- ignora tabelas pertencentes a extensoes instaladas no banco.
  select string_agg(
    format('%I.%I', namespace.nspname, relation.relname),
    ', '
    order by relation.relname
  )
  into v_table_list
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not relation.relispartition
    and not exists (
      select 1
      from pg_catalog.pg_depend as dependency
      where dependency.classid = 'pg_class'::regclass
        and dependency.objid = relation.oid
        and dependency.deptype = 'e'
    );

  if v_table_list is null then
    raise exception 'Nenhuma tabela da aplicacao foi encontrada no schema public.';
  end if;

  -- Todas as tabelas public entram no mesmo TRUNCATE, permitindo respeitar
  -- as dependencias entre elas sem usar CASCADE para outros schemas.
  execute 'truncate table ' || v_table_list || ' restart identity';

  insert into public.organizations (
    id,
    name,
    trade_name,
    cnpj,
    phone,
    email,
    created_at,
    updated_at
  ) values (
    v_organization_id,
    'Santo Gole Ltda.',
    coalesce(nullif(v_organization_trade_name, ''), 'Santo Gole'),
    v_organization_cnpj,
    v_organization_phone,
    coalesce(nullif(v_organization_email, ''), 'vagner.dev@outlook.com'),
    coalesce(v_organization_created_at, now()),
    now()
  );

  insert into public.profiles (
    id,
    full_name,
    phone,
    created_at,
    updated_at
  ) values (
    v_owner_id,
    'Vagner Santos',
    v_profile_phone,
    coalesce(v_profile_created_at, now()),
    now()
  );

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    created_at
  ) values (
    v_organization_id,
    v_owner_id,
    'owner',
    coalesce(v_membership_created_at, now())
  );

  -- Falha a transacao inteira se o estado minimo nao tiver sido restaurado.
  if not exists (
    select 1
    from public.organization_members as member
    join public.profiles as profile
      on profile.id = member.user_id
    join public.organizations as organization
      on organization.id = member.organization_id
    where member.user_id = v_owner_id
      and member.role = 'owner'
      and profile.full_name = 'Vagner Santos'
      and organization.name = 'Santo Gole Ltda.'
  ) then
    raise exception 'A identidade administrativa nao foi restaurada; a limpeza foi cancelada.';
  end if;
end;
$cleanup$;

commit;

-- Resultado esperado: exatamente uma linha.
select
  auth_user.email,
  profile.full_name,
  organization.name as organization_name,
  member.role
from auth.users as auth_user
join public.profiles as profile
  on profile.id = auth_user.id
join public.organization_members as member
  on member.user_id = profile.id
join public.organizations as organization
  on organization.id = member.organization_id
where lower(auth_user.email) = 'vagner.dev@outlook.com'
  and member.role = 'owner';
