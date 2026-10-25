import "server-only";

import { getCurrentMember } from "@/features/auth/current-member";
import type {
  ReportLowStockProduct,
  ReportPaymentMethod,
  ReportPeriodPreset,
  ReportTopProduct,
  ReportTrendPoint,
} from "@/features/reports/report-types";
import { createClient } from "@/lib/supabase/server";

const BRASILIA_TIME_ZONE = "America/Sao_Paulo";
const PAGE_SIZE = 500;
const MAX_RANGE_DAYS = 366;

type RawSale = {
  id: string;
  sold_at: string;
  total: number | string;
  sale_items: Array<{
    product_id: string;
    quantity: number | string;
    unit_cost: number | string;
    total: number | string;
    products: { name?: string; unit?: string } | null;
  }>;
  sale_payments: Array<{
    amount: number | string;
    payment_method: string;
    status: string;
  }>;
};

type RawFinancialPayment = {
  amount: number | string;
  paid_at: string;
  financial_entries: { entry_type?: "income" | "expense"; status?: string } | null;
};

type RawPurchaseReceipt = {
  id: string;
  received_at: string;
  purchase_receipt_items: Array<{
    quantity_received: number | string;
    unit_cost: number | string;
  }>;
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDateKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function resolvePeriod(
  preset: ReportPeriodPreset,
  requestedFrom?: string,
  requestedTo?: string,
) {
  const today = dateKey(new Date());
  let from = shiftDateKey(today, -29);
  let to = today;
  let normalizedPreset = preset;

  if (preset === "today") from = today;
  if (preset === "7d") from = shiftDateKey(today, -6);
  if (preset === "month") from = `${today.slice(0, 7)}-01`;
  if (preset === "custom") {
    if (validDateKey(requestedFrom) && validDateKey(requestedTo)) {
      from = requestedFrom as string;
      to = requestedTo as string;
      if (from > to) [from, to] = [to, from];
      if (to > today) to = today;
      if (from > today) from = today;
      if (from > to) from = to;
    } else {
      normalizedPreset = "30d";
    }
  }

  let rangeClamped = false;
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    from = shiftDateKey(to, -(MAX_RANGE_DAYS - 1));
    rangeClamped = true;
  }

  return { preset: normalizedPreset, from, to, rangeClamped };
}

function timestampBounds(from: string, to: string) {
  return {
    startIso: new Date(`${from}T00:00:00-03:00`).toISOString(),
    endIso: new Date(`${shiftDateKey(to, 1)}T00:00:00-03:00`).toISOString(),
  };
}

function saleDateKey(value: string) {
  return dateKey(new Date(value));
}

function formatShortDateKey(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function buildTrend(sales: RawSale[], from: string, to: string): ReportTrendPoint[] {
  const rangeDays = daysBetween(from, to);
  const mode = rangeDays <= 31 ? "day" : rangeDays <= 120 ? "week" : "month";
  const buckets = new Map<string, ReportTrendPoint>();

  if (mode === "day") {
    for (let index = 0; index < rangeDays; index += 1) {
      const key = shiftDateKey(from, index);
      buckets.set(key, { key, label: formatShortDateKey(key).slice(0, 5), sales: 0, revenue: 0 });
    }
  } else if (mode === "week") {
    for (let index = 0; index < rangeDays; index += 7) {
      const key = shiftDateKey(from, index);
      buckets.set(key, { key, label: formatShortDateKey(key).slice(0, 5), sales: 0, revenue: 0 });
    }
  } else {
    let cursor = `${from.slice(0, 7)}-01`;
    const finalMonth = to.slice(0, 7);
    while (cursor.slice(0, 7) <= finalMonth) {
      const [year, month] = cursor.split("-").map(Number);
      const key = cursor.slice(0, 7);
      buckets.set(key, {
        key,
        label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
          .format(new Date(Date.UTC(year, month - 1, 1)))
          .replace(" de ", "/"),
        sales: 0,
        revenue: 0,
      });
      cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    }
  }

  for (const sale of sales) {
    const saleDay = saleDateKey(sale.sold_at);
    let bucketKey = saleDay;
    if (mode === "week") {
      const index = Math.floor((daysBetween(from, saleDay) - 1) / 7);
      bucketKey = shiftDateKey(from, Math.max(0, index) * 7);
    }
    if (mode === "month") bucketKey = saleDay.slice(0, 7);
    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.sales += 1;
      bucket.revenue += asNumber(sale.total);
    }
  }

  return [...buckets.values()];
}

