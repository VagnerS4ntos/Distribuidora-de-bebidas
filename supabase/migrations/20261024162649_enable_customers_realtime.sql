begin;

create index if not exists customers_org_active_name_idx
  on public.customers (organization_id, active, name);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table public.customers;
  end if;
end;
$$;

commit;
