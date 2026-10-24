begin;

create index if not exists inventory_balances_org_product_location_idx
  on public.inventory_balances (organization_id, product_id, location_id);

create index if not exists stock_movements_org_created_at_idx
  on public.stock_movements (organization_id, created_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.adjust_inventory_balance(
  p_organization_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_new_quantity numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_balance_id uuid;
  v_movement_id uuid;
  v_current_quantity numeric(12,3);
  v_delta numeric(12,3);
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user_id is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = v_user_id
      and member.role in ('owner', 'manager')
  ) then
    raise exception 'Seu perfil não tem permissão para ajustar o estoque.'
      using errcode = '42501';
  end if;

  if p_new_quantity is null
    or p_new_quantity < 0
    or p_new_quantity > 999999999
    or trunc(p_new_quantity) <> p_new_quantity then
    raise exception 'Informe uma quantidade inteira, maior ou igual a zero.'
      using errcode = '22023';
  end if;

  if char_length(coalesce(v_notes, '')) > 500 then
    raise exception 'A observação deve ter no máximo 500 caracteres.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.products product
    where product.id = p_product_id
      and product.organization_id = p_organization_id
  ) then
    raise exception 'Produto não encontrado nesta organização.' using errcode = '22023';
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

  insert into public.inventory_balances (
    organization_id,
    location_id,
    product_id,
    quantity_on_hand
  )
  values (p_organization_id, p_location_id, p_product_id, 0)
  on conflict (organization_id, location_id, product_id) do nothing;

  select balance.id, balance.quantity_on_hand
    into v_balance_id, v_current_quantity
  from public.inventory_balances balance
  where balance.organization_id = p_organization_id
    and balance.location_id = p_location_id
    and balance.product_id = p_product_id
  for update;

  v_delta := p_new_quantity - v_current_quantity;

  if v_delta = 0 then
    raise exception 'O novo saldo deve ser diferente do saldo atual.' using errcode = '22023';
  end if;

  update public.inventory_balances
  set quantity_on_hand = p_new_quantity,
      updated_at = now()
  where id = v_balance_id;

  insert into public.stock_movements (
    organization_id,
    location_id,
    product_id,
    movement_type,
    quantity_delta,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  values (
    p_organization_id,
    p_location_id,
    p_product_id,
    case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
    v_delta,
    'inventory_adjustment',
    v_balance_id,
    coalesce(v_notes, 'Ajuste manual de estoque'),
    v_user_id
  )
  returning id into v_movement_id;

  insert into public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'update',
    'inventory_balances',
    v_balance_id::text,
    jsonb_build_object('quantity_on_hand', v_current_quantity),
    jsonb_build_object(
      'quantity_on_hand', p_new_quantity,
      'quantity_delta', v_delta,
      'movement_id', v_movement_id
    )
  );

  return v_movement_id;
end;
$$;

revoke all on function private.adjust_inventory_balance(uuid, uuid, uuid, numeric, text)
  from public, anon;
grant execute on function private.adjust_inventory_balance(uuid, uuid, uuid, numeric, text)
  to authenticated;

create or replace function public.adjust_inventory_balance(
  p_organization_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_new_quantity numeric,
  p_notes text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.adjust_inventory_balance(
    p_organization_id,
    p_product_id,
    p_location_id,
    p_new_quantity,
    p_notes
  );
$$;

revoke all on function public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text)
  from public, anon;
grant execute on function public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text)
  to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'inventory_balances',
    'stock_movements',
    'stock_locations',
    'products'
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