export async function getReportsPageData({
  preset = "30d",
  from,
  to,
}: {
  preset?: ReportPeriodPreset;
  from?: string;
  to?: string;
} = {}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const period = resolvePeriod(preset, from, to);
  const { startIso, endIso } = timestampBounds(period.from, period.to);
  const supabase = await createClient();
  const organizationId = member.organizationId;
  const sales: RawSale[] = [];
  const financialPayments: RawFinancialPayment[] = [];
  const purchaseReceipts: RawPurchaseReceipt[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, sold_at, total, sale_items(product_id, quantity, unit_cost, total, products(name, unit)), sale_payments(amount, payment_method, status)")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .gte("sold_at", startIso)
      .lt("sold_at", endIso)
      .order("sold_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RawSale[];
    sales.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("financial_entry_payments")
      .select("amount, paid_at, financial_entries!inner(entry_type, status)")
      .eq("organization_id", organizationId)
      .gte("paid_at", startIso)
      .lt("paid_at", endIso)
      .order("paid_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RawFinancialPayment[];
    financialPayments.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("purchase_receipts")
      .select("id, received_at, purchase_receipt_items(quantity_received, unit_cost)")
      .eq("organization_id", organizationId)
      .gte("received_at", startIso)
      .lt("received_at", endIso)
      .order("received_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RawPurchaseReceipt[];
    purchaseReceipts.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, name, unit, min_stock, active, inventory_balances(quantity_on_hand)")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name");
  if (productsError) throw productsError;

  let revenue = 0;
  let cost = 0;
  let unitsSold = 0;
  const productMap = new Map<string, ReportTopProduct>();
  const paymentMap = new Map<string, number>();

  for (const sale of sales) {
    revenue += asNumber(sale.total);
    for (const item of sale.sale_items ?? []) {
      const quantity = asNumber(item.quantity);
      const itemRevenue = asNumber(item.total);
      unitsSold += quantity;
      cost += quantity * asNumber(item.unit_cost);
      const current = productMap.get(item.product_id) ?? {
        id: item.product_id,
        name: item.products?.name ?? "Produto removido",
        unit: item.products?.unit ?? "UN",
        quantity: 0,
        revenue: 0,
      };
      current.quantity += quantity;
      current.revenue += itemRevenue;
      productMap.set(item.product_id, current);
    }
    for (const payment of sale.sale_payments ?? []) {
      if (payment.status !== "paid") continue;
      paymentMap.set(
        payment.payment_method,
        (paymentMap.get(payment.payment_method) ?? 0) + asNumber(payment.amount),
      );
    }
  }

  let financialIncome = 0;
  let financialExpense = 0;
  for (const payment of financialPayments) {
    const value = asNumber(payment.amount);
    if (payment.financial_entries?.entry_type === "income") financialIncome += value;
    if (payment.financial_entries?.entry_type === "expense") financialExpense += value;
  }

  let purchaseUnits = 0;
  let purchaseCost = 0;
  for (const receipt of purchaseReceipts) {
    for (const item of receipt.purchase_receipt_items ?? []) {
      const quantity = asNumber(item.quantity_received);
      purchaseUnits += quantity;
      purchaseCost += quantity * asNumber(item.unit_cost);
    }
  }

  const allLowStockProducts: ReportLowStockProduct[] = (productRows ?? [])
    .map((product) => {
      const stock = (product.inventory_balances ?? []).reduce(
        (totalValue, balance) => totalValue + asNumber(balance.quantity_on_hand),
        0,
      );
      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        stock,
        minimum: asNumber(product.min_stock),
      };
    })
    .filter((product) => product.stock <= product.minimum)
    .sort((first, second) => first.stock - second.stock || first.name.localeCompare(second.name, "pt-BR"));
  const lowStockProducts = allLowStockProducts.slice(0, 10);

  const paymentTotal = [...paymentMap.values()].reduce((totalValue, value) => totalValue + value, 0);
  const paymentMethods: ReportPaymentMethod[] = [...paymentMap.entries()]
    .map(([method, amount]) => ({
      method,
      amount,
      share: paymentTotal > 0 ? (amount / paymentTotal) * 100 : 0,
    }))
    .sort((first, second) => second.amount - first.amount);
  const topProducts = [...productMap.values()]
    .sort((first, second) => second.revenue - first.revenue || second.quantity - first.quantity)
    .slice(0, 10);
  const grossProfit = revenue - cost;

  return {
    organizationId,
    organizationName: member.organizationName,
    period,
    revenue,
    cost,
    grossProfit,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    salesCount: sales.length,
    unitsSold,
    averageTicket: sales.length ? revenue / sales.length : 0,
    financialIncome,
    financialExpense,
    financialBalance: financialIncome - financialExpense,
    purchaseReceiptCount: purchaseReceipts.length,
    purchaseUnits,
    purchaseCost,
    trend: buildTrend(sales, period.from, period.to),
    topProducts,
    paymentMethods,
    lowStockCount: allLowStockProducts.length,
    lowStockProducts,
  };
}
