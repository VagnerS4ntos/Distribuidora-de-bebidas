export type ReportPeriodPreset = "today" | "7d" | "30d" | "month" | "custom";

export type ReportTrendPoint = {
  key: string;
  label: string;
  sales: number;
  revenue: number;
};

export type ReportTopProduct = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
};

export type ReportPaymentMethod = {
  method: string;
  amount: number;
  share: number;
};

export type ReportLowStockProduct = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minimum: number;
};
