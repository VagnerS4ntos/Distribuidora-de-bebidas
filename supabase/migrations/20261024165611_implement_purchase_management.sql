begin;

create index if not exists purchase_orders_org_status_date_idx
  on public.purchase_orders (organization_id, status, ordered_at desc);

create index if not exists purchase_items_org_product_idx
  on public.purchase_items (organization_id, product_id);

create unique index if not exists purchase_items_order_product_unique_idx
  on public.purchase_items (purchase_order_id, product_id);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.create_purchase_order(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_supplier_document_number text,
  p_expected_at date,
  p_items jsonb,
  p_discount numeric,
  p_freight numeric,
  p_other_costs numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_purchase_id uuid;
  v_item record;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit_cost numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := round(coalesce(p_discount, 0), 2);
  v_freight numeric(12,2) := round(coalesce(p_freight, 0), 2);
  v_other_costs numeric(12,2) := round(coalesce(p_other_costs, 0), 2);
  v_total numeric(12,2);
  v_item_count integer;
  v_distinct_product_count integer;
begin
  if v_user_id is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = v_user_id
      and member.role in ('owner', 'manager', 'operator')
  ) then
    raise exception 'Você não possui acesso para registrar compras nesta organização.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.suppliers supplier
    where supplier.id = p_supplier_id
      and supplier.organization_id = p_organization_id
      and supplier.active
  ) then
    raise exception 'Selecione um fornecedor ativo.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_supplier_document_number, '')) > 80
    or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Um dos campos ultrapassou o limite permitido.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe os produtos do pedido.' using errcode = '22023';
  end if;

  select count(*), count(distinct item.value ->> 'product_id')
    into v_item_count, v_distinct_product_count
  from jsonb_array_elements(p_items) item;

  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'O pedido deve ter entre 1 e 100 produtos.' using errcode = '22023';
  end if;

  if v_item_count <> v_distinct_product_count then
    raise exception 'O mesmo produto não pode aparecer mais de uma vez.' using errcode = '22023';
  end if;

  for v_item in select item.value from jsonb_array_elements(p_items) item
  loop
    begin
      v_product_id := nullif(v_item.value ->> 'product_id', '')::uuid;
      v_quantity := nullif(v_item.value ->> 'quantity', '')::numeric;
      v_unit_cost := nullif(v_item.value ->> 'unit_cost', '')::numeric;
    exception when others then
      raise exception 'Produto, quantidade ou custo inválido.' using errcode = '22023';
    end;

    if v_product_id is null
      or v_quantity is null
      or v_quantity <= 0
      or v_quantity > 999999999
      or trunc(v_quantity) <> v_quantity then
      raise exception 'As quantidades devem ser números inteiros maiores que zero.' using errcode = '22023';
    end if;

    if v_unit_cost is null
      or v_unit_cost < 0
      or v_unit_cost > 9999999999.99
      or round(v_unit_cost, 2) <> v_unit_cost then
      raise exception 'Informe um custo válido para cada produto.' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.products product
      where product.id = v_product_id
        and product.organization_id = p_organization_id
        and product.active
    ) then
      raise exception 'Um dos produtos não está disponível para compra.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + round(v_quantity * v_unit_cost, 2);
  end loop;

  if v_discount < 0 or v_freight < 0 or v_other_costs < 0 then
    raise exception 'Desconto, frete e outros custos não podem ser negativos.' using errcode = '22023';
  end if;

  if v_discount > v_subtotal then
    raise exception 'O desconto não pode ser maior que o subtotal.' using errcode = '22023';
  end if;

  v_total := v_subtotal - v_discount + v_freight + v_other_costs;
  if v_total <= 0 then
    raise exception 'O total do pedido deve ser maior que zero.' using errcode = '22023';
  end if;

  insert into public.purchase_orders (
    organization_id,
    supplier_id,
    status,
    supplier_document_number,
    ordered_at,
    expected_at,
    subtotal,
    discount,
    freight,
    other_costs,
    total,
    notes,
    created_by
  )
  values (
    p_organization_id,
    p_supplier_id,
    'ordered',
    nullif(btrim(coalesce(p_supplier_document_number, '')), ''),
    now(),
    case
      when p_expected_at is null then null
      else p_expected_at::timestamp at time zone 'America/Sao_Paulo'
    end,
    v_subtotal,
    v_discount,
    v_freight,
    v_other_costs,
    v_total,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_purchase_id;

  for v_item in select item.value from jsonb_array_elements(p_items) item
  loop
    v_product_id := (v_item.value ->> 'product_id')::uuid;
    v_quantity := (v_item.value ->> 'quantity')::numeric;
    v_unit_cost := (v_item.value ->> 'unit_cost')::numeric;

    insert into public.purchase_items (
      organization_id,
      purchase_order_id,
      product_id,
      quantity_ordered,
      quantity_received,
      unit_cost,
      discount,
      total
    )
    values (
      p_organization_id,
      v_purchase_id,
      v_product_id,
      v_quantity,
      0,
      v_unit_cost,
      0,
      round(v_quantity * v_unit_cost, 2)
    );
  end loop;

  insert into public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'insert',
    'purchase_orders',
    v_purchase_id::text,
    jsonb_build_object(
      'status', 'ordered',
      'supplier_id', p_supplier_id,
      'subtotal', v_subtotal,
      'discount', v_discount,
      'freight', v_freight,
      'other_costs', v_other_costs,
      'total', v_total,
      'item_count', v_item_count
    )
  );

  return v_purchase_id;
