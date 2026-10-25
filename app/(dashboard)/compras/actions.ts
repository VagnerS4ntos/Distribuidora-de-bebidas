"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import type {
  PurchaseDetails,
  PurchaseDetailsResult,
} from "@/features/purchases/purchase-types";
import { createClient } from "@/lib/supabase/server";
import { brasiliaDateInputValue, isValidDateInput } from "@/lib/utils/date";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreatePurchaseInput = {
  supplierId: string;
  supplierDocumentNumber: string;
  orderedAt: string;
  expectedAt: string;
  discount: number;
  freight: number;
  otherCosts: number;
  notes: string;
  items: Array<{ productId: string; quantity: number; unitCost: number }>;
};

export type ReceivePurchaseInput = {
  purchaseId: string;
  locationId: string;
  receivedAt: string;
  items: Array<{ productId: string; quantity: number }>;
};

export type PurchaseActionResult = {
  success: boolean;
  message: string;
  purchaseId?: string;
  status?: string;
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validMoney(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    Math.abs(Math.round(value * 100) - value * 100) < 0.000001
  );
}

function revalidatePurchasePaths() {
  revalidatePath("/compras");
  revalidatePath("/estoques");
  revalidatePath("/produtos");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}

export async function createPurchaseOrder(
  input: CreatePurchaseInput,
): Promise<PurchaseActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!hasPermission(member.role, "purchases.manage")) {
    return { success: false, message: "Seu perfil não tem permissão para registrar compras." };
  }

  if (!uuidPattern.test(input.supplierId)) {
    return { success: false, message: "Selecione um fornecedor válido." };
  }
  if (input.supplierDocumentNumber.trim().length > 80) {
    return { success: false, message: "O documento do fornecedor deve ter no máximo 80 caracteres." };
  }
  if (!isValidDateInput(input.orderedAt)) {
    return { success: false, message: "Informe uma data de solicitação válida." };
  }
  if (input.orderedAt > brasiliaDateInputValue()) {
    return { success: false, message: "A data da solicitação não pode estar no futuro." };
  }
  if (input.expectedAt && !isValidDateInput(input.expectedAt)) {
    return { success: false, message: "Informe uma previsão de entrega válida." };
  }
  if (input.expectedAt && input.expectedAt < input.orderedAt) {
    return { success: false, message: "A previsão de entrega não pode ser anterior à solicitação." };
  }
  if (input.notes.trim().length > 1000) {
    return { success: false, message: "As observações devem ter no máximo 1.000 caracteres." };
  }
  if (![input.discount, input.freight, input.otherCosts].every(validMoney)) {
    return { success: false, message: "Informe valores adicionais válidos." };
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    return { success: false, message: "Adicione ao menos um produto ao pedido." };
  }

  const productIds = new Set<string>();
  let subtotal = 0;
  for (const item of input.items) {
    if (!uuidPattern.test(item.productId)) {
      return { success: false, message: "Selecione todos os produtos do pedido." };
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { success: false, message: "As quantidades devem ser números inteiros maiores que zero." };
    }
    if (!validMoney(item.unitCost)) {
      return { success: false, message: "Informe um custo válido para cada produto." };
    }
    if (productIds.has(item.productId)) {
      return { success: false, message: "O mesmo produto não pode aparecer duas vezes." };
    }
    productIds.add(item.productId);
    subtotal += item.quantity * item.unitCost;
  }
  if (input.discount > subtotal) {
    return { success: false, message: "O desconto não pode ser maior que o subtotal." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_organization_id: member.organizationId,
    p_supplier_id: input.supplierId,
    p_supplier_document_number: input.supplierDocumentNumber.trim(),
    p_ordered_at: input.orderedAt,
    p_expected_at: input.expectedAt || null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_cost: item.unitCost,
    })),
    p_discount: input.discount,
    p_freight: input.freight,
    p_other_costs: input.otherCosts,
    p_notes: input.notes.trim(),
  });

  if (error) {
    const knownMessage = [
      "Sessão expirada",
      "Você não possui acesso",
      "Selecione um fornecedor",
      "Um dos campos",
      "Informe os produtos",
      "O pedido deve ter",
      "O mesmo produto",
      "Produto, quantidade",
      "As quantidades",
      "Informe um custo",
      "Um dos produtos",
      "Desconto, frete",
      "O desconto",
      "O total",
      "Informe uma data de solicitação",
      "A data da solicitação",
      "A previsão de entrega",
    ].find((prefix) => error.message.startsWith(prefix));
    return {
      success: false,
      message: knownMessage
        ? error.message
        : error.code === "PGRST202"
          ? "Execute a migration de Compras no Supabase antes de registrar o primeiro pedido."
          : "Não foi possível registrar o pedido. Tente novamente.",
    };
  }

  revalidatePurchasePaths();
  return {
    success: true,
    message: "Pedido de compra registrado com sucesso.",
    purchaseId: String(data),
  };
}

