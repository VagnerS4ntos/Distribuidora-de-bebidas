import "server-only";

import { getCurrentMember, type OrganizationRole } from "@/features/auth/current-member";
import { hasPermission } from "@/features/auth/permissions";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TeamMember = {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: OrganizationRole;
  createdAt: string;
};

export async function getTeamPageData() {
  const currentMember = await getCurrentMember();
  if (!currentMember || !hasPermission(currentMember.role, "team.view")) return null;

  const supabase = await createClient();
  // O membro autorizado já foi autenticado acima. A leitura fica no servidor
  // e continua limitada aos membros da organização atual.
  const admin = isSupabaseAdminConfigured() ? createAdminClient() : null;
  const teamClient = admin ?? supabase;
  const { data, error } = await teamClient
    .from("organization_members")
    .select("user_id, role, created_at, profiles(full_name, phone)")
    .eq("organization_id", currentMember.organizationId)
    .order("created_at");

  if (error) throw error;

  const authUsers = admin
    ? await Promise.all(
        (data ?? []).map(async (member) => {
          const { data: authData } = await admin.auth.admin.getUserById(
            member.user_id,
          );
          return [member.user_id, authData.user?.email ?? ""] as const;
        }),
      )
    : [];
  const emailByUserId = new Map(authUsers);

  const members: TeamMember[] = (data ?? []).map((member) => ({
    userId: member.user_id,
    fullName:
      (member.profiles as { full_name?: string } | null)?.full_name || "Perfil sem nome",
    email: emailByUserId.get(member.user_id) ?? "",
    phone: (member.profiles as { phone?: string | null } | null)?.phone ?? null,
    role: member.role as OrganizationRole,
    createdAt: member.created_at,
  }));

  return { currentMember, members };
}
