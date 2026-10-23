import { Bell, CircleHelp, LogOut } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";

const roleLabels = { owner: "Proprietário", manager: "Gerente", operator: "Operador" } as const;

export function Topbar({ fullName = "Gestor", role }: { fullName?: string; role?: keyof typeof roleLabels }) {
  const initials = fullName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "GS";

  return (
    <header className="topbar">
      <div className="mobile-brand"><BrandMark compact /></div>
      <div className="topbar-spacer" />
      <button className="icon-button" aria-label="Ajuda"><CircleHelp size={19} /></button>
      <button className="icon-button notification-button" aria-label="Notificações">
        <Bell size={19} />
        <span className="notification-dot" />
      </button>
      <span className="avatar">{initials}</span>
      <span className="profile-copy"><strong>{fullName}</strong><small>{role ? roleLabels[role] : "Membro"}</small></span>
      <form action="/auth/signout" method="post">
        <button className="icon-button" aria-label="Sair da conta" title="Sair">
          <LogOut size={18} />
        </button>
      </form>
    </header>
  );
}
