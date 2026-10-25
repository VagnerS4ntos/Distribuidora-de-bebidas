"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, PackagePlus, Plus, Trash2 } from "lucide-react";
import type {
  PurchaseProduct,
  PurchaseSupplier,
} from "@/features/purchases/purchase-service";
import { brasiliaDateInputValue } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/format";
import { createPurchaseOrder } from "./actions";

type PurchaseLine = {
  id: number;
  productId: string;
  quantity: string;
  unitCost: string;
};

function moneyValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function NewPurchaseForm({
  suppliers,
  products,
}: {
  suppliers: PurchaseSupplier[];
  products: PurchaseProduct[];
}) {
  const router = useRouter();
  const nextLineId = useRef(2);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [supplierDocumentNumber, setSupplierDocumentNumber] = useState("");
  const [orderedAt, setOrderedAt] = useState(brasiliaDateInputValue);
  const [expectedAt, setExpectedAt] = useState("");
  const [discount, setDiscount] = useState("0");
  const [freight, setFreight] = useState("0");
  const [otherCosts, setOtherCosts] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([
    { id: 1, productId: "", quantity: "1", unitCost: "0.00" },
  ]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const subtotal = lines.reduce(
    (total, line) => total + (Number(line.quantity) || 0) * moneyValue(line.unitCost),
    0,
  );
  const total = Math.max(
    0,
    subtotal - moneyValue(discount) + moneyValue(freight) + moneyValue(otherCosts),
  );

  function updateLine(lineId: number, patch: Partial<PurchaseLine>) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
    setFeedback(null);
  }

  function chooseProduct(lineId: number, productId: string) {
    const product = productById.get(productId);
    updateLine(lineId, {
      productId,
      unitCost: product ? product.costPrice.toFixed(2) : "0.00",
    });
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!supplierId) {
      setFeedback("Selecione um fornecedor.");
      return;
    }
    if (!lines.length || lines.some((line) => !line.productId)) {
      setFeedback("Selecione todos os produtos do pedido.");
      return;
    }
    if (!orderedAt) {
      setFeedback("Informe a data da solicitação.");
      return;
    }
    if (orderedAt > brasiliaDateInputValue()) {
      setFeedback("A data da solicitação não pode estar no futuro.");
      return;
    }
    if (expectedAt && expectedAt < orderedAt) {
      setFeedback("A previsão de entrega não pode ser anterior à solicitação.");
      return;
    }

    const selectedProducts = new Set<string>();
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setFeedback("As quantidades devem ser números inteiros maiores que zero.");
        return;
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        setFeedback("Informe um custo válido para cada produto.");
        return;
      }
      if (selectedProducts.has(line.productId)) {
        setFeedback("O mesmo produto não pode aparecer duas vezes.");
        return;
      }
      selectedProducts.add(line.productId);
    }
    if (moneyValue(discount) > subtotal) {
      setFeedback("O desconto não pode ser maior que o subtotal.");
      return;
    }

    setBusy(true);
    try {
      const result = await createPurchaseOrder({
        supplierId,
        supplierDocumentNumber,
        orderedAt,
        expectedAt,
        discount: moneyValue(discount),
        freight: moneyValue(freight),
        otherCosts: moneyValue(otherCosts),
        notes,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      });

      if (!result.success || !result.purchaseId) {
        setFeedback(result.message);
        return;
      }
      router.replace(`/compras?criada=${encodeURIComponent(result.purchaseId.slice(0, 8))}`);
      router.refresh();
    } catch {
      setFeedback("Não foi possível registrar o pedido. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sale-form purchase-form" onSubmit={submitPurchase} aria-busy={busy}>
      <div className="sale-form-head">
        <span className="sale-form-icon"><PackagePlus size={20} /></span>
        <div>
          <span className="panel-kicker">Novo pedido</span>
          <h2>Registrar compra</h2>
          <p>O estoque será atualizado somente quando a mercadoria for recebida.</p>
        </div>
      </div>

      {feedback && <div className="sale-feedback sale-feedback-error" role="alert">{feedback}</div>}

      <div className="purchase-main-fields">
        <label>
          <span className="sale-field-label">Fornecedor <span className="required-mark">*</span></span>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required disabled={busy}>
            {suppliers.length ? suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}{supplier.tradeName ? ` · ${supplier.tradeName}` : ""}
              </option>
            )) : <option value="">Nenhum fornecedor ativo</option>}
          </select>
        </label>
        <label>
          Documento do fornecedor
          <input value={supplierDocumentNumber} onChange={(event) => setSupplierDocumentNumber(event.target.value)} maxLength={80} placeholder="Nota fiscal, pedido ou referência" disabled={busy} />
        </label>
        <label>
          <span className="sale-field-label">Data da solicitação <span className="required-mark">*</span></span>
          <input type="date" value={orderedAt} max={brasiliaDateInputValue()} onChange={(event) => setOrderedAt(event.target.value)} required disabled={busy} />
        </label>
        <label>
          Previsão de entrega
          <input type="date" value={expectedAt} min={orderedAt || undefined} onChange={(event) => setExpectedAt(event.target.value)} disabled={busy} />
        </label>
      </div>

      <div className="sale-items-head">
        <div><span className="panel-kicker">Itens</span><h3>Produtos do pedido</h3></div>
        <button className="button button-secondary" type="button" onClick={() => setLines((current) => [...current, { id: nextLineId.current++, productId: "", quantity: "1", unitCost: "0.00" }])} disabled={busy || lines.length >= 100}>
          <Plus size={15} />Adicionar produto
        </button>
      </div>

      <div className="sale-lines">
        {lines.map((line, index) => {
          const product = productById.get(line.productId);
          const lineTotal = (Number(line.quantity) || 0) * moneyValue(line.unitCost);
          return (
            <div className="sale-line purchase-line" key={line.id}>
              <span className="sale-line-number">{index + 1}</span>
              <label className="sale-product-field">
                <span className="sale-field-label">Produto <span className="required-mark">*</span></span>
                <select value={line.productId} onChange={(event) => chooseProduct(line.id, event.target.value)} required disabled={busy}>
                  <option value="">Selecione um produto</option>
                  {products.map((option) => (
                    <option key={option.id} value={option.id}>{option.name} · {option.brand || "Sem marca"}</option>
                  ))}
                </select>
              </label>
              <label>
                Quantidade
                <input type="number" inputMode="numeric" min="1" step="1" value={line.quantity} onKeyDown={(event) => { if ([".", ",", "e", "E", "+", "-"].includes(event.key)) event.preventDefault(); }} onChange={(event) => { if (event.target.value === "" || /^\d+$/.test(event.target.value)) updateLine(line.id, { quantity: event.target.value }); }} required disabled={busy} />
              </label>
              <label>
                Custo unitário
                <span className="purchase-money-input"><span>R$</span><input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(line.id, { unitCost: event.target.value })} required disabled={busy} /></span>
              </label>
              <div className="sale-line-info sale-line-total">
                <span>Total</span><strong>{formatCurrency(lineTotal)}</strong><small>{product?.unit ?? "Selecione o produto"}</small>
              </div>
              <button className="icon-button danger-button" type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} disabled={busy || lines.length === 1} aria-label={`Remover item ${index + 1}`} title="Remover item"><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>

      <div className="sale-footer-grid">
        <label className="sale-notes-field">
          Observações
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Condições, prazos e informações adicionais do pedido" disabled={busy} />
        </label>
        <div className="sale-summary purchase-summary">
          <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
          <label><span>Desconto</span><input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} disabled={busy} /></label>
          <label><span>Frete</span><input type="number" min="0" step="0.01" value={freight} onChange={(event) => setFreight(event.target.value)} disabled={busy} /></label>
          <label><span>Outros custos</span><input type="number" min="0" step="0.01" value={otherCosts} onChange={(event) => setOtherCosts(event.target.value)} disabled={busy} /></label>
          <div className="sale-summary-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
          <button className="button button-primary sale-submit" type="submit" disabled={busy || !suppliers.length || !products.length}>
            {busy ? <><LoaderCircle className="feedback-spinner" size={16} />Salvando pedido...</> : <><Check size={16} />Registrar pedido</>}
          </button>
        </div>
      </div>
    </form>
  );
}
