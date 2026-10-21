import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type OrganizationRole = "owner" | "manager" | "operator";

export type CurrentMember = {
  userId: string;
  organizationId: string;
  organizationName: string;
  fullName: string;
  role: OrganizationRole;
};

export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) return null;

  const [{ data: membership, error: membershipError }, { data: profile }] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("organization_id, role, organizations(name)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (membershipError || !membership) return null;

  return {
    userId,
    organizationId: membership.organization_id,
    organizationName:
      (membership.organizations as { name?: string } | null)?.name ?? "Minha organização",
    fullName: profile?.full_name || "Gestor",
    role: membership.role as OrganizationRole,
  };
});
