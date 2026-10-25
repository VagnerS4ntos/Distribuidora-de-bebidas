export type AuditModuleFilter =
  | "all"
  | "sales"
  | "products"
  | "inventory"
  | "purchases"
  | "financial"
  | "cash"
  | "customers"
  | "suppliers"
  | "team";

export type AuditActionFilter =
  | "all"
  | "insert"
  | "create"
  | "update"
  | "delete"
  | "receive"
  | "open"
  | "close"
  | "cancellation"
  | "return";

export type AuditLogItem = {
  id: number;
  actorId: string | null;
  actorName: string;
  action: string;
  tableName: string;
  recordId: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
};

export const auditModuleTables: Record<AuditModuleFilter, string[]> = {
  all: [],
  sales: ["sales"],
  products: ["products", "categories"],
  inventory: ["inventory_balances", "stock_locations", "stock_counts"],
  purchases: ["purchase_orders", "purchase_receipts"],
  financial: ["financial_entries", "financial_entry_payments", "financial_categories"],
  cash: ["cash_registers", "cash_sessions", "cash_movements"],
  customers: ["customers"],
  suppliers: ["suppliers"],
  team: ["organization_members", "profiles"],
};

export const auditTableLabels: Record<string, string> = {
  sales: "Venda",
  products: "Produto",
  categories: "Categoria de produto",
  inventory_balances: "Saldo de estoque",
  stock_locations: "Local de estoque",
  stock_counts: "Contagem de estoque",
  purchase_orders: "Compra",
  purchase_receipts: "Recebimento de compra",
  financial_entries: "Lançamento financeiro",
  financial_entry_payments: "Pagamento financeiro",
  financial_categories: "Categoria financeira",
  cash_registers: "Caixa",
  cash_sessions: "Sessão de caixa",
  cash_movements: "Movimentação de caixa",
  customers: "Cliente",
  suppliers: "Fornecedor",
  organization_members: "Membro da equipe",
  profiles: "Perfil",
};

export const auditActionLabels: Record<string, string> = {
  insert: "Criado",
  create: "Criado",
  update: "Atualizado",
  delete: "Excluído",
  receive: "Recebido",
  open: "Aberto",
  close: "Fechado",
  cancellation: "Cancelado",
  return: "Devolvido",
};

export const auditFieldLabels: Record<string, string> = {
  active: "Ativo",
  amount: "Valor",
  amount_paid: "Valor pago",
  barcode: "Código de barras",
  brand: "Marca",
  cash_register_id: "Caixa",
  cash_session_id: "Sessão de caixa",
  category_id: "Categoria",
  closed_at: "Data de fechamento",
  closed_by: "Fechado por",
  cnpj: "CNPJ",
  contact_name: "Nome do contato",
  cost_price: "Preço de custo",
  counted_closing_balance: "Saldo contado",
  created_by: "Criado por",
  customer_id: "Cliente",
  description: "Descrição",
  difference: "Diferença",
  direction: "Direção",
  discount: "Desconto",
  document: "Documento",
  due_date: "Data de vencimento",
  email: "E-mail",
  entry_type: "Tipo de lançamento",
  expected_at: "Previsão de recebimento",
  expected_closing_balance: "Saldo esperado",
  financial_entry_id: "Lançamento financeiro",
  freight: "Frete",
  full_name: "Nome",
  id: "Identificador",
  initial_quantity: "Quantidade inicial",
  is_returnable: "Retornável",
  issue_date: "Data de emissão",
  item_count: "Quantidade de itens",
  location_id: "Local",
  min_stock: "Estoque mínimo",
  movement_id: "Movimentação de estoque",
  movement_type: "Tipo de movimentação",
  name: "Nome",
  notes: "Observações",
  opened_at: "Data de abertura",
  opened_by: "Aberto por",
  opening_balance: "Saldo inicial",
  ordered_at: "Data da solicitação",
  other_costs: "Outros custos",
  paid_at: "Data do pagamento",
  payment_method: "Forma de pagamento",
  phone: "Telefone",
  product_id: "Produto",
  purchase_order_id: "Pedido de compra",
  purchase_receipt_id: "Recebimento da compra",
  quantity: "Quantidade",
  quantity_delta: "Variação do estoque",
  quantity_on_hand: "Saldo",
  quantity_ordered: "Quantidade solicitada",
  quantity_received: "Quantidade recebida",
  reason: "Motivo",
  received_at: "Data do recebimento",
  received_by: "Recebido por",
  received_item_count: "Quantidade de itens recebidos",
  reference_code: "Código de referência",
  reference_id: "Registro relacionado",
  reference_type: "Tipo de referência",
  refund_amount: "Valor estornado",
  role: "Perfil de acesso",
  sale_id: "Venda",
  sale_item_id: "Item da venda",
  sale_price: "Preço de venda",
  sale_return_id: "Devolução",
  sku: "SKU",
  sold_at: "Data da venda",
  status: "Status",
  subtotal: "Subtotal",
  supplier_document_number: "Documento do fornecedor",
  supplier_id: "Fornecedor",
  total: "Total",
  trade_name: "Nome fantasia",
  unit: "Unidade",
  unit_cost: "Custo unitário",
  units_per_package: "Unidades por embalagem",
  user_id: "Usuário",
};

export const auditValueLabels: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  operator: "Operador",
  draft: "Rascunho",
  ordered: "Solicitado",
  partially_received: "Recebido parcialmente",
  received: "Recebido",
  completed: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  pending: "Pendente",
  paid: "Pago",
  partially_paid: "Pago parcialmente",
  overdue: "Atrasado",
  open: "Aberto",
  closed: "Fechado",
  income: "Receita",
  expense: "Despesa",
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  bank_transfer: "Transferência bancária",
  boleto: "Boleto",
  store_credit: "Crédito da loja",
  voucher: "Vale",
  other: "Outro",
  opening: "Abertura",
  sale_receipt: "Recebimento de venda",
  cash_in: "Entrada de caixa",
  cash_out: "Saída de caixa",
  withdrawal: "Sangria",
  deposit: "Suprimento",
  refund: "Estorno",
  closing_adjustment: "Ajuste de fechamento",
  in: "Entrada",
  out: "Saída",
  UN: "Unidade",
  CX: "Caixa",
  FD: "Fardo",
  PACK: "Pacote",
  L: "Litro",
  ML: "Mililitro",
  KG: "Quilograma",
  G: "Grama",
};
