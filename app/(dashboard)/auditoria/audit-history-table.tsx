"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileClock, UserRound, X } from "lucide-react";
import {
  auditActionLabels,
  auditFieldLabels,
  auditTableLabels,
  auditValueLabels,
  type AuditLogItem,
} from "@/features/audit/audit-types";

const currencyFields = new Set([
  "amount",
  "amount_paid",
  "cost_price",
  "counted_closing_balance",
  "difference",
  "discount",
  "expected_closing_balance",
  "freight",
  "opening_balance",
  "other_costs",
  "refund_amount",
  "sale_price",
  "subtotal",
  "total",
  "unit_cost",
]);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatAuditDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(value);
}

function localizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (Array.isArray(value)) return value.map((item) => localizeValue(key, item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        auditFieldLabels[nestedKey] ?? nestedKey,
        localizeValue(nestedKey, nestedValue),
      ]),
    );
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") {
    if (currencyFields.has(key)) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    }
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
  }
  if (typeof value === "string") {
    if (key.endsWith("_at") || key.endsWith("_date")) return formatAuditDate(value);
    return auditValueLabels[value] ?? value;
  }
  return String(value);
}

function formatValue(key: string, value: unknown) {
  const localized = localizeValue(key, value);
  return typeof localized === "object" ? JSON.stringify(localized, null, 2) : String(localized);
}

function actionTone(action: string) {
  if (["delete", "cancellation", "return"].includes(action)) return "is-critical";
  if (["insert", "create", "open"].includes(action)) return "is-created";
  return "is-updated";
}

export function AuditHistoryTable({ logs }: { logs: AuditLogItem[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selected = logs.find((log) => log.id === selectedId) ?? null;
  const changes = useMemo(() => {
    if (!selected) return [];
    const keys = new Set([
      ...Object.keys(selected.oldData ?? {}),
      ...Object.keys(selected.newData ?? {}),
    ]);
    return [...keys]
      .filter((key) => JSON.stringify(selected.oldData?.[key]) !== JSON.stringify(selected.newData?.[key]))
      .sort((first, second) => (auditFieldLabels[first] ?? first).localeCompare(auditFieldLabels[second] ?? second, "pt-BR"));
  }, [selected]);

  const close = () => {
    setSelectedId(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };
  const open = (log: AuditLogItem, opener: HTMLElement) => {
    openerRef.current = opener;
    setSelectedId(log.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, log: AuditLogItem) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(log, event.currentTarget);
    }
  };

  useEffect(() => {
    if (!selected) return;
    closeRef.current?.focus();
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [selected]);

  const modal = selected ? (
    <div className="sale-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="sale-modal audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title">
        <header className="sale-modal-head">
          <div>
            <span className="panel-kicker">Evento de auditoria</span>
            <h2 id="audit-modal-title"><FileClock size={19} /> Registro #{selected.id}</h2>
          </div>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Fechar detalhes da auditoria" title="Fechar"><X size={19} /></button>
        </header>
        <div className="sale-modal-body">
          <div className="sale-detail-meta audit-detail-meta">
            <div><span>Ação</span><strong>{auditActionLabels[selected.action] ?? selected.action}</strong></div>
            <div><span>Módulo</span><strong>{auditTableLabels[selected.tableName] ?? selected.tableName}</strong></div>
            <div><span>Responsável</span><strong>{selected.actorName}</strong></div>
            <div><span>Data e hora</span><strong>{formatDate(selected.createdAt)}</strong></div>
          </div>
          <div className="audit-record-reference">
            <span>Identificador do registro</span>
            <code>{selected.recordId ?? "Não informado"}</code>
          </div>
          <div className="sale-detail-section-head audit-changes-heading">
            <div><span className="panel-kicker">Alterações</span><h3>Antes e depois</h3></div>
            <span className="table-count">{changes.length} campo(s)</span>
          </div>
          {changes.length ? (
            <div className="audit-change-list">
              {changes.map((key) => (
                <article key={key}>
                  <strong>{auditFieldLabels[key] ?? key}</strong>
                  <div>
                    <span><small>Antes</small><pre>{formatValue(key, selected.oldData?.[key])}</pre></span>
                    <span><small>Depois</small><pre>{formatValue(key, selected.newData?.[key])}</pre></span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="sale-detail-empty"><FileClock size={20} />Este evento não possui diferenças detalhadas.</div>
          )}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div className="data-table-wrap">
        <table className="data-table sales-table audit-table">
          <thead><tr><th>Data e hora</th><th>Responsável</th><th className="align-center">Ação</th><th>Módulo</th><th>Registro</th></tr></thead>
          <tbody>{logs.map((log) => (
            <tr
              className="sales-table-row"
              key={log.id}
              role="button"
              tabIndex={0}
              aria-label={`Abrir evento de auditoria ${log.id}`}
              onClick={(event) => open(log, event.currentTarget)}
              onKeyDown={(event) => handleKeyDown(event, log)}
            >
              <td className="muted-cell">{formatDate(log.createdAt)}</td>
              <td><span className="audit-actor"><UserRound size={14} />{log.actorName}</span></td>
              <td className="align-center"><span className={`audit-action ${actionTone(log.action)}`}>{auditActionLabels[log.action] ?? log.action}</span></td>
              <td><strong>{auditTableLabels[log.tableName] ?? log.tableName}</strong></td>
              <td><code className="sale-code">#{log.recordId?.slice(0, 12) ?? log.id}</code></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
