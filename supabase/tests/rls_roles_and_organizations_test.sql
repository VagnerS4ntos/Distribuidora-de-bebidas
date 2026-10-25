begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(112);

-- Duas organizacoes independentes, cada uma com os tres perfis de acesso.
-- O rollback final garante que os fixtures nunca persistam no banco.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-000000000001', 'rls-owner-a@example.test',    '{"full_name":"Owner A"}'),
  ('a0000000-0000-4000-8000-000000000002', 'rls-manager-a@example.test',  '{"full_name":"Manager A"}'),
  ('a0000000-0000-4000-8000-000000000003', 'rls-operator-a@example.test', '{"full_name":"Operator A"}'),
  ('b0000000-0000-4000-8000-000000000001', 'rls-owner-b@example.test',    '{"full_name":"Owner B"}'),
  ('b0000000-0000-4000-8000-000000000002', 'rls-manager-b@example.test',  '{"full_name":"Manager B"}'),
  ('b0000000-0000-4000-8000-000000000003', 'rls-operator-b@example.test', '{"full_name":"Operator B"}');

insert into public.organizations (id, name, trade_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Organizacao RLS A', 'RLS A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Organizacao RLS B', 'RLS B');

insert into public.organization_members (organization_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a0000000-0000-4000-8000-000000000002', 'manager'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a0000000-0000-4000-8000-000000000003', 'operator'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'b0000000-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'b0000000-0000-4000-8000-000000000002', 'manager'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'b0000000-0000-4000-8000-000000000003', 'operator');

insert into public.categories (id, organization_id, name)
values
  ('ca000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Categoria RLS A'),
  ('cb000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Categoria RLS B');

insert into public.products (id, organization_id, category_id, name, cost_price, sale_price)
values
  ('2a000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ca000000-0000-4000-8000-000000000001', 'Produto RLS A', 5, 10),
  ('2b000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'cb000000-0000-4000-8000-000000000002', 'Produto RLS B', 6, 12);

insert into public.stock_locations (id, organization_id, name)
values
  ('1a000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Local RLS A'),
  ('1b000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Local RLS B');

insert into public.inventory_balances (id, organization_id, location_id, product_id, quantity_on_hand)
values
  ('3a000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 10),
  ('3b000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '1b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002', 20);

insert into public.customers (id, organization_id, name)
values
  ('4a000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Cliente RLS A'),
  ('4b000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Cliente RLS B');

insert into public.audit_logs (organization_id, action, table_name, record_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'insert', 'rls_fixture', 'fixture-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'insert', 'rls_fixture', 'fixture-b');

-- Executada como authenticated: por ser SECURITY INVOKER, esta funcao sofre
-- as mesmas regras RLS que uma chamada feita pelo navegador.
create function pg_temp.assert_role_reads(
  p_organization_id uuid,
  p_other_organization_id uuid,
  p_expected_role text,
  p_label text,
  p_can_view_audit boolean
)
returns setof text
language plpgsql
as $function$
declare
  v_other_roles text[];
begin
  v_other_roles := case p_expected_role
    when 'owner' then array['manager', 'operator']
    when 'manager' then array['owner', 'operator']
    else array['owner', 'manager']
  end;

  return next extensions.is((select count(*)::integer from public.organizations), 1, p_label || ' ve somente sua organizacao');
  return next extensions.is((select count(*)::integer from public.customers), 1, p_label || ' ve somente clientes da sua organizacao');
  return next extensions.is((select count(*)::integer from public.customers where organization_id = p_other_organization_id), 0, p_label || ' nao ve clientes de outra organizacao');
  return next extensions.is((select count(*)::integer from public.inventory_balances), 1, p_label || ' ve somente estoque da sua organizacao');
  return next extensions.is((select count(*)::integer from public.inventory_balances where organization_id = p_other_organization_id), 0, p_label || ' nao ve estoque de outra organizacao');
  return next extensions.is((select count(*)::integer from public.organization_members), 3, p_label || ' ve os tres membros da sua organizacao');
  return next extensions.is((select count(*)::integer from public.profiles), 3, p_label || ' ve somente perfis da sua organizacao');
  return next extensions.ok(public.has_org_role(p_organization_id, array[p_expected_role]), p_label || ' e reconhecido com o perfil correto');
  return next extensions.ok(not public.has_org_role(p_organization_id, v_other_roles), p_label || ' nao recebe outro perfil por engano');
  return next extensions.ok(not public.is_org_member(p_other_organization_id), p_label || ' nao pertence a outra organizacao');

  if p_can_view_audit then
    return next extensions.ok((select count(*) > 0 from public.audit_logs where organization_id = p_organization_id), p_label || ' ve auditoria da propria organizacao');
    return next extensions.is((select count(*)::integer from public.audit_logs where organization_id = p_other_organization_id), 0, p_label || ' nao ve auditoria de outra organizacao');
  else
    return next extensions.is((select count(*)::integer from public.audit_logs), 0, p_label || ' nao ve o historico de auditoria');
  end if;
end;
$function$;

create function pg_temp.assert_owner_writes()
returns setof text
language plpgsql
as $function$
begin
  return next extensions.lives_ok(
    $$insert into public.customers (id, organization_id, name) values ('5a000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Criado pelo owner')$$,
    'owner cria cliente na propria organizacao'
  );
  return next extensions.throws_ok(
    $$insert into public.customers (id, organization_id, name) values ('5b000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Invasao')$$,
    '42501', null, 'owner nao cria cliente em outra organizacao'
  );
  return next extensions.results_eq(
    $$update public.customers set name = 'Atualizado pelo owner' where id = '4a000000-0000-4000-8000-000000000001' returning name$$,
    array['Atualizado pelo owner'], 'owner atualiza cliente da propria organizacao'
  );
  return next extensions.is_empty(
    $$update public.customers set name = 'Invasao' where id = '4b000000-0000-4000-8000-000000000002' returning id$$,
    'owner nao atualiza cliente de outra organizacao'
  );
  return next extensions.results_eq(
    $$delete from public.customers where id = '5a000000-0000-4000-8000-000000000001' returning id$$,
    array['5a000000-0000-4000-8000-000000000001'::uuid], 'owner exclui cliente da propria organizacao'
  );
  return next extensions.results_eq(
    $$update public.organizations set trade_name = 'RLS A atualizada' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning id$$,
    array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid], 'owner atualiza sua organizacao'
  );
  return next extensions.is_empty(
    $$update public.organizations set trade_name = 'Invasao' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' returning id$$,
    'owner nao atualiza outra organizacao'
  );
  return next extensions.results_eq(
    $$update public.organization_members set role = 'manager' where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000002' returning user_id$$,
    array['a0000000-0000-4000-8000-000000000002'::uuid], 'owner administra membro da propria organizacao'
  );
  return next extensions.is_empty(
    $$update public.organization_members set role = 'operator' where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' and user_id = 'b0000000-0000-4000-8000-000000000002' returning user_id$$,
    'owner nao administra membro de outra organizacao'
  );
  return next extensions.results_eq(
    $$update public.profiles set phone = '1111' where id = 'a0000000-0000-4000-8000-000000000001' returning id$$,
    array['a0000000-0000-4000-8000-000000000001'::uuid], 'owner atualiza o proprio perfil'
  );
  return next extensions.is_empty(
    $$update public.profiles set phone = 'invasao' where id = 'a0000000-0000-4000-8000-000000000002' returning id$$,
    'owner nao altera diretamente o perfil pessoal de outro membro'
  );
  return next extensions.throws_ok(
    $$insert into public.stock_movements (organization_id, location_id, product_id, movement_type, quantity_delta) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'adjustment_in', 1)$$,
    '42501', null, 'owner deve usar RPC para escrever em tabela transacional'
  );
  return next extensions.throws_ok(
    $$update public.organization_members set role = 'manager' where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000001'$$,
    '23514', null, 'ultimo owner nao pode ser rebaixado'
  );
  return next extensions.throws_ok(
    $$delete from public.organization_members where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000001'$$,
    '23514', null, 'ultimo owner nao pode ser removido'
  );
  return next extensions.results_eq(
    $$update public.organization_members set role = 'owner' where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000002' returning user_id$$,
    array['a0000000-0000-4000-8000-000000000002'::uuid], 'outro membro pode ser promovido a owner'
  );
  return next extensions.results_eq(
    $$update public.organization_members set role = 'manager' where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000001' returning user_id$$,
    array['a0000000-0000-4000-8000-000000000001'::uuid], 'owner pode ser rebaixado quando existe outro proprietario'
  );
end;
$function$;

create function pg_temp.assert_manager_writes()
returns setof text
language plpgsql
as $function$
begin
  return next extensions.lives_ok(
    $$insert into public.customers (id, organization_id, name) values ('5a000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Criado pelo manager')$$,
    'manager cria cliente na propria organizacao'
  );
  return next extensions.throws_ok(
    $$insert into public.customers (id, organization_id, name) values ('5b000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Invasao')$$,
    '42501', null, 'manager nao cria cliente em outra organizacao'
  );
  return next extensions.results_eq(
    $$update public.customers set name = 'Atualizado pelo manager' where id = '4a000000-0000-4000-8000-000000000001' returning name$$,
    array['Atualizado pelo manager'], 'manager atualiza cliente da propria organizacao'
  );
  return next extensions.is_empty(
    $$update public.customers set name = 'Invasao' where id = '4b000000-0000-4000-8000-000000000002' returning id$$,
    'manager nao atualiza cliente de outra organizacao'
  );
  return next extensions.is_empty(
    $$delete from public.customers where id = '5a000000-0000-4000-8000-000000000002' returning id$$,
    'manager nao exclui cliente'
  );
  return next extensions.is_empty(
    $$update public.organizations set trade_name = 'Manager alterou' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning id$$,
    'manager nao atualiza a organizacao'
  );
  return next extensions.is_empty(
    $$update public.organization_members set role = 'operator' where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000003' returning user_id$$,
    'manager nao administra perfis de acesso'
  );
  return next extensions.results_eq(
    $$update public.profiles set phone = '2222' where id = 'a0000000-0000-4000-8000-000000000002' returning id$$,
    array['a0000000-0000-4000-8000-000000000002'::uuid], 'manager atualiza o proprio perfil'
  );
  return next extensions.is_empty(
    $$update public.profiles set phone = 'invasao' where id = 'a0000000-0000-4000-8000-000000000003' returning id$$,
    'manager nao altera diretamente o perfil pessoal de outro membro'
  );
  return next extensions.throws_ok(
    $$insert into public.stock_movements (organization_id, location_id, product_id, movement_type, quantity_delta) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'adjustment_in', 1)$$,
    '42501', null, 'manager deve usar RPC para escrever em tabela transacional'
  );
end;
$function$;

create function pg_temp.assert_operator_writes()
returns setof text
language plpgsql
as $function$
begin
  return next extensions.throws_ok(
    $$insert into public.customers (id, organization_id, name) values ('5a000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Criado pelo operator')$$,
    '42501', null, 'operator nao cria cliente'
  );
  return next extensions.throws_ok(
    $$insert into public.customers (id, organization_id, name) values ('5b000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Invasao')$$,
    '42501', null, 'operator nao cria cliente em outra organizacao'
  );
  return next extensions.is_empty(
    $$update public.customers set name = 'Operator alterou' where id = '4a000000-0000-4000-8000-000000000001' returning id$$,
    'operator nao atualiza cliente'
  );
  return next extensions.is_empty(
    $$update public.customers set name = 'Invasao' where id = '4b000000-0000-4000-8000-000000000002' returning id$$,
    'operator nao atualiza cliente de outra organizacao'
  );
  return next extensions.is_empty(
    $$delete from public.customers where id = '4a000000-0000-4000-8000-000000000001' returning id$$,
    'operator nao exclui cliente'
  );
  return next extensions.is_empty(
    $$update public.organizations set trade_name = 'Operator alterou' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning id$$,
    'operator nao atualiza a organizacao'
  );
  return next extensions.is_empty(
    $$update public.organization_members set role = 'manager' where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'a0000000-0000-4000-8000-000000000003' returning user_id$$,
    'operator nao administra perfis de acesso'
  );
  return next extensions.results_eq(
    $$update public.profiles set phone = '3333' where id = 'a0000000-0000-4000-8000-000000000003' returning id$$,
    array['a0000000-0000-4000-8000-000000000003'::uuid], 'operator atualiza o proprio perfil'
  );
  return next extensions.is_empty(
    $$update public.profiles set phone = 'invasao' where id = 'a0000000-0000-4000-8000-000000000001' returning id$$,
    'operator nao altera diretamente o perfil pessoal de outro membro'
  );
  return next extensions.throws_ok(
    $$insert into public.stock_movements (organization_id, location_id, product_id, movement_type, quantity_delta) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'adjustment_in', 1)$$,
    '42501', null, 'operator deve usar RPC para escrever em tabela transacional'
  );
end;
$function$;

-- As seis verificacoes estruturais falham cedo caso RLS seja desligado.
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'organizations'), 'RLS habilitado em organizations');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'), 'RLS habilitado em profiles');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'organization_members'), 'RLS habilitado em organization_members');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'customers'), 'RLS habilitado em customers');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'inventory_balances'), 'RLS habilitado em inventory_balances');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'audit_logs'), 'RLS habilitado em audit_logs');

