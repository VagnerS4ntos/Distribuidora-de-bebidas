"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CustomerInput = {
  name: string;
  phone: string;
  email: string;
  document: string;
  notes: string;
  active: boolean;
};

export type CustomerResult = {
  success: boolean;
  message: string;
  customerId?: string;
};

function optionalText(value: string) {
  const text = value.trim();
  return text || null;
}

function validateCustomer(input: CustomerInput): CustomerResult | null {
  const name = input.name.trim();
  const email = optionalText(input.email);
  if (name.length < 2 || name.length > 160) {
    return {
      success: false,
      message: "Informe um nome entre 2 e 160 caracteres.",
    };
  }
  if (input.phone.trim().length > 30) {
    return { success: false, message: "O telefone deve ter no máximo 30 caracteres." };
  }
  if (email && (email.length > 254 || !emailPattern.test(email))) {
    return { success: false, message: "Informe um e-mail válido." };
  }
  if (input.document.trim().length > 40) {
    return { success: false, message: "O documento deve ter no máximo 40 caracteres." };
  }
  if (input.notes.trim().length > 1000) {
    return { success: false, message: "As observações devem ter no máximo 1.000 caracteres." };
  }
  return null;
}

export async function createCustomer(input: CustomerInput): Promise<CustomerResult> {
  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  const validation = validateCustomer(input);
  if (validation) return validation;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: member.organizationId,
      name: input.name.trim(),
      phone: optionalText(input.phone),
      email: optionalText(input.email)?.toLowerCase() ?? null,
      document: optionalText(input.document),
      notes: optionalText(input.notes),
      active: input.active,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      return { success: false, message: "Seu perfil não tem permissão para cadastrar clientes." };
    }
    return { success: false, message: "Não foi possível cadastrar o cliente. Tente novamente." };
  }

  revalidatePath("/clientes");
  revalidatePath("/vendas");
  return { success: true, message: "Cliente cadastrado com sucesso.", customerId: data.id };
}

export async function updateCustomer(
  input: CustomerInput & { customerId: string },
): Promise<CustomerResult> {
  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }
  if (member.role !== "owner" && member.role !== "manager") {
    return { success: false, message: "Seu perfil não tem permissão para editar clientes." };
  }
  if (!uuidPattern.test(input.customerId)) {
    return { success: false, message: "Cliente inválido." };
  }

  const validation = validateCustomer(input);
  if (validation) return validation;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({
      name: input.name.trim(),
      phone: optionalText(input.phone),
      email: optionalText(input.email)?.toLowerCase() ?? null,
      document: optionalText(input.document),
      notes: optionalText(input.notes),
      active: input.active,
    })
    .eq("organization_id", member.organizationId)
    .eq("id", input.customerId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return { success: false, message: "Seu perfil não tem permissão para editar clientes." };
    }
    return { success: false, message: "Não foi possível atualizar o cliente. Tente novamente." };
  }
  if (!data) {
    return { success: false, message: "Cliente não encontrado ou indisponível para edição." };
  }

  revalidatePath("/clientes");
  revalidatePath("/vendas");
  return { success: true, message: "Cliente atualizado com sucesso.", customerId: data.id };
}
