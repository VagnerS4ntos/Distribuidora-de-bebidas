begin;

create index if not exists audit_logs_org_table_date_idx
  on public.audit_logs (organization_id, table_name, created_at desc, id desc);

create index if not exists audit_logs_org_user_date_idx
  on public.audit_logs (organization_id, user_id, created_at desc, id desc)
  where user_id is not null;

-- O histórico é somente leitura e fica restrito a proprietários e gerentes.
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_member on public.audit_logs;
drop policy if exists audit_logs_insert_member on public.audit_logs;
drop policy if exists audit_logs_update_manager on public.audit_logs;
drop policy if exists audit_logs_delete_owner on public.audit_logs;

create policy audit_logs_select_management
  on public.audit_logs
  for select
  to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']));

revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

-- A função roda como o proprietário para que alterações permitidas pelas
-- políticas das tabelas de origem possam gravar uma trilha imutável. Ela não é
-- exposta como RPC e preserva auth.uid() como responsável pela operação.
create or replace function private.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_organization_id uuid;
  v_record_id text;
begin
  if tg_op <> 'INSERT' then
    v_old_data := to_jsonb(old)
      - 'organization_id'
      - 'created_at'
      - 'updated_at';
  end if;

  if tg_op <> 'DELETE' then
    v_new_data := to_jsonb(new)
      - 'organization_id'
      - 'created_at'
      - 'updated_at';
  end if;

  if tg_op = 'UPDATE' and v_old_data is not distinct from v_new_data then
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_organization_id := nullif(to_jsonb(old) ->> 'organization_id', '')::uuid;
    v_record_id := to_jsonb(old) ->> 'id';
  else
    v_organization_id := nullif(to_jsonb(new) ->> 'organization_id', '')::uuid;
    v_record_id := to_jsonb(new) ->> 'id';
  end if;

  if v_organization_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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
    v_organization_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_record_id,
    v_old_data,
    v_new_data
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function private.capture_audit_log()
  from public, anon, authenticated, service_role;

drop trigger if exists products_capture_audit on public.products;
create trigger products_capture_audit
after update or delete on public.products
for each row execute function private.capture_audit_log();

drop trigger if exists customers_capture_audit on public.customers;
create trigger customers_capture_audit
after insert or update or delete on public.customers
for each row execute function private.capture_audit_log();

drop trigger if exists suppliers_capture_audit on public.suppliers;
create trigger suppliers_capture_audit
after insert or update or delete on public.suppliers
for each row execute function private.capture_audit_log();

drop trigger if exists categories_capture_audit on public.categories;
create trigger categories_capture_audit
after insert or update or delete on public.categories
for each row execute function private.capture_audit_log();

drop trigger if exists stock_locations_capture_audit on public.stock_locations;
create trigger stock_locations_capture_audit
after insert or update or delete on public.stock_locations
for each row execute function private.capture_audit_log();

drop trigger if exists financial_categories_capture_audit on public.financial_categories;
create trigger financial_categories_capture_audit
after insert or update or delete on public.financial_categories
for each row execute function private.capture_audit_log();

drop trigger if exists financial_entries_capture_audit on public.financial_entries;
create trigger financial_entries_capture_audit
after insert or update or delete on public.financial_entries
for each row execute function private.capture_audit_log();

drop trigger if exists financial_entry_payments_capture_audit on public.financial_entry_payments;
create trigger financial_entry_payments_capture_audit
after insert or update or delete on public.financial_entry_payments
for each row execute function private.capture_audit_log();

drop trigger if exists cash_registers_capture_audit on public.cash_registers;
create trigger cash_registers_capture_audit
after update or delete on public.cash_registers
for each row execute function private.capture_audit_log();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_logs'
  ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end $$;

commit;
