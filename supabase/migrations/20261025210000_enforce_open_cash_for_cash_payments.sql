begin;

create or replace function private.sync_sale_payment_to_cash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if new.payment_method <> 'cash' or new.status <> 'paid' then
    return new;
  end if;

  select session.id
    into v_session_id
  from public.cash_sessions session
  where session.organization_id = new.organization_id
    and session.status = 'open'
  order by session.opened_at desc
  limit 1
  for update;

  if v_session_id is null then
    raise exception 'Abra o caixa antes de registrar um recebimento em dinheiro.'
      using errcode = '22023';
  end if;

  insert into public.cash_movements (
    organization_id,
    cash_session_id,
    movement_type,
    amount,
    direction,
    description,
    reference_type,
    reference_id,
    created_by
  )
  values (
    new.organization_id,
    v_session_id,
    'sale_receipt',
    new.amount,
    'in',
    'Venda #' || left(new.sale_id::text, 8),
    'sale_payment',
    new.id,
    (select sale.created_by from public.sales sale where sale.id = new.sale_id)
  )
  on conflict do nothing;

  return new;
end;
$$;

create or replace function private.sync_financial_payment_to_cash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_entry public.financial_entries%rowtype;
  v_expected_balance numeric(12,2);
begin
  if new.payment_method <> 'cash' then
    return new;
  end if;

  select entry.*
    into v_entry
  from public.financial_entries entry
  where entry.id = new.financial_entry_id
    and entry.organization_id = new.organization_id;

  if not found or v_entry.sale_id is not null then
    return new;
  end if;

  select session.*
    into v_session
  from public.cash_sessions session
  where session.organization_id = new.organization_id
    and session.status = 'open'
  order by session.opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Abra o caixa antes de registrar uma movimentação em dinheiro.'
      using errcode = '22023';
  end if;

  if v_entry.entry_type = 'expense' then
    select round(
      v_session.opening_balance + coalesce(sum(
        case when movement.direction = 'in' then movement.amount else -movement.amount end
      ) filter (where movement.movement_type <> 'opening'), 0),
      2
    )
      into v_expected_balance
    from public.cash_movements movement
    where movement.cash_session_id = v_session.id
      and movement.organization_id = new.organization_id;

    if new.amount > v_expected_balance then
      raise exception 'O pagamento em dinheiro não pode ultrapassar o saldo esperado do caixa.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.cash_movements (
    organization_id,
    cash_session_id,
    movement_type,
    amount,
    direction,
    description,
    reference_type,
    reference_id,
    created_by
  )
  values (
    new.organization_id,
    v_session.id,
    case when v_entry.entry_type = 'income' then 'cash_in' else 'expense' end,
    new.amount,
    case when v_entry.entry_type = 'income' then 'in' else 'out' end,
    left(v_entry.description, 200),
    'financial_entry_payment',
    new.id,
    new.created_by
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.sync_sale_payment_to_cash()
from public, anon, authenticated;
revoke all on function private.sync_financial_payment_to_cash()
from public, anon, authenticated;

commit;
