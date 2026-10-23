import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/features/auth/current-member";

export type ProductListItem = {
  id: string;
  name: string;
  brand: string;
  sku: string;
  category: string;
  unit: string;
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
  categoryCount: number;
  organizationId: string | null;
  organizationName: string | null;
  hasMembership: boolean;
};

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function getProductsPageData(): Promise<ProductsPageData> {
  const supabase = await createClient();
  const membership = await getCurrentMember();

  if (!membership) {
    return {
      products: [],
      categories: [],
      locations: [],
      categoryCount: 0,
      organizationId: null,
      organizationName: null,
      hasMembership: false,
    };
  }

  const organizationId = membership.organizationId;
  const [
    { data: products, error: productsError },
    { data: categories, error: categoriesError },
    { data: locations, error: locationsError },
  ] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, brand, sku, unit, sale_price, min_stock, is_returnable, active, categories(name), inventory_balances(quantity_on_hand)",
        )
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("categories")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("stock_locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
    ]);

  if (productsError) throw productsError;
  if (categoriesError) throw categoriesError;
  if (locationsError) throw locationsError;

  return {
    products: (products ?? []).map((product) => {
      const balances = (product.inventory_balances ?? []) as Array<{
        quantity_on_hand: number | string;
      }>;
      return {
        id: product.id,
        name: product.name,
        brand: product.brand ?? "Sem marca",
        sku: product.sku ?? "—",
        category:
          (product.categories as { name?: string } | null)?.name ?? "Sem categoria",
        unit: product.unit,
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
    locations: locations ?? [],
    categoryCount: categories?.length ?? 0,
    organizationId,
    organizationName: membership.organizationName,
    hasMembership: true,
  };
}
