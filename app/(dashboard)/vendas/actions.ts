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
        products(name, brand, sku, unit)
      ),
      sale_payments(payment_method, amount, status, paid_at)
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
  }>;
  const payments = (sale.sale_payments ?? []) as Array<{
    payment_method: string;
    amount: number | string;
    status: string;
    paid_at: string | null;
  }>;

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
    items: items.map((item) => ({
      id: item.id,
      product: item.products?.name ?? "Produto não encontrado",
      brand: item.products?.brand ?? null,
      sku: item.products?.sku ?? null,
      unit: item.products?.unit ?? "UN",
      quantity: asNumber(item.quantity),
      unitPrice: asNumber(item.unit_price),
      discount: asNumber(item.discount),
      total: asNumber(item.total),
    })),
    payments: payments.map((payment) => ({
      method: payment.payment_method,
      amount: asNumber(payment.amount),
      status: payment.status,
      paidAt: payment.paid_at,
    })),
  };

  return { success: true, data: details };
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
