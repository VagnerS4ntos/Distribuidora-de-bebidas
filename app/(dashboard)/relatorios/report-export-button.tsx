"use client";

import { Download } from "lucide-react";
import type {
  ReportLowStockProduct,
  ReportPaymentMethod,
  ReportTopProduct,
  ReportTrendPoint,
} from "@/features/reports/report-types";

type ExportData = {
  organizationName: string;
  from: string;
  to: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  salesCount: number;
  unitsSold: number;
  averageTicket: number;
  financialIncome: number;
  financialExpense: number;
  financialBalance: number;
  purchaseCost: number;
  trend: ReportTrendPoint[];
  topProducts: ReportTopProduct[];
  paymentMethods: ReportPaymentMethod[];
  lowStockProducts: ReportLowStockProduct[];
};

function csvCell(value: string | number) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function money(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function ReportExportButton({ data }: { data: ExportData }) {
  const downloadReport = () => {
    const rows: Array<Array<string | number>> = [
      ["RELATÓRIO GERENCIAL"],
      ["Organização", data.organizationName],
      ["Período", `${data.from} a ${data.to}`],
      [],
      ["RESUMO"],
      ["Faturamento", money(data.revenue)],
      ["Custo registrado", money(data.cost)],
      ["Lucro bruto", money(data.grossProfit)],
      ["Margem bruta (%)", data.grossMargin.toFixed(2).replace(".", ",")],
      ["Vendas concluídas", data.salesCount],
      ["Unidades vendidas", data.unitsSold],
      ["Ticket médio", money(data.averageTicket)],
      ["Entradas financeiras", money(data.financialIncome)],
      ["Saídas financeiras", money(data.financialExpense)],
      ["Saldo financeiro", money(data.financialBalance)],
      ["Compras recebidas", money(data.purchaseCost)],
      [],
      ["EVOLUÇÃO DAS VENDAS"],
      ["Período", "Vendas", "Faturamento"],
      ...data.trend.map((point) => [point.label, point.sales, money(point.revenue)]),
      [],
      ["PRODUTOS MAIS VENDIDOS"],
      ["Produto", "Quantidade", "Unidade", "Faturamento"],
      ...data.topProducts.map((product) => [product.name, product.quantity, product.unit, money(product.revenue)]),
      [],
      ["FORMAS DE PAGAMENTO"],
      ["Forma", "Valor", "Participação (%)"],
      ...data.paymentMethods.map((method) => [method.method, money(method.amount), method.share.toFixed(2).replace(".", ",")]),
      [],
      ["ESTOQUE CRÍTICO ATUAL"],
      ["Produto", "Saldo", "Unidade", "Estoque mínimo"],
      ...data.lowStockProducts.map((product) => [product.name, product.stock, product.unit, product.minimum]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-${data.from}-${data.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button className="button button-primary" type="button" onClick={downloadReport}>
      <Download size={17} /> Exportar CSV
    </button>
  );
}
