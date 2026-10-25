"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  CalendarCheck2,
  Check,
  CircleAlert,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PackageOpen,
  ReceiptText,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import type { PurchaseLocation } from "@/features/purchases/purchase-service";
import type {
  PurchaseDetails,
  PurchaseListItem,
  PurchaseStatus,
} from "@/features/purchases/purchase-types";
import { brasiliaDateInputValue } from "@/lib/utils/date";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { getPurchaseDetails, receivePurchaseOrder } from "./actions";

const statusLabels: Record<PurchaseStatus, string> = {
  draft: "Rascunho",
  ordered: "Aguardando",
  partially_received: "Recebido parcialmente",
  received: "Recebido",
  cancelled: "Cancelado",
};

const BRASILIA_TIME_ZONE = "America/Sao_Paulo";

function statusClass(status: PurchaseStatus) {
  if (status === "received") return "is-regular";
  if (status === "ordered" || status === "partially_received") return "is-low";
  return "is-inactive";
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: BRASILIA_TIME_ZONE,
  }).format(new Date(value));
}

function getBrasiliaDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BRASILIA_TIME_ZONE,
  }).formatToParts(new Date(value));
  const dateParts = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function isPurchaseOverdue(expectedAt: string | null, status: PurchaseStatus) {
  if (
    !expectedAt ||
    (status !== "ordered" && status !== "partially_received")
  ) {
    return false;
  }

  return getBrasiliaDateKey(expectedAt) < getBrasiliaDateKey(new Date());
}

