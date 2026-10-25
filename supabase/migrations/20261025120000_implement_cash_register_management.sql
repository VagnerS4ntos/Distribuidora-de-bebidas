begin;

create unique index if not exists one_open_cash_session_per_organization
  on public.cash_sessions (organization_id)
  where status = 'open';

create index if not exists cash_registers_org_active_name_idx
  on public.cash_registers (organization_id, active, name);

create index if not exists cash_sessions_org_status_opened_idx
  on public.cash_sessions (organization_id, status, opened_at desc);

create index if not exists cash_movements_org_session_date_idx
  on public.cash_movements (organization_id, cash_session_id, created_at desc);

create unique index if not exists cash_movements_reference_uidx
  on public.cash_movements (organization_id, reference_type, reference_id)
  where reference_type is not null and reference_id is not null;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.create_cash_register(
  p_organization_id uuid,
  p_name text,
  p_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_register_id uuid;
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
    raise exception 'Você não possui acesso para criar caixas nesta organização.'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) < 2
    or char_length(btrim(coalesce(p_name, ''))) > 80 then
    raise exception 'Informe um nome de caixa entre 2 e 80 caracteres.' using errcode = '22023';
  end if;

  if p_location_id is not null and not exists (
    select 1
    from public.stock_locations location
    where location.id = p_location_id
      and location.organization_id = p_organization_id
      and location.active
  ) then
    raise exception 'Selecione um local de estoque ativo.' using errcode = '22023';
  end if;

  insert into public.cash_registers (organization_id, name, location_id)
  values (p_organization_id, btrim(p_name), p_location_id)
  returning id into v_register_id;

  insert into public.audit_logs (
    organization_id, user_id, action, table_name, record_id, new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'create',
    'cash_registers',
    v_register_id::text,
    jsonb_build_object('name', btrim(p_name), 'location_id', p_location_id)
  );

  return v_register_id;
exception
  when unique_violation then
    raise exception 'Já existe um caixa com este nome.' using errcode = '23505';
end;
$$;

create or replace function public.create_cash_register(
  p_organization_id uuid,
  p_name text,
  p_location_id uuid
)
returns uuid
language sql
set search_path = ''
as $$
  select private.create_cash_register(p_organization_id, p_name, p_location_id);
$$;

create or replace function private.open_cash_session(
  p_organization_id uuid,
  p_cash_register_id uuid,
  p_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_opening_balance numeric(12,2) := round(coalesce(p_opening_balance, 0), 2);
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
    raise exception 'Você não possui acesso para abrir o caixa nesta organização.'
      using errcode = '42501';
  end if;

  perform 1
  from public.organizations organization
  where organization.id = p_organization_id
  for update;

  if v_opening_balance < 0
    or v_opening_balance > 9999999999.99
    or round(coalesce(p_opening_balance, 0), 2) <> coalesce(p_opening_balance, 0) then
    raise exception 'Informe um saldo inicial válido.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.cash_registers register
    where register.id = p_cash_register_id
      and register.organization_id = p_organization_id
      and register.active
  ) then
    raise exception 'Selecione um caixa ativo.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.cash_sessions session
    where session.organization_id = p_organization_id
      and session.status = 'open'
  ) then
    raise exception 'Já existe um caixa aberto nesta organização.' using errcode = '23505';
  end if;

  insert into public.cash_sessions (
    organization_id, cash_register_id, opened_by, opening_balance
  )
  values (
    p_organization_id, p_cash_register_id, v_user_id, v_opening_balance
  )
  returning id into v_session_id;

  if v_opening_balance > 0 then
    insert into public.cash_movements (
      organization_id,
      cash_session_id,
      movement_type,
      amount,
      direction,
      description,
      created_by
    )
    values (
      p_organization_id,
      v_session_id,
      'opening',
      v_opening_balance,
      'in',
      'Saldo inicial do caixa',
      v_user_id
    );
  end if;

  insert into public.audit_logs (
    organization_id, user_id, action, table_name, record_id, new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'open',
    'cash_sessions',
    v_session_id::text,
    jsonb_build_object(
      'cash_register_id', p_cash_register_id,
      'opening_balance', v_opening_balance
    )
  );

  return v_session_id;
