import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { RealtimeSuppliersSync } from "@/components/realtime-suppliers-sync";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getSuppliersPageData,
  type SupplierStatusFilter,
} from "@/features/suppliers/supplier-service";
import { SupplierForm } from "./supplier-form";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{
    pagina?: string;
    busca?: string;
    status?: string;
    novo?: string;
    editar?: string;
    criado?: string;
    atualizado?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.pagina);
  const status: SupplierStatusFilter =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "all";
  const data = await getSuppliersPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: params.busca ?? "",
    status,
  });

  const editingSupplier = data.canEditSuppliers
    ? data.suppliers.find((supplier) => supplier.id === params.editar)
    : undefined;
  const showNewSupplier = params.novo === "1" && data.canCreateSuppliers;
  const showSupplierForm = showNewSupplier || Boolean(editingSupplier);

  const listParams = new URLSearchParams();
  if (data.search) listParams.set("busca", data.search);
  if (data.status !== "all") listParams.set("status", data.status);
  if (data.page > 1) listParams.set("pagina", String(data.page));
  const returnHref = listParams.size
    ? `/fornecedores?${listParams}`
    : "/fornecedores";
  const newSupplierParams = new URLSearchParams(listParams);
  newSupplierParams.set("novo", "1");

  const pageHref = (page: number) => {
    const query = new URLSearchParams(listParams);
    query.delete("pagina");
    if (page > 1) query.set("pagina", String(page));
    return query.size ? `/fornecedores?${query}` : "/fornecedores";
  };
  const editHref = (supplierId: string) => {
    const query = new URLSearchParams(listParams);
    query.set("editar", supplierId);
    return `/fornecedores?${query}`;
  };

  const firstSupplier =
    data.filteredSupplierCount > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastSupplier = Math.min(
    data.page * data.pageSize,
    data.filteredSupplierCount,
  );

  return (
    <>
      {data.organizationId && (
        <RealtimeSuppliersSync organizationId={data.organizationId} />
      )}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Cadastros</span>
          <h1>Fornecedores</h1>
          <p>
            Centralize contatos e dados de fornecimento da {data.organizationName ?? "sua distribuidora"}.
          </p>
        </div>
        {data.canCreateSuppliers && (
          <Link
            className={`button ${showSupplierForm ? "button-secondary" : "button-primary"}`}
            href={showSupplierForm ? returnHref : `/fornecedores?${newSupplierParams}`}
            scroll={false}
          >
            {showSupplierForm ? <X size={17} /> : <Plus size={17} />}
            {showSupplierForm ? "Cancelar" : "Novo fornecedor"}
          </Link>
        )}
      </section>

      {params.criado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Fornecedor #{params.criado} cadastrado com sucesso.
        </div>
      )}
      {params.atualizado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Fornecedor #{params.atualizado} atualizado com sucesso.
        </div>
      )}
      {params.editar && data.canEditSuppliers && !editingSupplier && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          Fornecedor não encontrado ou indisponível para edição nesta página.
        </div>
      )}

      {showSupplierForm && (
        <article className="panel customer-form-panel">
          <SupplierForm
            key={editingSupplier?.id ?? "new"}
            supplier={editingSupplier}
            returnHref={returnHref}
          />
        </article>
      )}

      <section className="module-stat-grid">
        <article className="module-stat">
          <span>Fornecedores ativos</span>
          <strong>{data.activeSupplierCount}</strong>
          <small>Disponíveis para novos pedidos</small>
        </article>
        <article className="module-stat">
          <span>Novos no mês</span>
          <strong>{data.newThisMonthCount}</strong>
          <small>Cadastros realizados neste mês</small>
        </article>
        <article className="module-stat">
          <span>Fornecedores inativos</span>
          <strong>{data.inactiveSupplierCount}</strong>
          <small>Preservados no histórico de compras</small>
        </article>
      </section>

      {!data.hasMembership ? (
        <article className="panel membership-warning">
          <span className="construction-icon"><CircleAlert size={23} /></span>
          <div>
            <h2>Usuário sem organização vinculada</h2>
            <p>Vincule este usuário à organização para acessar os fornecedores protegidos pelas políticas de segurança.</p>
          </div>
        </article>
      ) : (
        <article className="panel customers-panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">Abastecimento</span>
              <h2>Todos os fornecedores</h2>
            </div>
            <span className="table-count">{data.filteredSupplierCount} fornecedor(es)</span>
          </div>

          <form className="customer-filters" method="get">
            <label className="customer-search-field">
              <span>Buscar fornecedor</span>
              <div>
                <Search size={16} />
                <input
                  name="busca"
                  type="search"
                  defaultValue={data.search}
                  placeholder="Razão social, fantasia, contato ou CNPJ"
                />
              </div>
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={data.status}>
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </label>
            <button className="button button-secondary" type="submit">Aplicar filtros</button>
            {(data.search || data.status !== "all") && (
              <Link className="button button-secondary customer-clear-filter" href="/fornecedores">
                <X size={15} />Limpar filtros
              </Link>
            )}
          </form>

          {data.suppliers.length ? (
            <div className="data-table-wrap">
              <table className="data-table customers-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Contato</th>
                    <th>CNPJ</th>
                    <th>Cadastro</th>
                    <th>Status</th>
                    {data.canEditSuppliers && <th className="align-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <div className="product-cell customer-cell">
                          <span className="customer-avatar"><Building2 size={16} /></span>
                          <span>
                            <strong>{supplier.name}</strong>
                            <small>{supplier.tradeName || "Sem nome fantasia"}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="customer-contact supplier-contact">
                          <span><UserRound size={13} />{supplier.contactName ?? "Contato não informado"}</span>
                          <span><Phone size={13} />{supplier.phone ?? "Telefone não informado"}</span>
                          <span><Mail size={13} />{supplier.email ?? "E-mail não informado"}</span>
                        </div>
                      </td>
                      <td className="muted-cell">{supplier.cnpj ?? "—"}</td>
                      <td className="muted-cell">{formatDate(supplier.createdAt)}</td>
                      <td>
                        <span className={`inventory-status ${supplier.active ? "is-regular" : "is-inactive"}`}>
                          {supplier.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      {data.canEditSuppliers && (
                        <td className="align-right">
                          <Link
                            className="icon-button customer-edit-button"
                            href={editHref(supplier.id)}
                            aria-label={`Editar ${supplier.name}`}
                            title="Editar fornecedor"
                            scroll={false}
                          >
                            <Pencil size={15} />
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Building2}
              title="Nenhum fornecedor encontrado"
              description="Altere os filtros ou cadastre um fornecedor para usá-lo nos próximos pedidos."
            />
          )}

          {data.filteredSupplierCount > 0 && (
            <nav className="products-pagination" aria-label="Paginação da lista de fornecedores">
              <span>Exibindo {firstSupplier}–{lastSupplier} de {data.filteredSupplierCount}</span>
              <div className="products-pagination-actions">
                {data.page > 1 ? (
                  <Link className="button button-secondary products-page-button" href={pageHref(data.page - 1)}>
                    <ChevronLeft size={14} />Anterior
                  </Link>
                ) : (
                  <span className="button button-secondary products-page-button is-disabled" aria-disabled="true">
                    <ChevronLeft size={14} />Anterior
                  </span>
                )}
                <span className="products-page-indicator">Página {data.page} de {data.totalPages}</span>
                {data.page < data.totalPages ? (
                  <Link className="button button-secondary products-page-button" href={pageHref(data.page + 1)}>
                    Próxima<ChevronRight size={14} />
                  </Link>
                ) : (
                  <span className="button button-secondary products-page-button is-disabled" aria-disabled="true">
                    Próxima<ChevronRight size={14} />
                  </span>
                )}
              </div>
            </nav>
          )}
        </article>
      )}
    </>
  );
}
