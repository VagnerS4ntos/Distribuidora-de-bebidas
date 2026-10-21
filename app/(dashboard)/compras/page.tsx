import { ModulePage } from "@/components/layout/module-page";

export default function PurchasesPage() {
  return <ModulePage
    eyebrow="Abastecimento"
    title="Compras"
    description="Planeje pedidos, acompanhe recebimentos parciais e atualize custos e estoque de forma segura."
    actionLabel="Novo pedido"
    stats={[{ label: "Pedidos em aberto", value: "0", detail: "Rascunhos e pedidos enviados" }, { label: "A receber", value: "0", detail: "Pedidos parcialmente recebidos" }, { label: "Comprado no mês", value: "R$ 0,00", detail: "Pedidos já recebidos" }]}
    items={[{ label: "Fornecedores", description: "Mantenha o cadastro de quem fornece cada item.", href: "/fornecedores" }, { label: "Entrada de estoque", description: "Recebimentos atualizam os saldos por local.", href: "/estoques" }, { label: "Contas a pagar", description: "Registre valores, vencimentos e baixas.", href: "/financeiro" }]}
  />;
}
