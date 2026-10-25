import "server-only";

import { getCurrentMember } from "@/features/auth/current-member";
import type {
  PurchaseListItem,
  PurchaseStatus,
  PurchaseStatusFilter,
} from "@/features/purchases/purchase-types";
import { createClient } from "@/lib/supabase/server";

export type PurchaseSupplier = { id: string; name: string; tradeName: string | null };
export type PurchaseLocation = { id: string; name: string };
export type PurchaseProduct = {
  id: string;
  name: string;
  brand: string | null;
  unit: string;
  costPrice: number;
};

const PURCHASES_PAGE_SIZE = 10;

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brasiliaMonthStartIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-01T00:00:00-03:00`).toISOString();
}

export async function getPurchasesPageData({
  page = 1,
  status = "all",
}: {
  page?: number;
  status?: PurchaseStatusFilter;
} = {}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = await createClient();
  const organizationId = member.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedStatus: PurchaseStatusFilter =
    status === "open" || status === "received" || status === "cancelled"
      ? status
      : "all";

  const getOrdersRange = (from: number, to: number) => {
    let query = supabase
      .from("purchase_orders")
      .select(
        "id, status, supplier_document_number, ordered_at, expected_at, received_at, total, suppliers(name, trade_name), purchase_items(id, quantity_ordered, quantity_received)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("ordered_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (normalizedStatus === "open") {
      query = query.in("status", ["ordered", "partially_received"]);
    } else if (normalizedStatus !== "all") {
      query = query.eq("status", normalizedStatus);
    }
    return query;
  };

  const from = (requestedPage - 1) * PURCHASES_PAGE_SIZE;
  const to = from + PURCHASES_PAGE_SIZE - 1;
  const [
    suppliersResult,
    productsResult,
    locationsResult,
    ordersResult,
    openOrdersResult,
    receivedMonthResult,
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, trade_name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, brand, unit, cost_price")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("stock_locations")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    getOrdersRange(from, to),
    supabase
      .from("purchase_orders")
      .select("id, purchase_items(quantity_ordered, quantity_received)")
      .eq("organization_id", organizationId)
      .in("status", ["ordered", "partially_received"]),
    supabase
      .from("purchase_orders")
      .select("total")
      .eq("organization_id", organizationId)
      .eq("status", "received")
      .gte("received_at", brasiliaMonthStartIso()),
  ]);

  const firstError = [
    suppliersResult.error,
    productsResult.error,
    locationsResult.error,
    ordersResult.error,
    openOrdersResult.error,
    receivedMonthResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const historyTotal = ordersResult.count ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / PURCHASES_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, historyTotalPages);
  let orderRows = ordersResult.data;

  if (currentPage !== requestedPage) {
    const correctedFrom = (currentPage - 1) * PURCHASES_PAGE_SIZE;
    const correctedResult = await getOrdersRange(
      correctedFrom,
      correctedFrom + PURCHASES_PAGE_SIZE - 1,
    );
    if (correctedResult.error) throw correctedResult.error;
    orderRows = correctedResult.data;
  }

  const mapOrder = (order: NonNullable<typeof orderRows>[number]): PurchaseListItem => {
    const supplier = order.suppliers as {
      name?: string;
      trade_name?: string | null;
    } | null;
    const items = (order.purchase_items ?? []) as Array<{
      id: string;
      quantity_ordered: number | string;
      quantity_received: number | string;
    }>;
    return {
      id: order.id,
      supplier: supplier?.name ?? "Fornecedor não encontrado",
      supplierTradeName: supplier?.trade_name ?? null,
      supplierDocumentNumber: order.supplier_document_number,
      status: order.status as PurchaseStatus,
      orderedAt: order.ordered_at,
      expectedAt: order.expected_at,
      receivedAt: order.received_at,
      total: asNumber(order.total),
      itemCount: items.length,
      quantityOrdered: items.reduce(
        (total, item) => total + asNumber(item.quantity_ordered),
        0,
      ),
      quantityReceived: items.reduce(
        (total, item) => total + asNumber(item.quantity_received),
        0,
      ),
    };
  };

  const openOrders = openOrdersResult.data ?? [];
  const pendingUnits = openOrders.reduce(
    (ordersTotal, order) =>
      ordersTotal +
      ((order.purchase_items ?? []) as Array<{
        quantity_ordered: number | string;
        quantity_received: number | string;
      }>).reduce(
        (itemsTotal, item) =>
          itemsTotal +
          Math.max(0, asNumber(item.quantity_ordered) - asNumber(item.quantity_received)),
        0,
      ),
    0,
  );

  return {
    organizationId,
    organizationName: member.organizationName,
    canManagePurchases: true,
    suppliers: (suppliersResult.data ?? []).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      tradeName: supplier.trade_name,
    })) as PurchaseSupplier[],
    products: (productsResult.data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      costPrice: asNumber(product.cost_price),
    })) as PurchaseProduct[],
    locations: (locationsResult.data ?? []) as PurchaseLocation[],
    purchases: (orderRows ?? []).map(mapOrder),
    openOrderCount: openOrders.length,
    pendingUnits,
    receivedMonthTotal: (receivedMonthResult.data ?? []).reduce(
      (total, order) => total + asNumber(order.total),
      0,
    ),
    status: normalizedStatus,
    page: currentPage,
    pageSize: PURCHASES_PAGE_SIZE,
    total: historyTotal,
    totalPages: historyTotalPages,
  };
}
