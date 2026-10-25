"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import type { ManualCashMovementType } from "@/features/cash/cash-types";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const manualMovementTypes = new Set<ManualCashMovementType>([
  "cash_in",
  "cash_out",
  "withdrawal",
  "deposit",
]);

export type CashActionResult = {
  success: boolean;
  message: string;
  id?: string;
  expectedBalance?: number;
  countedBalance?: number;
  difference?: number;
};

function validMoney(value: number, allowZero = false) {
  return (
    Number.isFinite(value) &&
    (allowZero ? value >= 0 : value > 0) &&
    value <= 9999999999.99 &&
    Math.abs(Math.round(value * 100) - value * 100) < 0.000001
  );
}

function revalidateCashPaths() {
  revalidatePath("/caixa");
  revalidatePath("/dashboard");
  revalidatePath("/vendas");
  revalidatePath("/financeiro");
}

function cashErrorMessage(error: { code?: string; message: string }, fallback: string) {
  const knownPrefix = [
    "Sessão expirada",
    "Você não possui acesso",
    "Informe um nome",
    "Selecione um local",
    "Já existe um caixa",
    "Informe um saldo inicial",
    "Selecione um caixa",
    "Caixa não encontrado",
    "Este caixa já foi fechado",
    "Selecione um tipo",
    "Informe um valor",
    "Informe uma descrição",
    "A saída não pode",
    "Informe um saldo contado",
    "As observações",
  ].find((prefix) => error.message.startsWith(prefix));

  if (knownPrefix) return error.message;
  if (error.code === "PGRST202") {
    return "Execute a migration do Caixa no Supabase antes de usar esta ação.";
  }
  return fallback;
}

export async function createCashRegister(input: {
  name: string;
  locationId: string;
}): Promise<CashActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (member.role !== "owner" && member.role !== "manager") {
    return { success: false, message: "Você não possui acesso para criar caixas." };
  }
  if (input.name.trim().length < 2 || input.name.trim().length > 80) {
    return { success: false, message: "Informe um nome de caixa entre 2 e 80 caracteres." };
  }
  if (input.locationId && !uuidPattern.test(input.locationId)) {
    return { success: false, message: "Selecione um local de estoque válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_cash_register", {
    p_organization_id: member.organizationId,
    p_name: input.name.trim(),
    p_location_id: input.locationId || null,
  });

  if (error) {
    return {
      success: false,
      message: cashErrorMessage(error, "Não foi possível criar o caixa. Tente novamente."),
    };
  }

  revalidateCashPaths();
  return { success: true, message: "Caixa criado com sucesso.", id: String(data) };
}

export async function openCashSession(input: {
  cashRegisterId: string;
  openingBalance: number;
}): Promise<CashActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!uuidPattern.test(input.cashRegisterId)) {
    return { success: false, message: "Selecione um caixa válido." };
  }
  if (!validMoney(input.openingBalance, true)) {
    return { success: false, message: "Informe um saldo inicial válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_cash_session", {
    p_organization_id: member.organizationId,
    p_cash_register_id: input.cashRegisterId,
    p_opening_balance: input.openingBalance,
  });

  if (error) {
    return {
      success: false,
      message: cashErrorMessage(error, "Não foi possível abrir o caixa. Tente novamente."),
    };
  }

  revalidateCashPaths();
  return { success: true, message: "Caixa aberto com sucesso.", id: String(data) };
}

export async function recordCashMovement(input: {
  cashSessionId: string;
  movementType: ManualCashMovementType;
  amount: number;
  description: string;
}): Promise<CashActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!uuidPattern.test(input.cashSessionId)) {
    return { success: false, message: "Caixa não encontrado." };
  }
  if (!manualMovementTypes.has(input.movementType)) {
    return { success: false, message: "Selecione um tipo de movimentação válido." };
  }
  if (!validMoney(input.amount)) {
    return { success: false, message: "Informe um valor monetário válido." };
  }
  if (input.description.trim().length < 2 || input.description.trim().length > 200) {
    return { success: false, message: "Informe uma descrição entre 2 e 200 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_cash_movement", {
    p_organization_id: member.organizationId,
    p_cash_session_id: input.cashSessionId,
    p_movement_type: input.movementType,
    p_amount: input.amount,
    p_description: input.description.trim(),
  });

  if (error) {
    return {
      success: false,
      message: cashErrorMessage(
        error,
        "Não foi possível registrar a movimentação. Tente novamente.",
      ),
    };
  }

  revalidateCashPaths();
  return { success: true, message: "Movimentação registrada com sucesso.", id: String(data) };
}

export async function closeCashSession(input: {
  cashSessionId: string;
  countedBalance: number;
  notes: string;
}): Promise<CashActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!uuidPattern.test(input.cashSessionId)) {
    return { success: false, message: "Caixa não encontrado." };
  }
  if (!validMoney(input.countedBalance, true)) {
    return { success: false, message: "Informe um saldo contado válido." };
  }
  if (input.notes.trim().length > 1000) {
    return { success: false, message: "As observações ultrapassaram o limite permitido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_cash_session", {
    p_organization_id: member.organizationId,
    p_cash_session_id: input.cashSessionId,
    p_counted_balance: input.countedBalance,
    p_notes: input.notes.trim(),
  });

  if (error) {
    return {
      success: false,
      message: cashErrorMessage(error, "Não foi possível fechar o caixa. Tente novamente."),
    };
  }

  const result = data as {
    expected_balance?: number | string;
    counted_balance?: number | string;
    difference?: number | string;
  } | null;
  revalidateCashPaths();
  return {
    success: true,
    message: "Caixa fechado com sucesso.",
    id: input.cashSessionId,
    expectedBalance: Number(result?.expected_balance ?? 0),
    countedBalance: Number(result?.counted_balance ?? 0),
    difference: Number(result?.difference ?? 0),
  };
}
