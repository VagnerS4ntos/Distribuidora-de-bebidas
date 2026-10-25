import "server-only";

import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import {
  auditModuleTables,
  type AuditActionFilter,
  type AuditLogItem,
  type AuditModuleFilter,
} from "@/features/audit/audit-types";
import { createClient } from "@/lib/supabase/server";

const AUDIT_PAGE_SIZE = 15;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function safeSearch(value: string) {
  return value.trim().replace(/[,%().]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

function validDate(value?: string) {
  if (!value || !datePattern.test(value)) return "";
  const parsed = new Date(`${value}T12:00:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? "" : value;
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getAuditPageData({
  page = 1,
  search = "",
  module = "all",
  action = "all",
  actorId = "",
  from = "",
  to = "",
}: {
  page?: number;
  search?: string;
  module?: AuditModuleFilter;
  action?: AuditActionFilter;
  actorId?: string;
  from?: string;
  to?: string;
} = {}) {
  const member = await getCurrentMember();
  if (!member || !hasPermission(member.role, "audit.view")) return null;

  const supabase = await createClient();
  const organizationId = member.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedSearch = safeSearch(search);
  const normalizedModule: AuditModuleFilter = module in auditModuleTables ? module : "all";
  const allowedActions: AuditActionFilter[] = [
    "all", "insert", "create", "update", "delete", "receive", "open", "close", "cancellation", "return",
  ];
  const normalizedAction = allowedActions.includes(action) ? action : "all";
  const normalizedActorId = uuidPattern.test(actorId) ? actorId : "";
  const normalizedFrom = validDate(from);
  let normalizedTo = validDate(to);
  if (normalizedFrom && normalizedTo && normalizedTo < normalizedFrom) {
    normalizedTo = normalizedFrom;
  }

  const filteredLogsQuery = () => {
    let query = supabase
      .from("audit_logs")
      .select("id, user_id, action, table_name, record_id, old_data, new_data, created_at, profiles(full_name)", { count: "exact" })
      .eq("organization_id", organizationId);
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      query = query.or(`record_id.ilike.${pattern},table_name.ilike.${pattern},action.ilike.${pattern}`);
    }
    const tables = auditModuleTables[normalizedModule];
    if (tables.length) query = query.in("table_name", tables);
    if (normalizedAction !== "all") query = query.eq("action", normalizedAction);
    if (normalizedActorId) query = query.eq("user_id", normalizedActorId);
    if (normalizedFrom) query = query.gte("created_at", `${normalizedFrom}T00:00:00-03:00`);
    if (normalizedTo) query = query.lte("created_at", `${normalizedTo}T23:59:59.999-03:00`);
    return query;
  };

  const fromIndex = (requestedPage - 1) * AUDIT_PAGE_SIZE;
  const toIndex = fromIndex + AUDIT_PAGE_SIZE - 1;
  const logsQuery = filteredLogsQuery()
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(fromIndex, toIndex);

  const today = todayKey();
  const [logsResult, totalResult, todayResult, criticalResult, actorsResult] = await Promise.all([
    logsQuery,
    supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", `${today}T00:00:00-03:00`).lte("created_at", `${today}T23:59:59.999-03:00`),
    supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("action", ["delete", "cancellation", "return"]),
    supabase.from("organization_members").select("user_id, profiles(full_name)").eq("organization_id", organizationId).order("created_at"),
  ]);

  const firstError = [logsResult.error, totalResult.error, todayResult.error, criticalResult.error, actorsResult.error].find(Boolean);
  if (firstError) throw firstError;

  const filteredTotal = logsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  let rows = logsResult.data;
  if (currentPage !== requestedPage) {
    const correctedFrom = (currentPage - 1) * AUDIT_PAGE_SIZE;
    const correctedResult = await filteredLogsQuery()
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(correctedFrom, correctedFrom + AUDIT_PAGE_SIZE - 1);
    if (correctedResult.error) throw correctedResult.error;
    rows = correctedResult.data;
  }

  const logs: AuditLogItem[] = (rows ?? []).map((row) => ({
    id: Number(row.id),
    actorId: row.user_id,
    actorName: (row.profiles as { full_name?: string } | null)?.full_name?.trim() || "Usuário removido ou sistema",
    action: row.action,
    tableName: row.table_name,
    recordId: row.record_id,
    oldData: row.old_data as Record<string, unknown> | null,
    newData: row.new_data as Record<string, unknown> | null,
    createdAt: row.created_at,
  }));

  return {
    organizationId,
    organizationName: member.organizationName,
    logs,
    actors: (actorsResult.data ?? []).map((actor) => ({
      id: actor.user_id,
      name: (actor.profiles as { full_name?: string } | null)?.full_name?.trim() || "Perfil sem nome",
    })),
    totalEvents: totalResult.count ?? 0,
    todayEvents: todayResult.count ?? 0,
    criticalEvents: criticalResult.count ?? 0,
    filteredTotal,
    search: normalizedSearch,
    module: normalizedModule,
    action: normalizedAction,
    actorId: normalizedActorId,
    from: normalizedFrom,
    to: normalizedTo,
    page: currentPage,
    pageSize: AUDIT_PAGE_SIZE,
    totalPages,
  };
}
