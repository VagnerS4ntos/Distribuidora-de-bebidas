begin;

-- Tabelas de movimentacao sao somente leitura para clientes PostgREST.
-- Toda escrita deve passar pelas RPCs validadas, que executam as alteracoes
-- atomicas e conferem usuario, organizacao, perfil e regras de negocio.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'purchase_orders',
    'purchase_items',
    'purchase_receipts',
    'purchase_receipt_items',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_returns',
    'sale_return_items',
    'cash_registers',
    'cash_sessions',
    'cash_movements',
    'financial_entries',
    'financial_entry_payments',
    'returnable_container_movements',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);

    -- REVOKE ALL tambem bloqueia TRUNCATE, REFERENCES e TRIGGER, operacoes
    -- que nao sao protegidas por RLS. O service_role e o proprietario das
    -- funcoes SECURITY DEFINER nao sao afetados por estes grants.
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      v_table
    );
    execute format(
      'grant select on table public.%I to authenticated',
      v_table
    );

    -- Remove as politicas de escrita genericas do schema inicial. Mesmo sem
    -- privilegios de tabela elas nao seriam suficientes para autorizar a
    -- escrita, mas remove-las deixa a regra explicita e evita reabertura
    -- acidental caso um grant seja alterado no futuro.
    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_insert_member',
      v_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_update_manager',
      v_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_delete_owner',
      v_table
    );
  end loop;
end;
$$;

-- Reafirma a superficie publica permitida: somente usuarios autenticados
-- podem chamar as RPCs transacionais. As funcoes privadas continuam sem
-- exposicao pela API e fazem a validacao efetiva do chamador.
do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_completed_sale(uuid,uuid,uuid,jsonb,numeric,text,text)',
    'public.process_sale_return(uuid,uuid,text,jsonb,text)',
    'public.create_product_with_initial_stock(uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,boolean,boolean,uuid,numeric)',
    'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)',
    'public.create_purchase_order(uuid,uuid,text,date,date,jsonb,numeric,numeric,numeric,text)',
    'public.receive_purchase_order(uuid,uuid,uuid,date,jsonb)',
    'public.create_financial_entry(uuid,text,uuid,uuid,uuid,text,numeric,date,date,boolean,text,text,text)',
    'public.record_financial_payment(uuid,uuid,numeric,date,text,text,text)',
    'public.create_cash_register(uuid,text,uuid)',
    'public.open_cash_session(uuid,uuid,numeric)',
    'public.record_cash_movement(uuid,uuid,text,numeric,text)',
    'public.close_cash_session(uuid,uuid,numeric,text)'
  ]
  loop
    if to_regprocedure(v_signature) is null then
      raise exception 'RPC obrigatoria nao encontrada: %', v_signature;
    end if;

    execute format(
      'revoke all privileges on function %s from public, anon',
      v_signature
    );
    execute format(
      'grant execute on function %s to authenticated',
      v_signature
    );
  end loop;
end;
$$;

-- Falha a migration inteira se algum privilegio direto permanecer aberto ou
-- se uma RPC obrigatoria tiver deixado de existir/ser executavel. Como tudo
-- esta dentro da mesma transacao, nao existe aplicacao parcial.
do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
  v_signature text;
  v_function regprocedure;
begin
  foreach v_table in array array[
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'purchase_orders',
    'purchase_items',
    'purchase_receipts',
    'purchase_receipt_items',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_returns',
    'sale_return_items',
    'cash_registers',
    'cash_sessions',
    'cash_movements',
    'financial_entries',
    'financial_entry_payments',
    'returnable_container_movements',
    'audit_logs'
  ]
  loop
    foreach v_role in array array['anon', 'authenticated']
    loop
      foreach v_privilege in array array[
        'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]
      loop
        if has_table_privilege(
          v_role,
          format('%I.%I', 'public', v_table),
          v_privilege
        ) then
          raise exception
            'Privilegio direto inesperado: papel %, tabela %, privilegio %',
            v_role,
            v_table,
            v_privilege;
        end if;
      end loop;
    end loop;

    if not has_table_privilege(
      'authenticated',
      format('%I.%I', 'public', v_table),
      'SELECT'
    ) then
      raise exception 'Leitura autenticada ausente na tabela %', v_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity
    ) then
      raise exception 'RLS nao esta habilitado na tabela %', v_table;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.create_completed_sale(uuid,uuid,uuid,jsonb,numeric,text,text)',
    'public.process_sale_return(uuid,uuid,text,jsonb,text)',
    'public.create_product_with_initial_stock(uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,boolean,boolean,uuid,numeric)',
    'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)',
    'public.create_purchase_order(uuid,uuid,text,date,date,jsonb,numeric,numeric,numeric,text)',
    'public.receive_purchase_order(uuid,uuid,uuid,date,jsonb)',
    'public.create_financial_entry(uuid,text,uuid,uuid,uuid,text,numeric,date,date,boolean,text,text,text)',
    'public.record_financial_payment(uuid,uuid,numeric,date,text,text,text)',
    'public.create_cash_register(uuid,text,uuid)',
    'public.open_cash_session(uuid,uuid,numeric)',
    'public.record_cash_movement(uuid,uuid,text,numeric,text)',
    'public.close_cash_session(uuid,uuid,numeric,text)'
  ]
  loop
    v_function := to_regprocedure(v_signature);

    if v_function is null then
      raise exception 'RPC obrigatoria nao encontrada: %', v_signature;
    end if;

    if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'authenticated nao pode executar a RPC %', v_signature;
    end if;

    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'anon pode executar indevidamente a RPC %', v_signature;
    end if;
  end loop;
end;
$$;

commit;
