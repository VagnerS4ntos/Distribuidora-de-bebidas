"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdjustInventoryInput = {
  productId: string;
  locationId: string;
  newQuantity: number;
  notes: string;
};

export type AdjustInventoryResult = {
  success: boolean;
  message: string;
  movementId?: string;
};

export async function adjustInventory(
  input: AdjustInventoryInput,
): Promise<AdjustInventoryResult> {
  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  if (member.role !== "owner" && member.role !== "manager") {
    return {
      success: false,
      message: "Seu perfil não tem permissão para ajustar o estoque.",
    };
  }

  if (!uuidPattern.test(input.productId) || !uuidPattern.test(input.locationId)) {
    return { success: false, message: "Selecione um produto e um local válidos." };
  }

  if (
    !Number.isFinite(input.newQuantity) ||
    input.newQuantity < 0 ||
    input.newQuantity > 999999999 ||
    !Number.isInteger(input.newQuantity)
  ) {
    return {
      success: false,
      message: "Informe uma quantidade inteira, maior ou igual a zero.",
    };
  }

  const notes = input.notes.trim();
  if (notes.length > 500) {
    return {
      success: false,
      message: "A observação deve ter no máximo 500 caracteres.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_inventory_balance", {
    p_organization_id: member.organizationId,
    p_product_id: input.productId,
    p_location_id: input.locationId,
    p_new_quantity: input.newQuantity,
    p_notes: notes || null,
  });

  if (error) {
    if (error.code === "42501") {
      return {
        success: false,
        message: "Seu perfil não tem permissão para ajustar o estoque.",
      };
    }
    if (error.code === "PGRST202") {
      return {
        success: false,
        message: "Execute a migration de estoque no Supabase antes de fazer ajustes.",
      };
    }

    const knownMessage = [
      "Informe uma quantidade inteira",
      "A observação",
      "Produto não encontrado",
      "Selecione um local",
      "O novo saldo",
    ].find((prefix) => error.message.startsWith(prefix));

    return {
      success: false,
      message:
        knownMessage ?? "Não foi possível ajustar o estoque. Tente novamente.",
    };
  }

  revalidatePath("/estoques");
  revalidatePath("/produtos");
  revalidatePath("/vendas");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: "Estoque ajustado com sucesso.",
    movementId: String(data),
  };
}
