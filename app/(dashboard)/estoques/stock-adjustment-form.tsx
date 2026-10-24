"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, SlidersHorizontal } from "lucide-react";
import type {
  InventoryLocation,
  InventoryProductOption,
} from "@/features/inventory/inventory-service";
import { formatQuantity } from "@/lib/utils/format";
import { adjustInventory } from "./actions";

export function StockAdjustmentForm({
  products,
  locations,
  initialProductId,
  initialLocationId,
  returnHref,
}: {
  products: InventoryProductOption[];
  locations: InventoryLocation[];
  initialProductId?: string;
  initialLocationId?: string | null;
  returnHref: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(
    products.some((product) => product.id === initialProductId)
      ? initialProductId!
      : products[0]?.id ?? "",
  );
  const [locationId, setLocationId] = useState(
    locations.some((location) => location.id === initialLocationId)
      ? initialLocationId!
      : locations[0]?.id ?? "",
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );
  const currentQuantity =
    selectedProduct?.balances.find(
      (balance) => balance.locationId === locationId,
    )?.quantity ?? 0;
  const [newQuantity, setNewQuantity] = useState(String(currentQuantity));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    document.getElementById("inventory-adjustment-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  function syncQuantity(nextProductId: string, nextLocationId: string) {
    const quantity =
      products
        .find((product) => product.id === nextProductId)
        ?.balances.find((balance) => balance.locationId === nextLocationId)
        ?.quantity ?? 0;
    setNewQuantity(String(quantity));
    setFeedback(null);
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const quantity = Number(newQuantity);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
      setFeedback("Informe uma quantidade inteira, maior ou igual a zero.");
      return;
    }
    if (quantity === currentQuantity) {
      setFeedback("O novo saldo deve ser diferente do saldo atual.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await adjustInventory({
        productId,
        locationId,
        newQuantity: quantity,
        notes: String(formData.get("notes") ?? ""),
      });

      if (!result.success || !result.movementId) {
        setFeedback(result.message);
        return;
      }

      const destination = new URLSearchParams();
      destination.set("ajustado", result.movementId.slice(0, 8));
      const returnQuery = returnHref.split("?")[1];
      if (returnQuery) {
        new URLSearchParams(returnQuery).forEach((value, key) => {
          destination.set(key, value);
        });
      }
      router.replace(`/estoques?${destination.toString()}`);
      router.refresh();
    } catch {
      setFeedback("Não foi possível ajustar o estoque. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (!products.length || !locations.length) {
    return (
      <div className="inventory-form-empty">
        Cadastre ao menos um produto e um local ativo antes de ajustar o estoque.
      </div>
    );
  }

  const difference = Number(newQuantity) - currentQuantity;

  return (
    <form
      id="inventory-adjustment-form"
      className="inventory-adjustment-form"
      onSubmit={submitAdjustment}
      aria-busy={busy}
    >
      <div className="inventory-form-head">
        <span className="sale-form-icon"><SlidersHorizontal size={20} /></span>
        <div>
          <span className="panel-kicker">Conferência física</span>
          <h2>Ajustar saldo de estoque</h2>
          <p>Informe o saldo contado. A diferença ficará registrada no histórico.</p>
        </div>
      </div>

      {feedback && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          {feedback}
        </div>
      )}

      <div className="inventory-adjustment-grid">
        <label>
          <span className="inventory-field-label">
            Produto <span className="required-mark">*</span>
          </span>
          <select
            value={productId}
            onChange={(event) => {
              const value = event.target.value;
              setProductId(value);
              syncQuantity(value, locationId);
            }}
            disabled={busy}
            required
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="inventory-field-label">
            Local <span className="required-mark">*</span>
          </span>
          <select
            value={locationId}
            onChange={(event) => {
              const value = event.target.value;
              setLocationId(value);
              syncQuantity(productId, value);
            }}
            disabled={busy}
            required
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>
        <label>
          Saldo atual
          <div className="inventory-current-balance">
            {formatQuantity(currentQuantity)} {selectedProduct?.unit ?? "UN"}
          </div>
        </label>
        <label>
          <span className="inventory-field-label">
            Novo saldo <span className="required-mark">*</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="999999999"
            step="1"
            value={newQuantity}
            onChange={(event) => {
              setNewQuantity(event.target.value);
              setFeedback(null);
            }}
            disabled={busy}
            required
          />
        </label>
        <label className="inventory-notes-field">
          Motivo do ajuste
          <input
            name="notes"
            type="text"
            maxLength={500}
            placeholder="Ex.: contagem física do fechamento"
            disabled={busy}
          />
        </label>
      </div>

      <div className="inventory-form-footer">
        <span className={`inventory-difference ${difference < 0 ? "is-negative" : difference > 0 ? "is-positive" : ""}`}>
          Diferença: {difference > 0 ? "+" : ""}{formatQuantity(difference)} {selectedProduct?.unit ?? "UN"}
        </span>
        <button className="button button-primary" type="submit" disabled={busy || difference === 0}>
          {busy ? <LoaderCircle className="feedback-spinner" size={17} /> : <Check size={17} />}
          {busy ? "Atualizando..." : "Confirmar ajuste"}
        </button>
      </div>
    </form>
  );
}
