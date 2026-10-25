"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Box,
  ClipboardList,
  CircleDollarSign,
  LayoutDashboard,
  PackageOpen,
  ShoppingBag,
  Truck,
  UserCog,
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
  { href: "/caixa", label: "Caixa", icon: CircleDollarSign },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

function NavPendingIndicator({ isCurrent }: { isCurrent: boolean }) {
  const { pending } = useLinkStatus();

  return pending && !isCurrent ? (
    <span className="nav-spinner" aria-label="Carregando" />
  ) : null;
}

function NavItems({
  items,
  pathname,
}: {
  items: typeof mainItems;
  pathname: string;
}) {
  return items.map(({ href, label, icon: Icon }) => (
    <Link
      className={`side-link${pathname === href ? " side-link-active" : ""}`}
      href={href}
      key={href}
      prefetch
      aria-current={pathname === href ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.9} />
      <span>{label}</span>
      <NavPendingIndicator isCurrent={pathname === href} />
    </Link>
  ));
}

export function Sidebar({ isOwner = false }: { isOwner?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <BrandMark />
      </div>
      <nav className="side-nav" aria-label="Navegação principal">
        <p className="side-section-label">Operação</p>
        <NavItems items={mainItems} pathname={pathname} />
        <p className="side-section-label side-section-gap">Gestão</p>
        <NavItems items={controlItems} pathname={pathname} />
        {isOwner && (
          <NavItems
            items={[{ href: "/equipe", label: "Equipe", icon: UserCog }]}
            pathname={pathname}
          />
        )}
      </nav>
    </aside>
  );
}