end;
$$;

create or replace function public.open_cash_session(
  p_organization_id uuid,
  p_cash_register_id uuid,
  p_opening_balance numeric
)
returns uuid
language sql
set search_path = ''
as $$
  select private.open_cash_session(
    p_organization_id,
    p_cash_register_id,
    p_opening_balance
  );
$$;

create or replace function private.record_cash_movement(
  p_organization_id uuid,
  p_cash_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_movement_id uuid;
  v_amount numeric(12,2) := round(coalesce(p_amount, 0), 2);
  v_direction text;
  v_expected_balance numeric(12,2);
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
    raise exception 'Você não possui acesso para movimentar este caixa.' using errcode = '42501';
  end if;

  select session.*
    into v_session
  from public.cash_sessions session
  where session.id = p_cash_session_id
    and session.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = 'P0002';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Este caixa já foi fechado.' using errcode = '22023';
  end if;

  if p_movement_type not in ('cash_in', 'cash_out', 'withdrawal', 'deposit') then
    raise exception 'Selecione um tipo de movimentação válido.' using errcode = '22023';
  end if;

  if v_amount <= 0
    or v_amount > 9999999999.99
    or round(p_amount, 2) <> p_amount then
    raise exception 'Informe um valor monetário válido.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_description, ''))) < 2
    or char_length(btrim(coalesce(p_description, ''))) > 200 then
    raise exception 'Informe uma descrição entre 2 e 200 caracteres.' using errcode = '22023';
  end if;

  v_direction := case
    when p_movement_type in ('cash_in', 'deposit') then 'in'
    else 'out'
  end;

  if v_direction = 'out' then
    select round(
      v_session.opening_balance + coalesce(sum(
        case when movement.direction = 'in' then movement.amount else -movement.amount end
      ) filter (where movement.movement_type <> 'opening'), 0),
      2
    )
      into v_expected_balance
    from public.cash_movements movement
    where movement.cash_session_id = p_cash_session_id
      and movement.organization_id = p_organization_id;

    if v_amount > v_expected_balance then
      raise exception 'A saída não pode ultrapassar o saldo esperado do caixa.'
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
    created_by
  )
  values (
    p_organization_id,
    p_cash_session_id,
    p_movement_type,
    v_amount,
    v_direction,
    btrim(p_description),
    v_user_id
  )
  returning id into v_movement_id;

  insert into public.audit_logs (
    organization_id, user_id, action, table_name, record_id, new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'create',
    'cash_movements',
    v_movement_id::text,
    jsonb_build_object(
      'cash_session_id', p_cash_session_id,
      'movement_type', p_movement_type,
      'amount', v_amount,
      'direction', v_direction,
      'description', btrim(p_description)
    )
  );

  return v_movement_id;
end;
$$;

create or replace function public.record_cash_movement(
  p_organization_id uuid,
  p_cash_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_description text
)
returns uuid
language sql
set search_path = ''
as $$
  select private.record_cash_movement(
    p_organization_id,
    p_cash_session_id,
    p_movement_type,
    p_amount,
    p_description
  );
$$;

