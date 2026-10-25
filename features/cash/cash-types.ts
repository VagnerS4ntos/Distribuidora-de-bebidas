export type CashMovementType =
  | "opening"
  | "sale_receipt"
  | "expense"
  | "cash_in"
  | "cash_out"
  | "withdrawal"
  | "deposit"
  | "refund"
  | "closing_adjustment";

export type ManualCashMovementType =
  | "cash_in"
  | "cash_out"
  | "withdrawal"
  | "deposit";

export type CashRegisterOption = {
  id: string;
  name: string;
  locationName: string | null;
};

export type CashLocationOption = {
  id: string;
  name: string;
};

export type CashMovementListItem = {
  id: string;
  movementType: CashMovementType;
  amount: number;
  direction: "in" | "out";
  description: string | null;
  referenceType: string | null;
  createdAt: string;
};

export type OpenCashSession = {
  id: string;
  registerId: string;
  registerName: string;
  locationName: string | null;
  openedAt: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  expectedBalance: number;
  movements: CashMovementListItem[];
};

export type ClosedCashSession = {
  id: string;
  registerName: string;
  openedAt: string;
  closedAt: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  expectedBalance: number;
  countedBalance: number;
  difference: number;
  notes: string | null;
};
