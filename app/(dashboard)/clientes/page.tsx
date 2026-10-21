import { ModulePage } from "@/components/layout/module-page";

export default function CustomersPage() {
  return <ModulePage
    eyebrow="Cadastros"
    title="Clientes"
    description="Mantenha os contatos atualizados, consulte o histórico de compras e acompanhe valores em aberto."
    actionLabel="Novo cliente"
    stats={[{ label: "Clientes ativos", value: "0", detail: "Cadastros disponíveis para venda" }, { label: "Novos no mês", value: "0", detail: "Clientes recém-cadastrados" }, { label: "Com saldo em aberto", value: "0", detail: "Acompanhe pelo financeiro" }]}
    items={[{ label: "Registrar venda", description: "Vincule o cliente e mantenha seu histórico completo.", href: "/vendas" }, { label: "Contas a receber", description: "Lance prazos e pagamentos de cada cliente.", href: "/financeiro" }, { label: "Relatórios", description: "Analise recorrência e volume comprado.", href: "/relatorios" }]}
  />;
}