export async function receivePurchaseOrder(
  input: ReceivePurchaseInput,
): Promise<PurchaseActionResult> {
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };
  if (!hasPermission(member.role, "purchases.manage")) {
    return { success: false, message: "Seu perfil não tem permissão para receber compras." };
  }
  if (!uuidPattern.test(input.purchaseId) || !uuidPattern.test(input.locationId)) {
    return { success: false, message: "Pedido ou local de estoque inválido." };
  }
  if (!isValidDateInput(input.receivedAt)) {
    return { success: false, message: "Informe uma data de recebimento válida." };
  }
  if (input.receivedAt > brasiliaDateInputValue()) {
    return { success: false, message: "A data do recebimento não pode estar no futuro." };
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    return { success: false, message: "Informe ao menos um produto recebido." };
  }

  const productIds = new Set<string>();
  for (const item of input.items) {
    if (
      !uuidPattern.test(item.productId) ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return { success: false, message: "As quantidades recebidas devem ser números inteiros maiores que zero." };
    }
    if (productIds.has(item.productId)) {
      return { success: false, message: "O mesmo produto não pode aparecer duas vezes." };
    }
    productIds.add(item.productId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    p_organization_id: member.organizationId,
    p_purchase_order_id: input.purchaseId,
    p_location_id: input.locationId,
    p_received_at: input.receivedAt,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  });

  if (error) {
    const knownMessage = [
      "Sessão expirada",
      "Você não possui acesso",
      "Selecione um local",
      "Pedido de compra",
      "Este pedido",
      "Informe os produtos",
      "Informe ao menos",
      "O mesmo produto",
      "Produto ou quantidade",
      "As quantidades",
      "Um dos produtos",
      "A quantidade recebida",
      "Informe uma data de recebimento",
      "A data do recebimento",
    ].find((prefix) => error.message.startsWith(prefix));
    return {
      success: false,
      message: knownMessage
        ? error.message
        : error.code === "PGRST202"
          ? "Execute a migration de Compras no Supabase antes de receber mercadorias."
          : "Não foi possível receber o pedido. Tente novamente.",
    };
  }

  revalidatePurchasePaths();
  return {
    success: true,
    message: data === "received" ? "Pedido recebido e estoque atualizado." : "Recebimento parcial registrado e estoque atualizado.",
    purchaseId: input.purchaseId,
    status: String(data),
  };
}

