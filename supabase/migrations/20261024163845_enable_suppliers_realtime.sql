begin;

create index if not exists suppliers_org_active_name_idx
  on public.suppliers (organization_id, active, name);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'suppliers'
  ) then
    alter publication supabase_realtime add table public.suppliers;
  end if;
end;
$$;

commit;
