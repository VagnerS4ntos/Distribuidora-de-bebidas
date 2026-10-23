import { redirect } from "next/navigation";
import { ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { TeamManager } from "./team-manager";
import { CreateUserForm } from "./create-user-form";
import { getTeamPageData } from "@/features/team/team-service";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { formatNumber } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string | string[] }>;
}) {
  const data = await getTeamPageData();
  if (!data) redirect("/dashboard");

  const params = await searchParams;
  const requestedEditUserId = Array.isArray(params.editar)
    ? params.editar[0]
    : params.editar;
  const editingUserId = data.members.some(
    (member) => member.userId === requestedEditUserId,
  )
    ? requestedEditUserId ?? null
    : null;

  const managers = data.members.filter((member) => member.role === "manager").length;
  const owners = data.members.filter((member) => member.role === "owner").length;

  return (
    <>
      <section className="page-heading">
        <div><span className="eyebrow">Administração</span><h1>Equipe e acessos</h1><p>Gerencie quem pode operar a {data.currentMember.organizationName} e defina o nível de acesso de cada pessoa.</p></div>
        <span className="owner-only-badge"><ShieldCheck size={16} />Exclusivo para owner</span>
      </section>
      <section className="module-stat-grid">
        <article className="module-stat"><span>Total de membros</span><strong>{formatNumber(data.members.length)}</strong><small>Usuários vinculados à organização</small></article>
        <article className="module-stat"><span>Proprietários</span><strong>{formatNumber(owners)}</strong><small>Acesso administrativo completo</small></article>
        <article className="module-stat"><span>Gerentes</span><strong>{formatNumber(managers)}</strong><small>Gestão da operação</small></article>
      </section>
      <article className="panel team-create-panel">
        <CreateUserForm adminConfigured={isSupabaseAdminConfigured()} />
      </article>
      <article className="panel team-panel">
        <div className="panel-head"><div><span className="panel-kicker">Controle de acesso</span><h2><UserCog size={18} /> Membros da organização</h2></div><span className="table-count"><UsersRound size={14} /> {data.members.length} membro(s)</span></div>
        <TeamManager
          initialMembers={data.members}
          currentUserId={data.currentMember.userId}
          editingUserId={editingUserId}
        />
      </article>
    </>
  );
}
