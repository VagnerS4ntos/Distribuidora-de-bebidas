"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Plus, ShoppingCart, Trash2 } from "lucide-react";
import type {
  SaleCustomer,
  SaleLocation,
  SaleProduct,
} from "@/features/sales/sales-service";
import { formatCurrency } from "@/lib/utils/format";
import { createSale } from "./actions";

type SaleLine = {
  id: number;
  productId: string;
  quantity: string;
};

const paymentOptions = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "bank_transfer", label: "Transferência bancária" },
  { value: "store_credit", label: "Crédito da loja" },
  { value: "voucher", label: "Vale" },
  { value: "other", label: "Outro" },
];

export function NewSaleForm({
  customers,
  locations,
  products,
}: {
  customers: SaleCustomer[];
  locations: SaleLocation[];
  products: SaleProduct[];
}) {
  const router = useRouter();
  const nextLineId = useRef(2);
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([
    { id: 1, productId: "", quantity: "1" },
  ]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const subtotal = lines.reduce((total, line) => {
    const product = productById.get(line.productId);
    const quantity = Number(line.quantity);
    return (
      total +
      (product && Number.isFinite(quantity) ? product.salePrice * quantity : 0)
    );
  }, 0);
  const discountValue = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountValue);

  function updateLine(lineId: number, patch: Partial<SaleLine>) {
    setLines((current) =>
      current.map((line) =>
        line.id === lineId ? { ...line, ...patch } : line,
      ),
    );
    setFeedback(null);
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { id: nextLineId.current++, productId: "", quantity: "1" },
    ]);
  }

  function removeLine(lineId: number) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!locationId) {
      setFeedback("Selecione um local de estoque.");
      return;
    }

    if (!lines.length || lines.some((line) => !line.productId)) {
      setFeedback("Selecione todos os produtos da venda.");
      return;
    }

    const selectedProducts = new Set<string>();
    for (const line of lines) {
      const product = productById.get(line.productId);
      const quantity = Number(line.quantity);
      const stock = product?.stockByLocation[locationId] ?? 0;

      if (!product || !Number.isFinite(quantity) || quantity <= 0) {
        setFeedback("Confira as quantidades dos produtos.");
        return;
      }
      if (!Number.isInteger(quantity)) {
        setFeedback("A quantidade dos produtos deve ser um número inteiro.");
        return;
      }
      if (selectedProducts.has(line.productId)) {
        setFeedback("O mesmo produto não pode aparecer duas vezes.");
        return;
      }
      if (quantity > stock) {
        setFeedback(
          `Estoque insuficiente para ${product.name}. Disponível: ${stock}.`,
        );
        return;
      }
      selectedProducts.add(line.productId);
    }

    if (discountValue < 0 || discountValue > subtotal) {
      setFeedback("O desconto não pode ser maior que o subtotal.");
      return;
    }

    setBusy(true);
    try {
      const result = await createSale({
        customerId: customerId || null,
        locationId,
        paymentMethod,
        discount: discountValue,
        notes,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      });

      if (!result.success || !result.saleId) {
        setFeedback(result.message);
        return;
      }

      router.replace(
        `/vendas?criada=${encodeURIComponent(result.saleId.slice(0, 8))}`,
      );
      router.refresh();
    } catch {
      setFeedback("Não foi possível registrar a venda. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sale-form" onSubmit={submitSale} aria-busy={busy}>
      <div className="sale-form-head">
        <span className="sale-form-icon">
          <ShoppingCart size={20} />
        </span>
        <div>
          <span className="panel-kicker">Novo pedido</span>
          <h2>Registrar venda</h2>
          <p>
            Os preços são carregados do catálogo e o estoque é baixado ao
            concluir.
          </p>
        </div>
      </div>

      {feedback && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          {feedback}
        </div>
      )}

      <div className="sale-main-fields">
        <label>
          Cliente
          <select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            disabled={busy}
          >
            <option value="">Consumidor final</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sale-field-label">
            Local de estoque <span className="required-mark">*</span>
          </span>
          <select
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setFeedback(null);
            }}
            required
            disabled={busy}
          >
            {locations.length ? (
              locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))
            ) : (
              <option value="">Nenhum local ativo</option>
            )}
          </select>
        </label>
        <label>
          <span className="sale-field-label">
            Forma de pagamento <span className="required-mark">*</span>
          </span>
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            required
            disabled={busy}
          >
            {paymentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sale-items-head">
        <div>
          <span className="panel-kicker">Itens</span>
          <h3>Produtos da venda</h3>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={addLine}
          disabled={busy || lines.length >= 100}
        >
          <Plus size={15} />
          Adicionar produto
        </button>
      </div>

      <div className="sale-lines">
        {lines.map((line, index) => {
          const product = productById.get(line.productId);
          const stock = product?.stockByLocation[locationId] ?? 0;
          const quantity = Number(line.quantity) || 0;
          return (
            <div className="sale-line" key={line.id}>
              <span className="sale-line-number">{index + 1}</span>
              <label className="sale-product-field">
                <span className="sale-field-label">
                  Produto <span className="required-mark">*</span>
                </span>
                <select
                  value={line.productId}
                  onChange={(event) =>
                    updateLine(line.id, { productId: event.target.value })
                  }
                  required
                  disabled={busy}
                >
                  <option value="">Selecione um produto</option>
                  {products.map((option) => {
                    const optionStock = option.stockByLocation[locationId] ?? 0;
                    return (
                      <option key={option.id} value={option.id}>
                        {option.name} · {option.brand} · estoque {optionStock}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Quantidade
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  max={stock >= 1 ? Math.floor(stock) : undefined}
                  value={line.quantity}
                  onKeyDown={(event) => {
                    if ([".", ",", "e", "E", "+", "-"].includes(event.key))
                      event.preventDefault();
                  }}
                  onChange={(event) => {
                    if (
                      event.target.value === "" ||
                      /^\d+$/.test(event.target.value)
                    ) {
                      updateLine(line.id, { quantity: event.target.value });
                    }
                  }}
                  required
                  disabled={busy}
                />
              </label>
              <div className="sale-line-info">
                <span>Unitário</span>
                <strong>{formatCurrency(product?.salePrice ?? 0)}</strong>
                <small>
                  {product
                    ? `${stock} ${product.unit} disponível(is)`
                    : "Selecione o produto"}
                </small>
              </div>
              <div className="sale-line-info sale-line-total">
                <span>Total</span>
                <strong>
                  {formatCurrency((product?.salePrice ?? 0) * quantity)}
                </strong>
              </div>
              <button
                className="icon-button danger-button"
                type="button"
                onClick={() => removeLine(line.id)}
                disabled={busy || lines.length === 1}
                aria-label={`Remover item ${index + 1}`}
                title="Remover item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="sale-footer-grid">
        <label className="sale-notes-field">
          Observações
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            placeholder="Informações adicionais da venda"
            disabled={busy}
          />
        </label>
        <div className="sale-summary">
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <label>
            <span>Desconto (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              max={subtotal || undefined}
              value={discount}
              onChange={(event) => {
                setDiscount(event.target.value);
                setFeedback(null);
              }}
              disabled={busy}
            />
          </label>
          <div className="sale-summary-total">
            <span>Total</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
          <button
            className="button button-primary sale-submit"
            type="submit"
            disabled={busy || !products.length || !locations.length}
          >
            {busy ? (
              <>
                <LoaderCircle className="feedback-spinner" size={16} />
                Finalizando venda...
              </>
            ) : (
              <>
                <Check size={16} />
                Concluir venda
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
