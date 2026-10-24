import { getCurrentMember } from "@/features/auth/current-member";
import { createClient } from "@/lib/supabase/server";

const SUPPLIERS_PAGE_SIZE = 10;

export type SupplierStatusFilter = "all" | "active" | "inactive";

export type SupplierListItem = {
  id: string;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuppliersPageData = {
  organizationId: string | null;
  organizationName: string | null;
  hasMembership: boolean;
  canCreateSuppliers: boolean;
  canEditSuppliers: boolean;
  suppliers: SupplierListItem[];
  totalSuppliers: number;
  activeSupplierCount: number;
  inactiveSupplierCount: number;
  newThisMonthCount: number;
  filteredSupplierCount: number;
  search: string;
  status: SupplierStatusFilter;
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

export async function getSuppliersPageData({
  page = 1,
  search = "",
  status = "all",
}: {
  page?: number;
  search?: string;
  status?: SupplierStatusFilter;
} = {}): Promise<SuppliersPageData> {
  const member = await getCurrentMember();
  if (!member) {
    return {
      organizationId: null,
      organizationName: null,
      hasMembership: false,
      canCreateSuppliers: false,
      canEditSuppliers: false,
      suppliers: [],
      totalSuppliers: 0,
      activeSupplierCount: 0,
      inactiveSupplierCount: 0,
      newThisMonthCount: 0,
      filteredSupplierCount: 0,
      search: "",
      status: "all",
      page: 1,
      pageSize: SUPPLIERS_PAGE_SIZE,
      totalPages: 1,
    };
  }

  const supabase = await createClient();
  const organizationId = member.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedSearch = safeSearchTerm(search);
  const normalizedStatus: SupplierStatusFilter =
    status === "active" || status === "inactive" ? status : "all";

  const getSuppliersRange = (from: number, to: number) => {
    let query = supabase
      .from("suppliers")
      .select(
        "id, name, trade_name, cnpj, phone, email, contact_name, notes, active, created_at, updated_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("name")
      .order("id")
      .range(from, to);

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      query = query.or(
        `name.ilike.${pattern},trade_name.ilike.${pattern},cnpj.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},contact_name.ilike.${pattern}`,
      );
    }
    if (normalizedStatus !== "all") {
      query = query.eq("active", normalizedStatus === "active");
    }
    return query;
  };

  const from = (requestedPage - 1) * SUPPLIERS_PAGE_SIZE;
  const to = from + SUPPLIERS_PAGE_SIZE - 1;
  const [initialSuppliersResult, totalResult, activeResult, newThisMonthResult] =
    await Promise.all([
      getSuppliersRange(from, to),
      supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", brasiliaMonthStartIso()),
    ]);

  const firstError = [
    initialSuppliersResult.error,
    totalResult.error,
    activeResult.error,
    newThisMonthResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const filteredSupplierCount = initialSuppliersResult.count ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredSupplierCount / SUPPLIERS_PAGE_SIZE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  let suppliers = initialSuppliersResult.data;

  if (currentPage !== requestedPage) {
    const correctedFrom = (currentPage - 1) * SUPPLIERS_PAGE_SIZE;
    const correctedResult = await getSuppliersRange(
      correctedFrom,
      correctedFrom + SUPPLIERS_PAGE_SIZE - 1,
    );
    if (correctedResult.error) throw correctedResult.error;
    suppliers = correctedResult.data;
  }

  const totalSuppliers = totalResult.count ?? 0;
  const activeSupplierCount = activeResult.count ?? 0;

  return {
    organizationId,
    organizationName: member.organizationName,
    hasMembership: true,
    canCreateSuppliers: true,
    canEditSuppliers: member.role === "owner" || member.role === "manager",
    suppliers: (suppliers ?? []).map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      tradeName: supplier.trade_name,
      cnpj: supplier.cnpj,
      phone: supplier.phone,
      email: supplier.email,
      contactName: supplier.contact_name,
      notes: supplier.notes,
      active: supplier.active,
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at,
    })),
    totalSuppliers,
    activeSupplierCount,
    inactiveSupplierCount: Math.max(0, totalSuppliers - activeSupplierCount),
    newThisMonthCount: newThisMonthResult.count ?? 0,
    filteredSupplierCount,
    search: normalizedSearch,
    status: normalizedStatus,
    page: currentPage,
    pageSize: SUPPLIERS_PAGE_SIZE,
    totalPages,
  };
}
