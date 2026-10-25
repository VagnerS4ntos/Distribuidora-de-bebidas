begin;

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  return_type text not null check (return_type in ('cancellation', 'return')),
  status text not null default 'completed' check (status = 'completed'),
  location_id uuid not null,
  payment_method text not null check (payment_method in (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer',
    'store_credit', 'voucher', 'other'
  )),
  refund_amount numeric(12,2) not null check (refund_amount > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (sale_id, organization_id)
    references public.sales(id, organization_id) on delete restrict,
  foreign key (location_id, organization_id)
    references public.stock_locations(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create unique index if not exists sale_items_id_org_uidx
  on public.sale_items (id, organization_id);

create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_return_id uuid not null,
  sale_item_id uuid not null,
  product_id uuid not null,
  quantity numeric(12,3) not null check (
    quantity > 0 and quantity = trunc(quantity)
  ),
  unit_refund numeric(12,2) not null check (unit_refund >= 0),
  total_refund numeric(12,2) not null check (total_refund >= 0),
  foreign key (sale_return_id, organization_id)
    references public.sale_returns(id, organization_id) on delete restrict,
  foreign key (sale_item_id, organization_id)
    references public.sale_items(id, organization_id) on delete restrict,
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete restrict,
  unique (sale_return_id, sale_item_id)
);

create index if not exists sale_returns_org_sale_date_idx
  on public.sale_returns (organization_id, sale_id, created_at desc);

create index if not exists sale_return_items_return_idx
  on public.sale_return_items (sale_return_id);

create index if not exists sale_return_items_sale_item_idx
  on public.sale_return_items (sale_item_id);

alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;

create policy sale_returns_select_member
  on public.sale_returns for select to authenticated
  using (public.is_org_member(organization_id));

create policy sale_return_items_select_member
  on public.sale_return_items for select to authenticated
  using (public.is_org_member(organization_id));

grant select on table public.sale_returns, public.sale_return_items to authenticated;
revoke all on table public.sale_returns, public.sale_return_items from anon;
revoke insert, update, delete on table public.sale_returns, public.sale_return_items
  from authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.process_sale_return(
  p_organization_id uuid,
  p_sale_id uuid,
  p_return_type text,
  p_items jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_requested_items jsonb;
  v_item jsonb;
  v_sale_item public.sale_items%rowtype;
  v_return_id uuid;
  v_financial_entry_id uuid;
  v_cash_session public.cash_sessions%rowtype;
  v_location_id uuid;
  v_payment_method text;
  v_quantity numeric(12,3);
  v_previously_returned numeric(12,3);
  v_item_count integer;
  v_distinct_item_count integer;
  v_current_index integer := 0;
  v_return_gross numeric(12,2) := 0;
  v_prior_refund numeric(12,2) := 0;
  v_refund_amount numeric(12,2);
  v_line_gross numeric(12,2);
  v_line_refund numeric(12,2);
  v_allocated_refund numeric(12,2) := 0;
  v_all_returned boolean;
  v_new_status text;
  v_cash_balance numeric(12,2);
  v_reason text := btrim(coalesce(p_reason, ''));
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
    raise exception 'Seu perfil não tem permissão para cancelar ou devolver vendas.'
      using errcode = '42501';
  end if;

  if p_return_type not in ('cancellation', 'return') then
    raise exception 'Selecione uma operação de pós-venda válida.' using errcode = '22023';
  end if;

  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Informe um motivo entre 3 e 500 caracteres.' using errcode = '22023';
  end if;

  select sale.*
    into v_sale
  from public.sales sale
  where sale.id = p_sale_id
    and sale.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0002';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Somente vendas concluídas podem ser canceladas ou devolvidas.'
      using errcode = '22023';
  end if;

  perform 1
  from public.sale_items item
  where item.sale_id = p_sale_id
    and item.organization_id = p_organization_id
  order by item.id
  for update;

  if p_return_type = 'cancellation' then
    if exists (
      select 1
      from public.sale_returns sale_return
      where sale_return.sale_id = p_sale_id
        and sale_return.organization_id = p_organization_id
    ) then
      raise exception 'Uma venda com devolução anterior não pode ser cancelada. Devolva os itens restantes.'
        using errcode = '22023';
    end if;

    select jsonb_agg(
      jsonb_build_object(
        'sale_item_id', item.id,
        'quantity', item.quantity
      ) order by item.id
    )
      into v_requested_items
    from public.sale_items item
    where item.sale_id = p_sale_id
      and item.organization_id = p_organization_id;
  else
    v_requested_items := p_items;
  end if;

  if v_requested_items is null or jsonb_typeof(v_requested_items) <> 'array' then
    raise exception 'Informe os itens da devolução.' using errcode = '22023';
  end if;

  select count(*), count(distinct entry.value ->> 'sale_item_id')
    into v_item_count, v_distinct_item_count
  from jsonb_array_elements(v_requested_items) entry;

  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'A devolução deve ter entre 1 e 100 itens.' using errcode = '22023';
  end if;

  if v_item_count <> v_distinct_item_count then
    raise exception 'O mesmo item não pode aparecer mais de uma vez.' using errcode = '22023';
  end if;

  select movement.location_id
    into v_location_id
  from public.stock_movements movement
  where movement.organization_id = p_organization_id
    and movement.reference_type = 'sale'
    and movement.reference_id = p_sale_id
    and movement.movement_type = 'sale_out'
  order by movement.created_at, movement.id
  limit 1;

  if v_location_id is null then
    raise exception 'Não foi possível identificar o local de estoque da venda.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.stock_movements movement
    where movement.organization_id = p_organization_id
      and movement.reference_type = 'sale'
      and movement.reference_id = p_sale_id
      and movement.movement_type = 'sale_out'
      and movement.location_id <> v_location_id
  ) then
    raise exception 'A venda possui baixas em locais diferentes e exige conferência manual.'
      using errcode = '22023';
  end if;

  select payment.payment_method
    into v_payment_method
  from public.sale_payments payment
  where payment.organization_id = p_organization_id
    and payment.sale_id = p_sale_id
    and payment.status in ('paid', 'refunded')
  order by payment.created_at
  limit 1;

  if v_payment_method is null then
    raise exception 'Não foi possível identificar o pagamento da venda.' using errcode = '22023';
  end if;

  for v_item in
    select entry.value
    from jsonb_array_elements(v_requested_items) entry
    order by entry.value ->> 'sale_item_id'
  loop
    begin
      v_quantity := nullif(v_item ->> 'quantity', '')::numeric;

      select sale_item.*
        into v_sale_item
      from public.sale_items sale_item
      where sale_item.id = nullif(v_item ->> 'sale_item_id', '')::uuid
        and sale_item.sale_id = p_sale_id
        and sale_item.organization_id = p_organization_id;
    exception when others then
      raise exception 'Item ou quantidade de devolução inválidos.' using errcode = '22023';
    end;

    if not found then
      raise exception 'Um dos itens não pertence a esta venda.' using errcode = '22023';
    end if;

    if v_quantity is null
      or v_quantity <= 0
      or v_quantity > 999999999
      or trunc(v_quantity) <> v_quantity then
      raise exception 'As quantidades devolvidas devem ser números inteiros maiores que zero.'
        using errcode = '22023';
    end if;

    select coalesce(sum(return_item.quantity), 0)
      into v_previously_returned
    from public.sale_return_items return_item
    join public.sale_returns sale_return
      on sale_return.id = return_item.sale_return_id
     and sale_return.organization_id = return_item.organization_id
    where return_item.organization_id = p_organization_id
      and return_item.sale_item_id = v_sale_item.id
      and sale_return.status = 'completed';

    if v_previously_returned + v_quantity > v_sale_item.quantity then
      raise exception 'A quantidade devolvida de um item ultrapassa o saldo disponível.'
        using errcode = '22023';
    end if;

    v_return_gross := v_return_gross + round(v_quantity * v_sale_item.unit_price, 2);
  end loop;

  if v_return_gross <= 0 or v_sale.subtotal <= 0 then
    raise exception 'Não foi possível calcular o valor da devolução.' using errcode = '22023';
  end if;

  select coalesce(sum(sale_return.refund_amount), 0)
    into v_prior_refund
  from public.sale_returns sale_return
  where sale_return.organization_id = p_organization_id
    and sale_return.sale_id = p_sale_id
    and sale_return.status = 'completed';

  select not exists (
    select 1
    from public.sale_items sale_item
    where sale_item.organization_id = p_organization_id
      and sale_item.sale_id = p_sale_id
      and sale_item.quantity > (
        coalesce((
          select sum(return_item.quantity)
          from public.sale_return_items return_item
          join public.sale_returns sale_return
            on sale_return.id = return_item.sale_return_id
           and sale_return.organization_id = return_item.organization_id
          where return_item.organization_id = p_organization_id
            and return_item.sale_item_id = sale_item.id
            and sale_return.status = 'completed'
        ), 0)
        + coalesce((
          select (entry.value ->> 'quantity')::numeric
          from jsonb_array_elements(v_requested_items) entry
          where entry.value ->> 'sale_item_id' = sale_item.id::text
        ), 0)
      )
  ) into v_all_returned;

  if p_return_type = 'cancellation' or v_all_returned then
    v_refund_amount := round(v_sale.total - v_prior_refund, 2);
  else
    v_refund_amount := round(v_sale.total * (v_return_gross / v_sale.subtotal), 2);
    v_refund_amount := least(v_refund_amount, round(v_sale.total - v_prior_refund, 2));
  end if;

  if v_refund_amount <= 0 then
    raise exception 'O valor total da venda já foi devolvido.' using errcode = '22023';
  end if;

  perform 1
  from public.inventory_balances balance
  where balance.organization_id = p_organization_id
    and balance.location_id = v_location_id
    and balance.product_id in (
      select sale_item.product_id
      from public.sale_items sale_item
      join jsonb_array_elements(v_requested_items) entry
        on entry.value ->> 'sale_item_id' = sale_item.id::text
      where sale_item.organization_id = p_organization_id
        and sale_item.sale_id = p_sale_id
    )
  order by balance.product_id
  for update;

  if v_payment_method = 'cash' then
    select session.*
      into v_cash_session
    from public.cash_sessions session
    where session.organization_id = p_organization_id
      and session.status = 'open'
    order by session.opened_at desc
    limit 1
    for update;

    if not found then
      raise exception 'Abra um caixa antes de realizar um estorno em dinheiro.'
        using errcode = '22023';
    end if;

    select round(
      v_cash_session.opening_balance + coalesce(sum(
        case when movement.direction = 'in' then movement.amount else -movement.amount end
      ) filter (where movement.movement_type <> 'opening'), 0),
      2
    )
      into v_cash_balance
    from public.cash_movements movement
    where movement.organization_id = p_organization_id
      and movement.cash_session_id = v_cash_session.id;

    if v_refund_amount > v_cash_balance then
      raise exception 'O saldo do caixa é insuficiente para realizar este estorno em dinheiro.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.sale_returns (
    organization_id,
    sale_id,
    return_type,
    location_id,
    payment_method,
    refund_amount,
    reason,
    created_by
  )
  values (
    p_organization_id,
    p_sale_id,
    p_return_type,
    v_location_id,
    v_payment_method,
    v_refund_amount,
    v_reason,
    v_user_id
  )
  returning id into v_return_id;

  for v_item in
    select entry.value
    from jsonb_array_elements(v_requested_items) entry
    order by entry.value ->> 'sale_item_id'
  loop
    v_current_index := v_current_index + 1;
    v_quantity := (v_item ->> 'quantity')::numeric;

    select sale_item.*
      into v_sale_item
    from public.sale_items sale_item
    where sale_item.id = (v_item ->> 'sale_item_id')::uuid
      and sale_item.sale_id = p_sale_id
      and sale_item.organization_id = p_organization_id;

    v_line_gross := round(v_quantity * v_sale_item.unit_price, 2);
    if v_current_index = v_item_count then
      v_line_refund := round(v_refund_amount - v_allocated_refund, 2);
    else
      v_line_refund := round(v_refund_amount * (v_line_gross / v_return_gross), 2);
      v_allocated_refund := v_allocated_refund + v_line_refund;
    end if;

    update public.inventory_balances
    set quantity_on_hand = quantity_on_hand + v_quantity,
        updated_at = now()
    where organization_id = p_organization_id
      and location_id = v_location_id
      and product_id = v_sale_item.product_id;

    if not found then
      raise exception 'Saldo de estoque do produto não encontrado.' using errcode = 'P0002';
    end if;

    insert into public.sale_return_items (
      organization_id,
      sale_return_id,
      sale_item_id,
      product_id,
      quantity,
      unit_refund,
      total_refund
    )
    values (
      p_organization_id,
      v_return_id,
      v_sale_item.id,
      v_sale_item.product_id,
      v_quantity,
      round(v_line_refund / v_quantity, 2),
      v_line_refund
    );

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
      v_location_id,
      v_sale_item.product_id,
      case when p_return_type = 'cancellation' then 'cancel_sale' else 'customer_return' end,
      v_quantity,
      v_sale_item.unit_cost,
      'sale_return',
      v_return_id,
      case when p_return_type = 'cancellation'
        then 'Reposição por cancelamento da venda #' || left(p_sale_id::text, 8)
        else 'Devolução da venda #' || left(p_sale_id::text, 8)
      end,
      v_user_id
    );
  end loop;

  v_new_status := case
    when p_return_type = 'cancellation' then 'cancelled'
    when v_all_returned then 'refunded'
    else 'completed'
  end;

  update public.sales
  set status = v_new_status,
      updated_at = now()
  where id = p_sale_id
    and organization_id = p_organization_id;

  if v_new_status in ('cancelled', 'refunded') then
    update public.sale_payments
    set status = 'refunded'
    where organization_id = p_organization_id
      and sale_id = p_sale_id
      and status = 'paid';
  end if;

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
    v_sale.customer_id,
    p_sale_id,
    'expense',
    'paid',
    case when p_return_type = 'cancellation'
      then 'Estorno do cancelamento da venda #' || left(p_sale_id::text, 8)
      else 'Estorno da devolução da venda #' || left(p_sale_id::text, 8)
    end,
    v_refund_amount,
    v_refund_amount,
    timezone('America/Sao_Paulo', now())::date,
    timezone('America/Sao_Paulo', now())::date,
    now(),
    v_payment_method,
    'DEV-' || left(v_return_id::text, 8),
    v_reason,
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
    notes,
    created_by
  )
  values (
    p_organization_id,
    v_financial_entry_id,
    v_refund_amount,
    v_payment_method,
    now(),
    'DEV-' || left(v_return_id::text, 8),
    v_reason,
    v_user_id
  );

  if v_payment_method = 'cash' then
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
      p_organization_id,
      v_cash_session.id,
      'refund',
      v_refund_amount,
      'out',
      case when p_return_type = 'cancellation'
        then 'Cancelamento da venda #' || left(p_sale_id::text, 8)
        else 'Devolução da venda #' || left(p_sale_id::text, 8)
      end,
      'sale_return',
      v_return_id,
      v_user_id
    );
  end if;

  insert into public.audit_logs (
    organization_id, user_id, action, table_name, record_id, old_data, new_data
  )
  values (
    p_organization_id,
    v_user_id,
    p_return_type,
    'sales',
    p_sale_id::text,
    jsonb_build_object('status', v_sale.status),
    jsonb_build_object(
      'status', v_new_status,
      'sale_return_id', v_return_id,
      'refund_amount', v_refund_amount,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'sale_return_id', v_return_id,
    'sale_id', p_sale_id,
    'status', v_new_status,
    'refund_amount', v_refund_amount
  );
end;
$$;

create or replace function public.process_sale_return(
  p_organization_id uuid,
  p_sale_id uuid,
  p_return_type text,
  p_items jsonb,
  p_reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.process_sale_return(
    p_organization_id,
    p_sale_id,
    p_return_type,
    p_items,
    p_reason
  );
$$;

revoke all on function private.process_sale_return(uuid, uuid, text, jsonb, text)
  from public, anon;
grant execute on function private.process_sale_return(uuid, uuid, text, jsonb, text)
  to authenticated;

revoke all on function public.process_sale_return(uuid, uuid, text, jsonb, text)
  from public, anon;
grant execute on function public.process_sale_return(uuid, uuid, text, jsonb, text)
  to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['sale_returns', 'sale_return_items']
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
