import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  PackageSearch,
  ShoppingBag,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentMember } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import { getDashboardSnapshot } from "@/features/dashboard/dashboard-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

function getBrasiliaGreeting(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );

  if (hour >= 6 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function DashboardPage() {
  const [data, currentMember] = await Promise.all([
    getDashboardSnapshot(),
    isSupabaseConfigured ? getCurrentMember() : Promise.resolve(null),
  ]);
  const greeting = getBrasiliaGreeting();
  const fullName = currentMember?.fullName || "Gestor";

  return (
    <>
      <section className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow-row">
            <span className="eyebrow">Painel de controle</span>
            {data.isDemo && (
              <span className="demo-badge">Dados de demonstração</span>
            )}
          </div>
          <h1>{greeting}, {fullName}.</h1>
          <p>
            Acompanhe o ritmo da <strong>{data.organizationName}</strong> hoje.
          </p>
        </div>
        {hasPermission(currentMember?.role, "reports.view") && (
          <Link href="/relatorios" className="button button-secondary">
            Ver relatórios
            <ArrowRight size={16} />
          </Link>
        )}
      </section>

      <section className="metrics-grid" aria-label="Indicadores principais">
        <MetricCard
          label="Vendas de hoje"
          value={formatCurrency(data.salesToday.value)}
          description={data.salesToday.comparison}
          icon={CircleDollarSign}
          tone="primary"
        />
        <MetricCard
          label="Pedidos finalizados"
          value={formatNumber(data.ordersToday.value)}
          description={data.ordersToday.comparison}
          icon={ShoppingBag}
          tone="teal"
        />
        <MetricCard
          label="Estoque em alerta"
          value={formatNumber(data.lowStock.value)}
          description={data.lowStock.comparison}
          icon={TriangleAlert}
          tone="amber"
        />
        <MetricCard
          label="A receber"
          value={formatCurrency(data.receivable.value)}
          description={data.receivable.comparison}
          icon={WalletCards}
          tone="blue"
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">Movimentação</span>
              <h2>Vendas recentes</h2>
            </div>
            <Link href="/vendas" className="text-link">
              Ver todas <ArrowRight size={15} />
            </Link>
          </div>
          {data.recentSales.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Venda</th>
                    <th>Cliente</th>
                    <th>Horário</th>
                    <th>Status</th>
                    <th className="align-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <strong className="sale-code">#{sale.id}</strong>
                      </td>
                      <td>{sale.customer}</td>
                      <td className="muted-cell">{sale.soldAt}</td>
                      <td>
                        <StatusBadge status={sale.status} />
                      </td>
                      <td className="align-right">
                        <strong>{formatCurrency(sale.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="Ainda não há vendas"
              description="As vendas finalizadas aparecerão aqui."
            />
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">Reposição</span>
              <h2>Estoque em alerta</h2>
            </div>
            <Link href="/estoques" className="text-link">
              Estoque <ArrowRight size={15} />
            </Link>
          </div>
          {data.stockAlerts.length ? (
            <ul className="stock-alert-list">
              {data.stockAlerts.map((item) => (
                <li key={item.id}>
                  <span className="product-initial">
                    {item.product.slice(0, 1)}
                  </span>
                  <span className="stock-alert-copy">
                    <strong>{item.product}</strong>
                    <small>
                      {formatNumber(item.stock)} {item.unit} em estoque
                    </small>
                  </span>
                  <span className="stock-minimum">
                    mín. {formatNumber(item.minimum)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={PackageSearch}
              title="Estoque saudável"
              description="Não há itens abaixo do mínimo."
            />
          )}
          <Link className="stock-action" href="/compras">
            <span>Planejar reposição</span>
            <ArrowRight size={16} />
          </Link>
        </article>
      </section>

      <section className="quick-actions" aria-label="Ações rápidas">
        <div>
          <span className="panel-kicker">Atalhos</span>
          <h2>Comece uma operação</h2>
        </div>
        <div className="quick-action-links">
          <Link href="/vendas">
            Registrar venda <ArrowRight size={16} />
          </Link>
          {hasPermission(currentMember?.role, "catalog.manage") && (
            <Link href="/produtos">
              Cadastrar produto <ArrowRight size={16} />
            </Link>
          )}
          {hasPermission(currentMember?.role, "purchases.manage") && (
            <Link href="/compras?nova=1">
              Nova compra <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
