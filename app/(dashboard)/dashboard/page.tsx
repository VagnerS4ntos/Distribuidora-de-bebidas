import Link from "next/link";
import { ArrowRight, CircleDollarSign, PackageSearch, ShoppingBag, TriangleAlert, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDashboardSnapshot } from "@/features/dashboard/dashboard-service";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardSnapshot();

  return (
    <>
      <section className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow-row">
            <span className="eyebrow">Painel de controle</span>
            {data.isDemo && <span className="demo-badge">Dados de demonstração</span>}
          </div>
          <h1>Bom dia, Gestor.</h1>
          <p>Acompanhe o ritmo da <strong>{data.organizationName}</strong> hoje.</p>
        </div>
        <Link href="/relatorios" className="button button-secondary">Ver relatórios<ArrowRight size={16} /></Link>
      </section>

      <section className="metrics-grid" aria-label="Indicadores principais">
        <MetricCard label="Vendas de hoje" value={formatCurrency(data.salesToday.value)} description={data.salesToday.comparison} icon={CircleDollarSign} tone="primary" />
        <MetricCard label="Pedidos finalizados" value={formatNumber(data.ordersToday.value)} description={data.ordersToday.comparison} icon={ShoppingBag} tone="teal" />
        <MetricCard label="Estoque em alerta" value={formatNumber(data.lowStock.value)} description={data.lowStock.comparison} icon={TriangleAlert} tone="amber" />
        <MetricCard label="A receber" value={formatCurrency(data.receivable.value)} description={data.receivable.comparison} icon={WalletCards} tone="blue" />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div><span className="panel-kicker">Movimentação</span><h2>Vendas recentes</h2></div>
            <Link href="/vendas" className="text-link">Ver todas <ArrowRight size={15} /></Link>
          </div>
          {data.recentSales.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Venda</th><th>Cliente</th><th>Horário</th><th>Status</th><th className="align-right">Total</th></tr></thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <td><strong className="sale-code">#{sale.id}</strong></td>
                      <td>{sale.customer}</td><td className="muted-cell">{sale.soldAt}</td>
                      <td><StatusBadge status={sale.status} /></td>
                      <td className="align-right"><strong>{formatCurrency(sale.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={ShoppingBag} title="Ainda não há vendas" description="As vendas finalizadas aparecerão aqui." />}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Reposição</span><h2>Estoque em alerta</h2></div>
            <Link href="/estoques" className="text-link">Estoque <ArrowRight size={15} /></Link>
          </div>
          {data.stockAlerts.length ? (
            <ul className="stock-alert-list">
              {data.stockAlerts.map((item) => (
                <li key={item.id}>
                  <span className="product-initial">{item.product.slice(0, 1)}</span>
                  <span className="stock-alert-copy"><strong>{item.product}</strong><small>{formatNumber(item.stock)} {item.unit} em estoque</small></span>
                  <span className="stock-minimum">mín. {formatNumber(item.minimum)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={PackageSearch} title="Estoque saudável" description="Não há itens abaixo do mínimo." />}
          <Link className="stock-action" href="/compras"><span>Planejar reposição</span><ArrowRight size={16} /></Link>
        </article>
      </section>

      <section className="quick-actions" aria-label="Ações rápidas">
        <div><span className="panel-kicker">Atalhos</span><h2>Comece uma operação</h2></div>
        <div className="quick-action-links">
          <Link href="/vendas">Registrar venda <ArrowRight size={16} /></Link>
          <Link href="/produtos">Cadastrar produto <ArrowRight size={16} /></Link>
          <Link href="/compras">Nova compra <ArrowRight size={16} /></Link>
        </div>
      </section>
    </>
  );
}
