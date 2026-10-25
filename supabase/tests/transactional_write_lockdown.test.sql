begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(304);

with transactional_tables(table_name) as (
  values
    ('inventory_balances'),
    ('stock_movements'),
    ('stock_counts'),
    ('stock_count_items'),
    ('purchase_orders'),
    ('purchase_items'),
    ('purchase_receipts'),
    ('purchase_receipt_items'),
    ('sales'),
    ('sale_items'),
    ('sale_payments'),
    ('sale_returns'),
    ('sale_return_items'),
    ('cash_registers'),
    ('cash_sessions'),
    ('cash_movements'),
    ('financial_entries'),
    ('financial_entry_payments'),
    ('returnable_container_movements'),
    ('audit_logs')
), roles(role_name) as (
  values ('anon'), ('authenticated')
), write_privileges(privilege_name) as (
  values
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('TRUNCATE'),
    ('REFERENCES'),
    ('TRIGGER')
)
select ok(
  not has_table_privilege(
    role_name,
    format('%I.%I', 'public', table_name),
    privilege_name
  ),
  format('%s nao pode usar %s diretamente em public.%s', role_name, privilege_name, table_name)
)
from transactional_tables
cross join roles
cross join write_privileges;

with transactional_tables(table_name) as (
  values
    ('inventory_balances'), ('stock_movements'), ('stock_counts'),
    ('stock_count_items'), ('purchase_orders'), ('purchase_items'),
    ('purchase_receipts'), ('purchase_receipt_items'), ('sales'),
    ('sale_items'), ('sale_payments'), ('sale_returns'),
    ('sale_return_items'), ('cash_registers'), ('cash_sessions'),
    ('cash_movements'), ('financial_entries'),
    ('financial_entry_payments'), ('returnable_container_movements'),
    ('audit_logs')
)
select ok(
  has_table_privilege(
    'authenticated',
    format('%I.%I', 'public', table_name),
    'SELECT'
  ),
  format('authenticated pode consultar public.%s', table_name)
)
from transactional_tables;

with transactional_tables(table_name) as (
  values
    ('inventory_balances'), ('stock_movements'), ('stock_counts'),
    ('stock_count_items'), ('purchase_orders'), ('purchase_items'),
    ('purchase_receipts'), ('purchase_receipt_items'), ('sales'),
    ('sale_items'), ('sale_payments'), ('sale_returns'),
    ('sale_return_items'), ('cash_registers'), ('cash_sessions'),
    ('cash_movements'), ('financial_entries'),
    ('financial_entry_payments'), ('returnable_container_movements'),
    ('audit_logs')
)
select ok(
  c.relrowsecurity,
  format('RLS esta habilitado em public.%s', transactional_tables.table_name)
)
from transactional_tables
join pg_catalog.pg_class c on c.relname = transactional_tables.table_name
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = 'public';

with rpc_signatures(signature) as (
  values
    ('public.create_completed_sale(uuid,uuid,uuid,jsonb,numeric,text,text)'),
    ('public.process_sale_return(uuid,uuid,text,jsonb,text)'),
    ('public.create_product_with_initial_stock(uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,boolean,boolean,uuid,numeric)'),
    ('public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'),
    ('public.create_purchase_order(uuid,uuid,text,date,date,jsonb,numeric,numeric,numeric,text)'),
    ('public.receive_purchase_order(uuid,uuid,uuid,date,jsonb)'),
    ('public.create_financial_entry(uuid,text,uuid,uuid,uuid,text,numeric,date,date,boolean,text,text,text)'),
    ('public.record_financial_payment(uuid,uuid,numeric,date,text,text,text)'),
    ('public.create_cash_register(uuid,text,uuid)'),
    ('public.open_cash_session(uuid,uuid,numeric)'),
    ('public.record_cash_movement(uuid,uuid,text,numeric,text)'),
    ('public.close_cash_session(uuid,uuid,numeric,text)')
), resolved as (
  select signature, to_regprocedure(signature) as function_oid
  from rpc_signatures
)
select ok(
  function_oid is not null
    and has_function_privilege('authenticated', function_oid, 'EXECUTE'),
  format('authenticated pode executar a RPC %s', signature)
)
from resolved;

with rpc_signatures(signature) as (
  values
    ('public.create_completed_sale(uuid,uuid,uuid,jsonb,numeric,text,text)'),
    ('public.process_sale_return(uuid,uuid,text,jsonb,text)'),
    ('public.create_product_with_initial_stock(uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,boolean,boolean,uuid,numeric)'),
    ('public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'),
    ('public.create_purchase_order(uuid,uuid,text,date,date,jsonb,numeric,numeric,numeric,text)'),
    ('public.receive_purchase_order(uuid,uuid,uuid,date,jsonb)'),
    ('public.create_financial_entry(uuid,text,uuid,uuid,uuid,text,numeric,date,date,boolean,text,text,text)'),
    ('public.record_financial_payment(uuid,uuid,numeric,date,text,text,text)'),
    ('public.create_cash_register(uuid,text,uuid)'),
    ('public.open_cash_session(uuid,uuid,numeric)'),
    ('public.record_cash_movement(uuid,uuid,text,numeric,text)'),
    ('public.close_cash_session(uuid,uuid,numeric,text)')
), resolved as (
  select signature, to_regprocedure(signature) as function_oid
  from rpc_signatures
)
select ok(
  function_oid is not null
    and not has_function_privilege('anon', function_oid, 'EXECUTE'),
  format('anon nao pode executar a RPC %s', signature)
)
from resolved;

select * from finish();
rollback;
