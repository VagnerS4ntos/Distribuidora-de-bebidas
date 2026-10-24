import Link from "next/link";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  PackageOpen,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { RealtimeProductsSync } from "@/components/realtime-products-sync";
import { EmptyState } from "@/components/ui/empty-state";
import { getProductsPageData } from "@/features/products/product-service";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    novo?: string;
    criado?: string;
    editar?: string;
    atualizado?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.pagina);
  const data = await getProductsPageData({
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  });
  const editingProduct = data.canEditProducts
    ? data.products.find((product) => product.id === params.editar)
    : undefined;
  const showNewProduct =
    params.novo === "1" && data.hasMembership && !editingProduct;
  const showProductForm = showNewProduct || Boolean(editingProduct);
  const pageHref = (page: number) =>
    page > 1 ? `/produtos?pagina=${page}` : "/produtos";
  const newProductHref =
    data.page > 1
      ? `/produtos?novo=1&pagina=${data.page}`
      : "/produtos?novo=1";
  const firstProduct =
    data.totalProducts > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastProduct = Math.min(
    data.page * data.pageSize,
    data.totalProducts,
  );

  return (
    <>
      {data.organizationId && (
        <RealtimeProductsSync organizationId={data.organizationId} />
      )}

      <section className="page-heading">
        <div>
          <span className="eyebrow">Cadastros</span>
          <h1>Produtos</h1>
          <p>{data.organizationName ? `Catálogo da ${data.organizationName}.` : "Organize bebidas por categoria, marca e embalagem."}</p>
        </div>
        {data.hasMembership && (
          <Link
            className={`button ${showProductForm ? "button-secondary" : "button-primary"}`}
            href={showProductForm ? pageHref(data.page) : newProductHref}
            scroll={false}
          >
            {showProductForm ? <X size={17} /> : <Plus size={17} />}
            {showProductForm ? "Cancelar" : "Novo produto"}
          </Link>
        )}
      </section>

      {params.criado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Produto #{params.criado} cadastrado com sucesso.
        </div>
      )}

      {params.atualizado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Produto #{params.atualizado} atualizado com sucesso.
        </div>
      )}

      {params.editar && data.canEditProducts && !editingProduct && (
        <div className="sale-feedback sale-feedback-error" role="alert">
          Produto não encontrado ou indisponível para edição.
        </div>
      )}

      {showProductForm && (
        <article className="panel product-form-panel">
          <NewProductForm
            key={editingProduct?.id ?? "new"}
            categories={data.categories}
            locations={data.locations}
            product={editingProduct}
            page={data.page}
          />
        </article>
      )}

      <section className="module-stat-grid">
        <article className="module-stat"><span>Produtos ativos</span><strong>{formatNumber(data.activeProductCount)}</strong><small>Itens disponíveis para venda</small></article>
        <article className="module-stat"><span>Retornáveis</span><strong>{formatNumber(data.returnableProductCount)}</strong><small>Com controle de vasilhame</small></article>
        <article className="module-stat"><span>Categorias</span><strong>{formatNumber(data.categoryCount)}</strong><small>Grupos do catálogo</small></article>
      </section>

      {!data.hasMembership ? (
        <article className="panel membership-warning">
          <span className="construction-icon"><CircleAlert size={23} /></span>
          <div>
            <h2>Usuário sem organização vinculada</h2>
            <p>O login funcionou, mas este usuário ainda não está na tabela <code>organization_members</code>. Vincule o ID do usuário à organização que possui os produtos.</p>
          </div>
        </article>
      ) : (
        <article className="panel products-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">Catálogo</span><h2>Todos os produtos</h2></div>
            <span className="table-count">{data.totalProducts} item(ns)</span>
          </div>
          {data.products.length ? (
            <div className="data-table-wrap">
              <table className="data-table products-table">
                <thead><tr><th>Produto</th><th>Categoria</th><th>SKU</th><th>Estoque</th><th>Unidade</th><th>Status</th><th className="align-right">Preço</th>{data.canEditProducts && <th className="align-right">Ações</th>}</tr></thead>
                <tbody>
                  {data.products.map((product) => {
                    const lowStock = product.stock <= product.minimumStock;
                    return (
                      <tr key={product.id}>
                        <td><div className="product-cell"><span className="product-initial"><Box size={15} /></span><span><strong>{product.name}</strong><small>{product.brand ?? "Sem marca"}</small></span></div></td>
                        <td>{product.category}</td>
                        <td className="muted-cell">{product.sku ?? "—"}</td>
                        <td><span className={lowStock ? "stock-value stock-value-low" : "stock-value"}>{formatNumber(product.stock)}</span>{lowStock && <small className="stock-hint">mín. {formatNumber(product.minimumStock)}</small>}</td>
                        <td>{product.unit}</td>
                        <td><span className={`status-badge ${product.active ? "status-completed" : "status-cancelled"}`}>{product.active ? "Ativo" : "Inativo"}</span></td>
                        <td className="align-right"><strong>{formatCurrency(product.salePrice)}</strong></td>
                        {data.canEditProducts && (
                          <td className="align-right">
                            <Link
                              href={`/produtos?editar=${encodeURIComponent(product.id)}${data.page > 1 ? `&pagina=${data.page}` : ""}`}
                              className="icon-button product-edit-button"
                              aria-label={`Editar ${product.name}`}
                              title="Editar produto"
                              scroll={false}
                            >
                              <Pencil size={15} />
                            </Link>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={PackageOpen} title="Nenhum produto visível" description="Confira o vínculo da organização e as políticas RLS." />}
          {data.totalProducts > 0 && (
            <nav className="products-pagination" aria-label="Paginação da lista de produtos">
              <span>Exibindo {firstProduct}–{lastProduct} de {data.totalProducts}</span>
              <div className="products-pagination-actions">
                {data.page > 1 ? (
                  <Link className="button button-secondary products-page-button" href={pageHref(data.page - 1)}>
                    <ChevronLeft size={14} />Anterior
                  </Link>
                ) : (
                  <span className="button button-secondary products-page-button is-disabled" aria-disabled="true"><ChevronLeft size={14} />Anterior</span>
                )}
                <span className="products-page-indicator">Página {data.page} de {data.totalPages}</span>
                {data.page < data.totalPages ? (
                  <Link className="button button-secondary products-page-button" href={pageHref(data.page + 1)}>
                    Próxima<ChevronRight size={14} />
                  </Link>
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
