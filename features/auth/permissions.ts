import type { OrganizationRole } from "@/features/auth/current-member";

export type AppPermission =
  | "sales.create"
  | "sales.manage_returns"
  | "catalog.manage"
  | "inventory.adjust"
  | "purchases.manage"
  | "finance.manage"
  | "cash.manage"
  | "reports.view"
  | "audit.view"
  | "team.view"
  | "team.manage"
  | "records.delete";

const allPermissions: AppPermission[] = [
  "sales.create",
  "sales.manage_returns",
  "catalog.manage",
  "inventory.adjust",
  "purchases.manage",
  "finance.manage",
  "cash.manage",
  "reports.view",
  "audit.view",
  "team.view",
  "team.manage",
  "records.delete",
];

const rolePermissions: Record<OrganizationRole, ReadonlySet<AppPermission>> = {
  owner: new Set(allPermissions),
  manager: new Set([
    "sales.create",
    "sales.manage_returns",
    "catalog.manage",
    "inventory.adjust",
    "purchases.manage",
    "finance.manage",
    "cash.manage",
    "reports.view",
    "audit.view",
    "team.view",
  ]),
  operator: new Set(["sales.create"]),
};

export function hasPermission(
  role: OrganizationRole | null | undefined,
  permission: AppPermission,
) {
  return role ? rolePermissions[role].has(permission) : false;
}

export const accessMatrix = [
  {
    capability: "Consultas operacionais",
    description: "Dashboard, vendas, produtos, estoque, clientes, fornecedores e compras",
    owner: "Completo",
    manager: "Completo",
    operator: "Somente leitura",
  },
  {
    capability: "Registrar vendas",
    description: "Concluir novas vendas e baixar o estoque",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Permitido",
  },
  {
    capability: "Cadastros e estoque",
    description: "Criar e editar produtos, clientes, fornecedores e ajustar saldos",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Bloqueado",
  },
  {
    capability: "Compras",
    description: "Criar pedidos e registrar recebimentos",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Somente leitura",
  },
  {
    capability: "Financeiro e caixa",
    description: "Criar lançamentos, baixar pagamentos e movimentar o caixa",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Somente leitura",
  },
  {
    capability: "Relatórios gerenciais",
    description: "Indicadores consolidados e exportação",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Bloqueado",
  },
  {
    capability: "Histórico de auditoria",
    description: "Consultar quem alterou cada registro e comparar os dados",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Bloqueado",
  },
  {
    capability: "Cancelamentos e devoluções",
    description: "Estornar vendas, financeiro e estoque",
    owner: "Permitido",
    manager: "Permitido",
    operator: "Bloqueado",
  },
  {
    capability: "Equipe e exclusões",
    description: "Consultar membros; somente proprietários gerenciam usuários, papéis e exclusões",
    owner: "Permitido",
    manager: "Somente leitura",
    operator: "Bloqueado",
  },
] as const;
