-- ============================================================
-- SANTO GOLE - DADOS DE DEMONSTRACAO
-- ============================================================
-- Uso: cole todo o arquivo no SQL Editor do Supabase e execute.
--
-- Requisitos:
--   1. As migrations do projeto devem estar aplicadas.
--   2. O usuario vagner.dev@outlook.com deve existir no Supabase Auth.
--   3. As tabelas de operacao devem estar vazias. A organizacao, o perfil
--      e o vinculo owner preservados pelo script de limpeza podem existir.
--
-- O script nao cria usuarios no Auth, nao altera o schema e nao apaga dados.
-- Todos os inserts sao executados em uma unica transacao.

begin;

-- Mantem a massa pseudoaleatoria reproduzivel entre execucoes.
select setseed(0.417);

do $seed$
declare
  v_owner_id uuid;
  v_org_id uuid;
  v_primary_location_id constant uuid := '20000000-0000-4000-8000-000000000001'::uuid;
  v_secondary_location_id constant uuid := '20000000-0000-4000-8000-000000000002'::uuid;
  v_register_id constant uuid := '30000000-0000-4000-8000-000000000001'::uuid;
  v_open_session_id constant uuid := '40000000-0000-4000-8000-000000000001'::uuid;

  v_customer_names text[] := array[
    'Mercadinho Sao Jose', 'Bar do Centro', 'Restaurante Sabor',
    'Condominio Horizonte', 'Padaria Pao Quente', 'Lanchonete Avenida',
    'Hotel Primavera', 'Cantina da Praca', 'Supermercado Familia',
    'Espetinho do Joao', 'Pizzaria Bella Massa', 'Clube Recreativo',
    'Acougue Boi Forte', 'Mercearia da Maria', 'Eventos Celebrar'
  ];
  v_supplier_names text[] := array[
    'Ambev Distribuidora', 'Coca-Cola FEMSA', 'Grupo Petropolis',
    'Heineken Brasil', 'Minalba Alimentos', 'Distribuidora Tropical'
  ];
  v_payment_methods text[] := array[
    'pix', 'debit_card', 'credit_card', 'bank_transfer'
  ];

  v_i integer;
  v_j integer;
  v_product_count integer;
  v_supplier_count integer;
  v_customer_count integer;
  v_item_count integer;
  v_quantity numeric(12,3);
  v_received_quantity numeric(12,3);
  v_unit_cost numeric(12,2);
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_freight numeric(12,2);
  v_total numeric(12,2);
  v_refund numeric(12,2);
  v_opening numeric(12,2);
  v_cash_in numeric(12,2);
  v_cash_out numeric(12,2);

  v_status text;
  v_payment_method text;
  v_purchase_id uuid;
  v_receipt_id uuid;
  v_sale_id uuid;
  v_return_id uuid;
  v_financial_id uuid;
  v_stock_count_id uuid;
  v_session_id uuid;
  v_supplier_id uuid;
  v_customer_id uuid;

  v_ordered_at timestamptz;
  v_expected_at timestamptz;
  v_received_at timestamptz;
  v_sold_at timestamptz;

  v_row record;
  v_product record;
