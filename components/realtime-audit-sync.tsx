"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeAuditSync({ organizationId }: { organizationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed) router.refresh();
      }, 250);
    };

    const start = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (disposed) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      channel = supabase
        .channel(`audit-sync:${organizationId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
          filter: `organization_id=eq.${organizationId}`,
        }, refresh)
        .subscribe();
    };

    void start();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return null;
}
