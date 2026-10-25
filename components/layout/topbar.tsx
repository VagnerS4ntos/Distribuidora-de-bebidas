import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";
import { TopbarActions } from "@/components/layout/topbar-actions";

const roleLabels = {
  owner: "Proprietário",
  manager: "Gerente",
  operator: "Operador",
} as const;

export function Topbar({
  fullName = "Gestor",
  role,
  organizationId,
}: {
  fullName?: string;
  role?: keyof typeof roleLabels;
  organizationId?: string;
}) {
  const initials =
    fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "GS";

  return (
    <header className="topbar">
      <div className="mobile-brand">
        <BrandMark compact />
      </div>
      <div className="topbar-spacer" />
      <TopbarActions organizationId={organizationId} role={role} />
      <span className="avatar">{initials}</span>
      <span className="profile-copy">
        <strong>{fullName}</strong>
        <small>{role ? roleLabels[role] : "Membro"}</small>
      </span>
      <form action="/auth/signout" method="post">
        <button className="icon-button" aria-label="Sair da conta" title="Sair">
          <LogOut size={18} />
        </button>
      </form>
    </header>
  );
}
