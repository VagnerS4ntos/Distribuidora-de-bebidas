import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleAlert,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { RealtimeReportsSync } from "@/components/realtime-reports-sync";
import { EmptyState } from "@/components/ui/empty-state";
import { getReportsPageData } from "@/features/reports/report-service";
import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import type { ReportPeriodPreset } from "@/features/reports/report-types";
import { formatCurrency, formatQuantity } from "@/lib/utils/format";
import { ReportExportButton } from "./report-export-button";
import { ReportPeriodFilter } from "./report-period-filter";

export const dynamic = "force-dynamic";

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

function formatDateKey(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${value}T12:00:00-03:00`));
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>;
}) {
  const params = await searchParams;
  const currentMember = await getCurrentMember();
  if (currentMember && !hasPermission(currentMember.role, "reports.view")) {
    redirect("/dashboard");
  }
  const preset: ReportPeriodPreset =
    params.periodo === "today"
    || params.periodo === "7d"
    || params.periodo === "month"
    || params.periodo === "custom"
      ? params.periodo
      : "30d";
  const data = await getReportsPageData({
    preset,
    from: params.inicio,
    to: params.fim,
  });

  if (!data) {
    return (
      <article className="panel membership-warning">
        <span className="construction-icon"><CircleAlert size={23} /></span>
        <div>
          <h2>Usuário sem organização vinculada</h2>
          <p>Vincule este usuário a uma organização antes de consultar os relatórios.</p>
        </div>
      </article>
    );
  }

  const periodDescription = `${formatDateKey(data.period.from)} a ${formatDateKey(data.period.to)}`;
  const maxTrendRevenue = Math.max(1, ...data.trend.map((point) => point.revenue));

  return (
    <>
      <RealtimeReportsSync organizationId={data.organizationId} />

      <section className="page-heading report-page-heading">
        <div>
          <span className="eyebrow">Inteligência do negócio</span>
          <h1>Relatórios</h1>
          <p>Analise o desempenho da {data.organizationName} entre {periodDescription}.</p>
        </div>
        <ReportExportButton
          data={{
            organizationName: data.organizationName,
            from: data.period.from,
            to: data.period.to,
            revenue: data.revenue,
            cost: data.cost,
            grossProfit: data.grossProfit,
            grossMargin: data.grossMargin,
            salesCount: data.salesCount,
            unitsSold: data.unitsSold,
            averageTicket: data.averageTicket,
            financialIncome: data.financialIncome,
            financialExpense: data.financialExpense,
            financialBalance: data.financialBalance,
            purchaseCost: data.purchaseCost,
            trend: data.trend,
            topProducts: data.topProducts,
            paymentMethods: data.paymentMethods,
            lowStockProducts: data.lowStockProducts,
          }}
        />
      </section>

      <ReportPeriodFilter
        preset={data.period.preset}
        from={data.period.from}
        to={data.period.to}
      />

      {data.period.rangeClamped && (
        <div className="sale-feedback report-range-warning" role="status">
          <CircleAlert size={16} /> O período foi limitado aos últimos 366 dias para manter o relatório rápido.
        </div>
      )}

      <section className="module-stat-grid report-metrics-grid">
        <article className="module-stat">
          <span>Faturamento</span>
          <strong>{formatCurrency(data.revenue)}</strong>
          <small>{data.salesCount} venda(s) concluída(s)</small>
        </article>
        <article className="module-stat">
          <span>Lucro bruto</span>
          <strong className={data.grossProfit < 0 ? "financial-expense" : "financial-income"}>{formatCurrency(data.grossProfit)}</strong>
          <small>Vendas menos o custo registrado nos itens</small>
        </article>
        <article className="module-stat">
          <span>Margem bruta</span>
          <strong>{data.grossMargin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
          <small>Calculada sobre o faturamento do período</small>
        </article>
        <article className="module-stat">
          <span>Ticket médio</span>
          <strong>{formatCurrency(data.averageTicket)}</strong>
          <small>Média por venda concluída</small>
        </article>
      </section>

      <section className="report-main-grid">
        <article className="panel report-chart-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Desempenho</span><h2><TrendingUp size={18} /> Evolução das vendas</h2></div>
            <span className="table-count">{formatQuantity(data.unitsSold)} unidade(s)</span>
          </div>
          {data.revenue > 0 ? (
            <div className="report-chart-wrap">
              <div className="report-chart" role="img" aria-label="Gráfico de faturamento por período">
                {data.trend.map((point) => {
                  const height = Math.max(4, (point.revenue / maxTrendRevenue) * 100);
                  return (
                    <div className="report-chart-column" key={point.key} title={`${point.label}: ${formatCurrency(point.revenue)} em ${point.sales} venda(s)`}>
                      <span>{point.revenue > 0 ? formatCurrency(point.revenue) : ""}</span>
                      <i style={{ "--report-bar-height": `${height}%` } as CSSProperties} />
                      <small>{point.label}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="Sem vendas no período" description="Escolha outro período ou registre novas vendas para acompanhar a evolução." />
          )}
        </article>

        <article className="panel report-cash-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Movimentação</span><h2><CircleDollarSign size={18} /> Fluxo financeiro</h2></div>
          </div>
          <div className="report-cash-summary">
            <div className="is-income"><span><ArrowDownLeft size={17} />Entradas</span><strong>{formatCurrency(data.financialIncome)}</strong></div>
            <div className="is-expense"><span><ArrowUpRight size={17} />Saídas</span><strong>{formatCurrency(data.financialExpense)}</strong></div>
            <div className="is-balance"><span>Saldo do período</span><strong className={data.financialBalance < 0 ? "financial-expense" : "financial-income"}>{formatCurrency(data.financialBalance)}</strong></div>
          </div>
          <div className="report-operation-summary">
            <div><ReceiptText size={17} /><span><small>Compras recebidas</small><strong>{formatCurrency(data.purchaseCost)}</strong></span></div>
            <div><Boxes size={17} /><span><small>Unidades recebidas</small><strong>{formatQuantity(data.purchaseUnits)}</strong></span></div>
            <div><ShoppingBag size={17} /><span><small>Recebimentos</small><strong>{data.purchaseReceiptCount}</strong></span></div>
          </div>
        </article>
      </section>

      <section className="report-detail-grid">
        <article className="panel report-table-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Ranking</span><h2><ShoppingBag size={18} /> Produtos mais vendidos</h2></div>
            <span className="table-count">Top {data.topProducts.length}</span>
          </div>
          {data.topProducts.length ? (
            <div className="data-table-wrap">
              <table className="data-table report-table">
                <thead><tr><th>#</th><th>Produto</th><th className="align-center">Quantidade</th><th className="align-right">Faturamento</th></tr></thead>
                <tbody>{data.topProducts.map((product, index) => (
                  <tr key={product.id}>
                    <td><span className="report-rank">{index + 1}</span></td>
                    <td><strong>{product.name}</strong></td>
                    <td className="align-center">{formatQuantity(product.quantity)} {product.unit}</td>
                    <td className="align-right"><strong>{formatCurrency(product.revenue)}</strong></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={ShoppingBag} title="Sem produtos vendidos" description="Não há itens vendidos no período selecionado." />}
        </article>

        <article className="panel report-payment-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Vendas</span><h2><ReceiptText size={18} /> Formas de pagamento</h2></div>
          </div>
          {data.paymentMethods.length ? (
            <div className="report-payment-list">
              {data.paymentMethods.map((method) => (
                <div key={method.method}>
                  <span><strong>{paymentLabels[method.method] ?? "Outro"}</strong><small>{method.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</small></span>
                  <div><i style={{ width: `${method.share}%` }} /></div>
                  <strong>{formatCurrency(method.amount)}</strong>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={ReceiptText} title="Sem pagamentos" description="Nenhum pagamento de venda foi encontrado no período." />}
        </article>
      </section>

      <article className="panel report-stock-panel">
        <div className="panel-head">
          <div><span className="panel-kicker">Posição atual</span><h2><PackageSearch size={18} /> Estoque crítico</h2></div>
          <span className="table-count">{data.lowStockCount} produto(s)</span>
        </div>
        {data.lowStockProducts.length ? (
          <div className="data-table-wrap">
            <table className="data-table report-stock-table">
              <thead><tr><th>Produto</th><th className="align-center">Saldo atual</th><th className="align-center">Estoque mínimo</th><th>Situação</th></tr></thead>
              <tbody>{data.lowStockProducts.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong></td>
                  <td className="align-center"><strong>{formatQuantity(product.stock)} {product.unit}</strong></td>
                  <td className="align-center">{formatQuantity(product.minimum)} {product.unit}</td>
                  <td><span className={`inventory-status ${product.stock <= 0 ? "is-out" : "is-low"}`}>{product.stock <= 0 ? "Sem estoque" : "Abaixo do mínimo"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState icon={PackageSearch} title="Estoque em dia" description="Nenhum produto ativo está no estoque mínimo ou abaixo dele." />}
      </article>
    </>
  );
}
