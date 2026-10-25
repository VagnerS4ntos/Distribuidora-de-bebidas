begin;

create index if not exists financial_entries_org_issue_date_idx
  on public.financial_entries (organization_id, issue_date desc, created_at desc);

create index if not exists financial_entries_org_type_status_idx
  on public.financial_entries (organization_id, entry_type, status);

create index if not exists financial_entry_payments_org_paid_at_idx
  on public.financial_entry_payments (organization_id, paid_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.create_financial_entry(
  p_organization_id uuid,
  p_entry_type text,
  p_category_id uuid,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_description text,
  p_amount numeric,
  p_issue_date date,
  p_due_date date,
  p_is_paid boolean,
  p_payment_method text,
  p_reference_code text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry_id uuid;
  v_amount numeric(12,2) := round(coalesce(p_amount, 0), 2);
  v_issue_date date := coalesce(
    p_issue_date,
    timezone('America/Sao_Paulo', now())::date
  );
  v_paid_at timestamptz;
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
    raise exception 'Você não possui acesso para registrar lançamentos nesta organização.'
      using errcode = '42501';
  end if;

  if p_entry_type not in ('income', 'expense') then
    raise exception 'Selecione um tipo de lançamento válido.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_description, ''))) < 2
    or char_length(btrim(coalesce(p_description, ''))) > 200 then
    raise exception 'Informe uma descrição entre 2 e 200 caracteres.' using errcode = '22023';
  end if;

  if v_amount <= 0
    or v_amount > 9999999999.99
    or round(p_amount, 2) <> p_amount then
    raise exception 'Informe um valor monetário válido.' using errcode = '22023';
  end if;

  if p_due_date is not null and p_due_date < v_issue_date then
    raise exception 'O vencimento não pode ser anterior à data de emissão.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_reference_code, '')) > 80
    or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Um dos campos ultrapassou o limite permitido.' using errcode = '22023';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.financial_categories category
    where category.id = p_category_id
      and category.organization_id = p_organization_id
      and category.entry_type = p_entry_type
      and category.active
  ) then
    raise exception 'Selecione uma categoria financeira válida.' using errcode = '22023';
  end if;

  if p_customer_id is not null and (
    p_entry_type <> 'income'
    or not exists (
      select 1
      from public.customers customer
      where customer.id = p_customer_id
        and customer.organization_id = p_organization_id
        and customer.active
    )
  ) then
    raise exception 'Selecione um cliente ativo para esta receita.' using errcode = '22023';
  end if;

  if p_supplier_id is not null and (
    p_entry_type <> 'expense'
    or not exists (
      select 1
      from public.suppliers supplier
      where supplier.id = p_supplier_id
        and supplier.organization_id = p_organization_id
        and supplier.active
    )
  ) then
    raise exception 'Selecione um fornecedor ativo para esta despesa.' using errcode = '22023';
  end if;

  if coalesce(p_is_paid, false) and p_payment_method not in (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer',
    'boleto', 'store_credit', 'voucher', 'other'
  ) then
    raise exception 'Selecione uma forma de pagamento válida.' using errcode = '22023';
  end if;

  if coalesce(p_is_paid, false) then
    v_paid_at := v_issue_date::timestamp at time zone 'America/Sao_Paulo';
  end if;

  insert into public.financial_entries (
    organization_id,
    category_id,
    supplier_id,
    customer_id,
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
    p_category_id,
    case when p_entry_type = 'expense' then p_supplier_id else null end,
    case when p_entry_type = 'income' then p_customer_id else null end,
    p_entry_type,
    case when coalesce(p_is_paid, false) then 'paid' else 'pending' end,
    btrim(p_description),
    v_amount,
    case when coalesce(p_is_paid, false) then v_amount else 0 end,
    v_issue_date,
    p_due_date,
    v_paid_at,
    case when coalesce(p_is_paid, false) then p_payment_method else null end,
    nullif(btrim(coalesce(p_reference_code, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_entry_id;

  if coalesce(p_is_paid, false) then
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
      v_entry_id,
      v_amount,
      p_payment_method,
      v_paid_at,
      nullif(btrim(coalesce(p_reference_code, '')), ''),
      null,
      v_user_id
    );
  end if;

  return v_entry_id;
end;
$$;

revoke all on function private.create_financial_entry(
  uuid, text, uuid, uuid, uuid, text, numeric, date, date, boolean, text, text, text
) from public, anon;
grant execute on function private.create_financial_entry(
  uuid, text, uuid, uuid, uuid, text, numeric, date, date, boolean, text, text, text
) to authenticated;

create or replace function public.create_financial_entry(
  p_organization_id uuid,
  p_entry_type text,
  p_category_id uuid,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_description text,
  p_amount numeric,
  p_issue_date date,
  p_due_date date,
  p_is_paid boolean,
  p_payment_method text,
  p_reference_code text,
  p_notes text
)
returns uuid
language sql
set search_path = ''
as $$
  select private.create_financial_entry(
    p_organization_id,
    p_entry_type,
    p_category_id,
    p_customer_id,
    p_supplier_id,
    p_description,
    p_amount,
    p_issue_date,
    p_due_date,
    p_is_paid,
    p_payment_method,
    p_reference_code,
    p_notes
  );
$$;

revoke all on function public.create_financial_entry(
  uuid, text, uuid, uuid, uuid, text, numeric, date, date, boolean, text, text, text
) from public, anon;
grant execute on function public.create_financial_entry(
  uuid, text, uuid, uuid, uuid, text, numeric, date, date, boolean, text, text, text
) to authenticated;

create or replace function private.record_financial_payment(
  p_organization_id uuid,
  p_financial_entry_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_payment_method text,
  p_reference_code text,
  p_notes text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry public.financial_entries%rowtype;
  v_amount numeric(12,2) := round(coalesce(p_amount, 0), 2);
  v_paid_on date := coalesce(
    p_paid_on,
    timezone('America/Sao_Paulo', now())::date
  );
  v_paid_at timestamptz;
  v_new_amount_paid numeric(12,2);
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
    raise exception 'Você não possui acesso para registrar pagamentos nesta organização.'
      using errcode = '42501';
  end if;

  select entry.*
    into v_entry
  from public.financial_entries entry
  where entry.id = p_financial_entry_id
    and entry.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Lançamento financeiro não encontrado.' using errcode = 'P0002';
  end if;

  if v_entry.status in ('paid', 'cancelled') then
    raise exception 'Este lançamento não aceita novos pagamentos.' using errcode = '22023';
  end if;

  if v_amount <= 0
    or v_amount > 9999999999.99
    or round(p_amount, 2) <> p_amount then
    raise exception 'Informe um valor de pagamento válido.' using errcode = '22023';
  end if;

  if v_amount > round(v_entry.amount - v_entry.amount_paid, 2) then
    raise exception 'O pagamento não pode ultrapassar o saldo pendente.' using errcode = '22023';
  end if;

  if v_paid_on > timezone('America/Sao_Paulo', now())::date then
    raise exception 'A data do pagamento não pode estar no futuro.' using errcode = '22023';
  end if;

  if p_payment_method not in (
    'cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer',
    'boleto', 'store_credit', 'voucher', 'other'
  ) then
    raise exception 'Selecione uma forma de pagamento válida.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_reference_code, '')) > 80
    or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Um dos campos ultrapassou o limite permitido.' using errcode = '22023';
  end if;

  v_paid_at := v_paid_on::timestamp at time zone 'America/Sao_Paulo';
  v_new_amount_paid := round(v_entry.amount_paid + v_amount, 2);
  v_new_status := case
    when v_new_amount_paid = v_entry.amount then 'paid'
    else 'partially_paid'
  end;

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
    p_financial_entry_id,
    v_amount,
    p_payment_method,
    v_paid_at,
    nullif(btrim(coalesce(p_reference_code, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_user_id
  );

  update public.financial_entries
  set amount_paid = v_new_amount_paid,
      status = v_new_status,
      paid_at = case when v_new_status = 'paid' then v_paid_at else null end,
      payment_method = p_payment_method
  where id = p_financial_entry_id
    and organization_id = p_organization_id;

  return v_new_status;
end;
$$;

revoke all on function private.record_financial_payment(
  uuid, uuid, numeric, date, text, text, text
) from public, anon;
grant execute on function private.record_financial_payment(
  uuid, uuid, numeric, date, text, text, text
) to authenticated;

create or replace function public.record_financial_payment(
  p_organization_id uuid,
  p_financial_entry_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_payment_method text,
  p_reference_code text,
  p_notes text
)
returns text
language sql
set search_path = ''
as $$
  select private.record_financial_payment(
    p_organization_id,
    p_financial_entry_id,
    p_amount,
    p_paid_on,
    p_payment_method,
    p_reference_code,
    p_notes
  );
$$;

revoke all on function public.record_financial_payment(
  uuid, uuid, numeric, date, text, text, text
) from public, anon;
grant execute on function public.record_financial_payment(
  uuid, uuid, numeric, date, text, text, text
) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'financial_categories',
    'financial_entries',
    'financial_entry_payments'
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