create or replace function private.close_cash_session(
  p_organization_id uuid,
  p_cash_session_id uuid,
  p_counted_balance numeric,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_counted_balance numeric(12,2) := round(coalesce(p_counted_balance, 0), 2);
  v_expected_balance numeric(12,2);
  v_difference numeric(12,2);
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
    raise exception 'Você não possui acesso para fechar este caixa.' using errcode = '42501';
  end if;

  select session.*
    into v_session
  from public.cash_sessions session
  where session.id = p_cash_session_id
    and session.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = 'P0002';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Este caixa já foi fechado.' using errcode = '22023';
  end if;

  if v_counted_balance < 0
    or v_counted_balance > 9999999999.99
    or round(p_counted_balance, 2) <> p_counted_balance then
    raise exception 'Informe um saldo contado válido.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'As observações ultrapassaram o limite permitido.' using errcode = '22023';
  end if;

  select round(
    v_session.opening_balance + coalesce(sum(
      case when movement.direction = 'in' then movement.amount else -movement.amount end
    ) filter (where movement.movement_type <> 'opening'), 0),
    2
  )
    into v_expected_balance
  from public.cash_movements movement
  where movement.cash_session_id = p_cash_session_id
    and movement.organization_id = p_organization_id;

  v_difference := round(v_counted_balance - v_expected_balance, 2);

  update public.cash_sessions
  set status = 'closed',
      closed_by = v_user_id,
      closed_at = now(),
      expected_closing_balance = v_expected_balance,
      counted_closing_balance = v_counted_balance,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_cash_session_id
    and organization_id = p_organization_id;

  insert into public.audit_logs (
    organization_id, user_id, action, table_name, record_id, old_data, new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'close',
    'cash_sessions',
    p_cash_session_id::text,
    jsonb_build_object('status', 'open'),
    jsonb_build_object(
      'status', 'closed',
      'expected_closing_balance', v_expected_balance,
      'counted_closing_balance', v_counted_balance,
      'difference', v_difference
    )
  );

  return jsonb_build_object(
    'session_id', p_cash_session_id,
    'expected_balance', v_expected_balance,
    'counted_balance', v_counted_balance,
    'difference', v_difference
  );
end;
$$;

create or replace function public.close_cash_session(
  p_organization_id uuid,
  p_cash_session_id uuid,
  p_counted_balance numeric,
  p_notes text
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.close_cash_session(
    p_organization_id,
    p_cash_session_id,
    p_counted_balance,
    p_notes
  );
$$;

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
    return new;
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
    return new;
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

drop trigger if exists sync_sale_payment_to_cash on public.sale_payments;
create trigger sync_sale_payment_to_cash
after insert or update of payment_method, status, amount
on public.sale_payments
for each row
execute function private.sync_sale_payment_to_cash();

drop trigger if exists sync_financial_payment_to_cash on public.financial_entry_payments;
create trigger sync_financial_payment_to_cash
after insert
on public.financial_entry_payments
for each row
execute function private.sync_financial_payment_to_cash();

revoke all on function private.create_cash_register(uuid, text, uuid) from public, anon;
revoke all on function private.open_cash_session(uuid, uuid, numeric) from public, anon;
revoke all on function private.record_cash_movement(uuid, uuid, text, numeric, text) from public, anon;
revoke all on function private.close_cash_session(uuid, uuid, numeric, text) from public, anon;
revoke all on function private.sync_sale_payment_to_cash() from public, anon, authenticated;
revoke all on function private.sync_financial_payment_to_cash() from public, anon, authenticated;

grant execute on function private.create_cash_register(uuid, text, uuid) to authenticated;
grant execute on function private.open_cash_session(uuid, uuid, numeric) to authenticated;
grant execute on function private.record_cash_movement(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function private.close_cash_session(uuid, uuid, numeric, text) to authenticated;

revoke all on function public.create_cash_register(uuid, text, uuid) from public, anon;
revoke all on function public.open_cash_session(uuid, uuid, numeric) from public, anon;
revoke all on function public.record_cash_movement(uuid, uuid, text, numeric, text) from public, anon;
revoke all on function public.close_cash_session(uuid, uuid, numeric, text) from public, anon;

grant execute on function public.create_cash_register(uuid, text, uuid) to authenticated;
grant execute on function public.open_cash_session(uuid, uuid, numeric) to authenticated;
grant execute on function public.record_cash_movement(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.close_cash_session(uuid, uuid, numeric, text) to authenticated;

revoke insert, update, delete on table public.cash_registers from anon, authenticated;
revoke insert, update, delete on table public.cash_sessions from anon, authenticated;
revoke insert, update, delete on table public.cash_movements from anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'cash_registers',
    'cash_sessions',
    'cash_movements'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table
      );
    end if;
  end loop;
end;
$$;

commit;
