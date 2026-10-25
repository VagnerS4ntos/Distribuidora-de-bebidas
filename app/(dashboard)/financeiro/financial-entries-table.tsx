"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  CreditCard,
  Landmark,
  LoaderCircle,
  ReceiptText,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  FinancialListItem,
  FinancialStatus,
} from "@/features/finance/finance-types";
import { brasiliaDateInputValue } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/format";
import { recordFinancialPayment } from "./actions";

const statusLabels: Record<FinancialStatus, string> = {
  pending: "Pendente",
  paid: "Quitado",
  partially_paid: "Pago parcialmente",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  bank_transfer: "Transferência bancária",
  boleto: "Boleto",
  store_credit: "Crédito da loja",
  voucher: "Vale",
  other: "Outro",
};

const paymentMethods = Object.entries(paymentLabels);

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Não informado";
  const parsed = value.length === 10
    ? new Date(`${value}T12:00:00-03:00`)
    : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(parsed);
}

function statusClass(status: FinancialStatus) {
  if (status === "paid") return "is-regular";
  if (status === "overdue") return "is-overdue";
  if (status === "cancelled") return "is-inactive";
  return "is-low";
}

function sourceLabel(entry: FinancialListItem) {
  if (entry.source === "sale") return `Venda #${entry.sourceId?.slice(0, 8)}`;
  if (entry.source === "purchase") return `Compra #${entry.sourceId?.slice(0, 8)}`;
  return "Lançamento manual";
}

