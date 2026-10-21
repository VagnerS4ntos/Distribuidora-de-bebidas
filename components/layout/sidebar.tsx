"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Box,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PackageOpen,
  ShoppingBag,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { BrandMark } from "@/components/layout/brand-mark";

const mainItems = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/vendas", label: "Vendas", icon: ShoppingBag },
  { href: "/produtos", label: "Produtos", icon: Box },
  { href: "/estoques", label: "Estoque", icon: PackageOpen },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
];

const controlItems = [
  { href: "/compras", label: "Compras", icon: ClipboardList },
  { href: "/financeiro", label: "Financeiro", icon: WalletCards },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

function NavItems({ items, pathname, pendingHref, onNavigate }: { items: typeof mainItems; pathname: string; pendingHref: string | null; onNavigate: (href: string) => void }) {
  return items.map(({ href, label, icon: Icon }) => (
    <Link
      className={`side-link${pathname === href || pendingHref === href ? " side-link-active" : ""}`}
      href={href}
      key={href}
      onClick={() => pathname !== href && onNavigate(href)}
      prefetch
      aria-current={pathname === href ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.9} />
      <span>{label}</span>
      {pendingHref === href && pathname !== href && <span className="nav-spinner" aria-label="Carregando" />}
    </Link>
  ));
}

export function Sidebar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  return (
    <aside className="sidebar">
      <div className="sidebar-head"><BrandMark /></div>
      <nav className="side-nav" aria-label="Navegação principal">
        <p className="side-section-label">Operação</p>
        <NavItems items={mainItems} pathname={pathname} pendingHref={pendingHref} onNavigate={setPendingHref} />
        <p className="side-section-label side-section-gap">Gestão</p>
        <NavItems items={controlItems} pathname={pathname} pendingHref={pendingHref} onNavigate={setPendingHref} />
      </nav>
      <div className="sidebar-footer">
        <FileText size={16} />
        <span>Dados protegidos por Supabase</span>
      </div>
    </aside>
  );
}
