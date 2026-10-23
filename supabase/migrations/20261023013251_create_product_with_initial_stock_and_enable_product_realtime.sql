begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.create_product_with_initial_stock(
  p_organization_id uuid,
  p_category_id uuid,
  p_name text,
  p_brand text,
  p_description text,
  p_barcode text,
  p_sku text,
  p_unit text,
  p_units_per_package numeric,
  p_cost_price numeric,
  p_sale_price numeric,
  p_min_stock numeric,
  p_is_returnable boolean,
  p_active boolean,
  p_location_id uuid,
  p_initial_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_product_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_initial_quantity numeric := coalesce(p_initial_quantity, 0);
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
    raise exception 'Você não possui acesso para cadastrar produtos nesta organização.'
      using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'Informe um nome de produto entre 2 e 160 caracteres.'
      using errcode = '22023';
  end if;

  if char_length(coalesce(p_brand, '')) > 120
    or char_length(coalesce(p_description, '')) > 1000
    or char_length(coalesce(p_barcode, '')) > 80
    or char_length(coalesce(p_sku, '')) > 80 then
    raise exception 'Um dos campos ultrapassou o limite permitido.'
      using errcode = '22023';
  end if;

  if p_unit is null or p_unit not in ('UN', 'CX', 'FD', 'PACK', 'L', 'ML', 'KG', 'G') then
    raise exception 'Selecione uma unidade válida.' using errcode = '22023';
  end if;

  if p_units_per_package is null
    or p_units_per_package <= 0
    or p_units_per_package > 999999999.999
    or round(p_units_per_package, 3) <> p_units_per_package then
    raise exception 'Informe uma quantidade válida por embalagem.' using errcode = '22023';
  end if;

  if p_cost_price is null
    or p_sale_price is null
    or p_cost_price < 0
    or p_sale_price < 0
    or p_cost_price > 9999999999.99
    or p_sale_price > 9999999999.99
    or round(p_cost_price, 2) <> p_cost_price
    or round(p_sale_price, 2) <> p_sale_price then
    raise exception 'Informe preços válidos.' using errcode = '22023';
  end if;

  if p_min_stock is null
    or p_min_stock < 0
    or p_min_stock > 999999999.999
    or round(p_min_stock, 3) <> p_min_stock then
    raise exception 'Informe um estoque mínimo válido.' using errcode = '22023';
  end if;

  if v_initial_quantity < 0
    or v_initial_quantity > 999999999
    or trunc(v_initial_quantity) <> v_initial_quantity then
    raise exception 'A quantidade inicial deve ser um número inteiro maior ou igual a zero.'
      using errcode = '22023';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.organization_id = p_organization_id
  ) then
    raise exception 'A categoria selecionada não está disponível.' using errcode = '22023';
  end if;

  if v_initial_quantity > 0 and not exists (
    select 1
    from public.stock_locations location
    where location.id = p_location_id
      and location.organization_id = p_organization_id
      and location.active
  ) then
    raise exception 'Selecione um local de estoque ativo.' using errcode = '22023';
  end if;

  insert into public.products (
    organization_id,
    category_id,
    name,
    brand,
    description,
    barcode,
    sku,
    unit,
    units_per_package,
    cost_price,
    sale_price,
    min_stock,
    is_returnable,
    active
  )
  values (
    p_organization_id,
    p_category_id,
    v_name,
    nullif(btrim(coalesce(p_brand, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_barcode, '')), ''),
    nullif(btrim(coalesce(p_sku, '')), ''),
    p_unit,
    p_units_per_package,
    p_cost_price,
    p_sale_price,
    p_min_stock,
    coalesce(p_is_returnable, false),
    coalesce(p_active, true)
  )
  returning id into v_product_id;

  if v_initial_quantity > 0 then
    insert into public.inventory_balances (
      organization_id,
      location_id,
      product_id,
      quantity_on_hand
    )
    values (
      p_organization_id,
      p_location_id,
      v_product_id,
      v_initial_quantity
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
      p_location_id,
      v_product_id,
      'initial_stock',
      v_initial_quantity,
      p_cost_price,
      'product',
      v_product_id,
      'Saldo inicial informado no cadastro do produto',
      v_user_id
    );
  end if;

  insert into public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    new_data
  )
  values (
    p_organization_id,
    v_user_id,
    'insert',
    'products',
    v_product_id::text,
    jsonb_build_object(
      'name', v_name,
      'location_id', p_location_id,
      'initial_quantity', v_initial_quantity
    )
  );

  return v_product_id;
end;
$$;

revoke all on function private.create_product_with_initial_stock(
  uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, boolean, boolean, uuid, numeric
) from public, anon;
grant execute on function private.create_product_with_initial_stock(
  uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, boolean, boolean, uuid, numeric
) to authenticated;

create or replace function public.create_product_with_initial_stock(
  p_organization_id uuid,
  p_category_id uuid,
  p_name text,
  p_brand text,
  p_description text,
  p_barcode text,
  p_sku text,
  p_unit text,
  p_units_per_package numeric,
  p_cost_price numeric,
  p_sale_price numeric,
  p_min_stock numeric,
  p_is_returnable boolean,
  p_active boolean,
  p_location_id uuid,
  p_initial_quantity numeric
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_product_with_initial_stock(
    p_organization_id,
    p_category_id,
    p_name,
    p_brand,
    p_description,
    p_barcode,
    p_sku,
    p_unit,
    p_units_per_package,
    p_cost_price,
    p_sale_price,
    p_min_stock,
    p_is_returnable,
    p_active,
    p_location_id,
    p_initial_quantity
  );
$$;

revoke all on function public.create_product_with_initial_stock(
  uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, boolean, boolean, uuid, numeric
) from public, anon;
grant execute on function public.create_product_with_initial_stock(
  uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, boolean, boolean, uuid, numeric
) to authenticated;

-- As páginas recebem apenas um sinal de mudança e buscam novamente os dados
-- que o usuário pode ler pelas políticas RLS da organização.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['products', 'inventory_balances', 'categories']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

commit;
