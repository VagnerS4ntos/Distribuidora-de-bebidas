import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileClock, History, ShieldCheck } from "lucide-react";
import { RealtimeAuditSync } from "@/components/realtime-audit-sync";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getAuditPageData } from "@/features/audit/audit-service";
import type { AuditActionFilter, AuditModuleFilter } from "@/features/audit/audit-types";
import { formatNumber } from "@/lib/utils/format";
import { AuditHistoryTable } from "./audit-history-table";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    pagina?: string;
    busca?: string;
    modulo?: string;
    acao?: string;
    usuario?: string;
    inicio?: string;
    fim?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.pagina);
  const data = await getAuditPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: params.busca ?? "",
    module: (params.modulo ?? "all") as AuditModuleFilter,
    action: (params.acao ?? "all") as AuditActionFilter,
    actorId: params.usuario ?? "",
    from: params.inicio ?? "",
    to: params.fim ?? "",
  });
  if (!data) redirect("/dashboard");

  const listParams = new URLSearchParams();
  if (data.search) listParams.set("busca", data.search);
  if (data.module !== "all") listParams.set("modulo", data.module);
  if (data.action !== "all") listParams.set("acao", data.action);
  if (data.actorId) listParams.set("usuario", data.actorId);
  if (data.from) listParams.set("inicio", data.from);
  if (data.to) listParams.set("fim", data.to);
  const pageHref = (page: number) => {
    const query = new URLSearchParams(listParams);
    if (page > 1) query.set("pagina", String(page));
    return query.size ? `/auditoria?${query}` : "/auditoria";
  };
  const firstRecord = data.filteredTotal > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRecord = Math.min(data.page * data.pageSize, data.filteredTotal);

  return (
    <>
      <RealtimeAuditSync organizationId={data.organizationId} />
      <section className="page-heading">
        <div>
          <span className="eyebrow">Segurança e rastreabilidade</span>
          <h1>Histórico de auditoria</h1>
          <p>Acompanhe quem alterou os dados da {data.organizationName} e compare cada modificação.</p>
        </div>
        <span className="owner-only-badge"><ShieldCheck size={16} />Proprietários e gerentes</span>
      </section>

      <section className="module-stat-grid audit-stat-grid">
        <article className="module-stat"><span>Eventos registrados</span><strong>{formatNumber(data.totalEvents)}</strong><small>Histórico preservado da organização</small></article>
        <article className="module-stat"><span>Atividade hoje</span><strong>{formatNumber(data.todayEvents)}</strong><small>Eventos no horário de Brasília</small></article>
        <article className={`module-stat ${data.criticalEvents ? "financial-stat-alert" : ""}`}><span>Eventos críticos</span><strong>{formatNumber(data.criticalEvents)}</strong><small>Exclusões, cancelamentos e devoluções</small></article>
      </section>

      <article className="panel audit-panel">
        <div className="panel-head">
          <div><span className="panel-kicker">Rastreabilidade</span><h2><History size={18} /> Eventos da organização</h2></div>
          <span className="table-count">{data.filteredTotal} evento(s)</span>
        </div>
        <AutoFilterForm
          className="audit-filters"
          clearClassName="audit-clear-filter"
          fields={[
            { type: "search", name: "busca", label: "Buscar", value: data.search, placeholder: "Registro, ação ou tabela", className: "audit-search-field" },
            { type: "select", name: "modulo", label: "Módulo", value: data.module, options: [
              { value: "all", label: "Todos os módulos" }, { value: "sales", label: "Vendas" }, { value: "products", label: "Produtos" }, { value: "inventory", label: "Estoque" }, { value: "purchases", label: "Compras" }, { value: "financial", label: "Financeiro" }, { value: "cash", label: "Caixa" }, { value: "customers", label: "Clientes" }, { value: "suppliers", label: "Fornecedores" }, { value: "team", label: "Equipe" },
            ] },
            { type: "select", name: "acao", label: "Ação", value: data.action, options: [
              { value: "all", label: "Todas as ações" }, { value: "insert", label: "Criação de registro" }, { value: "create", label: "Criação operacional" }, { value: "update", label: "Atualização" }, { value: "delete", label: "Exclusão" }, { value: "receive", label: "Recebimento" }, { value: "open", label: "Abertura" }, { value: "close", label: "Fechamento" }, { value: "cancellation", label: "Cancelamento" }, { value: "return", label: "Devolução" },
            ] },
            { type: "select", name: "usuario", label: "Responsável", value: data.actorId || "all", options: [
              { value: "all", label: "Todos os usuários" }, ...data.actors.map((actor) => ({ value: actor.id, label: actor.name })),
            ] },
            { type: "date", name: "inicio", label: "Data inicial", value: data.from, className: "audit-date-field" },
            { type: "date", name: "fim", label: "Data final", value: data.to, className: "audit-date-field" },
          ]}
        />

        {data.logs.length ? (
          <AuditHistoryTable logs={data.logs} />
        ) : (
          <EmptyState icon={FileClock} title="Nenhum evento encontrado" description="Altere os filtros ou aguarde uma nova operação registrada no sistema." />
        )}

        {data.filteredTotal > 0 && (
          <nav className="products-pagination" aria-label="Paginação do histórico de auditoria">
            <span>Exibindo {firstRecord}–{lastRecord} de {data.filteredTotal}</span>
            <div className="products-pagination-actions">
              {data.page > 1 ? <Link className="button button-secondary products-page-button" href={pageHref(data.page - 1)}><ChevronLeft size={14} />Anterior</Link> : <span className="button button-secondary products-page-button is-disabled" aria-disabled="true"><ChevronLeft size={14} />Anterior</span>}
              <span className="products-page-indicator">Página {data.page} de {data.totalPages}</span>
              {data.page < data.totalPages ? <Link className="button button-secondary products-page-button" href={pageHref(data.page + 1)}>Próxima<ChevronRight size={14} /></Link> : <span className="button button-secondary products-page-button is-disabled" aria-disabled="true">Próxima<ChevronRight size={14} /></span>}
            </div>
          </nav>
        )}
      </article>
    </>
  );
}
