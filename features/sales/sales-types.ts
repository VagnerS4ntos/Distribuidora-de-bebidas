export type RecentSale = {
  id: string;
  customer: string;
  soldAt: string;
  total: number;
  itemCount: number;
  paymentMethod: string | null;
};

export type SaleDetails = {
  id: string;
  customer: string;
  customerPhone: string | null;
  status: "draft" | "completed" | "cancelled" | "refunded";
  soldAt: string;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  items: Array<{
    id: string;
    product: string;
    brand: string | null;
    sku: string | null;
    unit: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    status: string;
    paidAt: string | null;
  }>;
};

export type SaleDetailsResult =
  | { success: true; data: SaleDetails }
  | { success: false; message: string };
