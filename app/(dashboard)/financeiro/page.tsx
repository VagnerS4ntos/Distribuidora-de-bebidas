import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Landmark,
  Plus,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { RealtimeFinancialSync } from "@/components/realtime-financial-sync";
import { EmptyState } from "@/components/ui/empty-state";
import { getFinancialPageData } from "@/features/finance/finance-service";
import type {
  FinancialStatusFilter,
  FinancialTypeFilter,
} from "@/features/finance/finance-types";
import { formatCurrency } from "@/lib/utils/format";
import { FinancialEntriesTable } from "./financial-entries-table";
import { NewFinancialEntryForm } from "./new-financial-entry-form";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    pagina?: string;
    busca?: string;
    tipo?: string;
    status?: string;
    novo?: string;
    criado?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.pagina);
  const type: FinancialTypeFilter =
    params.tipo === "income" || params.tipo === "expense" ? params.tipo : "all";
  const status: FinancialStatusFilter =
    params.status === "open" || params.status === "overdue" || params.status === "paid"
      ? params.status
      : "all";
  const data = await getFinancialPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: params.busca ?? "",
    type,
    status,
  });

  if (!data) {
    return (
      <article className="panel membership-warning">
        <span className="construction-icon"><CircleAlert size={23} /></span>
        <div>
          <h2>Usuário sem organização vinculada</h2>
          <p>Vincule este usuário a uma organização antes de acessar o controle financeiro.</p>
        </div>
      </article>
    );
  }

  const showNewEntry = params.novo === "1";
  const listParams = new URLSearchParams();
  if (data.search) listParams.set("busca", data.search);
  if (data.type !== "all") listParams.set("tipo", data.type);
  if (data.status !== "all") listParams.set("status", data.status);
  if (data.page > 1) listParams.set("pagina", String(data.page));
  const returnHref = listParams.size ? `/financeiro?${listParams}` : "/financeiro";
  const newEntryParams = new URLSearchParams(listParams);
  newEntryParams.set("novo", "1");

  const pageHref = (page: number) => {
    const query = new URLSearchParams(listParams);
    query.delete("pagina");
    if (page > 1) query.set("pagina", String(page));
    return query.size ? `/financeiro?${query}` : "/financeiro";
  };
  const firstEntry = data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastEntry = Math.min(data.page * data.pageSize, data.total);
  const hasFilters = Boolean(data.search || data.type !== "all" || data.status !== "all");

  return (
    <>
      <RealtimeFinancialSync organizationId={data.organizationId} />

      <section className="page-heading">
        <div>
          <span className="eyebrow">Gestão financeira</span>
          <h1>Financeiro</h1>
          <p>Acompanhe entradas, saídas e compromissos da {data.organizationName}.</p>
        </div>
        <Link
          className={`button ${showNewEntry ? "button-secondary" : "button-primary"}`}
          href={showNewEntry ? returnHref : `/financeiro?${newEntryParams}`}
          scroll={false}
        >
          {showNewEntry ? <X size={17} /> : <Plus size={17} />}
          {showNewEntry ? "Cancelar" : "Novo lançamento"}
        </Link>
      </section>

      {params.criado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Lançamento <strong>#{params.criado}</strong> registrado com sucesso.
        </div>
      )}

      {showNewEntry && (
        <article className="panel customer-form-panel">
          <NewFinancialEntryForm
            categories={data.categories}
            customers={data.customers}
            suppliers={data.suppliers}
            returnHref={returnHref}
          />
        </article>
      )}

      <section className="module-stat-grid financial-stat-grid">
        <article className="module-stat">
          <span>Resultado no mês</span>
          <strong className={data.monthBalance < 0 ? "financial-expense" : "financial-income"}>
            {formatCurrency(data.monthBalance)}
          </strong>
          <small>Entradas {formatCurrency(data.monthIncome)} · Saídas {formatCurrency(data.monthExpense)}</small>
        </article>
        <article className="module-stat">
          <span>A receber</span>
          <strong>{formatCurrency(data.receivable)}</strong>
          <small>Receitas ainda não recebidas</small>
        </article>
        <article className={`module-stat ${data.overdueCount ? "financial-stat-alert" : ""}`}>
          <span>A pagar</span>
          <strong>{formatCurrency(data.payable)}</strong>
          <small>{data.overdueCount ? `${data.overdueCount} lançamento(s) em atraso` : "Despesas ainda não pagas"}</small>
        </article>
      </section>

      <article className="panel customers-panel financial-panel">
        <div className="panel-head">
          <div>
            <span className="panel-kicker">Fluxo financeiro</span>
            <h2><WalletCards size={18} /> Lançamentos</h2>
          </div>
          <span className="table-count">{data.total} registro(s)</span>
        </div>

        <form className="customer-filters financial-filters" method="get">
          <label className="customer-search-field">
            <span>Buscar lançamento</span>
            <div>
              <Search size={16} />
              <input name="busca" type="search" defaultValue={data.search} placeholder="Descrição ou referência" />
            </div>
          </label>
          <label>
            <span>Tipo</span>
            <select name="tipo" defaultValue={data.type}>
              <option value="all">Receitas e despesas</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={data.status}>
              <option value="all">Todos</option>
              <option value="open">Pendentes</option>
              <option value="overdue">Atrasados</option>
              <option value="paid">Quitados</option>
            </select>
          </label>
          <button className="button button-secondary" type="submit">Aplicar filtros</button>
          {hasFilters && (
            <Link className="button button-secondary customer-clear-filter" href="/financeiro">
              <X size={15} />Limpar filtros
            </Link>
          )}
        </form>

        {data.entries.length ? (
          <FinancialEntriesTable entries={data.entries} />
        ) : (
          <EmptyState
            icon={Landmark}
            title="Nenhum lançamento encontrado"
            description={hasFilters
              ? "Altere os filtros para consultar outros lançamentos."
              : "Vendas, compras e lançamentos manuais aparecerão aqui."}
          />
        )}

        {data.total > 0 && (
          <nav className="products-pagination" aria-label="Paginação dos lançamentos financeiros">
            <span>Exibindo {firstEntry}–{lastEntry} de {data.total}</span>
            <div className="products-pagination-actions">
              {data.page > 1 ? (
                <Link className="button button-secondary products-page-button" href={pageHref(data.page - 1)}><ChevronLeft size={14} />Anterior</Link>
              ) : (
                <span className="button button-secondary products-page-button is-disabled" aria-disabled="true"><ChevronLeft size={14} />Anterior</span>
              )}
              <span className="products-page-indicator">Página {data.page} de {data.totalPages}</span>
              {data.page < data.totalPages ? (
                <Link className="button button-secondary products-page-button" href={pageHref(data.page + 1)}>Próxima<ChevronRight size={14} /></Link>
              ) : (
                <span className="button button-secondary products-page-button is-disabled" aria-disabled="true">Próxima<ChevronRight size={14} /></span>
              )}
            </div>
          </nav>
        )}
      </article>
    </>
  );
}
