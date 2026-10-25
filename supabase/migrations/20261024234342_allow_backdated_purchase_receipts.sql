begin;

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

revoke all on function private.receive_purchase_order_with_date(
  uuid, uuid, uuid, date, jsonb
) from public, anon;
grant execute on function private.receive_purchase_order_with_date(
  uuid, uuid, uuid, date, jsonb
) to authenticated;

commit;