export function PurchasesHistoryTable({
  purchases,
  locations,
}: {
  purchases: PurchaseListItem[];
  locations: PurchaseLocation[];
}) {
  const router = useRouter();
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [details, setDetails] = useState<PurchaseDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiveFeedback, setReceiveFeedback] = useState<string | null>(null);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [receivedAt, setReceivedAt] = useState(brasiliaDateInputValue);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>({});
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);

  const closeModal = () => {
    requestIdRef.current += 1;
    setSelectedPurchaseId(null);
    setDetails(null);
    setError(null);
    setReceiveFeedback(null);
    setLoading(false);
    setReceiving(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const loadDetails = async (purchaseId: string, initial = false) => {
    const requestId = ++requestIdRef.current;
    if (initial) {
      setSelectedPurchaseId(purchaseId);
      setDetails(null);
      setError(null);
    }
    setLoading(true);
    try {
      const result = await getPurchaseDetails(purchaseId);
      if (requestId !== requestIdRef.current) return;
      if (!result.success) {
        setError(result.message);
        return;
      }
      setDetails(result.data);
      setError(null);
      setReceivedQuantities(
        Object.fromEntries(
          result.data.items.map((item) => [
            item.productId,
            String(Math.max(0, item.quantityOrdered - item.quantityReceived)),
          ]),
        ),
      );
    } catch {
      if (requestId === requestIdRef.current) setError("Não foi possível carregar os detalhes do pedido.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const openPurchase = (purchaseId: string, opener: HTMLElement) => {
    openerRef.current = opener;
    setReceiveFeedback(null);
    void loadDetails(purchaseId, true);
  };

  async function receiveItems() {
    if (!details || !locationId) {
      setReceiveFeedback("Selecione um local de estoque.");
      return;
    }
    if (!receivedAt) {
      setReceiveFeedback("Informe a data do recebimento.");
      return;
    }
    if (receivedAt > brasiliaDateInputValue()) {
      setReceiveFeedback("A data do recebimento não pode estar no futuro.");
      return;
    }
    if (receivedAt < getBrasiliaDateKey(details.orderedAt)) {
      setReceiveFeedback("A data do recebimento não pode ser anterior à solicitação.");
      return;
    }
    const items = details.items.flatMap((item) => {
      const quantity = Number(receivedQuantities[item.productId] ?? 0);
      return quantity > 0 ? [{ productId: item.productId, quantity }] : [];
    });
    if (!items.length) {
      setReceiveFeedback("Informe ao menos uma quantidade recebida.");
      return;
    }
    for (const received of items) {
      const item = details.items.find((candidate) => candidate.productId === received.productId);
      const remaining = item ? item.quantityOrdered - item.quantityReceived : 0;
      if (!Number.isInteger(received.quantity) || received.quantity <= 0 || received.quantity > remaining) {
        setReceiveFeedback(`Confira a quantidade recebida de ${item?.product ?? "um dos produtos"}.`);
        return;
      }
    }

    setReceiving(true);
    setReceiveFeedback(null);
    try {
      const result = await receivePurchaseOrder({
        purchaseId: details.id,
        locationId,
        receivedAt,
        items,
      });
      if (!result.success) {
        setReceiveFeedback(result.message);
        return;
      }
      setReceiveFeedback(result.message);
      await loadDetails(details.id);
      router.refresh();
    } catch {
      setReceiveFeedback("Não foi possível registrar o recebimento. Tente novamente.");
    } finally {
      setReceiving(false);
    }
  }

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    purchaseId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPurchase(purchaseId, event.currentTarget);
    }
  };

  useEffect(() => {
    if (!selectedPurchaseId) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedPurchaseId]);

  const canReceive =
    details &&
    (details.status === "ordered" || details.status === "partially_received");
  const selectedPurchaseIsOverdue = details
    ? isPurchaseOverdue(details.expectedAt, details.status)
    : false;

  const modal = selectedPurchaseId ? (
    <div className="sale-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <section className="sale-modal purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-modal-title">
        <header className="sale-modal-head">
          <div>
            <span className="panel-kicker">Detalhes da compra</span>
            <h2 id="purchase-modal-title"><ReceiptText size={19} /> Pedido #{selectedPurchaseId.slice(0, 8)}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={closeModal} aria-label="Fechar detalhes do pedido" title="Fechar"><X size={19} /></button>
        </header>

        <div className="sale-modal-body">
          {loading && !details && (
            <div className="sale-modal-state" role="status"><LoaderCircle className="feedback-spinner" size={24} /><strong>Carregando detalhes...</strong><span>Buscando fornecedor e produtos do pedido.</span></div>
          )}
          {error && !loading && (
            <div className="sale-modal-state sale-modal-error" role="alert"><CircleAlert size={24} /><strong>Não foi possível abrir o pedido</strong><span>{error}</span><button className="button button-secondary" type="button" onClick={() => void loadDetails(selectedPurchaseId, true)}>Tentar novamente</button></div>
          )}

          {details && (
            <>
              <div className="sale-detail-meta purchase-detail-meta">
                <div><span>Fornecedor</span><strong>{details.supplier}</strong>{details.supplierTradeName && <small>{details.supplierTradeName}</small>}</div>
                <div><span>Solicitação</span><strong>{formatDate(details.orderedAt, true)}</strong><small>{details.supplierDocumentNumber || "Sem documento externo"}</small></div>
                <div className={selectedPurchaseIsOverdue ? "purchase-overdue-card" : undefined}><span>Previsão</span><strong>{formatDate(details.expectedAt)}</strong></div>
                <div className={selectedPurchaseIsOverdue ? "purchase-overdue-card" : undefined}><span>Status</span><strong>{statusLabels[details.status]}</strong>{selectedPurchaseIsOverdue && <small className="purchase-overdue-label"><TriangleAlert size={11} /> Pedido atrasado</small>}{details.receivedAt && <small>Concluído em {formatDate(details.receivedAt)}</small>}</div>
              </div>

              {selectedPurchaseIsOverdue && (
                <div className="purchase-overdue-warning" role="alert">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <div>
                    <strong>Recebimento atrasado</strong>
                    <span>A entrega estava prevista para {formatDate(details.expectedAt)} e ainda há itens pendentes.</span>
                  </div>
                </div>
              )}

              <div className="sale-detail-section-head">
                <div><span className="panel-kicker">Produtos</span><h3>Itens do pedido</h3></div>
                <span className="table-count">{details.items.length} item(ns)</span>
              </div>

              {details.items.length ? (
                <div className="sale-detail-table-wrap">
                  <table className="data-table sale-detail-table purchase-detail-table">
                    <thead><tr><th>Produto</th><th>SKU</th><th className="align-center">Pedido</th><th className="align-center">Recebido</th><th className="align-right">Custo</th><th className="align-right">Total</th></tr></thead>
                    <tbody>{details.items.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.product}</strong>{item.brand && <small>{item.brand}</small>}</td>
                        <td className="muted-cell">{item.sku ?? "—"}</td>
                        <td className="align-center">{formatNumber(item.quantityOrdered)} {item.unit}</td>
                        <td className="align-center"><strong>{formatNumber(item.quantityReceived)} {item.unit}</strong></td>
                        <td className="align-right">{formatCurrency(item.unitCost)}</td>
                        <td className="align-right"><strong>{formatCurrency(item.total)}</strong></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="sale-detail-empty"><PackageOpen size={20} />Nenhum item encontrado neste pedido.</div>}

              <div className="sale-detail-section-head purchase-receipts-heading">
                <div><span className="panel-kicker">Histórico</span><h3>Recebimentos do pedido</h3></div>
                <span className="table-count">{details.receipts.length} entrada(s)</span>
              </div>

              {details.receipts.length ? (
                <div className="purchase-receipts-list">
                  {details.receipts.map((receipt) => (
                    <article className="purchase-receipt-card" key={receipt.id}>
                      <header>
                        <div className="purchase-receipt-date">
                          <CalendarCheck2 size={17} aria-hidden="true" />
                          <span><small>Recebido em</small><strong>{formatDate(receipt.receivedAt)}</strong></span>
                        </div>
                        <div className="purchase-receipt-meta">
                          <span><MapPin size={13} aria-hidden="true" />{receipt.location}</span>
                          <span><UserRound size={13} aria-hidden="true" />{receipt.receivedBy || "Responsável não identificado"}</span>
                        </div>
                      </header>
                      <div className="purchase-receipt-items">
                        {receipt.items.map((item) => (
                          <div key={item.id}>
                            <span>
                              <strong>{item.product}</strong>
                              <small>{[item.brand, item.sku].filter(Boolean).join(" · ") || "Sem marca ou SKU"}</small>
                            </span>
                            <strong>{formatNumber(item.quantity)} {item.unit}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="sale-detail-empty purchase-receipts-empty"><PackageOpen size={20} />Nenhum recebimento registrado para este pedido.</div>
              )}

              {canReceive && (
                <section className="purchase-receive-section">
                  <div className="sale-detail-section-head">
                    <div><span className="panel-kicker">Entrada de estoque</span><h3>Registrar recebimento</h3></div>
                  </div>
                  {!locations.length ? (
                    <div className="sale-feedback sale-feedback-error"><CircleAlert size={16} />Cadastre um local de estoque ativo antes de receber.</div>
                  ) : (
                    <>
                      <div className="purchase-receive-fields">
                        <label className="purchase-receive-location">
                          <span>Local de estoque <span className="required-mark">*</span></span>
                          <select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={receiving}>
                            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                          </select>
                        </label>
                        <label className="purchase-receive-date">
                          <span>Data do recebimento <span className="required-mark">*</span></span>
                          <input type="date" value={receivedAt} min={brasiliaDateInputValue(details.orderedAt)} max={brasiliaDateInputValue()} onChange={(event) => setReceivedAt(event.target.value)} required disabled={receiving} />
                        </label>
                        <div className="purchase-receive-lines">
                          {details.items.map((item) => {
                            const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
                            return (
                              <label key={item.id}>
                                <span><strong>{item.product}</strong><small>Restante: {formatNumber(remaining)} {item.unit}</small></span>
                                <input type="number" inputMode="numeric" min="0" max={remaining} step="1" value={receivedQuantities[item.productId] ?? "0"} onKeyDown={(event) => { if ([".", ",", "e", "E", "+", "-"].includes(event.key)) event.preventDefault(); }} onChange={(event) => { if (event.target.value === "" || /^\d+$/.test(event.target.value)) setReceivedQuantities((current) => ({ ...current, [item.productId]: event.target.value })); }} disabled={receiving || remaining === 0} />
                              </label>
                            );
                          })}
                        </div>
                        <div className="purchase-receive-actions">
                          <button className="button button-primary purchase-receive-submit" type="button" onClick={() => void receiveItems()} disabled={receiving || !locations.length}>
                            {receiving ? <><LoaderCircle className="feedback-spinner" size={16} />Atualizando estoque...</> : <><PackageCheck size={16} />Confirmar recebimento</>}
                          </button>
                        </div>
                      </div>
                      {receiveFeedback && <div className={`sale-feedback ${receiveFeedback.includes("estoque atualizado") ? "sale-feedback-success" : "sale-feedback-error"}`} role="status">{receiveFeedback}</div>}
                    </>
                  )}
                </section>
              )}

              {!canReceive && receiveFeedback && <div className="sale-feedback sale-feedback-success" role="status"><Check size={16} />{receiveFeedback}</div>}

              <div className="sale-detail-footer">
                <div className="sale-detail-notes"><span>Observações</span><p>{details.notes || "Nenhuma observação informada."}</p></div>
                <div className="sale-detail-summary">
                  <div><span>Subtotal</span><strong>{formatCurrency(details.subtotal)}</strong></div>
                  <div><span>Desconto</span><strong>{formatCurrency(details.discount)}</strong></div>
                  <div><span>Frete</span><strong>{formatCurrency(details.freight)}</strong></div>
                  <div><span>Outros custos</span><strong>{formatCurrency(details.otherCosts)}</strong></div>
                  <div className="sale-detail-grand-total"><span>Total</span><strong>{formatCurrency(details.total)}</strong></div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div className="data-table-wrap">
        <table className="data-table sales-table purchases-table">
          <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Solicitação</th><th className="align-center">Itens</th><th className="align-center">Recebimento</th><th>Status</th><th className="align-right">Total</th></tr></thead>
          <tbody>{purchases.map((purchase) => {
            const overdue = isPurchaseOverdue(purchase.expectedAt, purchase.status);

            return (
              <tr className="sales-table-row" key={purchase.id} role="button" tabIndex={0} aria-label={`Abrir detalhes do pedido ${purchase.id.slice(0, 8)}`} onClick={(event) => openPurchase(purchase.id, event.currentTarget)} onKeyDown={(event) => handleRowKeyDown(event, purchase.id)}>
                <td><code className="sale-code">#{purchase.id.slice(0, 8)}</code>{purchase.supplierDocumentNumber && <small className="purchase-document">{purchase.supplierDocumentNumber}</small>}</td>
                <td><strong>{purchase.supplier}</strong>{purchase.supplierTradeName && <small className="purchase-document">{purchase.supplierTradeName}</small>}</td>
                <td className="muted-cell">{formatDate(purchase.orderedAt, true)}</td>
                <td className="align-center">{formatNumber(purchase.itemCount)}</td>
                <td className="align-center">{formatNumber(purchase.quantityReceived)} / {formatNumber(purchase.quantityOrdered)}</td>
                <td>
                  <div className="purchase-status-stack">
                    <span className={`inventory-status ${statusClass(purchase.status)}`}>{statusLabels[purchase.status]}</span>
                    {overdue && <span className="inventory-status is-overdue"><TriangleAlert size={11} aria-hidden="true" /> Atrasado</span>}
                  </div>
                </td>
                <td className="align-right"><strong>{formatCurrency(purchase.total)}</strong></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
