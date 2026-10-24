import { getCurrentMember } from "@/features/auth/current-member";
import { createClient } from "@/lib/supabase/server";

const INVENTORY_PAGE_SIZE = 10;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BalanceRow = {
  location_id: string;
  quantity_on_hand: number | string;
  updated_at?: string;
  stock_locations?: { name?: string } | null;
};

export type InventoryLocation = {
  id: string;
  name: string;
};

export type InventoryProductOption = {
  id: string;
  name: string;
  unit: string;
  balances: Array<{ locationId: string; quantity: number }>;
};

export type InventoryListItem = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  unit: string;
  active: boolean;
  minimumStock: number;
  stock: number;
  updatedAt: string | null;
  balances: Array<{ locationId: string; locationName: string; quantity: number }>;
};

export type InventoryMovement = {
  id: string;
  productName: string;
  productUnit: string;
  locationName: string;
  movementType: string;
  quantityDelta: number;
  notes: string | null;
  createdAt: string;
};

export type InventoryPageData = {
  organizationId: string | null;
  organizationName: string | null;
  hasMembership: boolean;
  canAdjustStock: boolean;
  locations: InventoryLocation[];
  products: InventoryListItem[];
  productOptions: InventoryProductOption[];
  movements: InventoryMovement[];
  selectedLocationId: string | null;
  search: string;
  totalProducts: number;
  totalQuantity: number;
  lowStockCount: number;
  outOfStockCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function balanceQuantity(balances: BalanceRow[], locationId: string | null) {
  return balances.reduce(
    (total, balance) =>
      !locationId || balance.location_id === locationId
        ? total + asNumber(balance.quantity_on_hand)
        : total,
    0,
  );
}

export async function getInventoryPageData({
  page = 1,
  locationId,
  search = "",
}: {
  page?: number;
  locationId?: string | null;
  search?: string;
} = {}): Promise<InventoryPageData> {
  const supabase = await createClient();
  const membership = await getCurrentMember();

  if (!membership) {
    return {
      organizationId: null,
      organizationName: null,
      hasMembership: false,
      canAdjustStock: false,
      locations: [],
      products: [],
      productOptions: [],
      movements: [],
      selectedLocationId: null,
      search: "",
      totalProducts: 0,
      totalQuantity: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      page: 1,
      pageSize: INVENTORY_PAGE_SIZE,
      totalPages: 1,
    };
  }

  const organizationId = membership.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedSearch = search.trim().slice(0, 80);
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

  const getProductsRange = (from: number, to: number) => {
    let query = supabase
      .from("products")
      .select(
        "id, name, brand, sku, unit, min_stock, active, inventory_balances(location_id, quantity_on_hand, updated_at, stock_locations(name))",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("name")
      .order("id")
      .range(from, to);

    if (normalizedSearch) query = query.ilike("name", `%${normalizedSearch}%`);
    if (selectedLocationId) {
      query = query.eq("inventory_balances.location_id", selectedLocationId);
    }

    return query;
  };

  const requestedFrom = (requestedPage - 1) * INVENTORY_PAGE_SIZE;
  const requestedTo = requestedFrom + INVENTORY_PAGE_SIZE - 1;
  let movementsQuery = supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity_delta, notes, created_at, products(name, unit), stock_locations(name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (selectedLocationId) {
    movementsQuery = movementsQuery.eq("location_id", selectedLocationId);
  }

  const [initialProductsResult, metricsResult, productOptionsResult, movementsResult] =
    await Promise.all([
      getProductsRange(requestedFrom, requestedTo),
      supabase
        .from("products")
        .select("id, min_stock, active, inventory_balances(location_id, quantity_on_hand)")
        .eq("organization_id", organizationId),
      supabase
        .from("products")
        .select("id, name, unit, inventory_balances(location_id, quantity_on_hand)")
        .eq("organization_id", organizationId)
        .order("name"),
      movementsQuery,
    ]);

  if (initialProductsResult.error) throw initialProductsResult.error;
  if (metricsResult.error) throw metricsResult.error;
  if (productOptionsResult.error) throw productOptionsResult.error;
  if (movementsResult.error) throw movementsResult.error;

  const totalProducts = initialProductsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / INVENTORY_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  let products = initialProductsResult.data;

  if (currentPage !== requestedPage) {
    const from = (currentPage - 1) * INVENTORY_PAGE_SIZE;
    const correctedResult = await getProductsRange(
      from,
      from + INVENTORY_PAGE_SIZE - 1,
    );
    if (correctedResult.error) throw correctedResult.error;
    products = correctedResult.data;
  }

  const metrics = (metricsResult.data ?? []).reduce(
    (summary, product) => {
      const balances = (product.inventory_balances ?? []) as BalanceRow[];
      const quantity = balanceQuantity(balances, selectedLocationId);
      summary.totalQuantity += quantity;
      if (product.active && quantity <= 0) summary.outOfStockCount += 1;
      if (product.active && quantity <= asNumber(product.min_stock)) {
        summary.lowStockCount += 1;
      }
      return summary;
    },
    { totalQuantity: 0, lowStockCount: 0, outOfStockCount: 0 },
  );

  return {
    organizationId,
    organizationName: membership.organizationName,
    hasMembership: true,
    canAdjustStock: membership.role === "owner" || membership.role === "manager",
    locations: availableLocations,
    products: (products ?? []).map((product) => {
      const balances = (product.inventory_balances ?? []) as BalanceRow[];
      const visibleBalances = balances
        .filter(
          (balance) =>
            !selectedLocationId || balance.location_id === selectedLocationId,
        )
        .map((balance) => ({
          locationId: balance.location_id,
          locationName: balance.stock_locations?.name ?? "Local não informado",
          quantity: asNumber(balance.quantity_on_hand),
        }))
        .sort((a, b) => a.locationName.localeCompare(b.locationName, "pt-BR"));
      const latestUpdate =
        balances
          .map((balance) => balance.updated_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        sku: product.sku,
        unit: product.unit,
        active: product.active,
        minimumStock: asNumber(product.min_stock),
        stock: balanceQuantity(balances, selectedLocationId),
        updatedAt: latestUpdate,
        balances: visibleBalances,
      };
    }),
    productOptions: (productOptionsResult.data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      unit: product.unit,
      balances: ((product.inventory_balances ?? []) as BalanceRow[]).map(
        (balance) => ({
          locationId: balance.location_id,
          quantity: asNumber(balance.quantity_on_hand),
        }),
      ),
    })),
    movements: (movementsResult.data ?? []).map((movement) => ({
      id: movement.id,
      productName:
        (movement.products as { name?: string } | null)?.name ?? "Produto removido",
      productUnit:
        (movement.products as { unit?: string } | null)?.unit ?? "UN",
      locationName:
        (movement.stock_locations as { name?: string } | null)?.name ??
        "Local não informado",
      movementType: movement.movement_type,
      quantityDelta: asNumber(movement.quantity_delta),
      notes: movement.notes,
      createdAt: movement.created_at,
    })),
    selectedLocationId,
    search: normalizedSearch,
    totalProducts,
    totalQuantity: metrics.totalQuantity,
    lowStockCount: metrics.lowStockCount,
    outOfStockCount: metrics.outOfStockCount,
    page: currentPage,
    pageSize: INVENTORY_PAGE_SIZE,
    totalPages,
  };
}