export async function getPurchaseDetails(
  purchaseId: string,
): Promise<PurchaseDetailsResult> {
  if (!uuidPattern.test(purchaseId)) {
    return { success: false, message: "Pedido de compra inválido." };
  }
  const member = await getCurrentMember();
  if (!member) return { success: false, message: "Sua sessão expirou. Entre novamente." };

  const supabase = await createClient();
  const { data: purchase, error } = await supabase
    .from("purchase_orders")
    .select(`
      id,
      status,
      supplier_document_number,
      ordered_at,
      expected_at,
      received_at,
      subtotal,
      discount,
      freight,
      other_costs,
      total,
      notes,
      suppliers(name, trade_name, phone),
      purchase_items(
        id,
        product_id,
        quantity_ordered,
        quantity_received,
        unit_cost,
        total,
        products(name, brand, sku, unit)
      ),
      purchase_receipts(
        id,
        received_at,
        created_at,
        location:stock_locations(name),
        receiver:profiles(full_name),
        items:purchase_receipt_items(
          id,
          product_id,
          quantity_received,
          unit_cost,
          products(name, brand, sku, unit)
        )
      )
    `)
    .eq("organization_id", member.organizationId)
    .eq("id", purchaseId)
    .maybeSingle();

  if (error || !purchase) {
    return {
      success: false,
      message: error ? "Não foi possível carregar os detalhes do pedido." : "Pedido não encontrado.",
    };
  }

  const supplier = purchase.suppliers as {
    name?: string;
    trade_name?: string | null;
    phone?: string | null;
  } | null;
  const items = (purchase.purchase_items ?? []) as Array<{
    id: string;
    product_id: string;
    quantity_ordered: number | string;
    quantity_received: number | string;
    unit_cost: number | string;
    total: number | string;
    products: {
      name?: string;
      brand?: string | null;
      sku?: string | null;
      unit?: string;
    } | null;
  }>;
  const receipts = (purchase.purchase_receipts ?? []) as Array<{
    id: string;
    received_at: string;
    created_at: string;
    location: { name?: string } | null;
    receiver: { full_name?: string | null } | null;
    items: Array<{
      id: string;
      product_id: string;
      quantity_received: number | string;
      unit_cost: number | string;
      products: {
        name?: string;
        brand?: string | null;
        sku?: string | null;
        unit?: string;
      } | null;
    }>;
  }>;

  const details: PurchaseDetails = {
    id: purchase.id,
    supplier: supplier?.name ?? "Fornecedor não encontrado",
    supplierTradeName: supplier?.trade_name ?? null,
    supplierPhone: supplier?.phone ?? null,
    supplierDocumentNumber: purchase.supplier_document_number,
    status: purchase.status as PurchaseDetails["status"],
    orderedAt: purchase.ordered_at,
    expectedAt: purchase.expected_at,
    receivedAt: purchase.received_at,
    subtotal: asNumber(purchase.subtotal),
    discount: asNumber(purchase.discount),
    freight: asNumber(purchase.freight),
    otherCosts: asNumber(purchase.other_costs),
    total: asNumber(purchase.total),
    notes: purchase.notes,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      product: item.products?.name ?? "Produto não encontrado",
      brand: item.products?.brand ?? null,
      sku: item.products?.sku ?? null,
      unit: item.products?.unit ?? "UN",
      quantityOrdered: asNumber(item.quantity_ordered),
      quantityReceived: asNumber(item.quantity_received),
      unitCost: asNumber(item.unit_cost),
      total: asNumber(item.total),
    })),
    receipts: receipts
      .map((receipt) => ({
        id: receipt.id,
        receivedAt: receipt.received_at,
        recordedAt: receipt.created_at,
        location: receipt.location?.name ?? "Local não encontrado",
        receivedBy: receipt.receiver?.full_name?.trim() || null,
        items: (receipt.items ?? []).map((item) => ({
          id: item.id,
          productId: item.product_id,
          product: item.products?.name ?? "Produto não encontrado",
          brand: item.products?.brand ?? null,
          sku: item.products?.sku ?? null,
          unit: item.products?.unit ?? "UN",
          quantity: asNumber(item.quantity_received),
          unitCost: asNumber(item.unit_cost),
        })),
      }))
      .sort((first, second) =>
        second.receivedAt.localeCompare(first.receivedAt)
        || second.recordedAt.localeCompare(first.recordedAt),
      ),
  };

  return { success: true, data: details };
}
