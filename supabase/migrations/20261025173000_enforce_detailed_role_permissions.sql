begin;

-- Matriz aplicada no banco:
-- owner: acesso completo;
-- manager: escrita operacional e financeira, sem gestão da equipe ou exclusões;
-- operator: leitura dos dados da organização e criação de vendas somente
-- pelo fluxo transacional public.create_completed_sale.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'categories', 'products', 'customers', 'suppliers',
    'stock_locations', 'inventory_balances', 'stock_movements',
    'stock_counts', 'stock_count_items', 'purchase_orders',
    'purchase_items', 'sales', 'sale_items', 'sale_payments',
    'cash_registers', 'cash_sessions', 'cash_movements',
    'financial_categories', 'financial_entries',
    'financial_entry_payments', 'returnable_container_movements',
    'audit_logs'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_insert_member',
      table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'', ''manager'']))',
      table_name || '_insert_member',
      table_name
    );
  end loop;
end $$;

-- As funções abaixo são SECURITY DEFINER porque executam operações
-- atômicas em várias tabelas. Atualizamos a validação interna sem
-- duplicar sua lógica de negócio, mantendo auth.uid() como identidade do chamador.
do $$
declare
  function_signature text;
  function_oid regprocedure;
  function_definition text;
  current_roles constant text := 'member.role in (''owner'', ''manager'', ''operator'')';
  allowed_roles constant text := 'member.role in (''owner'', ''manager'')';
begin
  foreach function_signature in array array[
    'private.create_product_with_initial_stock(uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,boolean,boolean,uuid,numeric)',
    'private.create_purchase_order(uuid,uuid,text,date,jsonb,numeric,numeric,numeric,text)',
    'private.receive_purchase_order(uuid,uuid,uuid,jsonb)',
    'private.create_financial_entry(uuid,text,uuid,uuid,uuid,text,numeric,date,date,boolean,text,text,text)',
    'private.record_financial_payment(uuid,uuid,numeric,date,text,text,text)',
    'private.open_cash_session(uuid,uuid,numeric)',
    'private.record_cash_movement(uuid,uuid,text,numeric,text)',
    'private.close_cash_session(uuid,uuid,numeric,text)'
  ]
  loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'Função obrigatória não encontrada: %', function_signature;
    end if;

    function_definition := pg_get_functiondef(function_oid);
    if position(current_roles in function_definition) = 0 then
      raise exception 'A validação de perfil esperada não foi encontrada em %', function_signature;
    end if;

    execute replace(function_definition, current_roles, allowed_roles);
  end loop;
end $$;

-- Mantém o fluxo de venda disponível aos três perfis. Os grants das
-- demais funções continuam restritos a authenticated, e a checagem de papel
-- ocorre dentro de cada função com search_path vazio.
revoke execute on function public.create_completed_sale(
  uuid, uuid, uuid, jsonb, numeric, text, text
) from public, anon;
grant execute on function public.create_completed_sale(
  uuid, uuid, uuid, jsonb, numeric, text, text
) to authenticated;

commit;
