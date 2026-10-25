import "server-only";

import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import type {
  FinancialCategoryOption,
  FinancialContactOption,
  FinancialEntryType,
  FinancialListItem,
  FinancialStatus,
  FinancialStatusFilter,
  FinancialTypeFilter,
} from "@/features/finance/finance-types";
import { createClient } from "@/lib/supabase/server";

const FINANCIAL_PAGE_SIZE = 10;
const BRASILIA_TIME_ZONE = "America/Sao_Paulo";

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthBounds(value = new Date()) {
  const current = dateKey(value);
  const [year, month] = current.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return {
    startIso: new Date(`${start}T00:00:00-03:00`).toISOString(),
    endIso: new Date(`${nextMonth}T00:00:00-03:00`).toISOString(),
  };
}

function safeSearchTerm(value: string) {
  return value.trim().replace(/[,%().]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

function effectiveStatus(
  status: FinancialStatus,
  dueDate: string | null,
  outstandingAmount: number,
  today: string,
): FinancialStatus {
  if (
    outstandingAmount > 0 &&
    dueDate &&
    dueDate < today &&
    (status === "pending" || status === "partially_paid" || status === "overdue")
  ) {
    return "overdue";
  }
  return status;
}

export async function getFinancialPageData({
  page = 1,
  search = "",
  type = "all",
  status = "all",
}: {
  page?: number;
  search?: string;
  type?: FinancialTypeFilter;
  status?: FinancialStatusFilter;
} = {}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = await createClient();
  const organizationId = member.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedSearch = safeSearchTerm(search);
  const normalizedType: FinancialTypeFilter =
    type === "income" || type === "expense" ? type : "all";
  const normalizedStatus: FinancialStatusFilter =
    status === "open" || status === "overdue" || status === "paid"
      ? status
      : "all";
  const today = dateKey();
  const { startIso, endIso } = monthBounds();

  const getEntriesRange = (from: number, to: number) => {
    let query = supabase
      .from("financial_entries")
      .select(
        `
          id,
          entry_type,
          status,
          description,
          amount,
          amount_paid,
          issue_date,
          due_date,
          paid_at,
          payment_method,
          reference_code,
          notes,
          sale_id,
          purchase_order_id,
          financial_categories(name),
          customers(name),
          suppliers(name),
          financial_entry_payments(id, amount, payment_method, paid_at, reference_code, notes)
        `,
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      query = query.or(`description.ilike.${pattern},reference_code.ilike.${pattern}`);
    }
    if (normalizedType !== "all") query = query.eq("entry_type", normalizedType);
    if (normalizedStatus === "open") {
      query = query.in("status", ["pending", "partially_paid", "overdue"]);
    } else if (normalizedStatus === "paid") {
      query = query.eq("status", "paid");
    } else if (normalizedStatus === "overdue") {
      query = query
        .in("status", ["pending", "partially_paid", "overdue"])
        .lt("due_date", today);
    }
    return query;
  };

  const from = (requestedPage - 1) * FINANCIAL_PAGE_SIZE;
  const to = from + FINANCIAL_PAGE_SIZE - 1;
  const [
    entriesResult,
    outstandingResult,
    monthPaymentsResult,
    categoriesResult,
    customersResult,
    suppliersResult,
    openCashSessionResult,
  ] = await Promise.all([
    getEntriesRange(from, to),
    supabase
      .from("financial_entries")
      .select("entry_type, status, amount, amount_paid, due_date")
      .eq("organization_id", organizationId)
      .neq("status", "cancelled"),
    supabase
      .from("financial_entry_payments")
      .select("amount, financial_entries!inner(entry_type)")
      .eq("organization_id", organizationId)
      .gte("paid_at", startIso)
      .lt("paid_at", endIso),
    supabase
      .from("financial_categories")
      .select("id, name, entry_type")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("cash_sessions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError = [
    entriesResult.error,
    outstandingResult.error,
    monthPaymentsResult.error,
    categoriesResult.error,
    customersResult.error,
    suppliersResult.error,
    openCashSessionResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const total = entriesResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / FINANCIAL_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  let entryRows = entriesResult.data;

  if (currentPage !== requestedPage) {
    const correctedFrom = (currentPage - 1) * FINANCIAL_PAGE_SIZE;
    const correctedResult = await getEntriesRange(
      correctedFrom,
      correctedFrom + FINANCIAL_PAGE_SIZE - 1,
    );
    if (correctedResult.error) throw correctedResult.error;
    entryRows = correctedResult.data;
  }

  const outstandingRows = outstandingResult.data ?? [];
  const receivable = outstandingRows
    .filter((entry) => entry.entry_type === "income")
    .reduce(
      (totalValue, entry) =>
        totalValue + Math.max(0, asNumber(entry.amount) - asNumber(entry.amount_paid)),
      0,
    );
  const payable = outstandingRows
    .filter((entry) => entry.entry_type === "expense")
    .reduce(
      (totalValue, entry) =>
        totalValue + Math.max(0, asNumber(entry.amount) - asNumber(entry.amount_paid)),
      0,
    );
  const overdueCount = outstandingRows.filter((entry) => {
    const remaining = asNumber(entry.amount) - asNumber(entry.amount_paid);
    return remaining > 0 && Boolean(entry.due_date && entry.due_date < today);
  }).length;

  let monthIncome = 0;
  let monthExpense = 0;
  for (const payment of monthPaymentsResult.data ?? []) {
    const linkedEntry = payment.financial_entries as {
      entry_type?: FinancialEntryType;
    } | null;
    if (linkedEntry?.entry_type === "income") monthIncome += asNumber(payment.amount);
    if (linkedEntry?.entry_type === "expense") monthExpense += asNumber(payment.amount);
  }

  const entries: FinancialListItem[] = (entryRows ?? []).map((entry) => {
    const amount = asNumber(entry.amount);
    const amountPaid = asNumber(entry.amount_paid);
    const outstandingAmount = Math.max(0, amount - amountPaid);
    const category = entry.financial_categories as { name?: string } | null;
    const customer = entry.customers as { name?: string } | null;
    const supplier = entry.suppliers as { name?: string } | null;
    const rawStatus = entry.status as FinancialStatus;
    const payments = ((entry.financial_entry_payments ?? []) as Array<{
      id: string;
      amount: number | string;
      payment_method: string;
      paid_at: string;
      reference_code: string | null;
      notes: string | null;
    }>).map((payment) => ({
      id: payment.id,
      amount: asNumber(payment.amount),
      paymentMethod: payment.payment_method,
      paidAt: payment.paid_at,
      referenceCode: payment.reference_code,
      notes: payment.notes,
    })).sort((first, second) => second.paidAt.localeCompare(first.paidAt));

    return {
      id: entry.id,
      entryType: entry.entry_type as FinancialEntryType,
      status: effectiveStatus(rawStatus, entry.due_date, outstandingAmount, today),
      description: entry.description,
      amount,
      amountPaid,
      outstandingAmount,
      issueDate: entry.issue_date,
      dueDate: entry.due_date,
      paidAt: entry.paid_at,
      paymentMethod: entry.payment_method,
      referenceCode: entry.reference_code,
      notes: entry.notes,
      category: category?.name ?? null,
      counterparty: customer?.name ?? supplier?.name ?? null,
      source: entry.sale_id ? "sale" : entry.purchase_order_id ? "purchase" : "manual",
      sourceId: entry.sale_id ?? entry.purchase_order_id ?? null,
      payments,
    };
  });

  return {
    organizationId,
    organizationName: member.organizationName,
    canManageFinance: hasPermission(member.role, "finance.manage"),
    cashOpen: Boolean(openCashSessionResult.data),
    entries,
    categories: (categoriesResult.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      entryType: category.entry_type as FinancialEntryType,
    })) as FinancialCategoryOption[],
    customers: (customersResult.data ?? []) as FinancialContactOption[],
    suppliers: (suppliersResult.data ?? []) as FinancialContactOption[],
    receivable,
    payable,
    overdueCount,
    monthIncome,
    monthExpense,
    monthBalance: monthIncome - monthExpense,
    search: normalizedSearch,
    type: normalizedType,
    status: normalizedStatus,
    page: currentPage,
    pageSize: FINANCIAL_PAGE_SIZE,
    total,
    totalPages,
  };
}
