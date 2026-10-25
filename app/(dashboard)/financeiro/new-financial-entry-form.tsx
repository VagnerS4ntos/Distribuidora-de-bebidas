"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDollarSign, LoaderCircle, LockKeyhole } from "lucide-react";
import type {
  FinancialCategoryOption,
  FinancialContactOption,
  FinancialEntryType,
} from "@/features/finance/finance-types";
import { brasiliaDateInputValue } from "@/lib/utils/date";
import { createFinancialEntry } from "./actions";

const paymentMethods = [
  ["pix", "Pix"],
  ["cash", "Dinheiro"],
  ["debit_card", "Cartão de débito"],
  ["credit_card", "Cartão de crédito"],
  ["bank_transfer", "Transferência bancária"],
  ["boleto", "Boleto"],
  ["store_credit", "Crédito da loja"],
  ["voucher", "Vale"],
  ["other", "Outro"],
] as const;

export function NewFinancialEntryForm({
  categories,
  customers,
  suppliers,
  returnHref,
  cashOpen,
}: {
  categories: FinancialCategoryOption[];
  customers: FinancialContactOption[];
  suppliers: FinancialContactOption[];
  returnHref: string;
  cashOpen: boolean;
}) {
  const router = useRouter();
  const [entryType, setEntryType] = useState<FinancialEntryType>("expense");
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const filteredCategories = useMemo(
    () => categories.filter((category) => category.entryType === entryType),
    [categories, entryType],
  );
  const counterparties = entryType === "income" ? customers : suppliers;
  const cashPaymentBlocked = isPaid && paymentMethod === "cash" && !cashOpen;

  useEffect(() => {
    document.getElementById("financial-entry-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get("amount"));

    setBusy(true);
    try {
      const result = await createFinancialEntry({
        entryType,
        categoryId: String(formData.get("categoryId") ?? ""),
        counterpartyId: String(formData.get("counterpartyId") ?? ""),
        description: String(formData.get("description") ?? ""),
        amount,
        issueDate: String(formData.get("issueDate") ?? ""),
        dueDate: String(formData.get("dueDate") ?? ""),
        isPaid,
        paymentMethod: String(formData.get("paymentMethod") ?? ""),
        referenceCode: String(formData.get("referenceCode") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      });

      if (!result.success || !result.entryId) {
        setFeedback(result.message);
        return;
      }

      const query = new URLSearchParams(returnHref.split("?")[1] ?? "");
      query.set("criado", result.entryId.slice(0, 8));
      router.replace(`/financeiro?${query.toString()}`);
      router.refresh();
    } catch {
      setFeedback("Não foi possível registrar o lançamento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      id="financial-entry-form"
      className="customer-form financial-entry-form"
      onSubmit={submitEntry}
      aria-busy={busy}
    >
      <div className="customer-form-head">
        <span className="sale-form-icon"><CircleDollarSign size={20} /></span>
        <div>
          <span className="panel-kicker">Novo registro</span>
          <h2>Registrar lançamento</h2>
          <p>Inclua uma receita ou despesa avulsa e acompanhe pagamentos parciais ou totais.</p>
        </div>
      </div>

      {feedback && (
        <div className="sale-feedback sale-feedback-error" role="alert">{feedback}</div>
      )}

      <div className="customer-form-grid financial-form-grid">
        <label>
          <span>Tipo <span className="required-mark">*</span></span>
          <select
            name="entryType"
            value={entryType}
            onChange={(event) => setEntryType(event.target.value as FinancialEntryType)}
            disabled={busy}
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </label>

        <label className="financial-description-field">
          <span>Descrição <span className="required-mark">*</span></span>
          <input
            name="description"
            type="text"
            minLength={2}
            maxLength={200}
            placeholder={entryType === "income" ? "Ex.: Receita de entrega" : "Ex.: Conta de energia"}
            autoFocus
            required
            disabled={busy}
          />
        </label>

        <label>
          <span>Valor <span className="required-mark">*</span></span>
          <input name="amount" type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" placeholder="0,00" required disabled={busy} />
        </label>

        <label>
          <span>Data de emissão <span className="required-mark">*</span></span>
          <input name="issueDate" type="date" defaultValue={brasiliaDateInputValue()} required disabled={busy} />
        </label>

        <label>
          Vencimento
          <input name="dueDate" type="date" disabled={busy} />
        </label>

        <label>
          Categoria
          <select name="categoryId" defaultValue="" key={entryType} disabled={busy}>
            <option value="">Sem categoria</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>

        <label>
          {entryType === "income" ? "Cliente" : "Fornecedor"}
          <select name="counterpartyId" defaultValue="" key={`counterparty-${entryType}`} disabled={busy}>
            <option value="">Não vinculado</option>
            {counterparties.map((counterparty) => (
              <option key={counterparty.id} value={counterparty.id}>{counterparty.name}</option>
            ))}
          </select>
        </label>

        <label>
          Código de referência
          <input name="referenceCode" type="text" maxLength={80} placeholder="Documento, boleto ou código interno" disabled={busy} />
        </label>

        {isPaid && (
          <label>
            <span>Forma de pagamento <span className="required-mark">*</span></span>
            <select
              name="paymentMethod"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              required
              disabled={busy}
            >
              {paymentMethods.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        )}

        <label className="customer-notes-field">
          Observações
          <textarea name="notes" maxLength={1000} rows={3} placeholder="Informações adicionais do lançamento" disabled={busy} />
        </label>
      </div>

      {cashPaymentBlocked && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          <LockKeyhole size={16} />
          Abra o caixa ou escolha outra forma de pagamento.
        </div>
      )}

      <div className="customer-form-footer">
        <label className="customer-active-check financial-paid-check">
          <input
            name="isPaid"
            type="checkbox"
            checked={isPaid}
            onChange={(event) => setIsPaid(event.target.checked)}
            disabled={busy}
          />
          <span>
            <strong>{entryType === "income" ? "Receita já recebida" : "Despesa já paga"}</strong>
            <small>Registra a quitação integral na data de emissão.</small>
          </span>
        </label>

        <button className="button button-primary" type="submit" disabled={busy || cashPaymentBlocked}>
          {busy ? <LoaderCircle className="feedback-spinner" size={17} /> : <Check size={17} />}
          {busy ? "Registrando..." : "Registrar lançamento"}
        </button>
      </div>
    </form>
  );
}
