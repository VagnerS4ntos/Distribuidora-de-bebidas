"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, PackagePlus } from "lucide-react";
import type {
  ProductCategory,
  ProductStockLocation,
} from "@/features/products/product-service";
import { createProduct } from "./actions";

const unitOptions = [
  { value: "UN", label: "Unidade (UN)" },
  { value: "CX", label: "Caixa (CX)" },
  { value: "FD", label: "Fardo (FD)" },
  { value: "PACK", label: "Pack" },
  { value: "L", label: "Litro (L)" },
  { value: "ML", label: "Mililitro (ML)" },
  { value: "KG", label: "Quilograma (KG)" },
  { value: "G", label: "Grama (G)" },
];

export function NewProductForm({
  categories,
  locations,
}: {
  categories: ProductCategory[];
  locations: ProductStockLocation[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [initialQuantity, setInitialQuantity] = useState("0");

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const initialQuantityValue = Number(formData.get("initialQuantity"));

    if (
      !Number.isFinite(initialQuantityValue) ||
      initialQuantityValue < 0 ||
      !Number.isInteger(initialQuantityValue)
    ) {
      setFeedback("A quantidade inicial deve ser um número inteiro maior ou igual a zero.");
      return;
    }

    if (initialQuantityValue > 0 && !formData.get("locationId")) {
      setFeedback("Selecione o local do estoque inicial.");
      return;
    }

    setBusy(true);

    try {
      const result = await createProduct({
        name: String(formData.get("name") ?? ""),
        categoryId: String(formData.get("categoryId") ?? "") || null,
        brand: String(formData.get("brand") ?? ""),
        description: String(formData.get("description") ?? ""),
        barcode: String(formData.get("barcode") ?? ""),
        sku: String(formData.get("sku") ?? ""),
        unit: String(formData.get("unit") ?? "UN"),
        unitsPerPackage: Number(formData.get("unitsPerPackage")),
        costPrice: Number(formData.get("costPrice")),
        salePrice: Number(formData.get("salePrice")),
        minimumStock: Number(formData.get("minimumStock")),
        locationId: String(formData.get("locationId") ?? "") || null,
        initialQuantity: initialQuantityValue,
        isReturnable: formData.get("isReturnable") === "on",
        active: formData.get("active") === "on",
      });

      if (!result.success || !result.productId) {
        setFeedback(result.message);
        return;
      }

      router.replace(
        `/produtos?criado=${encodeURIComponent(result.productId.slice(0, 8))}`,
      );
      router.refresh();
    } catch {
      setFeedback("Não foi possível cadastrar o produto. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="product-form" onSubmit={submitProduct} aria-busy={busy}>
      <div className="product-form-head">
        <span className="sale-form-icon">
          <PackagePlus size={20} />
        </span>
        <div>
          <span className="panel-kicker">Novo item</span>
          <h2>Cadastrar produto</h2>
          <p>Preencha os dados do catálogo. O saldo será controlado por local de estoque.</p>
        </div>
      </div>

      {feedback && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          {feedback}
        </div>
      )}

      <section className="product-form-section">
        <div className="product-form-section-title">
          <span className="panel-kicker">Identificação</span>
          <h3>Dados do produto</h3>
        </div>
        <div className="product-form-grid">
          <label className="product-field-wide">
            <span>Nome <span className="required-mark">*</span></span>
            <input name="name" type="text" minLength={2} maxLength={160} required disabled={busy} autoFocus />
          </label>
          <label>
            Categoria
            <select name="categoryId" defaultValue="" disabled={busy}>
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            Marca
            <input name="brand" type="text" maxLength={120} disabled={busy} />
          </label>
          <label>
            SKU
            <input name="sku" type="text" maxLength={80} disabled={busy} />
          </label>
          <label>
            Código de barras
            <input name="barcode" type="text" inputMode="numeric" maxLength={80} disabled={busy} />
          </label>
          <label className="product-field-full">
            Descrição
            <textarea name="description" maxLength={1000} rows={3} disabled={busy} />
          </label>
        </div>
      </section>

      <section className="product-form-section">
        <div className="product-form-section-title">
          <span className="panel-kicker">Comercial</span>
          <h3>Unidade, preços e controle</h3>
        </div>
        <div className="product-form-grid product-form-grid-commercial">
          <label>
            <span>Unidade <span className="required-mark">*</span></span>
            <select name="unit" defaultValue="UN" required disabled={busy}>
              {unitOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Unidades por embalagem <span className="required-mark">*</span></span>
            <input name="unitsPerPackage" type="number" min="0.001" step="0.001" defaultValue="1" required disabled={busy} />
          </label>
          <label>
            <span>Preço de custo <span className="required-mark">*</span></span>
            <div className="product-money-field"><span>R$</span><input name="costPrice" type="number" min="0" step="0.01" defaultValue="0" required disabled={busy} /></div>
          </label>
          <label>
            <span>Preço de venda <span className="required-mark">*</span></span>
            <div className="product-money-field"><span>R$</span><input name="salePrice" type="number" min="0" step="0.01" defaultValue="0" required disabled={busy} /></div>
          </label>
          <label>
            Estoque mínimo
            <input name="minimumStock" type="number" min="0" step="0.001" defaultValue="0" disabled={busy} />
          </label>
        </div>
      </section>

      <section className="product-form-section product-stock-section">
        <div className="product-form-section-title">
          <span className="panel-kicker">Estoque inicial</span>
          <h3>Quantidade disponível</h3>
          <p>Informe quantos itens já existem e em qual local estão armazenados.</p>
        </div>
        {locations.length ? (
          <div className="product-stock-grid">
            <label>
              Local de estoque
              <select
                name="locationId"
                defaultValue={locations[0]?.id ?? ""}
                disabled={busy || Number(initialQuantity) === 0}
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
            <label>
              Quantidade inicial
              <input
                name="initialQuantity"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={initialQuantity}
                onChange={(event) => {
                  setInitialQuantity(event.target.value);
                  setFeedback(null);
                }}
                required
                disabled={busy}
              />
            </label>
          </div>
        ) : (
          <div className="product-stock-warning">
            Nenhum local de estoque ativo. O produto será cadastrado sem saldo inicial.
          </div>
        )}
      </section>

      <div className="product-form-footer">
        <div className="product-options">
          <label className="product-check">
            <input name="active" type="checkbox" defaultChecked disabled={busy} />
            <span><strong>Produto ativo</strong><small>Disponível para vendas e movimentações.</small></span>
          </label>
          <label className="product-check">
            <input name="isReturnable" type="checkbox" disabled={busy} />
            <span><strong>Embalagem retornável</strong><small>Identifica itens com controle de vasilhame.</small></span>
          </label>
        </div>
        <button className="button button-primary product-submit" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="feedback-spinner" size={17} /> : <Check size={17} />}
          {busy ? "Cadastrando..." : "Cadastrar produto"}
        </button>
      </div>
    </form>
  );
}
