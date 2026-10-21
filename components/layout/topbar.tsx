import Link from "next/link";
import { Bell, CircleHelp, LogOut, Plus } from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";

export function Topbar() {
  return (
    <header className="topbar">
      <div className="mobile-brand"><BrandMark compact /></div>
      <div className="topbar-spacer" />
      <Link href="/vendas" className="button button-primary topbar-action">
        <Plus size={17} />
        <span>Nova venda</span>
      </Link>
      <button className="icon-button" aria-label="Ajuda"><CircleHelp size={19} /></button>
      <button className="icon-button notification-button" aria-label="Notificações">
        <Bell size={19} />
        <span className="notification-dot" />
      </button>
      <span className="avatar">GS</span>
      <span className="profile-copy"><strong>Gestor</strong><small>Administrador</small></span>
      <form action="/auth/signout" method="post">
        <button className="icon-button" aria-label="Sair da conta" title="Sair">
          <LogOut size={18} />
        </button>
      </form>
    </header>
  );
}
