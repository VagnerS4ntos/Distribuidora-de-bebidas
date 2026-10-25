begin;

create unique index if not exists purchase_items_id_org_unique_idx
  on public.purchase_items (id, organization_id);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  purchase_order_id uuid not null,
  location_id uuid not null,
  received_at timestamptz not null,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (purchase_order_id, organization_id)
    references public.purchase_orders(id, organization_id) on delete restrict,
  foreign key (location_id, organization_id)
    references public.stock_locations(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create index purchase_receipts_order_date_idx
  on public.purchase_receipts (organization_id, purchase_order_id, received_at desc);

create index purchase_receipts_location_idx
  on public.purchase_receipts (organization_id, location_id);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  receipt_id uuid not null,
  purchase_item_id uuid not null,
  product_id uuid not null,
  quantity_received numeric(12,3) not null
    check (
      quantity_received > 0
      and quantity_received = trunc(quantity_received)
    ),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (receipt_id, organization_id)
    references public.purchase_receipts(id, organization_id) on delete restrict,
  foreign key (purchase_item_id, organization_id)
    references public.purchase_items(id, organization_id) on delete restrict,
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete restrict,
  unique (receipt_id, product_id)
);

create index purchase_receipt_items_receipt_idx
  on public.purchase_receipt_items (organization_id, receipt_id);

create index purchase_receipt_items_product_idx
  on public.purchase_receipt_items (organization_id, product_id);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

create policy purchase_receipts_select_member
  on public.purchase_receipts
  for select
  to authenticated
  using ((select public.is_org_member(organization_id)));

create policy purchase_receipt_items_select_member
  on public.purchase_receipt_items
  for select
  to authenticated
  using ((select public.is_org_member(organization_id)));

revoke all on table public.purchase_receipts from public, anon, authenticated;
revoke all on table public.purchase_receipt_items from public, anon, authenticated;
grant select on table public.purchase_receipts to authenticated;
grant select on table public.purchase_receipt_items to authenticated;

do $$
declare
  v_group record;
  v_receipt_id uuid;
begin
  for v_group in
    select
      movement.organization_id,
      movement.reference_id as purchase_order_id,
      movement.location_id,
      movement.created_by,
      movement.created_at as received_at
    from public.stock_movements movement
    where movement.reference_type = 'purchase_order'
      and movement.movement_type = 'purchase_in'
      and movement.reference_id is not null
    group by
      movement.organization_id,
      movement.reference_id,
      movement.location_id,
      movement.created_by,
      movement.created_at
    order by movement.created_at
  loop
    insert into public.purchase_receipts (
      organization_id,
      purchase_order_id,
      location_id,
      received_at,
      received_by,
      created_at
    )
    values (
      v_group.organization_id,
      v_group.purchase_order_id,
      v_group.location_id,
      v_group.received_at,
      v_group.created_by,
      v_group.received_at
    )
    returning id into v_receipt_id;

    insert into public.purchase_receipt_items (
      organization_id,
      receipt_id,
      purchase_item_id,
      product_id,
      quantity_received,
      unit_cost,
      created_at
    )
    select
      movement.organization_id,
      v_receipt_id,
      purchase_item.id,
      movement.product_id,
      sum(movement.quantity_delta),
      max(coalesce(movement.unit_cost, purchase_item.unit_cost)),
      v_group.received_at
    from public.stock_movements movement
    join public.purchase_items purchase_item
      on purchase_item.organization_id = movement.organization_id
     and purchase_item.purchase_order_id = movement.reference_id
     and purchase_item.product_id = movement.product_id
    where movement.organization_id = v_group.organization_id
      and movement.reference_type = 'purchase_order'
      and movement.reference_id = v_group.purchase_order_id
      and movement.location_id = v_group.location_id
      and movement.created_by is not distinct from v_group.created_by
      and movement.created_at = v_group.received_at
      and movement.movement_type = 'purchase_in'
    group by movement.organization_id, purchase_item.id, movement.product_id;
  end loop;
end;
$$;

create or replace function private.receive_purchase_order_with_date(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_location_id uuid,
  p_received_at date,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_status text;
  v_ordered_date date;
  v_received_timestamp timestamptz;
  v_receipt_id uuid;
begin
  if p_received_at is null then
    raise exception 'Informe uma data de recebimento válida.' using errcode = '22023';
  end if;

  if p_received_at > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do recebimento não pode estar no futuro.' using errcode = '22023';
  end if;

  v_new_status := private.receive_purchase_order(
    p_organization_id,
    p_purchase_order_id,
    p_location_id,
    p_items
  );

  select (purchase.ordered_at at time zone 'America/Sao_Paulo')::date
    into v_ordered_date
  from public.purchase_orders purchase
  where purchase.id = p_purchase_order_id
    and purchase.organization_id = p_organization_id;

  if p_received_at < v_ordered_date then
    raise exception 'A data do recebimento não pode ser anterior à solicitação.'
      using errcode = '22023';
  end if;

  v_received_timestamp := p_received_at::timestamp at time zone 'America/Sao_Paulo';

  update public.stock_movements
  set created_at = v_received_timestamp
  where organization_id = p_organization_id
    and reference_type = 'purchase_order'
    and reference_id = p_purchase_order_id
    and movement_type = 'purchase_in'
    and created_at = transaction_timestamp();

  insert into public.purchase_receipts (
    organization_id,
    purchase_order_id,
    location_id,
    received_at,
    received_by
  )
  values (
    p_organization_id,
    p_purchase_order_id,
    p_location_id,
    v_received_timestamp,
    (select auth.uid())
  )
  returning id into v_receipt_id;

  insert into public.purchase_receipt_items (
    organization_id,
    receipt_id,
    purchase_item_id,
    product_id,
    quantity_received,
    unit_cost
  )
  select
    p_organization_id,
    v_receipt_id,
    purchase_item.id,
    purchase_item.product_id,
    (received_item.value ->> 'quantity')::numeric,
    purchase_item.unit_cost
  from jsonb_array_elements(p_items) received_item
  join public.purchase_items purchase_item
    on purchase_item.organization_id = p_organization_id
   and purchase_item.purchase_order_id = p_purchase_order_id
   and purchase_item.product_id = (received_item.value ->> 'product_id')::uuid;

  if v_new_status = 'received' then
    update public.purchase_orders
    set received_at = v_received_timestamp
    where id = p_purchase_order_id
      and organization_id = p_organization_id;

    update public.financial_entries
    set issue_date = p_received_at
    where organization_id = p_organization_id
      and purchase_order_id = p_purchase_order_id;
  end if;

  update public.audit_logs
  set new_data = coalesce(new_data, '{}'::jsonb)
    || jsonb_build_object(
      'received_at', p_received_at,
      'purchase_receipt_id', v_receipt_id
    )
  where organization_id = p_organization_id
    and table_name = 'purchase_orders'
    and record_id = p_purchase_order_id::text
    and action = 'receive'
    and created_at = transaction_timestamp();

  return v_new_status;
end;
$$;

revoke all on function private.receive_purchase_order_with_date(
  uuid, uuid, uuid, date, jsonb
) from public, anon;
grant execute on function private.receive_purchase_order_with_date(
  uuid, uuid, uuid, date, jsonb
) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'purchase_receipts',
    'purchase_receipt_items'
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
