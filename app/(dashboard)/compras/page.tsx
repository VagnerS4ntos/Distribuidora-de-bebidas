import Link from "next/link";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  PackageOpen,
  Plus,
  ShoppingBasket,
  X,
} from "lucide-react";
import { RealtimePurchasesSync } from "@/components/realtime-purchases-sync";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getPurchasesPageData } from "@/features/purchases/purchase-service";
import type { PurchaseStatusFilter } from "@/features/purchases/purchase-types";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { NewPurchaseForm } from "./new-purchase-form";
import { PurchasesHistoryTable } from "./purchases-history-table";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    nova?: string;
    criada?: string;
    recebida?: string;
    status?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const showNewPurchase = params.nova === "1";
  const requestedPage = Number(params.pagina);
  const status: PurchaseStatusFilter =
    params.status === "open" || params.status === "received" || params.status === "cancelled"
      ? params.status
      : "all";
  const data = await getPurchasesPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    status,
  });

  if (!data) {
    return (
      <article className="panel membership-warning">
        <span className="construction-icon"><CircleAlert size={23} /></span>
        <div><h2>Usuário sem organização vinculada</h2><p>Vincule este usuário a uma organização antes de registrar compras.</p></div>
      </article>
    );
  }

  const listHref = (
    page = 1,
    nextStatus = data.status,
    keepForm = showNewPurchase,
  ) => {
    const query = new URLSearchParams();
    if (keepForm) query.set("nova", "1");
    if (nextStatus !== "all") query.set("status", nextStatus);
    if (page > 1) query.set("pagina", String(page));
    return query.size ? `/compras?${query}` : "/compras";
  };
  const firstRecord = data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRecord = Math.min(data.page * data.pageSize, data.total);

  return (
    <>
      <RealtimePurchasesSync organizationId={data.organizationId} />

      <section className="page-heading">
        <div>
          <span className="eyebrow">Abastecimento</span>
          <h1>Compras</h1>
          <p>Registre pedidos da {data.organizationName}, receba mercadorias e atualize custos e estoque.</p>
        </div>
        {showNewPurchase ? (
          <Link href={listHref(1, data.status, false)} className="button button-secondary"><X size={17} />Cancelar</Link>
        ) : (
          <Link href="/compras?nova=1" className="button button-primary"><Plus size={17} />Novo pedido</Link>
        )}
      </section>

      {params.criada && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Pedido <strong>#{params.criada}</strong> registrado com sucesso.
        </div>
      )}
      {params.recebida && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Recebimento do pedido <strong>#{params.recebida}</strong> registrado e estoque atualizado.
        </div>
      )}

      <section className="module-stat-grid">
        <article className="module-stat">
          <span>Pedidos a receber</span>
          <strong>{formatNumber(data.openOrderCount)}</strong>
          <small>Pedidos abertos ou parcialmente recebidos</small>
        </article>
        <article className="module-stat">
          <span>Unidades pendentes</span>
          <strong>{formatNumber(data.pendingUnits)}</strong>
          <small>Itens que ainda não entraram no estoque</small>
        </article>
        <article className="module-stat">
          <span>Recebido no mês</span>
          <strong>{formatCurrency(data.receivedMonthTotal)}</strong>
          <small>Total dos pedidos recebidos no mês</small>
        </article>
      </section>

      {showNewPurchase && (
        <article className="panel sale-form-panel">
          {!data.suppliers.length || !data.products.length ? (
            <div className="sale-prerequisite-warning">
              <CircleAlert size={18} />
              <span>{!data.suppliers.length ? "Cadastre um fornecedor ativo antes de criar pedidos." : "Cadastre produtos ativos antes de criar pedidos."}</span>
            </div>
          ) : null}
          <NewPurchaseForm suppliers={data.suppliers} products={data.products} />
        </article>
      )}

      <article className="panel sales-panel">
        <div className="panel-head purchase-panel-head">
          <div>
            <span className="panel-kicker">Histórico</span>
            <h2><ShoppingBasket size={18} /> Pedidos de compra</h2>
          </div>
          <span className="table-count">{data.total} registro(s)</span>
        </div>

        <AutoFilterForm
          className="customer-filters purchase-filters"
          clearClassName="customer-clear-filter"
          clearLabel="Limpar filtro"
          fields={[
            { type: "select", name: "status", label: "Status", value: data.status, options: [
              { value: "all", label: "Todos os pedidos" },
              { value: "open", label: "A receber" },
              { value: "received", label: "Recebidos" },
              { value: "cancelled", label: "Cancelados" },
            ] },
          ]}
        />

        {data.purchases.length ? (
          <PurchasesHistoryTable purchases={data.purchases} locations={data.locations} />
        ) : (
          <EmptyState
            icon={data.status === "open" ? Boxes : PackageOpen}
            title="Nenhum pedido encontrado"
            description={data.status === "all" ? "Clique em Novo pedido para registrar a primeira compra." : "Não há pedidos com o status selecionado."}
          />
        )}

        {data.total > 0 && (
          <nav className="sales-pagination" aria-label="Paginação dos pedidos de compra">
            <span>Exibindo {firstRecord}–{lastRecord} de {data.total}</span>
            <div className="sales-pagination-actions">
              {data.page > 1 ? (
                <Link className="button button-secondary sales-page-button" href={listHref(data.page - 1)}><ChevronLeft size={14} />Anterior</Link>
              ) : (
                <span className="button button-secondary sales-page-button is-disabled" aria-disabled="true"><ChevronLeft size={14} />Anterior</span>
              )}
              <span className="sales-page-indicator">Página {data.page} de {data.totalPages}</span>
              {data.page < data.totalPages ? (
                <Link className="button button-secondary sales-page-button" href={listHref(data.page + 1)}>Próxima<ChevronRight size={14} /></Link>
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
