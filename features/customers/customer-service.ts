import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const CUSTOMERS_PAGE_SIZE = 10;

export type CustomerStatusFilter = "all" | "active" | "inactive";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomersPageData = {
  organizationId: string | null;
  organizationName: string | null;
  hasMembership: boolean;
  canCreateCustomers: boolean;
  canEditCustomers: boolean;
  customers: CustomerListItem[];
  totalCustomers: number;
  activeCustomerCount: number;
  inactiveCustomerCount: number;
  newThisMonthCount: number;
  filteredCustomerCount: number;
  search: string;
  status: CustomerStatusFilter;
  page: number;
  pageSize: number;
  totalPages: number;
};

function brasiliaMonthStartIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-01T00:00:00-03:00`).toISOString();
}

function safeSearchTerm(value: string) {
  return value.trim().replace(/[,%().]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export async function getCustomersPageData({
  page = 1,
  search = "",
  status = "all",
}: {
  page?: number;
  search?: string;
  status?: CustomerStatusFilter;
} = {}): Promise<CustomersPageData> {
  const member = await getCurrentMember();
  if (!member) {
    return {
      organizationId: null,
      organizationName: null,
      hasMembership: false,
      canCreateCustomers: false,
      canEditCustomers: false,
      customers: [],
      totalCustomers: 0,
      activeCustomerCount: 0,
      inactiveCustomerCount: 0,
      newThisMonthCount: 0,
      filteredCustomerCount: 0,
      search: "",
      status: "all",
      page: 1,
      pageSize: CUSTOMERS_PAGE_SIZE,
      totalPages: 1,
    };
  }

  const supabase = await createClient();
  const organizationId = member.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedSearch = safeSearchTerm(search);
  const normalizedStatus: CustomerStatusFilter =
    status === "active" || status === "inactive" ? status : "all";

  const getCustomersRange = (from: number, to: number) => {
    let query = supabase
      .from("customers")
      .select(
        "id, name, phone, email, document, notes, active, created_at, updated_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("name")
      .order("id")
      .range(from, to);

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      query = query.or(
        `name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},document.ilike.${pattern}`,
      );
    }
    if (normalizedStatus !== "all") {
      query = query.eq("active", normalizedStatus === "active");
    }
    return query;
  };

  const from = (requestedPage - 1) * CUSTOMERS_PAGE_SIZE;
  const to = from + CUSTOMERS_PAGE_SIZE - 1;
  const [
    initialCustomersResult,
    totalResult,
    activeResult,
    newThisMonthResult,
  ] = await Promise.all([
    getCustomersRange(from, to),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("active", true),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", brasiliaMonthStartIso()),
  ]);

  const firstError = [
    initialCustomersResult.error,
    totalResult.error,
    activeResult.error,
    newThisMonthResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const filteredCustomerCount = initialCustomersResult.count ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomerCount / CUSTOMERS_PAGE_SIZE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  let customers = initialCustomersResult.data;

  if (currentPage !== requestedPage) {
    const correctedFrom = (currentPage - 1) * CUSTOMERS_PAGE_SIZE;
    const correctedResult = await getCustomersRange(
      correctedFrom,
      correctedFrom + CUSTOMERS_PAGE_SIZE - 1,
    );
    if (correctedResult.error) throw correctedResult.error;
    customers = correctedResult.data;
  }

  const totalCustomers = totalResult.count ?? 0;
  const activeCustomerCount = activeResult.count ?? 0;

  return {
    organizationId,
    organizationName: member.organizationName,
    hasMembership: true,
    canCreateCustomers: hasPermission(member.role, "catalog.manage"),
    canEditCustomers: hasPermission(member.role, "catalog.manage"),
    customers: (customers ?? []).map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      document: customer.document,
      notes: customer.notes,
      active: customer.active,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    })),
    totalCustomers,
    activeCustomerCount,
    inactiveCustomerCount: Math.max(0, totalCustomers - activeCustomerCount),
    newThisMonthCount: newThisMonthResult.count ?? 0,
    filteredCustomerCount,
    search: normalizedSearch,
    status: normalizedStatus,
    page: currentPage,
    pageSize: CUSTOMERS_PAGE_SIZE,
    totalPages,
  };
}
