export type RecentSale = {
  id: string;
  customer: string;
  soldAt: string;
  updatedAt: string;
  total: number;
  refundedAmount: number;
  netTotal: number;
  itemCount: number;
  paymentMethod: string | null;
  status: "draft" | "completed" | "cancelled" | "refunded";
  hasPartialReturn: boolean;
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
    returnedQuantity: number;
    returnableQuantity: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    status: string;
    paidAt: string | null;
  }>;
  returns: Array<{
    id: string;
    returnType: "cancellation" | "return";
    refundAmount: number;
    reason: string;
    createdAt: string;
    items: Array<{
      product: string;
      unit: string;
      quantity: number;
      totalRefund: number;
    }>;
  }>;
  refundedAmount: number;
  netTotal: number;
  canCancel: boolean;
};

export type SaleDetailsResult =
  | { success: true; data: SaleDetails }
  | { success: false; message: string };
