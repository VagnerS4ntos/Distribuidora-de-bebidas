import { ModulePage } from "@/components/layout/module-page";

export default function FinancePage() {
  return <ModulePage
    eyebrow="Gestão financeira"
    title="Financeiro"
    description="Administre contas a pagar e receber, fluxo de caixa e conciliação de pagamentos em um só lugar."
    actionLabel="Novo lançamento"
    stats={[{ label: "A receber", value: "R$ 0,00", detail: "Títulos pendentes e parciais" }, { label: "A pagar", value: "R$ 0,00", detail: "Despesas e compras pendentes" }, { label: "Caixa hoje", value: "R$ 0,00", detail: "Movimentação da sessão atual" }]}
    items={[{ label: "Vendas", description: "Baixe recebimentos originados das vendas.", href: "/vendas" }, { label: "Compras", description: "Acompanhe obrigações de pedidos recebidos.", href: "/compras" }, { label: "Relatórios", description: "Avalie vencimentos e resultado por período.", href: "/relatorios" }]}
  />;
}
