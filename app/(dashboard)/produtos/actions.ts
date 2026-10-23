"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/features/auth/current-member";
import { createClient } from "@/lib/supabase/server";

const allowedUnits = new Set(["UN", "CX", "FD", "PACK", "L", "ML", "KG", "G"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateProductInput = {
  name: string;
  categoryId: string | null;
  brand: string;
  description: string;
  barcode: string;
  sku: string;
  unit: string;
  unitsPerPackage: number;
  costPrice: number;
  salePrice: number;
  minimumStock: number;
  locationId: string | null;
  initialQuantity: number;
  isReturnable: boolean;
  active: boolean;
};

export type CreateProductResult = {
  success: boolean;
  message: string;
  productId?: string;
};

function optionalText(value: string) {
  const text = value.trim();
  return text || null;
}

export async function createProduct(
  input: CreateProductInput,
): Promise<CreateProductResult> {
  const currentMember = await getCurrentMember();
  if (!currentMember) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  const name = input.name.trim();
  if (name.length < 2 || name.length > 160) {
    return {
      success: false,
      message: "Informe um nome de produto entre 2 e 160 caracteres.",
    };
  }

  if (input.categoryId && !uuidPattern.test(input.categoryId)) {
    return { success: false, message: "Selecione uma categoria válida." };
  }

  if (!allowedUnits.has(input.unit)) {
    return { success: false, message: "Selecione uma unidade válida." };
  }

  const numericFields = [input.costPrice, input.salePrice, input.minimumStock];
  if (numericFields.some((value) => !Number.isFinite(value) || value < 0)) {
    return { success: false, message: "Preços e estoque mínimo não podem ser negativos." };
  }

  if (!Number.isFinite(input.unitsPerPackage) || input.unitsPerPackage <= 0) {
    return {
      success: false,
      message: "A quantidade por embalagem deve ser maior que zero.",
    };
  }

  if (
    !Number.isFinite(input.initialQuantity) ||
    input.initialQuantity < 0 ||
    !Number.isInteger(input.initialQuantity)
  ) {
    return {
      success: false,
      message: "A quantidade inicial deve ser um número inteiro maior ou igual a zero.",
    };
  }

  if (input.initialQuantity > 0 && (!input.locationId || !uuidPattern.test(input.locationId))) {
    return { success: false, message: "Selecione o local do estoque inicial." };
  }

  const brand = optionalText(input.brand);
  const description = optionalText(input.description);
  const barcode = optionalText(input.barcode);
  const sku = optionalText(input.sku);

  if (
    (brand && brand.length > 120) ||
    (description && description.length > 1000) ||
    (barcode && barcode.length > 80) ||
    (sku && sku.length > 80)
  ) {
    return { success: false, message: "Um dos campos ultrapassou o limite permitido." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_product_with_initial_stock", {
      p_organization_id: currentMember.organizationId,
      p_category_id: input.categoryId,
      p_name: name,
      p_brand: brand,
      p_description: description,
      p_barcode: barcode,
      p_sku: sku,
      p_unit: input.unit,
      p_units_per_package: input.unitsPerPackage,
      p_cost_price: input.costPrice,
      p_sale_price: input.salePrice,
      p_min_stock: input.minimumStock,
      p_is_returnable: input.isReturnable,
      p_active: input.active,
      p_location_id: input.locationId,
      p_initial_quantity: input.initialQuantity,
    });

  if (error) {
    if (error.code === "23505") {
      const field = error.message.includes("barcode") ? "código de barras" : "SKU";
      return {
        success: false,
        message: `Já existe um produto com este ${field} na organização.`,
      };
    }

    if (error.code === "42501") {
      return {
        success: false,
        message: "Seu perfil não tem permissão para cadastrar produtos.",
      };
    }

    if (error.code === "PGRST202") {
      return {
        success: false,
        message: "Execute a nova migration de produtos no Supabase antes de cadastrar.",
      };
    }

    const knownMessage = [
      "Informe um nome",
      "Um dos campos",
      "Selecione uma unidade",
      "Informe uma quantidade",
      "Informe preços",
      "Informe um estoque",
      "A quantidade inicial",
      "A categoria selecionada",
      "Selecione um local",
    ].find((prefix) => error.message.startsWith(prefix));

    if (knownMessage) {
      return { success: false, message: error.message };
    }

    return {
      success: false,
      message: "Não foi possível cadastrar o produto. Tente novamente.",
    };
  }

  revalidatePath("/produtos");
  revalidatePath("/vendas");

  return {
    success: true,
    message: "Produto cadastrado com sucesso.",
    productId: String(data),
  };
}
