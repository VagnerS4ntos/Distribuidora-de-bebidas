export type FinancialEntryType = "income" | "expense";

export type FinancialStatus =
  | "pending"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "cancelled";

export type FinancialTypeFilter = "all" | FinancialEntryType;
export type FinancialStatusFilter = "all" | "open" | "overdue" | "paid";

export type FinancialPayment = {
  id: string;
  amount: number;
  paymentMethod: string;
  paidAt: string;
  referenceCode: string | null;
  notes: string | null;
};

export type FinancialListItem = {
  id: string;
  entryType: FinancialEntryType;
  status: FinancialStatus;
  description: string;
  amount: number;
  amountPaid: number;
  outstandingAmount: number;
  issueDate: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  referenceCode: string | null;
  notes: string | null;
  category: string | null;
  counterparty: string | null;
  source: "sale" | "purchase" | "manual";
  sourceId: string | null;
  payments: FinancialPayment[];
};

export type FinancialCategoryOption = {
  id: string;
  name: string;
  entryType: FinancialEntryType;
};

export type FinancialContactOption = {
  id: string;
  name: string;
};
