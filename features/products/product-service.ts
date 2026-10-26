import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";

const PRODUCTS_PAGE_SIZE = 10;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductListItem = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  barcode: string | null;
  sku: string | null;
  categoryId: string | null;
  category: string;
  unit: string;
  unitsPerPackage: number;
  costPrice: number;
  salePrice: number;
  stock: number;
  minimumStock: number;
  isReturnable: boolean;
  active: boolean;
};

export type ProductCategory = {
  id: string;
  name: string;
};

export type ProductStockLocation = {
  id: string;
  name: string;
};

export type ProductsPageData = {
  products: ProductListItem[];
  categories: ProductCategory[];
  locations: ProductStockLocation[];
  selectedLocationId: string | null;
  categoryCount: number;
  totalProducts: number;
  activeProductCount: number;
  returnableProductCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  organizationId: string | null;
  organizationName: string | null;
  hasMembership: boolean;
  canEditProducts: boolean;
};

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function getProductsPageData({
  page = 1,
  locationId,
}: {
  page?: number;
  locationId?: string | null;
} = {}): Promise<ProductsPageData> {
  const supabase = await createClient();
  const membership = await getCurrentMember();

  if (!membership) {
    return {
      products: [],
      categories: [],
      locations: [],
      selectedLocationId: null,
      categoryCount: 0,
      totalProducts: 0,
      activeProductCount: 0,
      returnableProductCount: 0,
      page: 1,
      pageSize: PRODUCTS_PAGE_SIZE,
      totalPages: 1,
      organizationId: null,
      organizationName: null,
      hasMembership: false,
      canEditProducts: false,
    };
  }

  const organizationId = membership.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedLocationId =
    locationId && uuidPattern.test(locationId) ? locationId : null;
  const { data: locations, error: locationsError } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name");

  if (locationsError) throw locationsError;

  const availableLocations = locations ?? [];
  const selectedLocationId = availableLocations.some(
    (location) => location.id === normalizedLocationId,
  )
    ? normalizedLocationId
    : null;
  const requestedFrom = (requestedPage - 1) * PRODUCTS_PAGE_SIZE;
  const requestedTo = requestedFrom + PRODUCTS_PAGE_SIZE - 1;
  const getProductsRange = (from: number, to: number) => {
    let query = supabase
      .from("products")
      .select(
        "id, name, brand, description, barcode, sku, category_id, unit, units_per_package, cost_price, sale_price, min_stock, is_returnable, active, categories(name), inventory_balances(location_id, quantity_on_hand)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("name")
      .order("id")
      .range(from, to);

    if (selectedLocationId) {
      query = query.eq("inventory_balances.location_id", selectedLocationId);
    }

    return query;
  };

  const [
    initialProductsResult,
    { data: categories, error: categoriesError },
    { count: activeProductCount, error: activeCountError },
    { count: returnableProductCount, error: returnableCountError },
  ] =
    await Promise.all([
      getProductsRange(requestedFrom, requestedTo),
      supabase
        .from("categories")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_returnable", true),
    ]);

  if (initialProductsResult.error) throw initialProductsResult.error;
  if (categoriesError) throw categoriesError;
  if (activeCountError) throw activeCountError;
  if (returnableCountError) throw returnableCountError;

  const totalProducts = initialProductsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  let products = initialProductsResult.data;

  if (currentPage !== requestedPage) {
    const from = (currentPage - 1) * PRODUCTS_PAGE_SIZE;
    const correctedResult = await getProductsRange(
      from,
      from + PRODUCTS_PAGE_SIZE - 1,
    );
    if (correctedResult.error) throw correctedResult.error;
    products = correctedResult.data;
  }

  return {
    products: (products ?? []).map((product) => {
      const balances = (product.inventory_balances ?? []) as Array<{
        location_id: string;
        quantity_on_hand: number | string;
      }>;
      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        description: product.description,
        barcode: product.barcode,
        categoryId: product.category_id,
        sku: product.sku,
        category:
          (product.categories as { name?: string } | null)?.name ?? "Sem categoria",
        unit: product.unit,
        unitsPerPackage: asNumber(product.units_per_package),
        costPrice: asNumber(product.cost_price),
        salePrice: asNumber(product.sale_price),
        stock: balances.reduce(
          (total, balance) => total + asNumber(balance.quantity_on_hand),
          0,
        ),
        minimumStock: asNumber(product.min_stock),
        isReturnable: product.is_returnable,
        active: product.active,
      };
    }),
    categories: categories ?? [],
    locations: availableLocations,
    selectedLocationId,
    categoryCount: categories?.length ?? 0,
    totalProducts,
    activeProductCount: activeProductCount ?? 0,
    returnableProductCount: returnableProductCount ?? 0,
    page: currentPage,
    pageSize: PRODUCTS_PAGE_SIZE,
    totalPages,
    organizationId,
    organizationName: membership.organizationName,
    hasMembership: true,
    canEditProducts: hasPermission(membership.role, "catalog.manage"),
  };
}
