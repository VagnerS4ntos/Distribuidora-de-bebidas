begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.create_completed_sale(
  p_organization_id uuid,
  p_customer_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_payment_method text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sale_id uuid;
  v_financial_entry_id uuid;
  v_item record;
  v_product_id uuid;
  v_product_name text;
  v_quantity numeric(12,3);
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_balance_id uuid;
  v_stock numeric(12,3);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := round(coalesce(p_discount, 0), 2);
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
    raise exception 'Você não possui acesso para registrar vendas nesta organização.'
      using errcode = '42501';
  end if;

  if p_payment_method is null or p_payment_method not in (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer',
    'store_credit', 'voucher', 'other'
  ) then
    raise exception 'Forma de pagamento inválida.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Informe os produtos da venda.' using errcode = '22023';
  end if;

  select count(*), count(distinct item.value ->> 'product_id')
    into v_item_count, v_distinct_product_count
  from jsonb_array_elements(p_items) item;

  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'A venda deve ter entre 1 e 100 produtos.' using errcode = '22023';
  end if;

  if v_item_count <> v_distinct_product_count then
    raise exception 'O mesmo produto não pode aparecer mais de uma vez.' using errcode = '22023';
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

  if p_customer_id is not null and not exists (
    select 1
    from public.customers customer
    where customer.id = p_customer_id
      and customer.organization_id = p_organization_id
      and customer.active
  ) then
    raise exception 'O cliente selecionado não está disponível.' using errcode = '22023';
  end if;

  for v_item in select item.value from jsonb_array_elements(p_items) item
  loop
    if jsonb_typeof(v_item.value) <> 'object' then
      raise exception 'Item de venda inválido.' using errcode = '22023';
    end if;

    begin
      v_product_id := nullif(v_item.value ->> 'product_id', '')::uuid;
      v_quantity := nullif(v_item.value ->> 'quantity', '')::numeric;
    exception when others then
      raise exception 'Produto ou quantidade inválidos.' using errcode = '22023';
    end;

    if v_product_id is null
      or v_quantity is null
      or v_quantity <= 0
      or v_quantity > 999999999.999
      or round(v_quantity, 3) <> v_quantity then
      raise exception 'Informe uma quantidade válida para cada produto.' using errcode = '22023';
    end if;

    select product.name, product.sale_price, product.cost_price
      into v_product_name, v_unit_price, v_unit_cost
    from public.products product
    where product.id = v_product_id
      and product.organization_id = p_organization_id
      and product.active;

    if not found then
      raise exception 'Um dos produtos não está disponível para venda.' using errcode = '22023';
    end if;

    select balance.id, balance.quantity_on_hand
      into v_balance_id, v_stock
    from public.inventory_balances balance
    where balance.organization_id = p_organization_id
      and balance.location_id = p_location_id
      and balance.product_id = v_product_id
    for update;

    if not found or v_stock < v_quantity then
      raise exception 'Estoque insuficiente para %.', v_product_name using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + round(v_quantity * v_unit_price, 2);
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'O desconto não pode ser negativo nem maior que o subtotal.' using errcode = '22023';
  end if;

  v_total := v_subtotal - v_discount;
  if v_total <= 0 then
    raise exception 'O total da venda deve ser maior que zero.' using errcode = '22023';
  end if;

  insert into public.sales (
    organization_id,
    customer_id,
    status,
    sold_at,
    subtotal,
    discount,
    total,
    notes,
    created_by
  )
  values (
    p_organization_id,
    p_customer_id,
    'completed',
    now(),
    v_subtotal,
    v_discount,
    v_total,
    nullif(btrim(left(coalesce(p_notes, ''), 1000)), ''),
    v_user_id
  )
  returning id into v_sale_id;

  for v_item in select item.value from jsonb_array_elements(p_items) item
  loop
    v_product_id := (v_item.value ->> 'product_id')::uuid;
    v_quantity := (v_item.value ->> 'quantity')::numeric;

    select product.sale_price, product.cost_price
      into v_unit_price, v_unit_cost
    from public.products product
    where product.id = v_product_id
      and product.organization_id = p_organization_id;

    insert into public.sale_items (
      organization_id,
      sale_id,
      product_id,
      quantity,
      unit_price,
      unit_cost,
      discount,
      total
    )
    values (
      p_organization_id,
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_unit_cost,
      0,
      round(v_quantity * v_unit_price, 2)
    );

    update public.inventory_balances
    set quantity_on_hand = quantity_on_hand - v_quantity,
        updated_at = now()
    where organization_id = p_organization_id
      and location_id = p_location_id
      and product_id = v_product_id;

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
      'sale_out',
      -v_quantity,
      v_unit_cost,
      'sale',
      v_sale_id,
      'Baixa automática da venda',
      v_user_id
    );
  end loop;

  insert into public.sale_payments (
    organization_id,
    sale_id,
    payment_method,
    amount,
    status,
    paid_at
  )
  values (
    p_organization_id,
    v_sale_id,
    p_payment_method,
    v_total,
    'paid',
    now()
  );

  insert into public.financial_entries (
    organization_id,
    customer_id,
    sale_id,
    entry_type,
    status,
    description,
    amount,
    amount_paid,
    issue_date,
    due_date,
    paid_at,
    payment_method,
    reference_code,
    notes,
    created_by
  )
  values (
    p_organization_id,
    p_customer_id,
    v_sale_id,
    'income',
    'paid',
    'Recebimento da venda #' || left(v_sale_id::text, 8),
    v_total,
    v_total,
    current_date,
    current_date,
    now(),
    p_payment_method,
    left(v_sale_id::text, 8),
    nullif(btrim(left(coalesce(p_notes, ''), 1000)), ''),
    v_user_id
  )
  returning id into v_financial_entry_id;

  insert into public.financial_entry_payments (
    organization_id,
    financial_entry_id,
    amount,
    payment_method,
    paid_at,
    reference_code,
    created_by
  )
  values (
    p_organization_id,
    v_financial_entry_id,
    v_total,
    p_payment_method,
    now(),
    left(v_sale_id::text, 8),
    v_user_id
  );

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
    'sales',
    v_sale_id::text,
    jsonb_build_object(
      'status', 'completed',
      'subtotal', v_subtotal,
      'discount', v_discount,
      'total', v_total,
      'payment_method', p_payment_method,
      'location_id', p_location_id,
      'item_count', v_item_count
    )
  );

  return v_sale_id;
end;
$$;

revoke all on function private.create_completed_sale(uuid, uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function private.create_completed_sale(uuid, uuid, uuid, jsonb, numeric, text, text) to authenticated;

create or replace function public.create_completed_sale(
  p_organization_id uuid,
  p_customer_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_payment_method text,
  p_notes text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_completed_sale(
    p_organization_id,
    p_customer_id,
    p_location_id,
    p_items,
    p_discount,
    p_payment_method,
    p_notes
  );
$$;

revoke all on function public.create_completed_sale(uuid, uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function public.create_completed_sale(uuid, uuid, uuid, jsonb, numeric, text, text) to authenticated;

commit;
