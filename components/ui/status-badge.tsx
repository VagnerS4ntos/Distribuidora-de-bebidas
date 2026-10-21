const labels = {
  completed: "Concluída",
  draft: "Rascunho",
  cancelled: "Cancelada",
  refunded: "Estornada",
  attention: "Atenção",
} as const;

export function StatusBadge({ status }: { status: keyof typeof labels }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