end;
$$;

create or replace function private.receive_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_location_id uuid,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_purchase_status text;
  v_purchase_total numeric(12,2);
  v_supplier_id uuid;
  v_item record;
  v_purchase_item_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_quantity numeric(12,3);
  v_quantity_ordered numeric(12,3);
  v_quantity_received numeric(12,3);
  v_unit_cost numeric(12,2);
  v_item_count integer;
  v_distinct_product_count integer;
  v_new_status text;
begin
  if v_user_id is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = v_user_id
      and member.role in ('owner', 'manager', 'operator')
  ) then
    raise exception 'Você não possui acesso para receber compras nesta organização.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.stock_locations location
    where location.id = p_location_id
      and location.organization_id = p_organization_id
      and location.active
  ) then
    raise exception 'Selecione um local de estoque ativo.' using errcode = '22023';
  end if;

  select purchase.status, purchase.total, purchase.supplier_id
    into v_purchase_status, v_purchase_total, v_supplier_id
  from public.purchase_orders purchase
  where purchase.id = p_purchase_order_id
    and purchase.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = '22023';
  end if;

  if v_purchase_status not in ('ordered', 'partially_received') then
    raise exception 'Este pedido não está disponível para recebimento.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe os produtos recebidos.' using errcode = '22023';
  end if;

  select count(*), count(distinct item.value ->> 'product_id')
    into v_item_count, v_distinct_product_count
  from jsonb_array_elements(p_items) item;

  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'Informe ao menos um produto recebido.' using errcode = '22023';
  end if;

  if v_item_count <> v_distinct_product_count then
    raise exception 'O mesmo produto não pode aparecer mais de uma vez.' using errcode = '22023';
  end if;

  for v_item in select item.value from jsonb_array_elements(p_items) item
  loop
    begin
      v_product_id := nullif(v_item.value ->> 'product_id', '')::uuid;
      v_quantity := nullif(v_item.value ->> 'quantity', '')::numeric;
    exception when others then
      raise exception 'Produto ou quantidade recebida inválida.' using errcode = '22023';
    end;

    if v_product_id is null
      or v_quantity is null
      or v_quantity <= 0
      or v_quantity > 999999999
      or trunc(v_quantity) <> v_quantity then
      raise exception 'As quantidades recebidas devem ser números inteiros maiores que zero.' using errcode = '22023';
    end if;

    select purchase_item.id,
           purchase_item.quantity_ordered,
           purchase_item.quantity_received,
           purchase_item.unit_cost,
           product.name
      into v_purchase_item_id,
           v_quantity_ordered,
           v_quantity_received,
           v_unit_cost,
           v_product_name
    from public.purchase_items purchase_item
    join public.products product
      on product.id = purchase_item.product_id
     and product.organization_id = purchase_item.organization_id
    where purchase_item.purchase_order_id = p_purchase_order_id
      and purchase_item.organization_id = p_organization_id
      and purchase_item.product_id = v_product_id
    for update of purchase_item;

    if not found then
      raise exception 'Um dos produtos não pertence a este pedido.' using errcode = '22023';
    end if;

    if v_quantity > v_quantity_ordered - v_quantity_received then
      raise exception 'A quantidade recebida de % ultrapassa o saldo do pedido.', v_product_name
        using errcode = '22023';
    end if;

    update public.purchase_items
    set quantity_received = quantity_received + v_quantity
    where id = v_purchase_item_id;

    insert into public.inventory_balances (
      organization_id,
      location_id,
      product_id,
      quantity_on_hand
    )
    values (
      p_organization_id,
      p_location_id,
      v_product_id,
      v_quantity
    )
    on conflict (organization_id, location_id, product_id)
    do update
      set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand,
          updated_at = now();

    update public.products
    set cost_price = v_unit_cost
    where id = v_product_id
      and organization_id = p_organization_id;

    insert into public.stock_movements (
      organization_id,
      location_id,
      product_id,
      movement_type,
      quantity_delta,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      p_organization_id,
      p_location_id,
      v_product_id,
      'purchase_in',
      v_quantity,
      v_unit_cost,
      'purchase_order',
      p_purchase_order_id,
      'Entrada automática do pedido de compra',
      v_user_id
    );
  end loop;

  if exists (
    select 1
    from public.purchase_items item
    where item.purchase_order_id = p_purchase_order_id
      and item.organization_id = p_organization_id
      and item.quantity_received < item.quantity_ordered
  ) then
    v_new_status := 'partially_received';
  else
    v_new_status := 'received';
  end if;

  update public.purchase_orders
  set status = v_new_status,
      received_at = case when v_new_status = 'received' then now() else null end
  where id = p_purchase_order_id
    and organization_id = p_organization_id;

  if v_new_status = 'received' and not exists (
    select 1
    from public.financial_entries entry
    where entry.organization_id = p_organization_id
      and entry.purchase_order_id = p_purchase_order_id
  ) then
    insert into public.financial_entries (
      organization_id,
      supplier_id,
      purchase_order_id,
      entry_type,
      status,
      description,
      amount,
      amount_paid,
      issue_date,
      reference_code,
      created_by
    )
    values (
      p_organization_id,
      v_supplier_id,
      p_purchase_order_id,
      'expense',
      'pending',
      'Compra #' || left(p_purchase_order_id::text, 8),
      v_purchase_total,
      0,
      current_date,
      left(p_purchase_order_id::text, 8),
      v_user_id
    );
  end if;

  insert into public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'receive',
    'purchase_orders',
    p_purchase_order_id::text,
    jsonb_build_object(
      'status', v_new_status,
      'location_id', p_location_id,
      'received_item_count', v_item_count
    )
  );

  return v_new_status;
