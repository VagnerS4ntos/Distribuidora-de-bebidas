"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import type { FinancialEntryType } from "@/features/finance/finance-types";
import { createClient } from "@/lib/supabase/server";
import { brasiliaDateInputValue, isValidDateInput } from "@/lib/utils/date";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const paymentMethods = new Set([
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "boleto",
  "store_credit",
  "voucher",
  "other",
]);

export type FinancialActionResult = {
  success: boolean;
  message: string;
  entryId?: string;
  status?: string;
};

export type CreateFinancialEntryInput = {
  entryType: FinancialEntryType;
  categoryId: string;
  counterpartyId: string;
  description: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  isPaid: boolean;
  paymentMethod: string;
  referenceCode: string;
  notes: string;
};

export type RecordFinancialPaymentInput = {
  entryId: string;
  amount: number;
  paidOn: string;
  paymentMethod: string;
  referenceCode: string;
  notes: string;
};

function validMoney(value: number) {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    value <= 9999999999.99 &&
    Math.abs(Math.round(value * 100) - value * 100) < 0.000001
  );
}

function optionalUuid(value: string) {
  const normalized = value.trim();
  return normalized && uuidPattern.test(normalized) ? normalized : null;
}

function revalidateFinancialPaths() {
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/vendas");
  revalidatePath("/compras");
}

function financialErrorMessage(error: { code?: string; message: string }, fallback: string) {
  const knownPrefix = [
    "Sessão expirada",
    "Você não possui acesso",
    "Selecione um tipo",
    "Informe uma descrição",
    "Informe um valor",
    "O vencimento",
    "Um dos campos",
    "Selecione uma categoria",
    "Selecione um cliente",
    "Selecione um fornecedor",
    "Selecione uma forma",
    "Lançamento financeiro",
    "Este lançamento",
    "O pagamento",
    "A data do pagamento",
  ].find((prefix) => error.message.startsWith(prefix));

  if (knownPrefix) return error.message;
  if (error.code === "PGRST202") {
    return "Execute a migration do Financeiro no Supabase antes de usar esta ação.";
  }
  return fallback;
}

export async function createFinancialEntry(
  input: CreateFinancialEntryInput,
): Promise<FinancialActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!hasPermission(member.role, "finance.manage")) {
    return { success: false, message: "Seu perfil não tem permissão para alterar o financeiro." };
  }

  if (input.entryType !== "income" && input.entryType !== "expense") {
    return { success: false, message: "Selecione um tipo de lançamento válido." };
  }
  if (input.description.trim().length < 2 || input.description.trim().length > 200) {
    return { success: false, message: "Informe uma descrição entre 2 e 200 caracteres." };
  }
  if (!validMoney(input.amount)) {
    return { success: false, message: "Informe um valor monetário válido." };
  }
  if (!isValidDateInput(input.issueDate)) {
    return { success: false, message: "Informe uma data de emissão válida." };
  }
  if (input.dueDate && !isValidDateInput(input.dueDate)) {
    return { success: false, message: "Informe uma data de vencimento válida." };
  }
  if (input.dueDate && input.dueDate < input.issueDate) {
    return { success: false, message: "O vencimento não pode ser anterior à data de emissão." };
  }
  if (input.referenceCode.trim().length > 80 || input.notes.trim().length > 1000) {
    return { success: false, message: "Um dos campos ultrapassou o limite permitido." };
  }
  if (input.categoryId && !optionalUuid(input.categoryId)) {
    return { success: false, message: "Selecione uma categoria financeira válida." };
  }
  if (input.counterpartyId && !optionalUuid(input.counterpartyId)) {
    return {
      success: false,
      message: input.entryType === "income"
        ? "Selecione um cliente válido."
        : "Selecione um fornecedor válido.",
    };
  }
  if (input.isPaid && !paymentMethods.has(input.paymentMethod)) {
    return { success: false, message: "Selecione uma forma de pagamento válida." };
  }

  const supabase = await createClient();
  const counterpartyId = optionalUuid(input.counterpartyId);
  const { data, error } = await supabase.rpc("create_financial_entry", {
    p_organization_id: member.organizationId,
    p_entry_type: input.entryType,
    p_category_id: optionalUuid(input.categoryId),
    p_customer_id: input.entryType === "income" ? counterpartyId : null,
    p_supplier_id: input.entryType === "expense" ? counterpartyId : null,
    p_description: input.description.trim(),
    p_amount: input.amount,
    p_issue_date: input.issueDate,
    p_due_date: input.dueDate || null,
    p_is_paid: input.isPaid,
    p_payment_method: input.isPaid ? input.paymentMethod : null,
    p_reference_code: input.referenceCode.trim(),
    p_notes: input.notes.trim(),
  });

  if (error) {
    return {
      success: false,
      message: financialErrorMessage(
        error,
        "Não foi possível registrar o lançamento. Tente novamente.",
      ),
    };
  }

  revalidateFinancialPaths();
  return {
    success: true,
    message: "Lançamento financeiro registrado com sucesso.",
    entryId: String(data),
  };
}

export async function recordFinancialPayment(
  input: RecordFinancialPaymentInput,
): Promise<FinancialActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!hasPermission(member.role, "finance.manage")) {
    return { success: false, message: "Seu perfil não tem permissão para alterar o financeiro." };
  }
  if (!uuidPattern.test(input.entryId)) {
    return { success: false, message: "Lançamento financeiro inválido." };
  }
  if (!validMoney(input.amount)) {
    return { success: false, message: "Informe um valor de pagamento válido." };
  }
  if (!isValidDateInput(input.paidOn)) {
    return { success: false, message: "Informe uma data de pagamento válida." };
  }
  if (input.paidOn > brasiliaDateInputValue()) {
    return { success: false, message: "A data do pagamento não pode estar no futuro." };
  }
  if (!paymentMethods.has(input.paymentMethod)) {
    return { success: false, message: "Selecione uma forma de pagamento válida." };
  }
  if (input.referenceCode.trim().length > 80 || input.notes.trim().length > 1000) {
    return { success: false, message: "Um dos campos ultrapassou o limite permitido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_financial_payment", {
    p_organization_id: member.organizationId,
    p_financial_entry_id: input.entryId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_payment_method: input.paymentMethod,
    p_reference_code: input.referenceCode.trim(),
    p_notes: input.notes.trim(),
  });

  if (error) {
    return {
      success: false,
      message: financialErrorMessage(
        error,
        "Não foi possível registrar o pagamento. Tente novamente.",
      ),
    };
  }

  revalidateFinancialPaths();
  return {
    success: true,
    message: data === "paid"
      ? "Pagamento concluído e lançamento quitado."
      : "Pagamento parcial registrado com sucesso.",
    entryId: input.entryId,
    status: String(data),
  };
}
