import { GlassWater } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="Bebidas Gestão">
      <span className="brand-icon">
        <GlassWater size={20} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>Brava</strong>
          <small>gestão de bebidas</small>
        </span>
      )}
    </div>
  );
}
