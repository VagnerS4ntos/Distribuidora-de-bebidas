"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Pencil, Save, Trash2, X } from "lucide-react";
import type { OrganizationRole } from "@/features/auth/current-member";
import type { TeamMember } from "@/features/team/team-service";
import { deleteOrganizationUser, updateOrganizationUser } from "./actions";

const roleLabels: Record<OrganizationRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  operator: "Operador",
};

export function TeamManager({ initialMembers, currentUserId, editingUserId }: { initialMembers: TeamMember[]; currentUserId: string; editingUserId: string | null }) {
  const router = useRouter();
  const members = initialMembers;
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  function openEditor(userId: string) {
    router.replace(`/equipe?editar=${encodeURIComponent(userId)}`, { scroll: false });
  }

  function closeEditor() {
    router.replace("/equipe", { scroll: false });
  }

  async function changeRole(member: TeamMember, role: OrganizationRole) {
    if (
      member.userId === currentUserId &&
      role !== "owner" &&
      !window.confirm("Ao alterar seu próprio perfil, você perderá o acesso à administração da equipe. Deseja continuar?")
    ) {
      return;
    }

    setBusyUserId(member.userId);
    setBusyMessage("Atualizando perfil de acesso...");
    setFeedback(null);

    try {
      const result = await updateOrganizationUser({
        userId: member.userId,
        fullName: member.fullName,
        email: member.email,
        phone: member.phone ?? "",
        role,
      });

      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) router.refresh();
    } catch {
      setFeedback({ tone: "error", message: "Não foi possível alterar o perfil." });
    } finally {
      setBusyUserId(null);
      setBusyMessage(null);
    }
  }

  async function removeMember(member: TeamMember) {
    if (member.userId === currentUserId) return;
    if (!window.confirm(`Excluir permanentemente a conta de ${member.fullName} do Supabase Auth e da organização?`)) return;

    setBusyUserId(member.userId);
    setBusyMessage("Excluindo usuário...");
    setFeedback(null);

    try {
      const result = await deleteOrganizationUser(member.userId);

      if (!result.success) {
        setFeedback({ tone: "error", message: result.message });
      } else {
        setFeedback({ tone: "success", message: result.message });
        router.refresh();
      }
    } catch {
      setFeedback({ tone: "error", message: "Não foi possível excluir o usuário." });
    } finally {
      setBusyUserId(null);
      setBusyMessage(null);
    }
  }

  async function updateMember(
    event: FormEvent<HTMLFormElement>,
    member: TeamMember,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selectedRole = String(
      formData.get("role") ?? member.role,
    ) as OrganizationRole;

    if (
      member.userId === currentUserId &&
      selectedRole !== "owner" &&
      !window.confirm("Ao alterar seu próprio perfil, você perderá o acesso à administração da equipe. Deseja continuar?")
    ) {
      return;
    }

    setBusyUserId(member.userId);
    setBusyMessage("Salvando alterações...");
    setFeedback(null);

    try {
      const result = await updateOrganizationUser({
        userId: member.userId,
        fullName: String(formData.get("full_name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        role: selectedRole,
      });

      if (!result.success || !result.member) {
        setFeedback({ tone: "error", message: result.message });
        return;
      }

      setFeedback({ tone: "success", message: result.message });
      closeEditor();
    } catch {
      setFeedback({ tone: "error", message: "Não foi possível concluir a atualização." });
    } finally {
      setBusyUserId(null);
      setBusyMessage(null);
    }
  }

  return (
    <>
      {busyMessage && <div className="team-feedback team-feedback-loading" role="status" aria-live="polite"><LoaderCircle className="feedback-spinner" size={15} />{busyMessage}</div>}
      {!busyMessage && feedback && <div className={`team-feedback team-feedback-${feedback.tone}`} role="status">{feedback.tone === "success" && <Check size={15} />}{feedback.message}</div>}

      <div className="data-table-wrap" aria-busy={busyUserId !== null}>
        <table className="data-table team-table">
          <thead><tr><th>Membro</th><th>E-mail</th><th>Telefone</th><th>Identificador</th><th>Perfil de acesso</th><th className="align-right">Ações</th></tr></thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isEditing = editingUserId === member.userId;
              const initials = member.fullName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

              if (isEditing) {
                const formId = `edit-member-${member.userId}`;
                return (
                  <tr key={member.userId} className="team-edit-row">
                    <td><form id={formId} onSubmit={(event) => updateMember(event, member)}><input className="team-edit-input" name="full_name" defaultValue={member.fullName} aria-label="Nome completo" required minLength={2} maxLength={120} disabled={busyUserId !== null} /></form></td>
                    <td><input className="team-edit-input team-email-input" form={formId} name="email" type="email" defaultValue={member.email} aria-label="E-mail" required disabled={busyUserId !== null} /></td>
                    <td><input className="team-edit-input" form={formId} name="phone" type="tel" defaultValue={member.phone ?? ""} aria-label="Telefone" placeholder="Não informado" disabled={busyUserId !== null} /></td>
                    <td><code className="member-id">{member.userId.slice(0, 8)}…</code></td>
                    <td>
                      <select className="role-select" form={formId} name="role" defaultValue={member.role} disabled={busyUserId !== null} aria-label={`Perfil de ${member.fullName}`}><option value="owner">{roleLabels.owner}</option><option value="manager">{roleLabels.manager}</option><option value="operator">{roleLabels.operator}</option></select>
                    </td>
                    <td className="align-right"><div className="team-actions"><button className="icon-button save-button" type="submit" form={formId} disabled={busyUserId !== null} aria-label={`Salvar alterações de ${member.fullName}`} title="Salvar">{busyUserId === member.userId ? <LoaderCircle className="feedback-spinner" size={16} /> : <Save size={16} />}</button><button className="icon-button" type="button" disabled={busyUserId !== null} onClick={closeEditor} aria-label="Cancelar edição" title="Cancelar"><X size={16} /></button></div></td>
                  </tr>
                );
              }

              return (
                <tr key={member.userId}>
                  <td><div className="team-person"><span className="avatar team-avatar">{initials || "?"}</span><span><strong>{member.fullName}</strong><small>{isSelf ? "Você" : "Membro da equipe"}</small></span></div></td>
                  <td className="muted-cell">{member.email || "Não informado"}</td>
                  <td className="muted-cell">{member.phone || "Não informado"}</td>
                  <td><code className="member-id">{member.userId.slice(0, 8)}…</code></td>
                  <td><div className="role-control"><select className="role-select" value={member.role} disabled={busyUserId !== null} onChange={(event) => changeRole(member, event.target.value as OrganizationRole)} aria-label={`Perfil de ${member.fullName}`}><option value="owner">{roleLabels.owner}</option><option value="manager">{roleLabels.manager}</option><option value="operator">{roleLabels.operator}</option></select>{busyUserId === member.userId && busyMessage === "Atualizando perfil de acesso..." && <LoaderCircle className="feedback-spinner role-spinner" size={15} aria-label="Atualizando perfil" />}</div></td>
                  <td className="align-right"><div className="team-actions"><button className="icon-button edit-button" type="button" disabled={busyUserId !== null} onClick={() => openEditor(member.userId)} aria-label={`Editar ${member.fullName}`} title="Editar informações"><Pencil size={16} /></button><button className="icon-button danger-button" type="button" disabled={isSelf || busyUserId !== null} onClick={() => removeMember(member)} aria-label={`Remover ${member.fullName}`} title={isSelf ? "Seu próprio acesso não pode ser removido" : "Remover membro"}><Trash2 size={16} /></button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
