import "server-only";

import { getCurrentMember } from "@/features/auth/current-member";
import type { RecentSale } from "@/features/sales/sales-types";
import { createClient } from "@/lib/supabase/server";

export type SaleCustomer = {
  id: string;
  name: string;
};

export type SaleLocation = {
  id: string;
  name: string;
};

export type SaleProduct = {
  id: string;
  name: string;
  brand: string;
  unit: string;
  salePrice: number;
  stockByLocation: Record<string, number>;
};

export type SalesHistoryScope = "recent" | "all";

type SalesPageOptions = {
  historyScope?: SalesHistoryScope;
  historyPage?: number;
};

const SALES_HISTORY_PAGE_SIZE = 20;
const BRASILIA_TIME_ZONE = "America/Sao_Paulo";

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBrasiliaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function brasiliaMidnightIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00-03:00`).toISOString();
}

export async function getSalesPageData({
  historyScope = "recent",
  historyPage = 1,
}: SalesPageOptions = {}) {
  const currentMember = await getCurrentMember();
  if (!currentMember) return null;

  const supabase = await createClient();
  const organizationId = currentMember.organizationId;
  const safeHistoryPage =
    Number.isInteger(historyPage) && historyPage > 0 ? historyPage : 1;
  const currentDateKey = getBrasiliaDateKey();
  const yesterdayStart = brasiliaMidnightIso(shiftDateKey(currentDateKey, -1));
  const todayStart = brasiliaMidnightIso(currentDateKey);
  const tomorrowStart = brasiliaMidnightIso(shiftDateKey(currentDateKey, 1));
  const historyFrom = (safeHistoryPage - 1) * SALES_HISTORY_PAGE_SIZE;
  const historyTo = historyFrom + SALES_HISTORY_PAGE_SIZE - 1;

  let historyQuery = supabase
    .from("sales")
    .select(
      "id, sold_at, created_at, total, customers(name), sale_items(id), sale_payments(payment_method)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  if (historyScope === "recent") {
    historyQuery = historyQuery
      .gte("sold_at", yesterdayStart)
      .lt("sold_at", tomorrowStart);
  }

  historyQuery = historyQuery
    .order("sold_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(historyFrom, historyTo);

  const [customersResult, productsResult, locationsResult, recentResult, todayResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, name, brand, unit, sale_price, inventory_balances(location_id, quantity_on_hand)",
        )
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("stock_locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      historyQuery,
      supabase
        .from("sales")
        .select("total, sale_items(quantity, unit_cost)")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("sold_at", todayStart)
        .lt("sold_at", tomorrowStart),
    ]);

  const firstError = [
    customersResult.error,
    productsResult.error,
    locationsResult.error,
    recentResult.error,
    todayResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const todaySales = todayResult.data ?? [];
  const todayTotal = todaySales.reduce(
    (total, sale) => total + asNumber(sale.total),
    0,
  );
  const todayItems = todaySales.reduce(
    (salesTotal, sale) =>
      salesTotal +
      (sale.sale_items ?? []).reduce(
        (itemsTotal, item) => itemsTotal + asNumber(item.quantity),
        0,
      ),
    0,
  );
  const todayCost = todaySales.reduce(
    (salesTotal, sale) =>
      salesTotal +
      (sale.sale_items ?? []).reduce(
        (itemsTotal, item) =>
          itemsTotal + asNumber(item.quantity) * asNumber(item.unit_cost),
        0,
      ),
    0,
  );
  const todayGrossProfit = todayTotal - todayCost;
  const historyTotal = recentResult.count ?? 0;

  const customers: SaleCustomer[] = customersResult.data ?? [];
  const locations: SaleLocation[] = locationsResult.data ?? [];
  const products: SaleProduct[] = (productsResult.data ?? []).map((product) => {
    const stockByLocation: Record<string, number> = {};
    const balances = (product.inventory_balances ?? []) as Array<{
      location_id: string;
      quantity_on_hand: number | string;
    }>;
    balances.forEach((balance) => {
      stockByLocation[balance.location_id] = asNumber(balance.quantity_on_hand);
    });

    return {
      id: product.id,
      name: product.name,
      brand: product.brand ?? "Sem marca",
      unit: product.unit,
      salePrice: asNumber(product.sale_price),
      stockByLocation,
    };
  });

  const recentSales: RecentSale[] = (recentResult.data ?? []).map((sale) => ({
    id: sale.id,
    customer:
      (sale.customers as { name?: string } | null)?.name ?? "Consumidor final",
    soldAt: sale.sold_at ?? sale.created_at,
    total: asNumber(sale.total),
    itemCount: ((sale.sale_items ?? []) as Array<{ id: string }>).length,
    paymentMethod:
      ((sale.sale_payments ?? []) as Array<{ payment_method?: string }>)[0]
        ?.payment_method ?? null,
  }));

  return {
    organizationId,
    organizationName: currentMember.organizationName,
    customers,
    locations,
    products,
    recentSales,
    todayTotal,
    todayCount: todaySales.length,
    todayItems,
    todayGrossProfit,
    todayGrossMargin: todayTotal > 0 ? (todayGrossProfit / todayTotal) * 100 : 0,
    historyScope,
    historyPage: safeHistoryPage,
    historyPageSize: SALES_HISTORY_PAGE_SIZE,
    historyTotal,
    historyTotalPages: Math.max(
      1,
      Math.ceil(historyTotal / SALES_HISTORY_PAGE_SIZE),
    ),
  };
}
