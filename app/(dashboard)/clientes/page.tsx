import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Mail,
  Pencil,
  Phone,
  Plus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { RealtimeCustomersSync } from "@/components/realtime-customers-sync";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getCustomersPageData,
  type CustomerStatusFilter,
} from "@/features/customers/customer-service";
import { CustomerForm } from "./customer-form";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default async function CustomersPage({
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
  const status: CustomerStatusFilter =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "all";
  const data = await getCustomersPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: params.busca ?? "",
    status,
  });

  const editingCustomer = data.canEditCustomers
    ? data.customers.find((customer) => customer.id === params.editar)
    : undefined;
  const showNewCustomer = params.novo === "1" && data.canCreateCustomers;
  const showCustomerForm = showNewCustomer || Boolean(editingCustomer);

  const listParams = new URLSearchParams();
  if (data.search) listParams.set("busca", data.search);
  if (data.status !== "all") listParams.set("status", data.status);
  if (data.page > 1) listParams.set("pagina", String(data.page));
  const returnHref = listParams.size ? `/clientes?${listParams}` : "/clientes";
  const newCustomerParams = new URLSearchParams(listParams);
  newCustomerParams.set("novo", "1");

  const pageHref = (page: number) => {
    const query = new URLSearchParams(listParams);
    query.delete("pagina");
    if (page > 1) query.set("pagina", String(page));
    return query.size ? `/clientes?${query}` : "/clientes";
  };
  const editHref = (customerId: string) => {
    const query = new URLSearchParams(listParams);
    query.set("editar", customerId);
    return `/clientes?${query}`;
  };

  const firstCustomer =
    data.filteredCustomerCount > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastCustomer = Math.min(
    data.page * data.pageSize,
    data.filteredCustomerCount,
  );

  return (
    <>
      {data.organizationId && (
        <RealtimeCustomersSync organizationId={data.organizationId} />
      )}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Cadastros</span>
          <h1>Clientes</h1>
          <p>Organize contatos e identifique as vendas da {data.organizationName ?? "sua distribuidora"}.</p>
        </div>
        {data.canCreateCustomers && (
          <Link
            className={`button ${showCustomerForm ? "button-secondary" : "button-primary"}`}
            href={showCustomerForm ? returnHref : `/clientes?${newCustomerParams}`}
            scroll={false}
          >
            {showCustomerForm ? <X size={17} /> : <Plus size={17} />}
            {showCustomerForm ? "Cancelar" : "Novo cliente"}
          </Link>
        )}
      </section>

      {params.criado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Cliente #{params.criado} cadastrado com sucesso.
        </div>
      )}
      {params.atualizado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Cliente #{params.atualizado} atualizado com sucesso.
        </div>
      )}
      {params.editar && data.canEditCustomers && !editingCustomer && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          Cliente não encontrado ou indisponível para edição nesta página.
        </div>
      )}

      {showCustomerForm && (
        <article className="panel customer-form-panel">
          <CustomerForm
            key={editingCustomer?.id ?? "new"}
            customer={editingCustomer}
            returnHref={returnHref}
          />
        </article>
      )}

      <section className="module-stat-grid customer-stat-grid">
        <article className="module-stat">
          <span>Clientes ativos</span>
          <strong>{data.activeCustomerCount}</strong>
          <small>Disponíveis para novas vendas</small>
        </article>
        <article className="module-stat">
          <span>Novos no mês</span>
          <strong>{data.newThisMonthCount}</strong>
          <small>Cadastros realizados neste mês</small>
        </article>
        <article className="module-stat">
          <span>Clientes inativos</span>
          <strong>{data.inactiveCustomerCount}</strong>
          <small>Preservados no histórico de vendas</small>
        </article>
      </section>

      {!data.hasMembership ? (
        <article className="panel membership-warning">
          <span className="construction-icon"><CircleAlert size={23} /></span>
          <div>
            <h2>Usuário sem organização vinculada</h2>
            <p>Vincule este usuário à organização para acessar os clientes protegidos pelas políticas de segurança.</p>
          </div>
        </article>
      ) : (
        <article className="panel customers-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Relacionamento</span><h2>Todos os clientes</h2></div>
            <span className="table-count">{data.filteredCustomerCount} cliente(s)</span>
          </div>

          <AutoFilterForm
            className="customer-filters"
            clearClassName="customer-clear-filter"
            fields={[
              { type: "search", name: "busca", label: "Buscar cliente", value: data.search, placeholder: "Nome, telefone, e-mail ou documento", className: "customer-search-field" },
              { type: "select", name: "status", label: "Status", value: data.status, options: [
                { value: "all", label: "Todos" },
                { value: "active", label: "Ativos" },
                { value: "inactive", label: "Inativos" },
              ] },
            ]}
          />

          {data.customers.length ? (
            <div className="data-table-wrap">
              <table className="data-table customers-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Documento</th>
                    <th>Cadastro</th>
                    <th>Status</th>
                    {data.canEditCustomers && <th className="align-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <div className="product-cell customer-cell">
                          <span className="customer-avatar"><UserRound size={16} /></span>
                          <span><strong>{customer.name}</strong><small>{customer.notes || "Sem observações"}</small></span>
                        </div>
                      </td>
                      <td>
                        <div className="customer-contact">
                          <span><Phone size={13} />{customer.phone ?? "Não informado"}</span>
                          <span><Mail size={13} />{customer.email ?? "Não informado"}</span>
                        </div>
                      </td>
                      <td className="muted-cell">{customer.document ?? "—"}</td>
                      <td className="muted-cell">{formatDate(customer.createdAt)}</td>
                      <td><span className={`inventory-status ${customer.active ? "is-regular" : "is-inactive"}`}>{customer.active ? "Ativo" : "Inativo"}</span></td>
                      {data.canEditCustomers && (
                        <td className="align-right">
                          <Link
                            className="icon-button customer-edit-button"
                            href={editHref(customer.id)}
                            aria-label={`Editar ${customer.name}`}
                            title="Editar cliente"
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
            <EmptyState icon={UsersRound} title="Nenhum cliente encontrado" description="Altere os filtros ou cadastre um cliente para identificá-lo nas próximas vendas." />
          )}

          {data.filteredCustomerCount > 0 && (
            <nav className="products-pagination" aria-label="Paginação da lista de clientes">
              <span>Exibindo {firstCustomer}–{lastCustomer} de {data.filteredCustomerCount}</span>
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
      )}
    </>
  );
}