-- Organizacao A: leitura e matriz completa de escrita.
do $$ begin perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;
set local role authenticated;
select * from pg_temp.assert_role_reads('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'owner', 'owner A', true);
select * from pg_temp.assert_owner_writes();
reset role;

-- Restaura os perfis depois do teste de transferencia de propriedade.
update public.organization_members
set role = 'owner'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and user_id = 'a0000000-0000-4000-8000-000000000001';
update public.organization_members
set role = 'manager'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and user_id = 'a0000000-0000-4000-8000-000000000002';

do $$ begin perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true); end $$;
set local role authenticated;
select * from pg_temp.assert_role_reads('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'manager', 'manager A', true);
select * from pg_temp.assert_manager_writes();
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true); end $$;
set local role authenticated;
select * from pg_temp.assert_role_reads('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'operator', 'operator A', false);
select * from pg_temp.assert_operator_writes();
reset role;

-- Organizacao B: os tres perfis repetem as leituras no sentido inverso.
do $$ begin perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;
set local role authenticated;
select * from pg_temp.assert_role_reads('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner', 'owner B', true);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true); end $$;
set local role authenticated;
select * from pg_temp.assert_role_reads('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'manager', 'manager B', true);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}', true); end $$;
set local role authenticated;
select * from pg_temp.assert_role_reads('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'operator', 'operator B', false);
reset role;

select * from finish();
rollback;
