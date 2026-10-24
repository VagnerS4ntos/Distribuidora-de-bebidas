"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeInventorySync({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 250);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };

    const startRealtime = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (disposed) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      if (disposed) return;
      const filter = `organization_id=eq.${organizationId}`;
      channel = supabase
        .channel(`inventory-sync:${organizationId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "inventory_balances", filter },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_movements", filter },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_locations", filter },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products", filter },
          scheduleRefresh,
        )
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
  }, [organizationId, router]);

  return null;
}
