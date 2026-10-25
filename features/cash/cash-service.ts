import "server-only";

import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import type {
  CashLocationOption,
  CashMovementListItem,
  CashMovementType,
  CashRegisterOption,
  ClosedCashSession,
  OpenCashSession,
} from "@/features/cash/cash-types";
import { createClient } from "@/lib/supabase/server";

const CASH_HISTORY_PAGE_SIZE = 10;

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function registerRelationName(value: unknown) {
  const relation = value as { name?: string } | Array<{ name?: string }> | null;
  return Array.isArray(relation) ? relation[0]?.name ?? "Caixa" : relation?.name ?? "Caixa";
}

function locationRelationName(value: unknown) {
  const relation = value as { name?: string } | Array<{ name?: string }> | null;
  return Array.isArray(relation) ? relation[0]?.name ?? null : relation?.name ?? null;
}

function mapMovement(row: {
  id: string;
  movement_type: string;
  amount: number | string;
  direction: string;
  description: string | null;
  reference_type: string | null;
  created_at: string;
}): CashMovementListItem {
  return {
    id: row.id,
    movementType: row.movement_type as CashMovementType,
    amount: asNumber(row.amount),
    direction: row.direction as "in" | "out",
    description: row.description,
    referenceType: row.reference_type,
    createdAt: row.created_at,
  };
}

function movementTotals(rows: Array<{
  movement_type: string;
  amount: number | string;
  direction: string;
}>) {
  let inflows = 0;
  let outflows = 0;
  for (const movement of rows) {
    if (movement.movement_type === "opening") continue;
    if (movement.direction === "in") inflows += asNumber(movement.amount);
    if (movement.direction === "out") outflows += asNumber(movement.amount);
  }
  return { inflows, outflows };
}

export async function getCashPageData({ page = 1 }: { page?: number } = {}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = await createClient();
  const organizationId = member.organizationId;
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;

  const [registersResult, locationsResult, openSessionResult, closedCountResult] =
    await Promise.all([
      supabase
        .from("cash_registers")
        .select("id, name, stock_locations(name)")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("stock_locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("cash_sessions")
        .select("id, cash_register_id, opened_at, opening_balance, cash_registers(name, stock_locations(name))")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cash_sessions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "closed"),
    ]);

  const firstError = [
    registersResult.error,
    locationsResult.error,
    openSessionResult.error,
    closedCountResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const total = closedCountResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CASH_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const from = (currentPage - 1) * CASH_HISTORY_PAGE_SIZE;
  const to = from + CASH_HISTORY_PAGE_SIZE - 1;

  const closedSessionsResult = await supabase
    .from("cash_sessions")
    .select(
      "id, opened_at, closed_at, opening_balance, expected_closing_balance, counted_closing_balance, notes, cash_registers(name)",
    )
    .eq("organization_id", organizationId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .range(from, to);
  if (closedSessionsResult.error) throw closedSessionsResult.error;

  const closedIds = (closedSessionsResult.data ?? []).map((session) => session.id);
  const openId = openSessionResult.data?.id;
  const movementSessionIds = [...closedIds, ...(openId ? [openId] : [])];
  const movementsResult = movementSessionIds.length
    ? await supabase
        .from("cash_movements")
        .select("id, cash_session_id, movement_type, amount, direction, description, reference_type, created_at")
        .eq("organization_id", organizationId)
        .in("cash_session_id", movementSessionIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (movementsResult.error) throw movementsResult.error;

  const movementRows = movementsResult.data ?? [];
  let openSession: OpenCashSession | null = null;
  if (openSessionResult.data) {
    const session = openSessionResult.data;
    const rows = movementRows.filter((movement) => movement.cash_session_id === session.id);
    const { inflows, outflows } = movementTotals(rows);
    const register = session.cash_registers as {
      name?: string;
      stock_locations?: { name?: string } | Array<{ name?: string }> | null;
    } | Array<{
      name?: string;
      stock_locations?: { name?: string } | Array<{ name?: string }> | null;
    }> | null;
    const normalizedRegister = Array.isArray(register) ? register[0] : register;

    openSession = {
      id: session.id,
      registerId: session.cash_register_id,
      registerName: normalizedRegister?.name ?? "Caixa",
      locationName: locationRelationName(normalizedRegister?.stock_locations),
      openedAt: session.opened_at,
      openingBalance: asNumber(session.opening_balance),
      inflows,
      outflows,
      expectedBalance: asNumber(session.opening_balance) + inflows - outflows,
      movements: rows.map(mapMovement),
    };
  }

  const closedSessions: ClosedCashSession[] = (closedSessionsResult.data ?? []).map((session) => {
    const rows = movementRows.filter((movement) => movement.cash_session_id === session.id);
    const { inflows, outflows } = movementTotals(rows);
    const expectedBalance = asNumber(session.expected_closing_balance);
    const countedBalance = asNumber(session.counted_closing_balance);
    return {
      id: session.id,
      registerName: registerRelationName(session.cash_registers),
      openedAt: session.opened_at,
      closedAt: session.closed_at ?? session.opened_at,
      openingBalance: asNumber(session.opening_balance),
      inflows,
      outflows,
      expectedBalance,
      countedBalance,
      difference: countedBalance - expectedBalance,
      notes: session.notes,
    };
  });

  const registers: CashRegisterOption[] = (registersResult.data ?? []).map((register) => ({
    id: register.id,
    name: register.name,
    locationName: locationRelationName(register.stock_locations),
  }));

  return {
    organizationId,
    organizationName: member.organizationName,
    role: member.role,
    canManageRegisters: hasPermission(member.role, "cash.manage"),
    registers,
    locations: (locationsResult.data ?? []) as CashLocationOption[],
    openSession,
    closedSessions,
    page: currentPage,
    pageSize: CASH_HISTORY_PAGE_SIZE,
    total,
    totalPages,
  };
}
