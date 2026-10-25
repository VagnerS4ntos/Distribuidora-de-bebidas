"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  CircleAlert,
  History,
  LoaderCircle,
  LockKeyhole,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  X,
} from "lucide-react";
import type {
  RecentSale,
  SaleDetails,
} from "@/features/sales/sales-types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { getSaleDetails, processSaleReturn } from "./actions";

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  bank_transfer: "Transferência",
  store_credit: "Crédito da loja",
  voucher: "Vale",
  other: "Outro",
};

const statusLabels: Record<SaleDetails["status"], string> = {
  draft: "Rascunho",
  completed: "Concluída",
  cancelled: "Cancelada",
  refunded: "Devolvida",
};

function formatSaleDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function SalesHistoryTable({
  sales,
  canManageReturns,
  cashOpen,
}: {
  sales: RecentSale[];
  canManageReturns: boolean;
  cashOpen: boolean;
}) {
  const router = useRouter();
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [details, setDetails] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"return" | "cancellation" | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);
  const observedSaleRevisionRef = useRef<string | null>(null);
  const cashReturnBlocked = Boolean(
    details?.payments.some((payment) => payment.method === "cash") && !cashOpen,
  );

  const closeModal = () => {
    requestIdRef.current += 1;
    setSelectedSaleId(null);
    setDetails(null);
    setError(null);
    setLoading(false);
    setActionMode(null);
    setReturnQuantities({});
    setReturnReason("");
    setActionFeedback(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const loadDetails = useCallback(async (saleId: string) => {
    const requestId = ++requestIdRef.current;
    setSelectedSaleId(saleId);
    setDetails(null);
    setError(null);
    setLoading(true);
    setActionMode(null);
    setReturnQuantities({});
    setReturnReason("");
    setActionFeedback(null);

    try {
      const result = await getSaleDetails(saleId);
      if (requestId !== requestIdRef.current) return;
      if (result.success) setDetails(result.data);
      else setError(result.message);
    } catch {
      if (requestId === requestIdRef.current) {
        setError("Não foi possível carregar os detalhes da venda.");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const openAction = (mode: "return" | "cancellation") => {
    setActionMode(mode);
    setReturnReason("");
    setActionFeedback(null);
    setReturnQuantities({});
  };

  const submitPostSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!details || !actionMode) return;
    if (cashReturnBlocked) {
      setActionFeedback({
        message: "Abra o caixa antes de estornar uma venda recebida em dinheiro.",
        success: false,
      });
      return;
    }
    const items = details.items
      .map((item) => ({
        saleItemId: item.id,
        quantity: Number(returnQuantities[item.id] ?? 0),
      }))
      .filter((item) => item.quantity > 0);

    setActionBusy(true);
    setActionFeedback(null);
    try {
      const result = await processSaleReturn({
        saleId: details.id,
        returnType: actionMode,
        reason: returnReason,
        items,
      });
      if (result.success) {
        const successFeedback = { message: result.message, success: true };
        setActionMode(null);
        setReturnQuantities({});
        setReturnReason("");
        await loadDetails(details.id);
        setActionFeedback(successFeedback);
        router.refresh();
      } else {
        setActionFeedback({ message: result.message, success: false });
      }
    } catch {
      setActionFeedback({
        message: "Não foi possível concluir a operação. Tente novamente.",
        success: false,
      });
    } finally {
      setActionBusy(false);
    }
  };

  const openSale = (saleId: string, opener: HTMLElement) => {
    openerRef.current = opener;
    void loadDetails(saleId);
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    saleId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSale(saleId, event.currentTarget);
    }
  };

  useEffect(() => {
    if (!selectedSaleId) return;

    closeButtonRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedSaleId]);

  useEffect(() => {
    if (!selectedSaleId) {
      observedSaleRevisionRef.current = null;
      return;
    }

    const selectedSale = sales.find((sale) => sale.id === selectedSaleId);
    if (!selectedSale) return;
    const revision = `${selectedSale.updatedAt}:${selectedSale.status}:${selectedSale.refundedAmount}`;

    if (observedSaleRevisionRef.current === null) {
      observedSaleRevisionRef.current = revision;
      return;
    }
    if (observedSaleRevisionRef.current !== revision) {
      observedSaleRevisionRef.current = revision;
      void loadDetails(selectedSaleId);
    }
  }, [loadDetails, sales, selectedSaleId]);

  const modal = selectedSaleId ? (
    <div
      className="sale-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        className="sale-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-modal-title"
      >
        <header className="sale-modal-head">
          <div>
            <span className="panel-kicker">Detalhes da venda</span>
            <h2 id="sale-modal-title">
              <ReceiptText size={19} /> Venda #{selectedSaleId.slice(0, 8)}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={closeModal}
            aria-label="Fechar detalhes da venda"
            title="Fechar"
          >
            <X size={19} />
          </button>
        </header>

        <div className="sale-modal-body">
          {loading && (
            <div className="sale-modal-state" role="status">
              <LoaderCircle className="feedback-spinner" size={24} />
              <strong>Carregando detalhes...</strong>
              <span>Buscando produtos e pagamento da venda.</span>
            </div>
          )}

          {error && !loading && (
            <div className="sale-modal-state sale-modal-error" role="alert">
              <CircleAlert size={24} />
              <strong>Não foi possível abrir a venda</strong>
              <span>{error}</span>
              <button className="button button-secondary" type="button" onClick={() => void loadDetails(selectedSaleId)}>
                Tentar novamente
              </button>
            </div>
          )}

          {details && !loading && (
            <>
              <div className="sale-detail-meta">
                <div><span>Cliente</span><strong>{details.customer}</strong>{details.customerPhone && <small>{details.customerPhone}</small>}</div>
                <div><span>Data da venda</span><strong>{formatSaleDate(details.soldAt)}</strong></div>
                <div><span>Status</span><strong>{statusLabels[details.status]}</strong></div>
                <div>
                  <span>Pagamento</span>
                  <strong>{details.payments.length ? details.payments.map((payment) => paymentLabels[payment.method] ?? "Outro").join(" + ") : "Não informado"}</strong>
                </div>
              </div>

              <div className="sale-detail-section-head">
                <div><span className="panel-kicker">Produtos</span><h3>Itens da venda</h3></div>
                <span className="table-count">{details.items.length} item(ns)</span>
              </div>

              {details.items.length ? (
                <div className="sale-detail-table-wrap">
                  <table className="data-table sale-detail-table">
                    <thead><tr><th>Produto</th><th>SKU</th><th className="align-center">Vendida</th><th className="align-center">Devolvida</th><th className="align-right">Unitário</th><th className="align-right">Total</th></tr></thead>
                    <tbody>
                      {details.items.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.product}</strong>{item.brand && <small>{item.brand}</small>}</td>
                          <td className="muted-cell">{item.sku ?? "—"}</td>
                          <td className="align-center">{formatNumber(item.quantity)} {item.unit}</td>
                          <td className={`align-center ${item.returnedQuantity ? "sale-returned-quantity" : "muted-cell"}`}>
                            {formatNumber(item.returnedQuantity)} {item.unit}
                          </td>
                          <td className="align-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="align-right"><strong>{formatCurrency(item.total)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sale-detail-empty"><PackageOpen size={20} />Nenhum item encontrado nesta venda.</div>
              )}

              {details.returns.length > 0 && (
                <section className="sale-returns-history">
                  <div className="sale-detail-section-head">
                    <div><span className="panel-kicker">Pós-venda</span><h3>Cancelamentos e devoluções</h3></div>
                    <span className="table-count">{details.returns.length} registro(s)</span>
                  </div>
                  <div className="sale-return-cards">
                    {details.returns.map((saleReturn) => (
                      <article key={saleReturn.id}>
                        <header>
                          <span className="sale-return-icon"><History size={16} /></span>
                          <div>
                            <strong>{saleReturn.returnType === "cancellation" ? "Cancelamento integral" : "Devolução"}</strong>
                            <small>{formatSaleDate(saleReturn.createdAt)} · #{saleReturn.id.slice(0, 8)}</small>
                          </div>
                          <strong>{formatCurrency(saleReturn.refundAmount)}</strong>
                        </header>
                        <p>{saleReturn.reason}</p>
                        <div className="sale-return-card-items">
                          {saleReturn.items.map((item, index) => (
                            <span key={`${saleReturn.id}-${index}`}>
                              {item.product} · {formatNumber(item.quantity)} {item.unit}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {actionFeedback && (
                <div className={`sale-feedback ${actionFeedback.success ? "sale-feedback-success" : "sale-feedback-error"}`} role={actionFeedback.success ? "status" : "alert"}>
                  {actionFeedback.success ? <Check size={16} /> : <CircleAlert size={16} />}
                  {actionFeedback.message}
                </div>
              )}

              {canManageReturns && details.status === "completed" && !actionMode && (
                <div className="sale-post-actions">
                  <div>
                    <span className="panel-kicker">Ações de pós-venda</span>
                    <p>As duas operações repõem o estoque e registram o estorno financeiro.</p>
                  </div>
                  <div>
                    {details.items.some((item) => item.returnableQuantity > 0) && (
                      <button className="button button-secondary" type="button" onClick={() => openAction("return")} disabled={cashReturnBlocked}>
                        <RotateCcw size={16} />Registrar devolução
                      </button>
                    )}
                    {details.canCancel && (
                      <button className="button sale-cancel-button" type="button" onClick={() => openAction("cancellation")} disabled={cashReturnBlocked}>
                        <Ban size={16} />Cancelar venda
                      </button>
                    )}
                  </div>
                </div>
              )}

              {canManageReturns && details.status === "completed" && cashReturnBlocked && !actionMode && (
                <div className="sale-feedback sale-feedback-error" role="alert">
                  <LockKeyhole size={16} />
                  Abra o caixa antes de cancelar ou devolver uma venda recebida em dinheiro.
                </div>
              )}

              {actionMode && (
                <form className="sale-return-form" onSubmit={submitPostSale} aria-busy={actionBusy}>
                  <div className="sale-return-form-head">
                    <span className={`sale-return-icon ${actionMode === "cancellation" ? "is-cancellation" : ""}`}>
                      {actionMode === "cancellation" ? <Ban size={18} /> : <RotateCcw size={18} />}
                    </span>
                    <div>
                      <span className="panel-kicker">Confirmação</span>
                      <h3>{actionMode === "cancellation" ? "Cancelar venda integralmente" : "Registrar devolução de itens"}</h3>
                      <p>{actionMode === "cancellation" ? "Todos os itens voltarão ao estoque e o valor integral será estornado." : "Informe somente as quantidades que o cliente está devolvendo."}</p>
                    </div>
                  </div>

                  {cashReturnBlocked && (
                    <div className="sale-feedback sale-feedback-error" role="alert">
                      <LockKeyhole size={16} />
                      O caixa foi fechado. Reabra-o antes de concluir o estorno em dinheiro.
                    </div>
                  )}

                  {actionMode === "return" && (
                    <div className="sale-return-item-fields">
                      {details.items.filter((item) => item.returnableQuantity > 0).map((item) => (
                        <label key={item.id}>
                          <span>
                            <strong>{item.product}</strong>
                            <small>Disponível: {formatNumber(item.returnableQuantity)} {item.unit}</small>
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={item.returnableQuantity}
                            step="1"
                            value={returnQuantities[item.id] ?? "0"}
                            onKeyDown={(event) => {
                              if ([".", ",", "e", "E", "+", "-"].includes(event.key)) event.preventDefault();
                            }}
                            onChange={(event) => {
                              if (event.target.value === "" || /^\d+$/.test(event.target.value)) {
                                setReturnQuantities((current) => ({ ...current, [item.id]: event.target.value }));
                              }
                            }}
                            disabled={actionBusy}
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  <label className="sale-return-reason">
                    <span>Motivo <span className="required-mark">*</span></span>
                    <textarea
                      value={returnReason}
                      onChange={(event) => setReturnReason(event.target.value)}
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      placeholder={actionMode === "cancellation" ? "Informe por que a venda está sendo cancelada" : "Informe o motivo da devolução"}
                      required
                      disabled={actionBusy}
                    />
                  </label>

                  <div className="sale-return-form-actions">
                    <button className="button button-secondary" type="button" onClick={() => setActionMode(null)} disabled={actionBusy}>Voltar</button>
                    <button className={`button ${actionMode === "cancellation" ? "sale-cancel-button" : "button-primary"}`} type="submit" disabled={actionBusy || cashReturnBlocked}>
                      {actionBusy ? <LoaderCircle className="feedback-spinner" size={16} /> : actionMode === "cancellation" ? <Ban size={16} /> : <RotateCcw size={16} />}
                      {actionBusy ? "Processando..." : actionMode === "cancellation" ? "Confirmar cancelamento" : "Confirmar devolução"}
                    </button>
                  </div>
                </form>
              )}

              <div className="sale-detail-footer">
                <div className="sale-detail-notes">
                  <span>Observações</span>
                  <p>{details.notes || "Nenhuma observação informada."}</p>
                </div>
                <div className="sale-detail-summary">
                  <div><span>Subtotal</span><strong>{formatCurrency(details.subtotal)}</strong></div>
                  <div><span>Desconto</span><strong>{formatCurrency(details.discount)}</strong></div>
                  <div><span>Total original</span><strong>{formatCurrency(details.total)}</strong></div>
                  {details.refundedAmount > 0 && <div className="sale-detail-refunded"><span>Valor devolvido</span><strong>− {formatCurrency(details.refundedAmount)}</strong></div>}
                  <div className="sale-detail-grand-total"><span>Valor líquido</span><strong>{formatCurrency(details.netTotal)}</strong></div>
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
        <table className="data-table sales-table">
          <thead><tr><th>Venda</th><th>Cliente</th><th>Data</th><th className="align-center">Itens</th><th>Situação</th><th>Pagamento</th><th className="align-right">Valor líquido</th></tr></thead>
          <tbody>
            {sales.map((sale) => (
              <tr
                className="sales-table-row"
                key={sale.id}
                role="button"
                tabIndex={0}
                aria-label={`Abrir detalhes da venda ${sale.id.slice(0, 8)}`}
                onClick={(event) => openSale(sale.id, event.currentTarget)}
                onKeyDown={(event) => handleRowKeyDown(event, sale.id)}
              >
                <td><code className="sale-code">#{sale.id.slice(0, 8)}</code></td>
                <td><strong>{sale.customer}</strong></td>
                <td className="muted-cell">{formatSaleDate(sale.soldAt)}</td>
                <td className="align-center">{formatNumber(sale.itemCount)}</td>
                <td>
                  <span className={`status-badge ${sale.hasPartialReturn ? "status-attention" : `status-${sale.status}`}`}>
                    {sale.hasPartialReturn ? "Devolução parcial" : statusLabels[sale.status]}
                  </span>
                </td>
                <td>{sale.paymentMethod ? paymentLabels[sale.paymentMethod] ?? "Outro" : <span className="muted-cell">Não informado</span>}</td>
                <td className="align-right">
                  <strong>{formatCurrency(sale.netTotal)}</strong>
                  {sale.refundedAmount > 0 && <small className="sale-list-refund">− {formatCurrency(sale.refundedAmount)} devolvido</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
