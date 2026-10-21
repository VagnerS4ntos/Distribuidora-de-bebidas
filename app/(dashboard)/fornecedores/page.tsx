import { ModulePage } from "@/components/layout/module-page";

export default function SuppliersPage() {
  return <ModulePage
    eyebrow="Cadastros"
    title="Fornecedores"
    description="Centralize contatos, documentos e histórico de fornecimento para agilizar as reposições."
    actionLabel="Novo fornecedor"
    stats={[{ label: "Fornecedores ativos", value: "0", detail: "Disponíveis para pedidos" }, { label: "Pedidos em aberto", value: "0", detail: "Aguardando recebimento" }, { label: "Contas a pagar", value: "R$ 0,00", detail: "Compras ainda pendentes" }]}
    items={[{ label: "Pedidos de compra", description: "Crie e acompanhe pedidos por fornecedor.", href: "/compras" }, { label: "Produtos", description: "Consulte o catálogo antes de comprar.", href: "/produtos" }, { label: "Financeiro", description: "Controle títulos e pagamentos de compras.", href: "/financeiro" }]}
  />;
}
