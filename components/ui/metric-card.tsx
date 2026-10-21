import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: "primary" | "teal" | "amber" | "blue";
};

export function MetricCard({ label, value, description, icon: Icon, tone }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className={`metric-icon metric-icon-${tone}`}><Icon size={20} /></div>
      <div className="metric-card-head"><span>{label}</span><strong>{value}</strong></div>
      <p>{description}</p>
    </article>
  );
}
