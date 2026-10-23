import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  List,
  PackageOpen,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import { RealtimeSalesSync } from "@/components/realtime-sales-sync";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getSalesPageData,
  type SalesHistoryScope,
} from "@/features/sales/sales-service";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { NewSaleForm } from "./new-sale-form";
import { SalesHistoryTable } from "./sales-history-table";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    nova?: string;
    criada?: string;
    historico?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const showNewSale = params.nova === "1";
  const historyScope: SalesHistoryScope =
    params.historico === "todas" ? "all" : "recent";
  const requestedPage = Number(params.pagina);
  const historyPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const data = await getSalesPageData({ historyScope, historyPage });

  if (!data) {
    return (
      <article className="panel membership-warning">
        <span className="construction-icon"><CircleAlert size={23} /></span>
        <div><h2>Usuário sem organização vinculada</h2><p>Vincule este usuário a uma organização antes de registrar vendas.</p></div>
      </article>
    );
  }

  const historyHref = (scope: SalesHistoryScope, page = 1) => {
    const query = new URLSearchParams();
    if (showNewSale) query.set("nova", "1");
    if (scope === "all") query.set("historico", "todas");
    if (page > 1) query.set("pagina", String(page));
    const search = query.toString();
    return search ? `/vendas?${search}` : "/vendas";
  };

  const historyFirstRecord =
    data.historyTotal > 0
      ? (data.historyPage - 1) * data.historyPageSize + 1
      : 0;
  const historyLastRecord = Math.min(
    data.historyPage * data.historyPageSize,
    data.historyTotal,
  );

  return (
    <>
      <RealtimeSalesSync organizationId={data.organizationId} />

      <section className="page-heading">
        <div>
          <span className="eyebrow">Operação comercial</span>
          <h1>Vendas</h1>
          <p>Registre pedidos da {data.organizationName}, receba pagamentos e mantenha o estoque sincronizado.</p>
        </div>
        {showNewSale ? (
          <Link href="/vendas" className="button button-secondary"><X size={17} />Cancelar</Link>
        ) : (
          <Link href="/vendas?nova=1" className="button button-primary"><Plus size={17} />Nova venda</Link>
        )}
      </section>

      {params.criada && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Venda <strong>#{params.criada}</strong> registrada e estoque atualizado com sucesso.
        </div>
      )}

      <section className="module-stat-grid">
        <article className="module-stat"><span>Vendas hoje</span><strong>{formatCurrency(data.todayTotal)}</strong><small>{formatNumber(data.todayCount)} venda(s) concluída(s)</small></article>
        <article className="module-stat"><span>Itens vendidos hoje</span><strong>{formatNumber(data.todayItems)}</strong><small>Unidades baixadas do estoque</small></article>
        <article className="module-stat"><span>Lucro bruto hoje</span><strong>{formatCurrency(data.todayGrossProfit)}</strong><small>Margem estimada de {formatNumber(data.todayGrossMargin)}%</small></article>
      </section>

      {showNewSale && (
        <article className="panel sale-form-panel">
          {!data.locations.length || !data.products.length ? (
            <div className="sale-prerequisite-warning">
              <CircleAlert size={18} />
              <span>{!data.locations.length ? "Cadastre um local de estoque antes de vender." : "Cadastre produtos ativos antes de vender."}</span>
            </div>
          ) : null}
          <NewSaleForm customers={data.customers} locations={data.locations} products={data.products} />
        </article>
      )}

      <article className="panel sales-panel">
        <div className="panel-head">
          <div>
            <span className="panel-kicker">Histórico</span>
            <h2><ShoppingBag size={18} /> {data.historyScope === "all" ? "Todas as vendas" : "Vendas de ontem e hoje"}</h2>
          </div>
          <div className="sales-history-controls">
            <span className="table-count">{data.historyTotal} registro(s)</span>
            <Link
              href={historyHref(data.historyScope === "all" ? "recent" : "all")}
              className="button button-secondary sales-history-toggle"
            >
              {data.historyScope === "all" ? <CalendarDays size={14} /> : <List size={14} />}
              {data.historyScope === "all" ? "Ontem e hoje" : "Todas as vendas"}
            </Link>
          </div>
        </div>
        {data.recentSales.length ? (
          <SalesHistoryTable sales={data.recentSales} />
        ) : (
          <EmptyState
            icon={PackageOpen}
            title={data.historyScope === "all" ? "Nenhuma venda registrada" : "Nenhuma venda ontem ou hoje"}
            description={data.historyScope === "all" ? "Clique em Nova venda para registrar o primeiro pedido." : "Use Todas as vendas para consultar períodos anteriores."}
          />
        )}
        {data.historyTotal > 0 && (
          <nav className="sales-pagination" aria-label="Paginação do histórico de vendas">
            <span>Exibindo {historyFirstRecord}–{historyLastRecord} de {data.historyTotal}</span>
            <div className="sales-pagination-actions">
              {data.historyPage > 1 ? (
                <Link className="button button-secondary sales-page-button" href={historyHref(data.historyScope, data.historyPage - 1)}>
                  <ChevronLeft size={14} />Anterior
                </Link>
              ) : (
                <span className="button button-secondary sales-page-button is-disabled" aria-disabled="true"><ChevronLeft size={14} />Anterior</span>
              )}
              <span className="sales-page-indicator">Página {data.historyPage} de {data.historyTotalPages}</span>
              {data.historyPage < data.historyTotalPages ? (
                <Link className="button button-secondary sales-page-button" href={historyHref(data.historyScope, data.historyPage + 1)}>
                  Próxima<ChevronRight size={14} />
                </Link>
              ) : (
                <span className="button button-secondary sales-page-button is-disabled" aria-disabled="true">Próxima<ChevronRight size={14} /></span>
              )}
            </div>
          </nav>
        )}
      </article>
    </>
  );
}
