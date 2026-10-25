begin;

drop function if exists public.create_purchase_order(
  uuid, uuid, text, date, jsonb, numeric, numeric, numeric, text
);

drop function if exists public.receive_purchase_order(uuid, uuid, uuid, jsonb);

revoke execute on function private.create_purchase_order(
  uuid, uuid, text, date, jsonb, numeric, numeric, numeric, text
) from authenticated;

revoke execute on function private.receive_purchase_order(uuid, uuid, uuid, jsonb)
  from authenticated;

create or replace function private.create_purchase_order_with_dates(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_supplier_document_number text,
  p_ordered_at date,
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
  v_purchase_id uuid;
  v_ordered_timestamp timestamptz;
begin
  if p_ordered_at is null then
    raise exception 'Informe uma data de solicitação válida.' using errcode = '22023';
  end if;

  if p_ordered_at > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da solicitação não pode estar no futuro.' using errcode = '22023';
  end if;

  if p_expected_at is not null and p_expected_at < p_ordered_at then
    raise exception 'A previsão de entrega não pode ser anterior à solicitação.'
      using errcode = '22023';
  end if;

  v_purchase_id := private.create_purchase_order(
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

  v_ordered_timestamp := p_ordered_at::timestamp at time zone 'America/Sao_Paulo';

  update public.purchase_orders
  set ordered_at = v_ordered_timestamp
  where id = v_purchase_id
    and organization_id = p_organization_id;

  update public.audit_logs
  set new_data = coalesce(new_data, '{}'::jsonb)
    || jsonb_build_object('ordered_at', p_ordered_at)
  where organization_id = p_organization_id
    and table_name = 'purchase_orders'
    and record_id = v_purchase_id::text
    and action = 'insert'
    and created_at = transaction_timestamp();

  return v_purchase_id;
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
    || jsonb_build_object('received_at', p_received_at)
  where organization_id = p_organization_id
    and table_name = 'purchase_orders'
    and record_id = p_purchase_order_id::text
    and action = 'receive'
    and created_at = transaction_timestamp();

  return v_new_status;
end;
$$;

revoke all on function private.create_purchase_order_with_dates(
  uuid, uuid, text, date, date, jsonb, numeric, numeric, numeric, text
) from public, anon;
grant execute on function private.create_purchase_order_with_dates(
  uuid, uuid, text, date, date, jsonb, numeric, numeric, numeric, text
) to authenticated;

revoke all on function private.receive_purchase_order_with_date(
  uuid, uuid, uuid, date, jsonb
) from public, anon;
grant execute on function private.receive_purchase_order_with_date(
  uuid, uuid, uuid, date, jsonb
) to authenticated;

create or replace function public.create_purchase_order(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_supplier_document_number text,
  p_ordered_at date,
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
  select private.create_purchase_order_with_dates(
    p_organization_id,
    p_supplier_id,
    p_supplier_document_number,
    p_ordered_at,
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
  p_received_at date,
  p_items jsonb
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.receive_purchase_order_with_date(
    p_organization_id,
    p_purchase_order_id,
    p_location_id,
    p_received_at,
    p_items
  );
$$;

revoke all on function public.create_purchase_order(
  uuid, uuid, text, date, date, jsonb, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.create_purchase_order(
  uuid, uuid, text, date, date, jsonb, numeric, numeric, numeric, text
) to authenticated;

revoke all on function public.receive_purchase_order(
  uuid, uuid, uuid, date, jsonb
) from public, anon;
grant execute on function public.receive_purchase_order(
  uuid, uuid, uuid, date, jsonb
) to authenticated;

commit;
