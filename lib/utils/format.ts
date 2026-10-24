const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatQuantity(value: number) {
  return quantityFormatter.format(value);
}

export function formatShortDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