begin
  select user_record.id
    into v_owner_id
  from auth.users as user_record
  where lower(user_record.email) = 'vagner.dev@outlook.com'
  order by user_record.created_at
  limit 1;

  if v_owner_id is null then
    raise exception
      'O usuario vagner.dev@outlook.com nao foi encontrado no Supabase Auth.';
  end if;

  select organization.id
    into v_org_id
  from public.organizations as organization
  left join public.organization_members as member
    on member.organization_id = organization.id
   and member.user_id = v_owner_id
  where member.user_id is not null
     or lower(organization.name) = lower('Santo Gole Ltda.')
     or lower(coalesce(organization.trade_name, '')) = lower('Santo Gole')
  order by
    case when member.user_id is not null then 0 else 1 end,
    organization.created_at
  limit 1;

  v_org_id := coalesce(
    v_org_id,
    '10000000-0000-4000-8000-000000000001'::uuid
  );

  if exists (
    select 1
    from public.organizations as organization
    where organization.id <> v_org_id
  ) then
    raise exception
      'Existem outras organizacoes cadastradas. Execute o script de limpeza antes do seed.';
  end if;

  -- Faz auth.uid() identificar o proprietario durante os triggers de auditoria.
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_id, 'role', 'authenticated')::text,
    true
  );

  -- ----------------------------------------------------------
  -- ORGANIZACAO E PROPRIETARIO
  -- ----------------------------------------------------------
  insert into public.organizations (
    id, name, trade_name, cnpj, phone, email
  ) values (
    v_org_id,
    'Santo Gole Ltda.',
    'Santo Gole',
    '12.345.678/0001-90',
    '(11) 4002-8922',
    'contato@santogole.com.br'
  )
  on conflict (id) do update
    set name = excluded.name,
        trade_name = excluded.trade_name,
        cnpj = excluded.cnpj,
        phone = excluded.phone,
        email = excluded.email,
        updated_at = now();

  insert into public.profiles (id, full_name, phone)
  values (v_owner_id, 'Vagner Santos', '(11) 99999-0001')
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        updated_at = now();

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_owner_id, 'owner')
  on conflict (organization_id, user_id) do update
    set role = excluded.role;

  -- ----------------------------------------------------------
  -- CATEGORIAS, PRODUTOS, CLIENTES E FORNECEDORES
  -- ----------------------------------------------------------
  insert into public.categories (organization_id, name, description)
  values
    (v_org_id, 'Cervejas', 'Cervejas em lata, garrafa e long neck'),
    (v_org_id, 'Refrigerantes', 'Refrigerantes em diversos tamanhos'),
    (v_org_id, 'Aguas', 'Agua mineral com e sem gas'),
    (v_org_id, 'Energeticos', 'Energeticos e bebidas funcionais'),
    (v_org_id, 'Destilados', 'Vodka, gin, whisky e outros destilados'),
    (v_org_id, 'Sucos', 'Sucos, nectares e bebidas de frutas');

  for v_row in
    select *
    from (values
      ('Cervejas', 'Cerveja Pilsen 350ml', 'Aurora', 'Lata 350 ml', '7891000000011', 'CER-001', 2.45, 4.50, 36, false),
      ('Cervejas', 'Cerveja Premium 350ml', 'Serra', 'Lata 350 ml', '7891000000028', 'CER-002', 3.70, 6.50, 30, false),
      ('Cervejas', 'Cerveja Long Neck 330ml', 'Aurora', 'Garrafa 330 ml', '7891000000035', 'CER-003', 4.20, 7.90, 24, false),
      ('Cervejas', 'Cerveja 600ml Retornavel', 'Serra', 'Garrafa retornavel 600 ml', '7891000000042', 'CER-004', 5.60, 10.00, 24, true),
      ('Refrigerantes', 'Refrigerante Cola 2L', 'Cola Brasil', 'Garrafa 2 litros', '7891000000059', 'REF-001', 5.90, 10.50, 18, false),
      ('Refrigerantes', 'Refrigerante Guarana 2L', 'Guarana Brasil', 'Garrafa 2 litros', '7891000000066', 'REF-002', 5.40, 9.90, 18, false),
      ('Refrigerantes', 'Refrigerante Laranja 2L', 'Laranja Brasil', 'Garrafa 2 litros', '7891000000073', 'REF-003', 5.10, 9.50, 14, false),
      ('Refrigerantes', 'Refrigerante Cola Lata 350ml', 'Cola Brasil', 'Lata 350 ml', '7891000000080', 'REF-004', 2.60, 5.00, 30, false),
      ('Aguas', 'Agua Mineral 500ml', 'Fonte Azul', 'Garrafa 500 ml', '7891000000097', 'AGU-001', 1.00, 2.50, 48, false),
      ('Aguas', 'Agua com Gas 500ml', 'Fonte Azul', 'Garrafa 500 ml', '7891000000103', 'AGU-002', 1.35, 3.00, 36, false),
      ('Aguas', 'Agua Mineral 1,5L', 'Fonte Azul', 'Garrafa 1,5 litro', '7891000000110', 'AGU-003', 2.15, 4.50, 24, false),
      ('Energeticos', 'Energetico 250ml', 'Energia Max', 'Lata 250 ml', '7891000000127', 'ENE-001', 4.20, 8.50, 20, false),
      ('Energeticos', 'Energetico 473ml', 'Energia Max', 'Lata 473 ml', '7891000000134', 'ENE-002', 6.70, 12.90, 16, false),
      ('Destilados', 'Vodka 1L', 'Vodka Prata', 'Garrafa 1 litro', '7891000000141', 'DES-001', 24.00, 42.90, 8, false),
      ('Destilados', 'Gin 750ml', 'Gin Botanico', 'Garrafa 750 ml', '7891000000158', 'DES-002', 38.00, 69.90, 6, false),
      ('Destilados', 'Whisky 1L', 'Old Valley', 'Garrafa 1 litro', '7891000000165', 'DES-003', 62.00, 109.90, 5, false),
      ('Sucos', 'Suco de Laranja 1L', 'Fruta Boa', 'Caixa 1 litro', '7891000000172', 'SUC-001', 4.80, 8.90, 12, false),
      ('Sucos', 'Suco de Uva 1L', 'Fruta Boa', 'Caixa 1 litro', '7891000000189', 'SUC-002', 5.30, 9.90, 12, false)
    ) as product_data(
      category_name, product_name, brand, description, barcode, sku,
      cost_price, sale_price, min_stock, is_returnable
    )
  loop
    insert into public.products (
      organization_id, category_id, name, brand, description,
      barcode, sku, unit, units_per_package, cost_price, sale_price,
      min_stock, is_returnable, active
    ) values (
      v_org_id,
      (
        select category.id
        from public.categories as category
        where category.organization_id = v_org_id
          and category.name = v_row.category_name
      ),
      v_row.product_name,
      v_row.brand,
      v_row.description,
      v_row.barcode,
      v_row.sku,
      'UN',
      1,
      v_row.cost_price,
      v_row.sale_price,
      v_row.min_stock,
      v_row.is_returnable,
      true
    );
  end loop;

  for v_i in 1..array_length(v_customer_names, 1)
  loop
    insert into public.customers (
      organization_id, name, phone, email, document, notes, active,
      created_at, updated_at
    ) values (
      v_org_id,
      v_customer_names[v_i],
      '(11) 9' || lpad((1000000 + v_i * 713)::text, 8, '0'),
      'cliente' || lpad(v_i::text, 2, '0') || '@exemplo.com',
      lpad((10000000000::bigint + v_i * 9731)::text, 11, '0'),
      case when mod(v_i, 4) = 0 then 'Prefere entrega no periodo da tarde.' end,
      v_i <> 14,
      now() - make_interval(days => 70 - v_i * 3),
      now() - make_interval(days => 70 - v_i * 3)
    );
  end loop;

  for v_i in 1..array_length(v_supplier_names, 1)
  loop
    insert into public.suppliers (
      organization_id, name, trade_name, cnpj, phone, email,
      contact_name, notes, active, created_at, updated_at
    ) values (
      v_org_id,
      v_supplier_names[v_i],
      split_part(v_supplier_names[v_i], ' ', 1),
      lpad((12345678000000::bigint + v_i * 100 + v_i)::text, 14, '0'),
      '(11) 3' || lpad((2000000 + v_i * 911)::text, 7, '0'),
      'fornecedor' || v_i || '@exemplo.com',
      'Contato ' || v_i,
      case when mod(v_i, 2) = 0 then 'Entrega semanal programada.' end,
      true,
      now() - make_interval(days => 100 - v_i * 5),
      now() - make_interval(days => 100 - v_i * 5)
    );
  end loop;

  insert into public.stock_locations (
    id, organization_id, name, description, active
  ) values
    (v_primary_location_id, v_org_id, 'Deposito Principal', 'Estoque central da distribuidora', true),
    (v_secondary_location_id, v_org_id, 'Loja', 'Estoque de pronta-entrega', true);

  insert into public.financial_categories (
    organization_id, name, entry_type, active
  ) values
    (v_org_id, 'Receitas de vendas', 'income', true),
    (v_org_id, 'Outras receitas', 'income', true),
    (v_org_id, 'Compra de mercadorias', 'expense', true),
    (v_org_id, 'Aluguel', 'expense', true),
    (v_org_id, 'Energia eletrica', 'expense', true),
    (v_org_id, 'Combustivel e entregas', 'expense', true),
    (v_org_id, 'Manutencao', 'expense', true);

  select count(*) into v_product_count
  from public.products where organization_id = v_org_id;

  select count(*) into v_customer_count
  from public.customers where organization_id = v_org_id;

  select count(*) into v_supplier_count
  from public.suppliers where organization_id = v_org_id;

  -- ----------------------------------------------------------
  -- CAIXA ATUAL E FECHAMENTOS ANTERIORES
  -- ----------------------------------------------------------
  insert into public.cash_registers (
    id, organization_id, name, location_id, active
  ) values (
    v_register_id, v_org_id, 'Caixa Principal', v_primary_location_id, true
  );

  insert into public.cash_sessions (
    id, organization_id, cash_register_id, status, opened_by,
    opened_at, opening_balance, notes
  ) values (
    v_open_session_id, v_org_id, v_register_id, 'open', v_owner_id,
    now() - interval '10 hours', 350.00, 'Expediente atual'
  );

  insert into public.cash_movements (
    organization_id, cash_session_id, movement_type, amount, direction,
    description, created_by, created_at
  ) values
    (v_org_id, v_open_session_id, 'opening', 350.00, 'in', 'Abertura do caixa', v_owner_id, now() - interval '10 hours'),
    (v_org_id, v_open_session_id, 'cash_in', 180.00, 'in', 'Suprimento para troco', v_owner_id, now() - interval '9 hours'),
    (v_org_id, v_open_session_id, 'expense', 42.50, 'out', 'Despesa rapida de entrega', v_owner_id, now() - interval '4 hours');

  for v_i in 1..7
  loop
    v_opening := round((200 + random() * 250)::numeric, 2);
    v_cash_in := round((450 + random() * 950)::numeric, 2);
    v_cash_out := round((40 + random() * 180)::numeric, 2);

    insert into public.cash_sessions (
      organization_id, cash_register_id, status, opened_by, opened_at,
      opening_balance, closed_by, closed_at, expected_closing_balance,
      counted_closing_balance, notes
    ) values (
      v_org_id,
      v_register_id,
      'closed',
      v_owner_id,
      now() - make_interval(days => v_i, hours => 11),
      v_opening,
      v_owner_id,
      now() - make_interval(days => v_i, hours => 2),
      v_opening + v_cash_in - v_cash_out,
      v_opening + v_cash_in - v_cash_out + case when mod(v_i, 3) = 0 then 2.00 else 0 end,
      'Fechamento de demonstracao'
    ) returning id into v_session_id;

    insert into public.cash_movements (
      organization_id, cash_session_id, movement_type, amount, direction,
      description, created_by, created_at
    ) values
      (v_org_id, v_session_id, 'opening', v_opening, 'in', 'Abertura do caixa', v_owner_id, now() - make_interval(days => v_i, hours => 11)),
      (v_org_id, v_session_id, 'cash_in', v_cash_in, 'in', 'Recebimentos do expediente', v_owner_id, now() - make_interval(days => v_i, hours => 6)),
      (v_org_id, v_session_id, 'expense', v_cash_out, 'out', 'Despesas do expediente', v_owner_id, now() - make_interval(days => v_i, hours => 4));
  end loop;

  -- ----------------------------------------------------------
  -- ESTOQUE INICIAL
  -- ----------------------------------------------------------
  for v_product in
    select product.*
    from public.products as product
    where product.organization_id = v_org_id
    order by product.name
  loop
    insert into public.stock_movements (
      organization_id, location_id, product_id, movement_type,
      quantity_delta, unit_cost, reference_type, notes,
      created_by, created_at
    ) values
      (
        v_org_id, v_primary_location_id, v_product.id, 'initial_stock',
        180 + floor(random() * 221), v_product.cost_price,
        'seed', 'Saldo inicial de demonstracao', v_owner_id,
        now() - interval '90 days'
      ),
      (
        v_org_id, v_secondary_location_id, v_product.id, 'initial_stock',
        30 + floor(random() * 71), v_product.cost_price,
        'seed', 'Saldo inicial de demonstracao', v_owner_id,
        now() - interval '90 days'
      );
  end loop;

  -- ----------------------------------------------------------
  -- COMPRAS E RECEBIMENTOS
  -- ----------------------------------------------------------
  for v_i in 1..12
  loop
    select supplier.id into v_supplier_id
    from public.suppliers as supplier
    where supplier.organization_id = v_org_id
    order by supplier.name
    limit 1 offset mod(v_i - 1, v_supplier_count);

    v_status := case
      when v_i <= 7 then 'received'
      when v_i <= 9 then 'partially_received'
      else 'ordered'
    end;
    v_ordered_at := now() - make_interval(days => 78 - v_i * 5);
    v_expected_at := v_ordered_at + make_interval(days => 7 + mod(v_i, 5));
    v_received_at := case
      when v_status = 'received'
        then v_ordered_at + make_interval(days => 3 + mod(v_i, 4))
      else null
    end;

    insert into public.purchase_orders (
      organization_id, supplier_id, status, supplier_document_number,
      ordered_at, expected_at, received_at, subtotal, discount,
      freight, other_costs, total, notes, created_by, created_at, updated_at
    ) values (
      v_org_id, v_supplier_id, v_status,
      'NF-' || lpad((1000 + v_i)::text, 6, '0'),
      v_ordered_at, v_expected_at, v_received_at,
      0, 0, 0, 0, 0,
      case when v_status = 'ordered' then 'Pedido aguardando recebimento.' else 'Pedido de demonstracao.' end,
      v_owner_id, v_ordered_at, coalesce(v_received_at, v_ordered_at)
    ) returning id into v_purchase_id;

    v_item_count := 2 + mod(v_i, 3);

    for v_j in 1..v_item_count
    loop
      select product.* into v_product
      from public.products as product
      where product.organization_id = v_org_id
      order by product.name
      limit 1 offset mod((v_i - 1) * 4 + (v_j - 1), v_product_count);

      v_quantity := 12 + mod(v_i * 7 + v_j * 5, 37);
      v_received_quantity := case
        when v_status = 'received' then v_quantity
        when v_status = 'partially_received' then greatest(1, floor(v_quantity / 2))
        else 0
      end;
      v_unit_cost := round(
        v_product.cost_price * (0.92 + random()::numeric * 0.12),
        2
      );

      insert into public.purchase_items (
        organization_id, purchase_order_id, product_id,
        quantity_ordered, quantity_received, unit_cost, discount, total
      ) values (
        v_org_id, v_purchase_id, v_product.id,
        v_quantity, v_received_quantity, v_unit_cost, 0,
        round(v_quantity * v_unit_cost, 2)
      );
    end loop;

    select coalesce(sum(item.total), 0)
      into v_subtotal
    from public.purchase_items as item
    where item.purchase_order_id = v_purchase_id;

    v_discount := case when mod(v_i, 4) = 0 then round(v_subtotal * 0.03, 2) else 0 end;
    v_freight := round((20 + random() * 60)::numeric, 2);
    v_total := round(v_subtotal - v_discount + v_freight, 2);

    update public.purchase_orders
    set subtotal = v_subtotal,
        discount = v_discount,
        freight = v_freight,
        total = v_total,
        updated_at = coalesce(v_received_at, v_ordered_at)
    where id = v_purchase_id;

    if v_status in ('received', 'partially_received') then
      insert into public.purchase_receipts (
        organization_id, purchase_order_id, location_id,
        received_at, received_by, created_at
      ) values (
        v_org_id,
        v_purchase_id,
        v_primary_location_id,
        coalesce(v_received_at, v_ordered_at + interval '6 days'),
        v_owner_id,
        coalesce(v_received_at, v_ordered_at + interval '6 days')
      ) returning id into v_receipt_id;

      insert into public.purchase_receipt_items (
        organization_id, receipt_id, purchase_item_id, product_id,
        quantity_received, unit_cost, created_at
      )
      select
        v_org_id,
        v_receipt_id,
        item.id,
        item.product_id,
        item.quantity_received,
        item.unit_cost,
        coalesce(v_received_at, v_ordered_at + interval '6 days')
      from public.purchase_items as item
      where item.purchase_order_id = v_purchase_id
        and item.quantity_received > 0;

      insert into public.stock_movements (
        organization_id, location_id, product_id, movement_type,
        quantity_delta, unit_cost, reference_type, reference_id,
        notes, created_by, created_at
      )
      select
        v_org_id,
        v_primary_location_id,
        receipt_item.product_id,
        'purchase_in',
        receipt_item.quantity_received,
        receipt_item.unit_cost,
        'purchase_order',
        v_purchase_id,
        'Recebimento do pedido #' || left(v_purchase_id::text, 8),
        v_owner_id,
        coalesce(v_received_at, v_ordered_at + interval '6 days')
      from public.purchase_receipt_items as receipt_item
      where receipt_item.receipt_id = v_receipt_id;

      v_status := case when mod(v_i, 3) = 0 then 'paid' else 'overdue' end;

      insert into public.financial_entries (
        organization_id, category_id, supplier_id, purchase_order_id,
        entry_type, status, description, amount, amount_paid,
        issue_date, due_date, paid_at, payment_method, reference_code,
        notes, created_by, created_at, updated_at
      ) values (
        v_org_id,
        (
          select category.id from public.financial_categories as category
          where category.organization_id = v_org_id
            and category.name = 'Compra de mercadorias'
            and category.entry_type = 'expense'
        ),
        v_supplier_id,
        v_purchase_id,
        'expense',
        v_status,
        'Compra #' || left(v_purchase_id::text, 8),
        v_total,
        case when v_status = 'paid' then v_total else 0 end,
        coalesce(v_received_at, v_ordered_at)::date,
        (coalesce(v_received_at, v_ordered_at) + interval '14 days')::date,
        case when v_status = 'paid' then coalesce(v_received_at, v_ordered_at) + interval '5 days' end,
        case when v_status = 'paid' then 'bank_transfer' end,
        'COMP-' || lpad(v_i::text, 4, '0'),
        'Lancamento gerado pelo seed.',
        v_owner_id,
        coalesce(v_received_at, v_ordered_at),
        coalesce(v_received_at, v_ordered_at)
      ) returning id into v_financial_id;

      if v_status = 'paid' then
        insert into public.financial_entry_payments (
          organization_id, financial_entry_id, amount, payment_method,
          paid_at, reference_code, notes, created_by
        ) values (
          v_org_id, v_financial_id, v_total, 'bank_transfer',
          coalesce(v_received_at, v_ordered_at) + interval '5 days',
          'PAG-COMP-' || lpad(v_i::text, 4, '0'),
          'Pagamento de compra de demonstracao.', v_owner_id
        );
      end if;
    end if;
  end loop;

  -- ----------------------------------------------------------
  -- VENDAS, ITENS, PAGAMENTOS E FINANCEIRO
  -- ----------------------------------------------------------
  for v_i in 1..42
  loop
    if mod(v_i, 5) = 0 then
      v_customer_id := null;
    else
      select customer.id into v_customer_id
      from public.customers as customer
      where customer.organization_id = v_org_id
      order by customer.name
      limit 1 offset mod(v_i - 1, v_customer_count);
    end if;

    v_sold_at := case
      when v_i <= 6 then now() - make_interval(mins => v_i * 18)
      else now() - make_interval(
        days => 1 + mod(v_i * 7, 44),
        hours => mod(v_i * 3, 10)
      )
    end;

    insert into public.sales (
      organization_id, customer_id, status, sold_at, subtotal,
      discount, total, notes, created_by, created_at, updated_at
    ) values (
      v_org_id, v_customer_id, 'completed', v_sold_at,
      0, 0, 0,
      case when mod(v_i, 9) = 0 then 'Entrega solicitada pelo cliente.' end,
      v_owner_id, v_sold_at, v_sold_at
    ) returning id into v_sale_id;

    v_item_count := 1 + mod(v_i, 3);

    for v_j in 1..v_item_count
    loop
      select product.* into v_product
      from public.products as product
      where product.organization_id = v_org_id
      order by product.name
      limit 1 offset mod(v_i * 3 + v_j - 1, v_product_count);

      v_quantity := 1 + mod(v_i + v_j, 4);

      insert into public.sale_items (
        organization_id, sale_id, product_id, quantity,
        unit_price, unit_cost, discount, total
      ) values (
        v_org_id, v_sale_id, v_product.id, v_quantity,
        v_product.sale_price, v_product.cost_price, 0,
        round(v_quantity * v_product.sale_price, 2)
      );
    end loop;

    select coalesce(sum(item.total), 0)
      into v_subtotal
    from public.sale_items as item
    where item.sale_id = v_sale_id;

    v_discount := case when mod(v_i, 6) = 0 then round(v_subtotal * 0.05, 2) else 0 end;
    v_total := round(v_subtotal - v_discount, 2);
    v_payment_method := v_payment_methods[1 + mod(v_i - 1, array_length(v_payment_methods, 1))];

    update public.sales
    set subtotal = v_subtotal,
        discount = v_discount,
        total = v_total,
        updated_at = v_sold_at
    where id = v_sale_id;

    insert into public.sale_payments (
      organization_id, sale_id, payment_method, amount, status,
      paid_at, transaction_reference, notes, created_at
    ) values (
      v_org_id, v_sale_id, v_payment_method, v_total, 'paid',
      v_sold_at, 'VEN-' || lpad(v_i::text, 5, '0'),
      'Pagamento de demonstracao.', v_sold_at
    );

    insert into public.financial_entries (
      organization_id, category_id, customer_id, sale_id,
      entry_type, status, description, amount, amount_paid,
      issue_date, due_date, paid_at, payment_method, reference_code,
      notes, created_by, created_at, updated_at
    ) values (
      v_org_id,
      (
        select category.id from public.financial_categories as category
        where category.organization_id = v_org_id
          and category.name = 'Receitas de vendas'
          and category.entry_type = 'income'
      ),
      v_customer_id,
      v_sale_id,
      'income', 'paid',
      'Venda #' || left(v_sale_id::text, 8),
      v_total, v_total,
      v_sold_at::date, v_sold_at::date, v_sold_at,
      v_payment_method,
      'REC-' || lpad(v_i::text, 5, '0'),
      'Receita gerada pelo seed.',
      v_owner_id, v_sold_at, v_sold_at
    ) returning id into v_financial_id;

    insert into public.financial_entry_payments (
      organization_id, financial_entry_id, amount, payment_method,
      paid_at, reference_code, notes, created_by
    ) values (
      v_org_id, v_financial_id, v_total, v_payment_method,
      v_sold_at, 'REC-' || lpad(v_i::text, 5, '0'),
      'Recebimento da venda.', v_owner_id
    );

    insert into public.stock_movements (
      organization_id, location_id, product_id, movement_type,
      quantity_delta, unit_cost, reference_type, reference_id,
      notes, created_by, created_at
    )
    select
      v_org_id,
      v_primary_location_id,
      item.product_id,
      'sale_out',
      -item.quantity,
      item.unit_cost,
      'sale',
      v_sale_id,
      'Baixa da venda #' || left(v_sale_id::text, 8),
      v_owner_id,
      v_sold_at
    from public.sale_items as item
    where item.sale_id = v_sale_id;
  end loop;

  -- Consolida o saldo a partir de todas as entradas e saidas criadas acima.
  insert into public.inventory_balances (
    organization_id, location_id, product_id, quantity_on_hand, updated_at
  )
  select
    movement.organization_id,
    movement.location_id,
    movement.product_id,
    sum(movement.quantity_delta),
    now()
  from public.stock_movements as movement
  where movement.organization_id = v_org_id
  group by movement.organization_id, movement.location_id, movement.product_id;

  -- ----------------------------------------------------------
  -- DEVOLUCOES PARCIAIS DE VENDAS
  -- ----------------------------------------------------------
  for v_row in
    select *
    from (
      select distinct on (sale.id)
        sale.id as sale_id,
        sale.customer_id,
        sale.subtotal as sale_subtotal,
        sale.total as sale_total,
        sale.sold_at,
        item.id as sale_item_id,
        item.product_id,
        item.quantity as sold_quantity,
        item.unit_price,
        item.unit_cost,
        payment.payment_method
      from public.sales as sale
      join public.sale_items as item
        on item.sale_id = sale.id
       and item.organization_id = sale.organization_id
      join public.sale_payments as payment
        on payment.sale_id = sale.id
       and payment.organization_id = sale.organization_id
      where sale.organization_id = v_org_id
        and sale.status = 'completed'
        and item.quantity >= 1
      order by sale.id, item.id
    ) as return_candidate
    order by return_candidate.sold_at desc
    limit 2
  loop
    v_quantity := 1;
    v_refund := round(
      v_row.sale_total *
      ((v_quantity * v_row.unit_price) / nullif(v_row.sale_subtotal, 0)),
      2
    );

    insert into public.sale_returns (
      organization_id, sale_id, return_type, status, location_id,
      payment_method, refund_amount, reason, created_by, created_at
    ) values (
      v_org_id, v_row.sale_id, 'return', 'completed', v_primary_location_id,
      v_row.payment_method, v_refund,
      'Produto devolvido em demonstracao.', v_owner_id,
      least(now(), v_row.sold_at + interval '1 day')
    ) returning id into v_return_id;

    insert into public.sale_return_items (
      organization_id, sale_return_id, sale_item_id, product_id,
      quantity, unit_refund, total_refund
    ) values (
      v_org_id, v_return_id, v_row.sale_item_id, v_row.product_id,
      v_quantity, round(v_refund / v_quantity, 2), v_refund
    );

    update public.inventory_balances
    set quantity_on_hand = quantity_on_hand + v_quantity,
        updated_at = now()
    where organization_id = v_org_id
      and location_id = v_primary_location_id
      and product_id = v_row.product_id;

    insert into public.stock_movements (
      organization_id, location_id, product_id, movement_type,
      quantity_delta, unit_cost, reference_type, reference_id,
      notes, created_by, created_at
    ) values (
      v_org_id, v_primary_location_id, v_row.product_id,
      'customer_return', v_quantity, v_row.unit_cost,
      'sale_return', v_return_id,
      'Devolucao parcial da venda #' || left(v_row.sale_id::text, 8),
      v_owner_id, least(now(), v_row.sold_at + interval '1 day')
    );

    insert into public.financial_entries (
      organization_id, customer_id, sale_id, entry_type, status,
      description, amount, amount_paid, issue_date, due_date,
      paid_at, payment_method, reference_code, notes,
      created_by, created_at, updated_at
    ) values (
      v_org_id, v_row.customer_id, v_row.sale_id, 'expense', 'paid',
      'Estorno da devolucao da venda #' || left(v_row.sale_id::text, 8),
      v_refund, v_refund, current_date, current_date,
      now(), v_row.payment_method,
      'DEV-' || left(v_return_id::text, 8),
      'Devolucao parcial de demonstracao.',
      v_owner_id, now(), now()
    ) returning id into v_financial_id;

    insert into public.financial_entry_payments (
      organization_id, financial_entry_id, amount, payment_method,
      paid_at, reference_code, notes, created_by
    ) values (
      v_org_id, v_financial_id, v_refund, v_row.payment_method,
      now(), 'DEV-' || left(v_return_id::text, 8),
      'Pagamento do estorno.', v_owner_id
    );

    insert into public.audit_logs (
      organization_id, user_id, action, table_name, record_id,
      old_data, new_data, created_at
    ) values (
      v_org_id, v_owner_id, 'return', 'sales', v_row.sale_id::text,
      jsonb_build_object('status', 'completed'),
      jsonb_build_object(
        'status', 'completed',
        'sale_return_id', v_return_id,
        'refund_amount', v_refund,
        'reason', 'Produto devolvido em demonstracao.'
      ),
      now()
    );
  end loop;

  -- ----------------------------------------------------------
  -- CONTAGENS DE ESTOQUE
  -- ----------------------------------------------------------
  for v_i in 1..2
  loop
    insert into public.stock_counts (
      organization_id, location_id, status, started_at,
      completed_at, notes, created_by
    ) values (
      v_org_id,
      case when v_i = 1 then v_primary_location_id else v_secondary_location_id end,
      'completed',
      now() - make_interval(days => 20 - v_i * 6, hours => 3),
      now() - make_interval(days => 20 - v_i * 6, hours => 1),
      'Contagem ciclica de demonstracao.',
      v_owner_id
    ) returning id into v_stock_count_id;

    insert into public.stock_count_items (
      organization_id, stock_count_id, product_id,
      expected_quantity, counted_quantity, notes
    )
    select
      v_org_id,
      v_stock_count_id,
      balance.product_id,
      balance.quantity_on_hand,
      greatest(
        0,
        balance.quantity_on_hand + mod(row_number() over (order by balance.product_id), 3) - 1
      ),
      case
        when mod(row_number() over (order by balance.product_id), 3) = 1
          then 'Diferenca identificada na contagem.'
      end
    from public.inventory_balances as balance
    where balance.organization_id = v_org_id
      and balance.location_id = case
        when v_i = 1 then v_primary_location_id
        else v_secondary_location_id
      end
    order by balance.product_id
    limit 8;
  end loop;

  -- ----------------------------------------------------------
  -- VASILHAMES RETORNAVEIS
  -- ----------------------------------------------------------
  for v_product in
    select product.*
    from public.products as product
    where product.organization_id = v_org_id
      and product.is_returnable
  loop
    for v_i in 1..5
    loop
      select customer.id into v_customer_id
      from public.customers as customer
      where customer.organization_id = v_org_id
      order by customer.name
      limit 1 offset mod(v_i * 2, v_customer_count);

      insert into public.returnable_container_movements (
        organization_id, product_id, customer_id, movement_type,
        quantity, deposit_amount, notes, created_by, created_at
      ) values (
        v_org_id, v_product.id, v_customer_id,
        'delivered_to_customer', 2 + mod(v_i, 4),
        round((2 + mod(v_i, 4)) * 3.00, 2),
        'Entrega de vasilhames de demonstracao.',
        v_owner_id, now() - make_interval(days => 18 - v_i * 2)
      );

      if mod(v_i, 2) = 0 then
        insert into public.returnable_container_movements (
          organization_id, product_id, customer_id, movement_type,
          quantity, deposit_amount, notes, created_by, created_at
        ) values (
          v_org_id, v_product.id, v_customer_id,
          'returned_by_customer', 1 + mod(v_i, 2), 3.00,
          'Retorno parcial de vasilhames.',
          v_owner_id, now() - make_interval(days => 17 - v_i * 2)
        );
      end if;
    end loop;
  end loop;

  -- ----------------------------------------------------------
  -- OUTROS LANCAMENTOS FINANCEIROS
  -- ----------------------------------------------------------
  for v_i in 1..12
  loop
    v_total := round((90 + random() * 850)::numeric, 2);
    v_status := case
      when mod(v_i, 4) = 0 then 'pending'
      when mod(v_i, 5) = 0 then 'overdue'
      else 'paid'
    end;
    v_payment_method := case when mod(v_i, 2) = 0 then 'pix' else 'bank_transfer' end;

    select supplier.id into v_supplier_id
    from public.suppliers as supplier
    where supplier.organization_id = v_org_id
    order by supplier.name
    limit 1 offset mod(v_i - 1, v_supplier_count);

    insert into public.financial_entries (
      organization_id, category_id, supplier_id, entry_type, status,
      description, amount, amount_paid, issue_date, due_date,
      paid_at, payment_method, reference_code, notes,
      created_by, created_at, updated_at
    ) values (
      v_org_id,
      (
        select category.id
        from public.financial_categories as category
        where category.organization_id = v_org_id
          and category.entry_type = 'expense'
        order by category.name
        limit 1 offset mod(v_i, 4)
      ),
      v_supplier_id,
      'expense',
      v_status,
      case mod(v_i, 4)
        when 0 then 'Aluguel e despesas do imovel'
        when 1 then 'Energia eletrica'
        when 2 then 'Combustivel para entregas'
        else 'Manutencao de equipamentos'
      end,
      v_total,
      case when v_status = 'paid' then v_total else 0 end,
      current_date - (35 - v_i * 2),
      current_date - (20 - v_i * 2),
      case when v_status = 'paid' then now() - make_interval(days => 30 - v_i * 2) end,
      case when v_status = 'paid' then v_payment_method end,
      'DESP-' || lpad(v_i::text, 4, '0'),
      'Lancamento avulso de demonstracao.',
      v_owner_id,
      now() - make_interval(days => 35 - v_i * 2),
      now() - make_interval(days => 30 - v_i * 2)
    ) returning id into v_financial_id;

    if v_status = 'paid' then
      insert into public.financial_entry_payments (
        organization_id, financial_entry_id, amount, payment_method,
        paid_at, reference_code, notes, created_by
      ) values (
        v_org_id, v_financial_id, v_total, v_payment_method,
        now() - make_interval(days => 30 - v_i * 2),
        'PAG-DESP-' || lpad(v_i::text, 4, '0'),
        'Pagamento de despesa avulsa.', v_owner_id
      );
    end if;
  end loop;
