"use client";

import Link from "next/link";
import {
  Bell,
  BookOpenText,
  CalendarClock,
  CircleHelp,
  PackagePlus,
  PackageSearch,
  ShoppingCart,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatQuantity } from "@/lib/utils/format";
import type { OrganizationRole } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";

type AlertItem = {
  id: string;
  kind: "overdue_purchase" | "low_stock";
  title: string;
  description: string;
  href: string;
};

type OpenMenu = "help" | "alerts" | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function brasiliaDayStartIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00-03:00`).toISOString();
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function TopbarActions({
  organizationId,
  role,
}: {
  organizationId?: string;
  role?: OrganizationRole;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(Boolean(organizationId));
  const [alertsError, setAlertsError] = useState(false);
  const supabase = useMemo(() => (organizationId ? createClient() : null), [organizationId]);

  const loadAlerts = useCallback(async () => {
    if (!supabase || !organizationId) {
      setLoadingAlerts(false);
      return;
    }

    const [productsResult, purchasesResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, unit, min_stock, inventory_balances(quantity_on_hand)")
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("purchase_orders")
        .select("id, expected_at, suppliers(name, trade_name)", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("status", ["ordered", "partially_received"])
        .lt("expected_at", brasiliaDayStartIso())
        .order("expected_at", { ascending: true })
        .limit(6),
    ]);

    if (productsResult.error || purchasesResult.error) {
      console.error(
        "Não foi possível carregar os alertas do cabeçalho",
        productsResult.error ?? purchasesResult.error,
      );
      setAlertsError(true);
      setLoadingAlerts(false);
      return;
    }

    const lowStock = (productsResult.data ?? [])
      .map((product) => {
        const balances = (product.inventory_balances ?? []) as Array<{
          quantity_on_hand: number | string;
        }>;
        const stock = balances.reduce(
          (total, balance) => total + asNumber(balance.quantity_on_hand),
          0,
        );
        return {
          id: product.id,
          name: product.name,
          unit: product.unit,
          stock,
          minimum: asNumber(product.min_stock),
        };
      })
      .filter((product) => product.stock <= product.minimum)
      .sort((a, b) => a.stock - b.stock);

    const overdueAlerts: AlertItem[] = (purchasesResult.data ?? []).map((purchase) => {
      const supplier = purchase.suppliers as {
        name?: string;
        trade_name?: string | null;
      } | null;
      const supplierName = supplier?.trade_name || supplier?.name || "Fornecedor";
      return {
        id: `purchase-${purchase.id}`,
        kind: "overdue_purchase",
        title: `Compra atrasada · ${supplierName}`,
        description: `Recebimento previsto para ${formatDate(purchase.expected_at)}`,
        href: "/compras?status=open",
      };
    });

    const lowStockAlerts: AlertItem[] = lowStock.map((product) => ({
      id: `stock-${product.id}`,
      kind: "low_stock",
      title: `Estoque baixo · ${product.name}`,
      description: `${formatQuantity(product.stock)} ${product.unit} em estoque · mínimo ${formatQuantity(product.minimum)}`,
      href: `/estoques?busca=${encodeURIComponent(product.name)}`,
    }));

    setAlerts([...overdueAlerts, ...lowStockAlerts].slice(0, 6));
    setAlertCount((purchasesResult.count ?? overdueAlerts.length) + lowStock.length);
    setAlertsError(false);
    setLoadingAlerts(false);
  }, [organizationId, supabase]);

  useEffect(() => {
    const handleOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!supabase || !organizationId) return;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!disposed) void loadAlerts();
      }, 250);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const startRealtime = async () => {
      await loadAlerts();
      const { data: { session } } = await supabase.auth.getSession();
      if (disposed) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;

      const filter = `organization_id=eq.${organizationId}`;
      channel = supabase
        .channel(`header-alerts:${organizationId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "products", filter }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory_balances", filter }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter }, scheduleRefresh)
        .subscribe();
    };

    void startRealtime();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadAlerts, organizationId, supabase]);

  const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
    if (menu === "alerts") void loadAlerts();
  };

  return (
    <div className="topbar-actions" ref={rootRef}>
      <div className="topbar-action">
        <button
          type="button"
          className="icon-button topbar-help-button"
          aria-label="Abrir ajuda rápida"
          aria-expanded={openMenu === "help"}
          aria-controls="topbar-help-menu"
          title="Ajuda rápida"
          onClick={() => toggleMenu("help")}
        >
          <CircleHelp size={19} />
        </button>
        {openMenu === "help" && (
          <section className="topbar-popover topbar-help-popover" id="topbar-help-menu">
            <div className="topbar-popover-head">
              <div><span>SUPORTE RÁPIDO</span><strong>Como posso ajudar?</strong></div>
              <button type="button" className="popover-close" aria-label="Fechar ajuda" onClick={() => setOpenMenu(null)}><X size={16} /></button>
            </div>
            <p className="topbar-popover-intro">Acesse diretamente as tarefas mais comuns da Santo Gole.</p>
            <nav className="topbar-help-links" aria-label="Atalhos de ajuda">
              <Link href="/vendas?nova=1" onClick={() => setOpenMenu(null)}><ShoppingCart size={18} /><span><strong>Registrar uma venda</strong><small>Selecione os produtos e conclua o pedido.</small></span></Link>
              {hasPermission(role, "catalog.manage") && <Link href="/produtos?novo=1" onClick={() => setOpenMenu(null)}><PackagePlus size={18} /><span><strong>Cadastrar um produto</strong><small>Inclua preços e o estoque inicial.</small></span></Link>}
              {hasPermission(role, "purchases.manage") && <Link href="/compras?nova=1" onClick={() => setOpenMenu(null)}><BookOpenText size={18} /><span><strong>Registrar uma compra</strong><small>Crie o pedido e acompanhe o recebimento.</small></span></Link>}
            </nav>
          </section>
        )}
      </div>

      <div className="topbar-action">
        <button
          type="button"
          className="icon-button notification-button"
          aria-label={alertCount ? `Abrir ${alertCount} alertas operacionais` : "Abrir alertas operacionais"}
          aria-expanded={openMenu === "alerts"}
          aria-controls="topbar-alerts-menu"
          title="Alertas operacionais"
          onClick={() => toggleMenu("alerts")}
        >
          <Bell size={19} />
          {alertCount > 0 && <span className="notification-count">{alertCount > 9 ? "9+" : alertCount}</span>}
        </button>
        {openMenu === "alerts" && (
          <section className="topbar-popover topbar-alerts-popover" id="topbar-alerts-menu" aria-live="polite">
            <div className="topbar-popover-head">
              <div><span>ACOMPANHAMENTO</span><strong>Alertas operacionais</strong></div>
              <button type="button" className="popover-close" aria-label="Fechar alertas" onClick={() => setOpenMenu(null)}><X size={16} /></button>
            </div>
            {loadingAlerts ? (
              <div className="topbar-popover-state">Atualizando alertas...</div>
            ) : alertsError ? (
              <div className="topbar-popover-state is-error">Não foi possível carregar os alertas agora.</div>
            ) : alerts.length ? (
              <div className="topbar-alert-list">
                {alerts.map((alert) => (
                  <Link href={alert.href} key={alert.id} onClick={() => setOpenMenu(null)}>
                    <span className={`topbar-alert-icon is-${alert.kind}`}>
                      {alert.kind === "overdue_purchase" ? <CalendarClock size={17} /> : <PackageSearch size={17} />}
                    </span>
                    <span><strong>{alert.title}</strong><small>{alert.description}</small></span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="topbar-popover-state is-success"><strong>Tudo em dia</strong><span>Não há compras atrasadas nem produtos com estoque baixo.</span></div>
            )}
            {alertCount > alerts.length && <p className="topbar-alert-more">E mais {alertCount - alerts.length} alerta(s).</p>}
          </section>
        )}
      </div>
    </div>
  );
}
