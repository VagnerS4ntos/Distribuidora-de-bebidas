import Link from "next/link";
import { Box, CircleAlert, PackageOpen, Plus, X } from "lucide-react";
import { RealtimeProductsSync } from "@/components/realtime-products-sync";
import { EmptyState } from "@/components/ui/empty-state";
import { getProductsPageData } from "@/features/products/product-service";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string; criado?: string }>;
}) {
  const params = await searchParams;
  const data = await getProductsPageData();
  const activeProducts = data.products.filter((product) => product.active);
  const returnableProducts = data.products.filter((product) => product.isReturnable);
  const showNewProduct = params.novo === "1" && data.hasMembership;

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
            className={`button ${showNewProduct ? "button-secondary" : "button-primary"}`}
            href={showNewProduct ? "/produtos" : "/produtos?novo=1"}
            scroll={false}
          >
            {showNewProduct ? <X size={17} /> : <Plus size={17} />}
            {showNewProduct ? "Cancelar" : "Novo produto"}
          </Link>
        )}
      </section>

      {params.criado && (
        <div className="sale-feedback sale-feedback-success" role="status">
          Produto #{params.criado} cadastrado com sucesso.
        </div>
      )}

      {showNewProduct && (
        <article className="panel product-form-panel">
          <NewProductForm categories={data.categories} locations={data.locations} />
        </article>
      )}

      <section className="module-stat-grid">
        <article className="module-stat"><span>Produtos ativos</span><strong>{formatNumber(activeProducts.length)}</strong><small>Itens disponíveis para venda</small></article>
        <article className="module-stat"><span>Retornáveis</span><strong>{formatNumber(returnableProducts.length)}</strong><small>Com controle de vasilhame</small></article>
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
            <span className="table-count">{data.products.length} item(ns)</span>
          </div>
          {data.products.length ? (
            <div className="data-table-wrap">
              <table className="data-table products-table">
                <thead><tr><th>Produto</th><th>Categoria</th><th>SKU</th><th>Estoque</th><th>Unidade</th><th>Status</th><th className="align-right">Preço</th></tr></thead>
                <tbody>
                  {data.products.map((product) => {
                    const lowStock = product.stock <= product.minimumStock;
                    return (
                      <tr key={product.id}>
                        <td><div className="product-cell"><span className="product-initial"><Box size={15} /></span><span><strong>{product.name}</strong><small>{product.brand}</small></span></div></td>
                        <td>{product.category}</td>
                        <td className="muted-cell">{product.sku}</td>
                        <td><span className={lowStock ? "stock-value stock-value-low" : "stock-value"}>{formatNumber(product.stock)}</span>{lowStock && <small className="stock-hint">mín. {formatNumber(product.minimumStock)}</small>}</td>
                        <td>{product.unit}</td>
                        <td><span className={`status-badge ${product.active ? "status-completed" : "status-cancelled"}`}>{product.active ? "Ativo" : "Inativo"}</span></td>
                        <td className="align-right"><strong>{formatCurrency(product.salePrice)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={PackageOpen} title="Nenhum produto visível" description="Confira o vínculo da organização e as políticas RLS." />}
        </article>
      )}
    </>
  );
}
