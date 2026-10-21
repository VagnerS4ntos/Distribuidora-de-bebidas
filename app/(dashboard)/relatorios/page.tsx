import { ModulePage } from "@/components/layout/module-page";

export default function ReportsPage() {
  return <ModulePage
    eyebrow="Inteligência do negócio"
    title="Relatórios"
    description="Transforme vendas, estoque e financeiro em informações claras para decidir a próxima compra e meta."
    actionLabel="Gerar relatório"
    stats={[{ label: "Faturamento do mês", value: "R$ 0,00", detail: "Vendas concluídas" }, { label: "Margem estimada", value: "0%", detail: "Preço de venda menos custo" }, { label: "Giro de estoque", value: "—", detail: "Dados insuficientes" }]}
    items={[{ label: "Desempenho de vendas", description: "Compare períodos, ticket e melhores clientes.", href: "/vendas" }, { label: "Posição de estoque", description: "Analise saldo, cobertura e itens parados.", href: "/estoques" }, { label: "Fluxo financeiro", description: "Consulte receitas, despesas e vencimentos.", href: "/financeiro" }]}
  />;
}
