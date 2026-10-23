begin;

-- Mantém registros históricos intactos, mas exige quantidades inteiras em
-- todos os novos itens de venda, inclusive gravações feitas fora da interface.
alter table public.sale_items
  add constraint sale_items_quantity_integer_check
  check (quantity = trunc(quantity))
  not valid;

-- A página de vendas usa os eventos desta tabela apenas como sinal para buscar
-- novamente os dados autorizados pelas políticas de RLS da organização.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales'
  ) then
    execute 'alter publication supabase_realtime add table public.sales';
  end if;
end;
$$;

commit;
