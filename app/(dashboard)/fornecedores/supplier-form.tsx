"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, LoaderCircle, Pencil } from "lucide-react";
import type { SupplierListItem } from "@/features/suppliers/supplier-service";
import { createSupplier, updateSupplier } from "./actions";

export function SupplierForm({
  supplier,
  returnHref,
}: {
  supplier?: SupplierListItem;
  returnHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    document.getElementById("supplier-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    const fields = {
      name: String(formData.get("name") ?? ""),
      tradeName: String(formData.get("tradeName") ?? ""),
      cnpj: String(formData.get("cnpj") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      contactName: String(formData.get("contactName") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      active: formData.get("active") === "on",
    };

    setBusy(true);
    try {
      const result = supplier
        ? await updateSupplier({ ...fields, supplierId: supplier.id })
        : await createSupplier(fields);

      if (!result.success || !result.supplierId) {
        setFeedback(result.message);
        return;
      }

      const destination = new URLSearchParams(returnHref.split("?")[1] ?? "");
      destination.set(
        supplier ? "atualizado" : "criado",
        result.supplierId.slice(0, 8),
      );
      router.replace(`/fornecedores?${destination.toString()}`);
      router.refresh();
    } catch {
      setFeedback(
        supplier
          ? "Não foi possível atualizar o fornecedor. Tente novamente."
          : "Não foi possível cadastrar o fornecedor. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="supplier-form" className="customer-form" onSubmit={submitSupplier} aria-busy={busy}>
      <div className="customer-form-head">
        <span className="sale-form-icon">
          {supplier ? <Pencil size={20} /> : <Building2 size={20} />}
        </span>
        <div>
          <span className="panel-kicker">{supplier ? "Edição" : "Novo cadastro"}</span>
          <h2>{supplier ? "Editar fornecedor" : "Cadastrar fornecedor"}</h2>
          <p>Fornecedores ativos poderão ser vinculados aos próximos pedidos de compra.</p>
        </div>
      </div>

      {feedback && (
        <div className="sale-feedback sale-feedback-error" role="alert">{feedback}</div>
      )}

      <div className="customer-form-grid">
        <label className="customer-name-field">
          <span className="customer-field-label">Razão social ou nome <span className="required-mark">*</span></span>
          <input name="name" type="text" minLength={2} maxLength={160} defaultValue={supplier?.name ?? ""} autoFocus required disabled={busy} />
        </label>
        <label>
          Nome fantasia
          <input name="tradeName" type="text" maxLength={160} defaultValue={supplier?.tradeName ?? ""} disabled={busy} />
        </label>
        <label>
          CNPJ
          <input name="cnpj" type="text" maxLength={40} defaultValue={supplier?.cnpj ?? ""} disabled={busy} />
        </label>
        <label>
          Telefone
          <input name="phone" type="tel" maxLength={30} defaultValue={supplier?.phone ?? ""} placeholder="(00) 00000-0000" disabled={busy} />
        </label>
        <label>
          E-mail
          <input name="email" type="email" maxLength={254} defaultValue={supplier?.email ?? ""} placeholder="contato@fornecedor.com" disabled={busy} />
        </label>
        <label className="supplier-contact-field">
          Pessoa de contato
          <input name="contactName" type="text" maxLength={160} defaultValue={supplier?.contactName ?? ""} disabled={busy} />
        </label>
        <label className="supplier-notes-field">
          Observações
          <textarea name="notes" maxLength={1000} rows={3} defaultValue={supplier?.notes ?? ""} placeholder="Prazos, dias de entrega e outras informações úteis" disabled={busy} />
        </label>
      </div>

      <div className="customer-form-footer">
        <label className="customer-active-check">
          <input name="active" type="checkbox" defaultChecked={supplier?.active ?? true} disabled={busy} />
          <span><strong>Fornecedor ativo</strong><small>Disponível para seleção nos novos pedidos.</small></span>
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="feedback-spinner" size={17} /> : <Check size={17} />}
          {busy ? "Salvando..." : supplier ? "Salvar alterações" : "Cadastrar fornecedor"}
        </button>
      </div>
    </form>
  );
}
