import { ModulePage } from "@/components/layout/module-page";

export default function SalesPage() {
  return <ModulePage
    eyebrow="Operação comercial"
    title="Vendas"
    description="Registre pedidos, acompanhe recebimentos e mantenha o estoque sincronizado a cada venda."
    actionLabel="Nova venda"
    stats={[{ label: "Vendas hoje", value: "R$ 0,00", detail: "Conecte ao Supabase" }, { label: "Pedidos abertos", value: "0", detail: "Rascunhos e em atendimento" }, { label: "Ticket médio", value: "R$ 0,00", detail: "No período selecionado" }]}
    items={[{ label: "Cadastro de clientes", description: "Use clientes no pedido e acompanhe o histórico.", href: "/clientes" }, { label: "Catálogo de produtos", description: "Defina preço, unidade e disponibilidade.", href: "/produtos" }, { label: "Fluxo de caixa", description: "Concilie recebimentos por forma de pagamento.", href: "/financeiro" }]}
  />;
}
