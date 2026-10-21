import { ModulePage } from "@/components/layout/module-page";

export default function InventoryPage() {
  return <ModulePage
    eyebrow="Operação logística"
    title="Estoque"
    description="Controle saldos por depósito, registre movimentações e faça inventários com rastreabilidade."
    actionLabel="Nova movimentação"
    stats={[{ label: "Itens em estoque", value: "0", detail: "Somatório de todos os locais" }, { label: "Abaixo do mínimo", value: "0", detail: "Produtos para reposição" }, { label: "Inventários abertos", value: "0", detail: "Contagens em andamento" }]}
    items={[{ label: "Produtos", description: "Configure estoque mínimo e unidades por embalagem.", href: "/produtos" }, { label: "Pedidos de compra", description: "Receba mercadorias e gere entradas de estoque.", href: "/compras" }, { label: "Relatório de giro", description: "Avalie os produtos com maior saída.", href: "/relatorios" }]}
  />;
}
