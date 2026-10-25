"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import type {
  SaleDetails,
  SaleDetailsResult,
} from "@/features/sales/sales-types";
import { createClient } from "@/lib/supabase/server";

const paymentMethods = new Set([
  "cash",
  "pix",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "store_credit",
  "voucher",
  "other",
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateSaleInput = {
  customerId: string | null;
  locationId: string;
  discount: number;
  paymentMethod: string;
  notes: string;
  items: Array<{ productId: string; quantity: number }>;
};

export type CreateSaleResult = {
  success: boolean;
  message: string;
  saleId?: string;
};

export type SaleReturnInput = {
  saleId: string;
  returnType: "cancellation" | "return";
  reason: string;
  items: Array<{ saleItemId: string; quantity: number }>;
};

export type SaleReturnResult = {
  success: boolean;
  message: string;
  saleReturnId?: string;
  status?: SaleDetails["status"];
  refundAmount?: number;
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getSaleDetails(saleId: string): Promise<SaleDetailsResult> {
  if (!uuidPattern.test(saleId)) {
    return { success: false, message: "Venda inválida." };
  }

  const currentMember = await getCurrentMember();
  if (!currentMember) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  const supabase = await createClient();
  const { data: sale, error } = await supabase
    .from("sales")
    .select(`
      id,
      status,
      sold_at,
      created_at,
      subtotal,
      discount,
      total,
      notes,
      customers(name, phone),
      sale_items(
        id,
        quantity,
        unit_price,
        discount,
        total,
        products(name, brand, sku, unit),
        sale_return_items(quantity)
      ),
      sale_payments(payment_method, amount, status, paid_at),
      sale_returns(
        id,
        return_type,
        refund_amount,
        reason,
        created_at,
        sale_return_items(quantity, total_refund, products(name, unit))
      )
    `)
    .eq("organization_id", currentMember.organizationId)
    .eq("id", saleId)
    .maybeSingle();

  if (error || !sale) {
    return {
      success: false,
      message: error
        ? "Não foi possível carregar os detalhes da venda."
        : "Venda não encontrada.",
    };
  }

  const customer = sale.customers as {
    name?: string;
    phone?: string | null;
  } | null;
  const items = (sale.sale_items ?? []) as Array<{
    id: string;
    quantity: number | string;
    unit_price: number | string;
    discount: number | string;
    total: number | string;
    products: {
      name?: string;
      brand?: string | null;
      sku?: string | null;
      unit?: string;
    } | null;
    sale_return_items: Array<{ quantity: number | string }>;
  }>;
  const payments = (sale.sale_payments ?? []) as Array<{
    payment_method: string;
    amount: number | string;
    status: string;
    paid_at: string | null;
  }>;
  const returns = (sale.sale_returns ?? []) as Array<{
    id: string;
    return_type: "cancellation" | "return";
    refund_amount: number | string;
    reason: string;
    created_at: string;
    sale_return_items: Array<{
      quantity: number | string;
      total_refund: number | string;
      products: { name?: string; unit?: string } | null;
    }>;
  }>;
  const refundedAmount = returns.reduce(
    (total, saleReturn) => total + asNumber(saleReturn.refund_amount),
    0,
  );

  const details: SaleDetails = {
    id: sale.id,
    customer: customer?.name ?? "Consumidor final",
    customerPhone: customer?.phone ?? null,
    status: sale.status as SaleDetails["status"],
    soldAt: sale.sold_at ?? sale.created_at,
    subtotal: asNumber(sale.subtotal),
    discount: asNumber(sale.discount),
    total: asNumber(sale.total),
    notes: sale.notes,
    items: items.map((item) => {
      const quantity = asNumber(item.quantity);
      const returnedQuantity = (item.sale_return_items ?? []).reduce(
        (total, returnedItem) => total + asNumber(returnedItem.quantity),
        0,
      );
      return {
        id: item.id,
        product: item.products?.name ?? "Produto não encontrado",
        brand: item.products?.brand ?? null,
        sku: item.products?.sku ?? null,
        unit: item.products?.unit ?? "UN",
        quantity,
        unitPrice: asNumber(item.unit_price),
        discount: asNumber(item.discount),
        total: asNumber(item.total),
        returnedQuantity,
        returnableQuantity: Math.max(0, quantity - returnedQuantity),
      };
    }),
    payments: payments.map((payment) => ({
      method: payment.payment_method,
      amount: asNumber(payment.amount),
      status: payment.status,
      paidAt: payment.paid_at,
    })),
    returns: returns
      .map((saleReturn) => ({
        id: saleReturn.id,
        returnType: saleReturn.return_type,
        refundAmount: asNumber(saleReturn.refund_amount),
        reason: saleReturn.reason,
        createdAt: saleReturn.created_at,
        items: (saleReturn.sale_return_items ?? []).map((item) => ({
          product: item.products?.name ?? "Produto não encontrado",
          unit: item.products?.unit ?? "UN",
          quantity: asNumber(item.quantity),
          totalRefund: asNumber(item.total_refund),
        })),
      }))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    refundedAmount,
    netTotal: Math.max(0, asNumber(sale.total) - refundedAmount),
    canCancel: returns.length === 0 && sale.status === "completed",
  };

  return { success: true, data: details };
}

export async function processSaleReturn(
  input: SaleReturnInput,
): Promise<SaleReturnResult> {
  const currentMember = await getCurrentMember();
  if (!currentMember) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }
  if (currentMember.role !== "owner" && currentMember.role !== "manager") {
    return { success: false, message: "Seu perfil não tem permissão para esta operação." };
  }
  if (!uuidPattern.test(input.saleId)) {
    return { success: false, message: "Venda inválida." };
  }
  if (input.returnType !== "cancellation" && input.returnType !== "return") {
    return { success: false, message: "Selecione uma operação de pós-venda válida." };
  }
  if (input.reason.trim().length < 3 || input.reason.trim().length > 500) {
    return { success: false, message: "Informe um motivo entre 3 e 500 caracteres." };
  }
  if (input.returnType === "return") {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
      return { success: false, message: "Informe ao menos um item para devolução." };
    }
    const itemIds = new Set<string>();
    for (const item of input.items) {
      if (
        !uuidPattern.test(item.saleItemId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return { success: false, message: "As quantidades devolvidas devem ser números inteiros maiores que zero." };
      }
      if (itemIds.has(item.saleItemId)) {
        return { success: false, message: "O mesmo item não pode aparecer mais de uma vez." };
      }
      itemIds.add(item.saleItemId);
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("process_sale_return", {
    p_organization_id: currentMember.organizationId,
    p_sale_id: input.saleId,
    p_return_type: input.returnType,
    p_items: input.returnType === "return"
      ? input.items.map((item) => ({
          sale_item_id: item.saleItemId,
          quantity: item.quantity,
        }))
      : [],
    p_reason: input.reason.trim(),
  });

  if (error) {
    const knownPrefix = [
      "Sessão expirada",
      "Seu perfil não tem permissão",
      "Selecione uma operação",
      "Informe um motivo",
      "Venda não encontrada",
      "Somente vendas concluídas",
      "Uma venda com devolução anterior",
      "Informe os itens",
      "A devolução deve ter",
      "O mesmo item",
      "Não foi possível identificar",
      "A venda possui baixas",
      "Item ou quantidade",
      "Um dos itens",
      "As quantidades devolvidas",
      "A quantidade devolvida",
      "Não foi possível calcular",
      "O valor total",
      "Abra um caixa",
      "O saldo do caixa",
      "Saldo de estoque",
    ].find((prefix) => error.message.startsWith(prefix));

    return {
      success: false,
      message: knownPrefix
        ? error.message
        : error.code === "PGRST202"
          ? "Execute a migration de cancelamentos e devoluções no Supabase."
          : "Não foi possível concluir a operação. Tente novamente.",
    };
  }

  const result = data as {
    sale_return_id?: string;
    status?: SaleDetails["status"];
    refund_amount?: number | string;
  } | null;

  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/estoques");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");
  revalidatePath("/relatorios");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: input.returnType === "cancellation"
      ? "Venda cancelada, estoque reposto e valor estornado."
      : "Devolução registrada, estoque reposto e valor estornado.",
    saleReturnId: result?.sale_return_id,
    status: result?.status,
    refundAmount: asNumber(result?.refund_amount),
  };
}

export async function createSale(
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
  const currentMember = await getCurrentMember();
  if (!currentMember) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  if (!uuidPattern.test(input.locationId)) {
    return { success: false, message: "Selecione o local de estoque." };
  }

  if (input.customerId && !uuidPattern.test(input.customerId)) {
    return { success: false, message: "Selecione um cliente válido." };
  }

  if (!paymentMethods.has(input.paymentMethod)) {
    return { success: false, message: "Selecione uma forma de pagamento válida." };
  }

  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    return { success: false, message: "Adicione ao menos um produto à venda." };
  }

  const productIds = new Set<string>();
  for (const item of input.items) {
    if (
      !uuidPattern.test(item.productId) ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isInteger(item.quantity)
    ) {
      return { success: false, message: "As quantidades dos produtos devem ser números inteiros." };
    }
    if (productIds.has(item.productId)) {
      return { success: false, message: "O mesmo produto não pode aparecer duas vezes." };
    }
    productIds.add(item.productId);
  }

  if (!Number.isFinite(input.discount) || input.discount < 0) {
    return { success: false, message: "Informe um desconto válido." };
  }

  if (input.notes.length > 1000) {
    return { success: false, message: "As observações devem ter no máximo 1.000 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_completed_sale", {
    p_organization_id: currentMember.organizationId,
    p_customer_id: input.customerId,
    p_location_id: input.locationId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    p_discount: input.discount,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes.trim(),
  });

  if (error) {
    const knownMessage = [
      "Sessão expirada",
      "Você não possui acesso",
      "Forma de pagamento inválida",
      "Informe os produtos",
      "A venda deve ter",
      "O mesmo produto",
      "Selecione um local",
      "O cliente selecionado",
      "Item de venda inválido",
      "Produto ou quantidade inválidos",
      "Informe uma quantidade",
      "Um dos produtos",
      "Estoque insuficiente",
      "O desconto",
      "O total da venda",
    ].find((prefix) => error.message.startsWith(prefix));

    return {
      success: false,
      message: knownMessage
        ? error.message
        : error.code === "PGRST202"
          ? "Execute a migration de vendas no Supabase antes de registrar a primeira venda."
          : "Não foi possível registrar a venda. Tente novamente.",
    };
  }

  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/estoques");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: "Venda registrada e estoque atualizado com sucesso.",
    saleId: String(data),
  };
}
