import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  History,
  Landmark,
  LockKeyhole,
  Wallet,
} from "lucide-react";
import { RealtimeCashSync } from "@/components/realtime-cash-sync";
import { EmptyState } from "@/components/ui/empty-state";
import { getCashPageData } from "@/features/cash/cash-service";
import type { CashMovementType } from "@/features/cash/cash-types";
import { formatCurrency } from "@/lib/utils/format";
import { CashControls } from "./cash-controls";

export const dynamic = "force-dynamic";

const movementLabels: Record<CashMovementType, string> = {
  opening: "Saldo inicial",
  sale_receipt: "Venda em dinheiro",
  expense: "Despesa em dinheiro",
  cash_in: "Entrada avulsa",
  cash_out: "Saída avulsa",
  withdrawal: "Sangria",
  deposit: "Suprimento",
  refund: "Estorno",
  closing_adjustment: "Ajuste de fechamento",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function differenceLabel(value: number) {
  if (Math.abs(value) < 0.005) return "Sem diferença";
  return value > 0 ? `Sobra de ${formatCurrency(value)}` : `Falta de ${formatCurrency(Math.abs(value))}`;
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; sucesso?: string; diferenca?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.pagina);
  const data = await getCashPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  });

  if (!data) {
    return (
      <article className="panel membership-warning">
        <span className="construction-icon"><CircleAlert size={23} /></span>
        <div>
          <h2>Usuário sem organização vinculada</h2>
          <p>Vincule este usuário a uma organização antes de acessar o caixa.</p>
        </div>
      </article>
    );
  }

  const session = data.openSession;
  const difference = Number(params.diferenca ?? 0);
  const firstEntry = data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastEntry = Math.min(data.page * data.pageSize, data.total);
  const pageHref = (page: number) => page > 1 ? `/caixa?pagina=${page}` : "/caixa";

  return (
    <>
      <RealtimeCashSync organizationId={data.organizationId} />

      <section className="page-heading cash-page-heading">
        <div>
          <span className="eyebrow">Controle financeiro</span>
          <h1>Caixa</h1>
          <p>Controle dinheiro em espécie e realize o fechamento diário da {data.organizationName}.</p>
        </div>
        <span className={`cash-live-status ${session ? "is-open" : "is-closed"}`}>
          {session ? <Wallet size={16} /> : <LockKeyhole size={16} />}
          {session ? `${session.registerName} aberto` : "Caixa fechado"}
        </span>
      </section>

      {params.sucesso === "aberto" && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Caixa aberto. Vendas e pagamentos em dinheiro agora serão registrados automaticamente.
        </div>
      )}
      {params.sucesso === "fechado" && (
        <div className={`sale-feedback ${Math.abs(difference) < 0.005 ? "sale-feedback-success" : "cash-close-feedback"}`} role="status">
          Fechamento concluído. {differenceLabel(difference)}.
        </div>
      )}

      <section className="module-stat-grid cash-stat-grid">
        <article className="module-stat">
          <span>Status atual</span>
          <strong className={session ? "financial-income" : ""}>{session ? "Aberto" : "Fechado"}</strong>
          <small>{session ? `Desde ${formatDateTime(session.openedAt)}` : "Pronto para iniciar um novo expediente"}</small>
        </article>
        <article className="module-stat">
          <span>Saldo esperado</span>
          <strong>{formatCurrency(session?.expectedBalance ?? 0)}</strong>
          <small>{session ? `Abertura de ${formatCurrency(session.openingBalance)}` : "Nenhum caixa aberto"}</small>
        </article>
        <article className="module-stat">
          <span>Entradas</span>
          <strong className="financial-income">{formatCurrency(session?.inflows ?? 0)}</strong>
          <small>Vendas, receitas e suprimentos</small>
        </article>
        <article className="module-stat">
          <span>Saídas</span>
          <strong className="financial-expense">{formatCurrency(session?.outflows ?? 0)}</strong>
          <small>Despesas, retiradas e sangrias</small>
        </article>
      </section>

      <CashControls
        openSession={session}
        registers={data.registers}
        locations={data.locations}
        canManageRegisters={data.canManageRegisters}
      />

      {session && (
        <article className="panel cash-movements-panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">Expediente atual</span>
              <h2><Landmark size={18} /> Movimentações do caixa</h2>
            </div>
            <span className="table-count">{session.movements.length} registro(s)</span>
          </div>
          {session.movements.length ? (
            <div className="data-table-wrap">
              <table className="data-table cash-movements-table">
                <thead><tr><th>Horário</th><th>Movimentação</th><th>Descrição</th><th className="align-right">Valor</th></tr></thead>
                <tbody>
                  {session.movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="muted-cell">{formatDateTime(movement.createdAt)}</td>
                      <td>
                        <span className={`cash-movement-kind ${movement.direction === "in" ? "is-in" : "is-out"}`}>
                          {movement.direction === "in" ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
                          {movementLabels[movement.movementType]}
                        </span>
                      </td>
                      <td>{movement.description || "Sem descrição"}</td>
                      <td className={`align-right cash-movement-value ${movement.direction === "in" ? "is-in" : "is-out"}`}>
                        {movement.direction === "in" ? "+" : "−"} {formatCurrency(movement.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={History} title="Nenhuma movimentação" description="As movimentações deste expediente aparecerão aqui." />
          )}
        </article>
      )}

      <article className="panel cash-history-panel">
        <div className="panel-head">
          <div>
            <span className="panel-kicker">Conferência</span>
            <h2><History size={18} /> Fechamentos anteriores</h2>
          </div>
          <span className="table-count">{data.total} fechamento(s)</span>
        </div>
        {data.closedSessions.length ? (
          <div className="data-table-wrap">
            <table className="data-table cash-history-table">
              <thead><tr><th>Caixa</th><th>Abertura</th><th>Fechamento</th><th className="align-right">Esperado</th><th className="align-right">Contado</th><th className="align-right">Diferença</th></tr></thead>
              <tbody>
                {data.closedSessions.map((closed) => (
                  <tr key={closed.id} title={closed.notes || undefined}>
                    <td><strong>{closed.registerName}</strong><small>Entradas {formatCurrency(closed.inflows)} · Saídas {formatCurrency(closed.outflows)}</small></td>
                    <td className="muted-cell">{formatDateTime(closed.openedAt)}</td>
                    <td className="muted-cell">{formatDateTime(closed.closedAt)}</td>
                    <td className="align-right">{formatCurrency(closed.expectedBalance)}</td>
                    <td className="align-right">{formatCurrency(closed.countedBalance)}</td>
                    <td className={`align-right cash-history-difference ${closed.difference === 0 ? "is-balanced" : closed.difference > 0 ? "is-surplus" : "is-shortage"}`}>
                      {closed.difference > 0 ? "+" : ""}{formatCurrency(closed.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={History} title="Nenhum fechamento registrado" description="Ao fechar o primeiro caixa, a conferência ficará salva neste histórico." />
        )}

        {data.total > 0 && (
          <nav className="products-pagination" aria-label="Paginação dos fechamentos de caixa">
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
