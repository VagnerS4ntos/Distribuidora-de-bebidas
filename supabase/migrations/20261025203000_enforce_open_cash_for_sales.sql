begin;

create or replace function private.require_open_cash_for_completed_sale()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cash_session_id uuid;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  select session.id
    into v_cash_session_id
  from public.cash_sessions session
  where session.organization_id = new.organization_id
    and session.status = 'open'
  order by session.opened_at desc
  limit 1
  for share;

  if v_cash_session_id is null then
    raise exception 'Abra o caixa antes de registrar uma venda.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists require_open_cash_for_completed_sale on public.sales;
create trigger require_open_cash_for_completed_sale
before insert or update of status
on public.sales
for each row
execute function private.require_open_cash_for_completed_sale();

revoke all on function private.require_open_cash_for_completed_sale()
from public, anon, authenticated;

commit;
