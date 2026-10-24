import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  PackageCheck,
  PackageOpen,
  PencilLine,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { RealtimeInventorySync } from "@/components/realtime-inventory-sync";
import { EmptyState } from "@/components/ui/empty-state";
import { getInventoryPageData } from "@/features/inventory/inventory-service";
import { formatQuantity } from "@/lib/utils/format";
import { StockAdjustmentForm } from "./stock-adjustment-form";

export const dynamic = "force-dynamic";

const movementLabels: Record<string, string> = {
  purchase_in: "Entrada por compra",
  sale_out: "Saída por venda",
  customer_return: "Devolução de cliente",
  supplier_return: "Devolução ao fornecedor",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de saída",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
  initial_stock: "Saldo inicial",
  loss: "Perda",
  cancel_sale: "Cancelamento de venda",
  cancel_purchase: "Cancelamento de compra",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    pagina?: string;
    local?: string;
    busca?: string;
    ajustar?: string;
    ajustado?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.pagina);
  const data = await getInventoryPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    locationId: params.local,
    search: params.busca ?? "",
  });

  const listParams = new URLSearchParams();
  if (data.search) listParams.set("busca", data.search);
  if (data.selectedLocationId) listParams.set("local", data.selectedLocationId);
  if (data.page > 1) listParams.set("pagina", String(data.page));
  const returnHref = listParams.size ? `/estoques?${listParams}` : "/estoques";
  const showAdjustment = Boolean(params.ajustar) && data.canAdjustStock;
  const adjustmentHref = new URLSearchParams(listParams);
  adjustmentHref.set("ajustar", "1");

  const pageHref = (page: number) => {
    const query = new URLSearchParams(listParams);
    query.delete("pagina");
    if (page > 1) query.set("pagina", String(page));
    return query.size ? `/estoques?${query}` : "/estoques";
  };

  const firstProduct =
    data.totalProducts > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastProduct = Math.min(data.page * data.pageSize, data.totalProducts);
  const selectedLocation = data.locations.find(
    (location) => location.id === data.selectedLocationId,
  );

  return (
    <>
      {data.organizationId && (
        <RealtimeInventorySync organizationId={data.organizationId} />
      )}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Operação logística</span>
          <h1>Estoque</h1>
          <p>
            Acompanhe saldos, alertas e movimentações da {data.organizationName ?? "sua distribuidora"}.
          </p>
        </div>
        {data.canAdjustStock && (
          <Link
            className={`button ${showAdjustment ? "button-secondary" : "button-primary"}`}
            href={showAdjustment ? returnHref : `/estoques?${adjustmentHref}`}
            scroll={false}
          >
            {showAdjustment ? <X size={17} /> : <SlidersHorizontal size={17} />}
            {showAdjustment ? "Cancelar" : "Ajustar estoque"}
          </Link>
        )}
      </section>

      {params.ajustado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Estoque atualizado e movimentação #{params.ajustado} registrada.
        </div>
      )}

      {showAdjustment && (
        <article className="panel inventory-form-panel">
          <StockAdjustmentForm
            key={`${params.ajustar}:${data.selectedLocationId ?? "all"}`}
            products={data.productOptions}
            locations={data.locations}
            initialProductId={params.ajustar === "1" ? undefined : params.ajustar}
            initialLocationId={data.selectedLocationId}
            returnHref={returnHref}
          />
        </article>
      )}

      <section className="module-stat-grid inventory-stat-grid">
        <article className="module-stat">
          <span>Itens em estoque</span>
          <strong>{formatQuantity(data.totalQuantity)}</strong>
          <small>{selectedLocation ? `Saldo em ${selectedLocation.name}` : "Somatório de todos os locais"}</small>
        </article>
        <article className="module-stat">
          <span>Abaixo do mínimo</span>
          <strong>{data.lowStockCount}</strong>
          <small>Produtos que precisam de atenção</small>
        </article>
        <article className="module-stat">
          <span>Sem estoque</span>
          <strong>{data.outOfStockCount}</strong>
          <small>Produtos ativos com saldo zerado</small>
        </article>
        <article className="module-stat">
          <span>Locais ativos</span>
          <strong>{data.locations.length}</strong>
          <small>Depósitos disponíveis</small>
        </article>
      </section>

      {!data.hasMembership ? (
        <article className="panel membership-warning">
          <span className="construction-icon"><CircleAlert size={23} /></span>
          <div>
            <h2>Usuário sem organização vinculada</h2>
            <p>Vincule este usuário à organização para consultar os saldos protegidos pelas políticas de acesso.</p>
          </div>
        </article>
      ) : (
        <>
          <article className="panel inventory-panel">
            <div className="panel-head inventory-panel-head">
              <div>
                <span className="panel-kicker">Posição atual</span>
                <h2>Saldos por produto</h2>
              </div>
              <span className="table-count">{data.totalProducts} produto(s)</span>
            </div>

            <form className="inventory-filters" method="get">
              <label className="inventory-search-field">
                <span>Buscar produto</span>
                <div><Search size={16} /><input name="busca" type="search" defaultValue={data.search} placeholder="Nome do produto" /></div>
              </label>
              <label>
                <span>Local de estoque</span>
                <select name="local" defaultValue={data.selectedLocationId ?? ""}>
                  <option value="">Todos os locais</option>
                  {data.locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </label>
              <button className="button button-secondary" type="submit">Aplicar filtros</button>
              {(data.search || data.selectedLocationId) && (
                <Link className="button button-secondary inventory-clear-filter" href="/estoques">
                  <X size={15} />
                  Limpar filtros
                </Link>
              )}
            </form>

            {data.products.length ? (
              <div className="data-table-wrap">
                <table className="data-table inventory-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Distribuição</th>
                      <th className="align-center">Mínimo</th>
                      <th className="align-center">Saldo</th>
                      <th>Status</th>
                      {data.canAdjustStock && <th className="align-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((product) => {
                      const noStock = product.stock <= 0;
                      const lowStock = product.stock <= product.minimumStock;
                      const status = !product.active
                        ? "Inativo"
                        : noStock
                          ? "Sem estoque"
                          : lowStock
                            ? "Estoque baixo"
                            : "Regular";
                      return (
                        <tr key={product.id}>
                          <td>
                            <div className="product-cell">
                              <span className="product-initial"><Box size={15} /></span>
                              <span><strong>{product.name}</strong><small>{product.sku ?? product.brand ?? "Sem identificação adicional"}</small></span>
                            </div>
                          </td>
                          <td>
                            {product.balances.length ? (
                              <div className="inventory-location-list">
                                {product.balances.slice(0, 2).map((balance) => (
                                  <span key={balance.locationId}>{balance.locationName}: <strong>{formatQuantity(balance.quantity)}</strong></span>
                                ))}
                                {product.balances.length > 2 && <small>+{product.balances.length - 2} local(is)</small>}
                              </div>
                            ) : <span className="muted-cell">Sem saldo registrado</span>}
                          </td>
                          <td className="align-center">{formatQuantity(product.minimumStock)} {product.unit}</td>
                          <td className="align-center"><strong className={lowStock ? "inventory-total is-low" : "inventory-total"}>{formatQuantity(product.stock)} {product.unit}</strong></td>
                          <td><span className={`inventory-status ${!product.active ? "is-inactive" : noStock ? "is-empty" : lowStock ? "is-low" : "is-regular"}`}>{status}</span></td>
                          {data.canAdjustStock && (
                            <td className="align-right">
                              <Link
                                className="icon-button inventory-adjust-button"
                                href={`${returnHref}${returnHref.includes("?") ? "&" : "?"}ajustar=${encodeURIComponent(product.id)}`}
                                aria-label={`Ajustar estoque de ${product.name}`}
                                title="Ajustar estoque"
                                scroll={false}
                              >
                                <PencilLine size={15} />
                              </Link>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={PackageOpen} title="Nenhum produto encontrado" description="Altere os filtros ou cadastre um produto para iniciar o controle de estoque." />
            )}

            {data.totalProducts > 0 && (
              <nav className="products-pagination" aria-label="Paginação da lista de estoque">
                <span>Exibindo {firstProduct}–{lastProduct} de {data.totalProducts}</span>
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

          <article className="panel inventory-movements-panel">
            <div className="panel-head">
              <div><span className="panel-kicker">Rastreabilidade</span><h2>Movimentações recentes</h2></div>
              <span className="table-count">Últimos {data.movements.length} registros</span>
            </div>
            {data.movements.length ? (
              <div className="data-table-wrap">
                <table className="data-table inventory-movements-table">
                  <thead><tr><th>Movimentação</th><th>Produto</th><th>Local</th><th>Data</th><th className="align-right">Quantidade</th></tr></thead>
                  <tbody>
                    {data.movements.map((movement) => {
                      const incoming = movement.quantityDelta > 0;
                      return (
                        <tr key={movement.id}>
                          <td><span className={`movement-kind ${incoming ? "is-in" : "is-out"}`}>{incoming ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />}{movementLabels[movement.movementType] ?? "Movimentação"}</span></td>
                          <td><strong>{movement.productName}</strong>{movement.notes && <small className="movement-note">{movement.notes}</small>}</td>
                          <td>{movement.locationName}</td>
                          <td className="muted-cell">{formatDateTime(movement.createdAt)}</td>
                          <td className="align-right"><strong className={incoming ? "movement-quantity is-in" : "movement-quantity is-out"}>{incoming ? "+" : ""}{formatQuantity(movement.quantityDelta)} {movement.productUnit}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={PackageCheck} title="Nenhuma movimentação registrada" description="Entradas, vendas e ajustes aparecerão neste histórico." />
            )}
          </article>
        </>
      )}
    </>
  );
}
