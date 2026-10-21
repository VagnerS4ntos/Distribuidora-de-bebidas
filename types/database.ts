export type SaleStatus = "draft" | "completed" | "cancelled" | "refunded";
export type FinancialStatus =
  | "pending"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "cancelled";

export interface Product {
  id: string;
  organization_id: string;
  category_id: string | null;
  name: string;
  brand: string | null;
  unit: "UN" | "CX" | "FD" | "PACK" | "L" | "ML" | "KG" | "G";
  cost_price: number;
  sale_price: number;
  min_stock: number;
  is_returnable: boolean;
  active: boolean;
}

export interface Sale {
  id: string;
  customer_id: string | null;
  status: SaleStatus;
  sold_at: string | null;
  total: number;
}

export interface InventoryBalance {
  product_id: string;
  location_id: string;
  quantity_on_hand: number;
}

export interface FinancialEntry {
  id: string;
  entry_type: "income" | "expense";
  status: FinancialStatus;
  description: string;
  amount: number;
  amount_paid: number;
  due_date: string | null;
}
