export type PurchaseStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export type PurchaseStatusFilter = "all" | "open" | "received" | "cancelled";

export type PurchaseListItem = {
  id: string;
  supplier: string;
  supplierTradeName: string | null;
  supplierDocumentNumber: string | null;
  status: PurchaseStatus;
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  total: number;
  itemCount: number;
  quantityOrdered: number;
  quantityReceived: number;
};

export type PurchaseDetails = {
  id: string;
  supplier: string;
  supplierTradeName: string | null;
  supplierPhone: string | null;
  supplierDocumentNumber: string | null;
  status: PurchaseStatus;
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  subtotal: number;
  discount: number;
  freight: number;
  otherCosts: number;
  total: number;
  notes: string | null;
  items: Array<{
    id: string;
    productId: string;
    product: string;
    brand: string | null;
    sku: string | null;
    unit: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
    total: number;
  }>;
  receipts: Array<{
    id: string;
    receivedAt: string;
    recordedAt: string;
    location: string;
    receivedBy: string | null;
    items: Array<{
      id: string;
      productId: string;
      product: string;
      brand: string | null;
      sku: string | null;
      unit: string;
      quantity: number;
      unitCost: number;
    }>;
  }>;
};

export type PurchaseDetailsResult =
  | { success: true; data: PurchaseDetails }
  | { success: false; message: string };
