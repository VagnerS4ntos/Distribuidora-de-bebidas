import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DashboardMetric = {
  value: number;
  comparison: string;
};

export type DashboardAlert = {
  id: string;
  product: string;
  stock: number;
  minimum: number;
  unit: string;
};

export type RecentSale = {
  id: string;
  customer: string;
  total: number;
  soldAt: string;
  status: "completed" | "draft" | "cancelled" | "refunded";
};

export type DashboardSnapshot = {
  isDemo: boolean;
  organizationName: string;
  salesToday: DashboardMetric;
  ordersToday: DashboardMetric;
  lowStock: DashboardMetric;
  receivable: DashboardMetric;
  stockAlerts: DashboardAlert[];
  recentSales: RecentSale[];
};

const demoSnapshot: DashboardSnapshot = {
  isDemo: true,
  organizationName: "Distribuidora Horizonte",
  salesToday: { value: 12480.5, comparison: "+12,4% em relação a ontem" },
  ordersToday: { value: 38, comparison: "6 pedidos em separação" },
  lowStock: { value: 7, comparison: "2 itens em nível crítico" },
  receivable: { value: 8430, comparison: "R$ 1.240 vence hoje" },
  stockAlerts: [
    { id: "demo-1", product: "Cerveja Pilsen 350 ml", stock: 24, minimum: 48, unit: "UN" },
    { id: "demo-2", product: "Refrigerante Cola 2 L", stock: 12, minimum: 24, unit: "UN" },
    { id: "demo-3", product: "Água sem gás 500 ml", stock: 18, minimum: 36, unit: "FD" },
  ],
  recentSales: [
    { id: "VND-1048", customer: "Mercadinho Central", total: 1248.9, soldAt: "Hoje, 10:42", status: "completed" },
    { id: "VND-1047", customer: "Bar do Lago", total: 786.5, soldAt: "Hoje, 10:16", status: "completed" },
    { id: "VND-1046", customer: "Empório São José", total: 469.2, soldAt: "Hoje, 09:38", status: "completed" },
    { id: "VND-1045", customer: "Cliente balcão", total: 186, soldAt: "Hoje, 09:02", status: "completed" },
  ],
};

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Carrega um resumo da organização do usuário autenticado. Sem credenciais do
 * Supabase, retorna dados de demonstração para que a interface seja navegável.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!isSupabaseConfigured) return demoSnapshot;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ...demoSnapshot,
        isDemo: false,
        organizationName: "Acesse sua conta para visualizar os dados",
        salesToday: { value: 0, comparison: "Faça login para continuar" },
        ordersToday: { value: 0, comparison: "Nenhum pedido carregado" },
        lowStock: { value: 0, comparison: "Nenhum item carregado" },
        receivable: { value: 0, comparison: "Nenhum título carregado" },
        stockAlerts: [],
        recentSales: [],
      };
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, organizations(name)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.organization_id) {
      return {
        ...demoSnapshot,
        isDemo: false,
        organizationName: "Sua organização ainda não foi configurada",
        salesToday: { value: 0, comparison: "Cadastre uma organização para começar" },
        ordersToday: { value: 0, comparison: "Nenhum pedido hoje" },
        lowStock: { value: 0, comparison: "Nenhum item em alerta" },
        receivable: { value: 0, comparison: "Nenhum título pendente" },
        stockAlerts: [],
        recentSales: [],
      };
    }

    const organizationId = membership.organization_id;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

    const [todaySales, monthSales, products, receivables, recentSales] = await Promise.all([
      supabase
        .from("sales")
        .select("id, total, sale_returns(refund_amount)")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("sold_at", dayStart.toISOString()),
      supabase
        .from("sales")
        .select("total, sale_returns(refund_amount)")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("sold_at", monthStart.toISOString()),
      supabase
        .from("products")
        .select("id, name, min_stock, unit, inventory_balances(quantity_on_hand)")
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("financial_entries")
        .select("amount, amount_paid")
        .eq("organization_id", organizationId)
        .eq("entry_type", "income")
        .in("status", ["pending", "partially_paid", "overdue"]),
      supabase
        .from("sales")
        .select("id, total, sold_at, status, customers(name), sale_returns(refund_amount)")
        .eq("organization_id", organizationId)
        .order("sold_at", { ascending: false })
        .limit(5),
    ]);

    const alerts = (products.data ?? [])
      .map((product) => {
        const quantities = (product.inventory_balances ?? []) as Array<{
          quantity_on_hand: number | string;
        }>;
        const stock = quantities.reduce(
          (total, balance) => total + asNumber(balance.quantity_on_hand),
          0,
        );
        return {
          id: product.id,
          product: product.name,
          stock,
          minimum: asNumber(product.min_stock),
          unit: product.unit,
        };
      })
      .filter((product) => product.stock <= product.minimum)
      .sort((a, b) => a.stock - b.stock);

    const netSaleValue = (sale: {
      total: number | string;
      sale_returns: Array<{ refund_amount: number | string }>;
    }) => Math.max(
      0,
      asNumber(sale.total) - (sale.sale_returns ?? []).reduce(
        (total, saleReturn) => total + asNumber(saleReturn.refund_amount),
        0,
      ),
    );
    const salesAmount = (todaySales.data ?? []).reduce(
      (total, sale) => total + netSaleValue(sale),
      0,
    );
    const monthlyAmount = (monthSales.data ?? []).reduce(
      (total, sale) => total + netSaleValue(sale),
      0,
    );
    const receivableAmount = (receivables.data ?? []).reduce(
      (total, entry) => total + asNumber(entry.amount) - asNumber(entry.amount_paid),
      0,
    );

    return {
      isDemo: false,
      organizationName:
        (membership.organizations as { name?: string } | null)?.name ?? "Minha distribuidora",
      salesToday: {
        value: salesAmount,
        comparison: `${todaySales.data?.length ?? 0} venda(s) finalizada(s) hoje`,
      },
      ordersToday: {
        value: todaySales.data?.length ?? 0,
        comparison: `Faturamento no mês: R$ ${monthlyAmount.toFixed(2).replace(".", ",")}`,
      },
      lowStock: { value: alerts.length, comparison: "Itens no estoque mínimo ou abaixo dele" },
      receivable: { value: receivableAmount, comparison: "Contas a receber pendentes" },
      stockAlerts: alerts.slice(0, 5),
      recentSales: (recentSales.data ?? []).map((sale) => ({
        id: sale.id.slice(0, 8).toUpperCase(),
        customer:
          (sale.customers as { name?: string } | null)?.name ?? "Cliente balcão",
        total: netSaleValue(sale),
        soldAt: sale.sold_at
          ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(sale.sold_at),
            )
          : "Não finalizada",
        status: sale.status as RecentSale["status"],
      })),
    };
  } catch (error) {
    console.error("Não foi possível carregar o painel", error);
    return demoSnapshot;
  }
}
