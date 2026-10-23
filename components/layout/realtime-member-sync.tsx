"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeMemberSync({
  organizationId,
  organizationUpdatedAt,
}: {
  organizationId: string;
  organizationUpdatedAt: string;
}) {
  const router = useRouter();
  const lastOrganizationUpdate = useRef(organizationUpdatedAt);

  useEffect(() => {
    lastOrganizationUpdate.current = organizationUpdatedAt;
  }, [organizationUpdatedAt]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let checking = false;
    let disposed = false;

    const scheduleRefresh = (updatedAt?: string) => {
      if (updatedAt) lastOrganizationUpdate.current = updatedAt;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 300);
    };

    const checkForUpdates = async () => {
      if (disposed || checking || document.visibilityState !== "visible") return;
      checking = true;

      const { data, error } = await supabase
        .from("organizations")
        .select("updated_at")
        .eq("id", organizationId)
        .single();

      checking = false;
      if (
        !disposed &&
        !error &&
        data.updated_at !== lastOrganizationUpdate.current
      ) {
        scheduleRefresh(data.updated_at);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdates();
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
      channel = supabase
        .channel(`member-sync:${organizationId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "organizations",
            filter: `id=eq.${organizationId}`,
          },
          (payload) => {
            scheduleRefresh(
              (payload.new as { updated_at?: string }).updated_at,
            );
          },
        )
        .subscribe();
    };

    void startRealtime();
    const pollingInterval = window.setInterval(() => {
      void checkForUpdates();
    }, 5_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.clearInterval(pollingInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return null;
}