end
$seed$;

-- A transacao inteira e revertida se algum conjunto essencial ficar vazio.
do $verify$
begin
  if not exists (select 1 from public.organization_members where role = 'owner') then
    raise exception 'Validacao falhou: proprietario nao criado.';
  end if;

  if (select count(*) from public.products) < 18 then
    raise exception 'Validacao falhou: catalogo incompleto.';
  end if;

  if not exists (select 1 from public.sales where status = 'completed') then
    raise exception 'Validacao falhou: nenhuma venda concluida.';
  end if;

  if not exists (select 1 from public.inventory_balances where quantity_on_hand > 0) then
    raise exception 'Validacao falhou: estoque nao consolidado.';
  end if;

  if not exists (select 1 from public.purchase_receipts) then
    raise exception 'Validacao falhou: nenhum recebimento de compra.';
  end if;
end
$verify$;

commit;

-- Resumo exibido ao final no SQL Editor.
select *
from (values
  ('organizacoes', (select count(*)::bigint from public.organizations)),
  ('membros', (select count(*)::bigint from public.organization_members)),
  ('categorias', (select count(*)::bigint from public.categories)),
  ('produtos', (select count(*)::bigint from public.products)),
  ('clientes', (select count(*)::bigint from public.customers)),
  ('fornecedores', (select count(*)::bigint from public.suppliers)),
  ('locais_estoque', (select count(*)::bigint from public.stock_locations)),
  ('saldos_estoque', (select count(*)::bigint from public.inventory_balances)),
  ('movimentos_estoque', (select count(*)::bigint from public.stock_movements)),
  ('compras', (select count(*)::bigint from public.purchase_orders)),
  ('recebimentos_compra', (select count(*)::bigint from public.purchase_receipts)),
  ('vendas', (select count(*)::bigint from public.sales)),
  ('devolucoes', (select count(*)::bigint from public.sale_returns)),
  ('lancamentos_financeiros', (select count(*)::bigint from public.financial_entries)),
  ('sessoes_caixa', (select count(*)::bigint from public.cash_sessions)),
  ('auditoria', (select count(*)::bigint from public.audit_logs))
) as summary(table_name, row_count)
order by summary.table_name;
