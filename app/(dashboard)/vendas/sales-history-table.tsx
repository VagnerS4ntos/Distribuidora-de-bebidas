"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleAlert,
  LoaderCircle,
  PackageOpen,
  ReceiptText,
  X,
} from "lucide-react";
import type {
  RecentSale,
  SaleDetails,
} from "@/features/sales/sales-types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { getSaleDetails } from "./actions";

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
  refunded: "Estornada",
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

export function SalesHistoryTable({ sales }: { sales: RecentSale[] }) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [details, setDetails] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);

  const closeModal = () => {
    requestIdRef.current += 1;
    setSelectedSaleId(null);
    setDetails(null);
    setError(null);
    setLoading(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const loadDetails = async (saleId: string) => {
    const requestId = ++requestIdRef.current;
    setSelectedSaleId(saleId);
    setDetails(null);
    setError(null);
    setLoading(true);

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
                    <thead><tr><th>Produto</th><th>SKU</th><th className="align-center">Qtd.</th><th className="align-right">Unitário</th><th className="align-right">Total</th></tr></thead>
                    <tbody>
                      {details.items.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.product}</strong>{item.brand && <small>{item.brand}</small>}</td>
                          <td className="muted-cell">{item.sku ?? "—"}</td>
                          <td className="align-center">{formatNumber(item.quantity)} {item.unit}</td>
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

              <div className="sale-detail-footer">
                <div className="sale-detail-notes">
                  <span>Observações</span>
                  <p>{details.notes || "Nenhuma observação informada."}</p>
                </div>
                <div className="sale-detail-summary">
                  <div><span>Subtotal</span><strong>{formatCurrency(details.subtotal)}</strong></div>
                  <div><span>Desconto</span><strong>{formatCurrency(details.discount)}</strong></div>
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
        <table className="data-table sales-table">
          <thead><tr><th>Venda</th><th>Cliente</th><th>Data</th><th className="align-center">Itens</th><th>Pagamento</th><th className="align-right">Total</th></tr></thead>
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
                <td>{sale.paymentMethod ? paymentLabels[sale.paymentMethod] ?? "Outro" : <span className="muted-cell">Não informado</span>}</td>
                <td className="align-right"><strong>{formatCurrency(sale.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
