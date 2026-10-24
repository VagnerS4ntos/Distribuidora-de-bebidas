"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Pencil, UserPlus } from "lucide-react";
import type { CustomerListItem } from "@/features/customers/customer-service";
import { createCustomer, updateCustomer } from "./actions";

export function CustomerForm({
  customer,
  returnHref,
}: {
  customer?: CustomerListItem;
  returnHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    document.getElementById("customer-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    const fields = {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      document: String(formData.get("document") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      active: formData.get("active") === "on",
    };

    setBusy(true);
    try {
      const result = customer
        ? await updateCustomer({ ...fields, customerId: customer.id })
        : await createCustomer(fields);

      if (!result.success || !result.customerId) {
        setFeedback(result.message);
        return;
      }

      const destination = new URLSearchParams(returnHref.split("?")[1] ?? "");
      destination.set(customer ? "atualizado" : "criado", result.customerId.slice(0, 8));
      router.replace(`/clientes?${destination.toString()}`);
      router.refresh();
    } catch {
      setFeedback(
        customer
          ? "Não foi possível atualizar o cliente. Tente novamente."
          : "Não foi possível cadastrar o cliente. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="customer-form" className="customer-form" onSubmit={submitCustomer} aria-busy={busy}>
      <div className="customer-form-head">
        <span className="sale-form-icon">
          {customer ? <Pencil size={20} /> : <UserPlus size={20} />}
        </span>
        <div>
          <span className="panel-kicker">{customer ? "Edição" : "Novo cadastro"}</span>
          <h2>{customer ? "Editar cliente" : "Cadastrar cliente"}</h2>
          <p>Os clientes ativos ficam disponíveis para identificação nas novas vendas.</p>
        </div>
      </div>

      {feedback && (
        <div className="sale-feedback sale-feedback-error" role="alert">{feedback}</div>
      )}

      <div className="customer-form-grid">
        <label className="customer-name-field">
          <span className="customer-field-label">Nome <span className="required-mark">*</span></span>
          <input name="name" type="text" minLength={2} maxLength={160} defaultValue={customer?.name ?? ""} autoFocus required disabled={busy} />
        </label>
        <label>
          Telefone
          <input name="phone" type="tel" maxLength={30} defaultValue={customer?.phone ?? ""} placeholder="(00) 00000-0000" disabled={busy} />
        </label>
        <label>
          E-mail
          <input name="email" type="email" maxLength={254} defaultValue={customer?.email ?? ""} placeholder="cliente@email.com" disabled={busy} />
        </label>
        <label>
          CPF ou CNPJ
          <input name="document" type="text" maxLength={40} defaultValue={customer?.document ?? ""} disabled={busy} />
        </label>
        <label className="customer-notes-field">
          Observações
          <textarea name="notes" maxLength={1000} rows={3} defaultValue={customer?.notes ?? ""} placeholder="Informações úteis para o atendimento" disabled={busy} />
        </label>
      </div>

      <div className="customer-form-footer">
        <label className="customer-active-check">
          <input name="active" type="checkbox" defaultChecked={customer?.active ?? true} disabled={busy} />
          <span><strong>Cliente ativo</strong><small>Disponível para seleção nas novas vendas.</small></span>
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="feedback-spinner" size={17} /> : <Check size={17} />}
          {busy ? "Salvando..." : customer ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}