end;
$$;

revoke all on function private.create_purchase_order(
  uuid, uuid, text, date, jsonb, numeric, numeric, numeric, text
) from public, anon;
grant execute on function private.create_purchase_order(
  uuid, uuid, text, date, jsonb, numeric, numeric, numeric, text
) to authenticated;

revoke all on function private.receive_purchase_order(uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.receive_purchase_order(uuid, uuid, uuid, jsonb)
  to authenticated;

create or replace function public.create_purchase_order(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_supplier_document_number text,
  p_expected_at date,
  p_items jsonb,
  p_discount numeric,
  p_freight numeric,
  p_other_costs numeric,
  p_notes text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_purchase_order(
    p_organization_id,
    p_supplier_id,
    p_supplier_document_number,
    p_expected_at,
    p_items,
    p_discount,
    p_freight,
    p_other_costs,
    p_notes
  );
$$;

create or replace function public.receive_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_location_id uuid,
  p_items jsonb
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.receive_purchase_order(
    p_organization_id,
    p_purchase_order_id,
    p_location_id,
    p_items
  );
$$;

revoke all on function public.create_purchase_order(
  uuid, uuid, text, date, jsonb, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.create_purchase_order(
  uuid, uuid, text, date, jsonb, numeric, numeric, numeric, text
) to authenticated;

revoke all on function public.receive_purchase_order(uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.receive_purchase_order(uuid, uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'purchase_orders',
    'purchase_items',
    'inventory_balances',
    'stock_movements',
    'products',
    'financial_entries'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

commit;
