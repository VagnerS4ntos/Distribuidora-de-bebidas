"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { ReportPeriodPreset } from "@/features/reports/report-types";

export function ReportPeriodFilter({
  preset,
  from,
  to,
}: {
  preset: ReportPeriodPreset;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodPreset>(preset);
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const [isPending, startTransition] = useTransition();
  const isCustom = selectedPeriod === "custom";

  const updateReport = (
    period: ReportPeriodPreset,
    nextFrom = fromDate,
    nextTo = toDate,
  ) => {
    const query = new URLSearchParams({ periodo: period });
    if (period === "custom") {
      query.set("inicio", nextFrom);
      query.set("fim", nextTo);
    }
    startTransition(() => {
      router.replace(`/relatorios?${query.toString()}`, { scroll: false });
    });
  };

  return (
    <article className="panel report-filter-panel" aria-busy={isPending}>
      <div className={`report-period-form${isCustom ? " is-custom" : ""}`}>
        <label>
          <span>Período</span>
          <select
            value={selectedPeriod}
            onChange={(event) => {
              const period = event.target.value as ReportPeriodPreset;
              setSelectedPeriod(period);
              updateReport(period);
            }}
          >
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="month">Este mês</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>

        {isCustom && (
          <>
            <label>
              <span>Data inicial</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  const value = event.target.value;
                  const nextToDate = value && toDate && value > toDate ? value : toDate;
                  setFromDate(value);
                  if (nextToDate !== toDate) setToDate(nextToDate);
                  if (value && nextToDate) updateReport("custom", value, nextToDate);
                }}
                required
              />
            </label>
            <label>
              <span>Data final</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value && fromDate && value < fromDate) return;
                  setToDate(value);
                  if (fromDate && value) updateReport("custom", fromDate, value);
                }}
                required
              />
            </label>
          </>
        )}

        <span className={`report-filter-updating${isPending ? " is-visible" : ""}`} role="status">
          <LoaderCircle className="feedback-spinner" size={15} /> Atualizando...
        </span>
      </div>
    </article>
  );
}
