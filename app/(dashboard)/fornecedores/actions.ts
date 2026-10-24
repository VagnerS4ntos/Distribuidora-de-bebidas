"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupplierInput = {
  name: string;
  tradeName: string;
  cnpj: string;
  phone: string;
  email: string;
  contactName: string;
  notes: string;
  active: boolean;
};

export type SupplierResult = {
  success: boolean;
  message: string;
  supplierId?: string;
};

function optionalText(value: string) {
  const text = value.trim();
  return text || null;
}

function validateSupplier(input: SupplierInput): SupplierResult | null {
  const name = input.name.trim();
  const email = optionalText(input.email);
  if (name.length < 2 || name.length > 160) {
    return { success: false, message: "Informe um nome entre 2 e 160 caracteres." };
  }
  if (input.tradeName.trim().length > 160) {
    return { success: false, message: "O nome fantasia deve ter no máximo 160 caracteres." };
  }
  if (input.cnpj.trim().length > 40) {
    return { success: false, message: "O CNPJ deve ter no máximo 40 caracteres." };
  }
  if (input.phone.trim().length > 30) {
    return { success: false, message: "O telefone deve ter no máximo 30 caracteres." };
  }
  if (email && (email.length > 254 || !emailPattern.test(email))) {
    return { success: false, message: "Informe um e-mail válido." };
  }
  if (input.contactName.trim().length > 160) {
    return { success: false, message: "O contato deve ter no máximo 160 caracteres." };
  }
  if (input.notes.trim().length > 1000) {
    return { success: false, message: "As observações devem ter no máximo 1.000 caracteres." };
  }
  return null;
}

export async function createSupplier(input: SupplierInput): Promise<SupplierResult> {
  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  const validation = validateSupplier(input);
  if (validation) return validation;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: member.organizationId,
      name: input.name.trim(),
      trade_name: optionalText(input.tradeName),
      cnpj: optionalText(input.cnpj),
      phone: optionalText(input.phone),
      email: optionalText(input.email)?.toLowerCase() ?? null,
      contact_name: optionalText(input.contactName),
      notes: optionalText(input.notes),
      active: input.active,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      return { success: false, message: "Seu perfil não tem permissão para cadastrar fornecedores." };
    }
    return { success: false, message: "Não foi possível cadastrar o fornecedor. Tente novamente." };
  }

  revalidatePath("/fornecedores");
  revalidatePath("/compras");
  return { success: true, message: "Fornecedor cadastrado com sucesso.", supplierId: data.id };
}

export async function updateSupplier(
  input: SupplierInput & { supplierId: string },
): Promise<SupplierResult> {
  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }
  if (member.role !== "owner" && member.role !== "manager") {
    return { success: false, message: "Seu perfil não tem permissão para editar fornecedores." };
  }
  if (!uuidPattern.test(input.supplierId)) {
    return { success: false, message: "Fornecedor inválido." };
  }

  const validation = validateSupplier(input);
  if (validation) return validation;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update({
      name: input.name.trim(),
      trade_name: optionalText(input.tradeName),
      cnpj: optionalText(input.cnpj),
      phone: optionalText(input.phone),
      email: optionalText(input.email)?.toLowerCase() ?? null,
      contact_name: optionalText(input.contactName),
      notes: optionalText(input.notes),
      active: input.active,
    })
    .eq("organization_id", member.organizationId)
    .eq("id", input.supplierId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return { success: false, message: "Seu perfil não tem permissão para editar fornecedores." };
    }
    return { success: false, message: "Não foi possível atualizar o fornecedor. Tente novamente." };
  }
  if (!data) {
    return { success: false, message: "Fornecedor não encontrado ou indisponível para edição." };
  }

  revalidatePath("/fornecedores");
  revalidatePath("/compras");
  return { success: true, message: "Fornecedor atualizado com sucesso.", supplierId: data.id };
}