export function FinancialEntriesTable({ entries }: { entries: FinancialListItem[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(brasiliaDateInputValue);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [referenceCode, setReferenceCode] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;

  const closeModal = () => {
    setSelectedId(null);
    setFeedback(null);
    setBusy(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const openEntry = (entry: FinancialListItem, opener: HTMLElement) => {
    openerRef.current = opener;
    setSelectedId(entry.id);
    setAmount(entry.outstandingAmount.toFixed(2));
    setPaidOn(brasiliaDateInputValue());
    setPaymentMethod(entry.paymentMethod ?? "pix");
    setReferenceCode("");
    setNotes("");
    setFeedback(null);
  };

  async function submitPayment() {
    if (!selectedEntry) return;
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setFeedback("Informe um valor de pagamento válido.");
      return;
    }
    if (paymentAmount > selectedEntry.outstandingAmount + 0.000001) {
      setFeedback("O pagamento não pode ultrapassar o saldo pendente.");
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await recordFinancialPayment({
        entryId: selectedEntry.id,
        amount: paymentAmount,
        paidOn,
        paymentMethod,
        referenceCode,
        notes,
      });
      setFeedback(result.message);
      if (result.success) {
        router.refresh();
      }
    } catch {
      setFeedback("Não foi possível registrar o pagamento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    entry: FinancialListItem,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEntry(entry, event.currentTarget);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedId]);

  const canReceivePayment = selectedEntry
    && selectedEntry.outstandingAmount > 0
    && selectedEntry.status !== "cancelled";

  const modal = selectedEntry ? (
    <div
      className="sale-modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}
    >
      <section
        className="sale-modal financial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-modal-title"
      >
        <header className="sale-modal-head">
          <div>
            <span className="panel-kicker">Detalhes do lançamento</span>
            <h2 id="financial-modal-title">
              <ReceiptText size={19} /> #{selectedEntry.id.slice(0, 8)}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={closeModal}
            aria-label="Fechar detalhes do lançamento"
            title="Fechar"
          >
            <X size={19} />
          </button>
        </header>

        <div className="sale-modal-body">
          <div className="financial-detail-title">
            <span className={`financial-type-icon is-${selectedEntry.entryType}`}>
              {selectedEntry.entryType === "income"
                ? <ArrowDownLeft size={19} />
                : <ArrowUpRight size={19} />}
            </span>
            <div>
              <span>{selectedEntry.entryType === "income" ? "Receita" : "Despesa"}</span>
              <h3>{selectedEntry.description}</h3>
              <small>{selectedEntry.category ?? "Sem categoria"}</small>
            </div>
            <strong className={selectedEntry.entryType === "income" ? "financial-income" : "financial-expense"}>
              {formatCurrency(selectedEntry.amount)}
            </strong>
          </div>

          {selectedEntry.status === "overdue" && (
            <div className="purchase-overdue-warning financial-overdue-warning" role="alert">
              <TriangleAlert size={18} />
              <div>
                <strong>Lançamento atrasado</strong>
                <span>O vencimento foi em {formatDate(selectedEntry.dueDate)} e ainda há {formatCurrency(selectedEntry.outstandingAmount)} pendente.</span>
              </div>
            </div>
          )}

          <div className="sale-detail-meta financial-detail-meta">
            <div><span>Status</span><strong>{statusLabels[selectedEntry.status]}</strong></div>
            <div><span>Emissão</span><strong>{formatDate(selectedEntry.issueDate)}</strong></div>
            <div><span>Vencimento</span><strong>{formatDate(selectedEntry.dueDate)}</strong></div>
            <div><span>{selectedEntry.entryType === "income" ? "Cliente" : "Fornecedor"}</span><strong>{selectedEntry.counterparty ?? "Não vinculado"}</strong></div>
            <div><span>Origem</span><strong>{sourceLabel(selectedEntry)}</strong></div>
            <div><span>Referência</span><strong>{selectedEntry.referenceCode ?? "Não informada"}</strong></div>
          </div>

          <div className="financial-balance-grid">
            <div><span>Valor total</span><strong>{formatCurrency(selectedEntry.amount)}</strong></div>
            <div><span>Pago</span><strong>{formatCurrency(selectedEntry.amountPaid)}</strong></div>
            <div className={selectedEntry.outstandingAmount > 0 ? "is-pending" : "is-settled"}>
              <span>Saldo pendente</span><strong>{formatCurrency(selectedEntry.outstandingAmount)}</strong>
            </div>
          </div>

          <div className="sale-detail-section-head financial-payments-heading">
            <div><span className="panel-kicker">Movimentações</span><h3>Histórico de pagamentos</h3></div>
            <span className="table-count">{selectedEntry.payments.length} pagamento(s)</span>
          </div>

          {selectedEntry.payments.length ? (
            <div className="financial-payment-list">
              {selectedEntry.payments.map((payment) => (
                <article key={payment.id}>
                  <span className="financial-payment-icon"><CreditCard size={16} /></span>
                  <div>
                    <strong>{paymentLabels[payment.paymentMethod] ?? "Outro"}</strong>
                    <small>{formatDate(payment.paidAt, true)}{payment.referenceCode ? ` · ${payment.referenceCode}` : ""}</small>
                    {payment.notes && <p>{payment.notes}</p>}
                  </div>
                  <strong>{formatCurrency(payment.amount)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="sale-detail-empty financial-payments-empty">
              <Landmark size={20} /> Nenhum pagamento registrado.
            </div>
          )}

          {canReceivePayment && (
            <section className="purchase-receive-section financial-payment-form">
              <div className="sale-detail-section-head">
                <div>
                  <span className="panel-kicker">Baixa financeira</span>
                  <h3>{selectedEntry.entryType === "income" ? "Registrar recebimento" : "Registrar pagamento"}</h3>
                </div>
              </div>
              <div className="financial-payment-fields">
                <label>
                  <span>Valor <span className="required-mark">*</span></span>
                  <input type="number" inputMode="decimal" min="0.01" max={selectedEntry.outstandingAmount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} />
                </label>
                <label>
                  <span>Data <span className="required-mark">*</span></span>
                  <input type="date" max={brasiliaDateInputValue()} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} required disabled={busy} />
                </label>
                <label>
                  <span>Forma <span className="required-mark">*</span></span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={busy}>
                    {paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Referência
                  <input type="text" maxLength={80} value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} disabled={busy} />
                </label>
                <label className="financial-payment-notes">
                  Observações
                  <input type="text" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} />
                </label>
                <button className="button button-primary" type="button" onClick={() => void submitPayment()} disabled={busy}>
                  {busy ? <LoaderCircle className="feedback-spinner" size={16} /> : <Check size={16} />}
                  {busy ? "Registrando..." : "Confirmar pagamento"}
                </button>
              </div>
              {feedback && (
                <div className={`sale-feedback ${feedback.includes("sucesso") || feedback.includes("quitado") ? "sale-feedback-success" : "sale-feedback-error"}`} role="status">
                  {feedback}
                </div>
              )}
            </section>
          )}

          {!canReceivePayment && feedback && (
            <div className="sale-feedback sale-feedback-success" role="status"><Check size={16} />{feedback}</div>
          )}

          <div className="sale-detail-notes financial-entry-notes">
            <span>Observações do lançamento</span>
            <p>{selectedEntry.notes || "Nenhuma observação informada."}</p>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div className="data-table-wrap">
        <table className="data-table sales-table financial-table">
          <thead>
            <tr>
              <th>Lançamento</th>
              <th>Tipo</th>
              <th>Emissão</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th className="align-right">Pago / Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                className="sales-table-row"
                key={entry.id}
                role="button"
                tabIndex={0}
                aria-label={`Abrir detalhes do lançamento ${entry.description}`}
                onClick={(event) => openEntry(entry, event.currentTarget)}
                onKeyDown={(event) => handleRowKeyDown(event, entry)}
              >
                <td>
                  <div className="financial-entry-cell">
                    <strong>{entry.description}</strong>
                    <small>{entry.counterparty ?? entry.category ?? sourceLabel(entry)}</small>
                  </div>
                </td>
                <td>
                  <span className={`financial-type-badge is-${entry.entryType}`}>
                    {entry.entryType === "income" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                    {entry.entryType === "income" ? "Receita" : "Despesa"}
                  </span>
                </td>
                <td className="muted-cell">{formatDate(entry.issueDate)}</td>
                <td className={entry.status === "overdue" ? "financial-due-overdue" : "muted-cell"}>
                  {entry.status === "overdue" && <CalendarClock size={13} />}
                  {formatDate(entry.dueDate)}
                </td>
                <td><span className={`inventory-status ${statusClass(entry.status)}`}>{statusLabels[entry.status]}</span></td>
                <td className="align-right">
                  <div className="financial-amount-cell">
                    <strong>{formatCurrency(entry.amountPaid)} / {formatCurrency(entry.amount)}</strong>
                    {entry.outstandingAmount > 0 && <small>Falta {formatCurrency(entry.outstandingAmount)}</small>}
                  </div>
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
