begin;

-- A tela de equipe assina somente a organização atual. As ações de membros
-- atualizam organizations.updated_at depois de concluídas, produzindo um único
-- evento leve e protegido pela RLS já existente em organizations.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'organizations'
  ) then
    execute 'alter publication supabase_realtime add table public.organizations';
  end if;
end;
$$;

commit;
