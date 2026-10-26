"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Pencil, Save, Search, SearchX, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import type { OrganizationRole } from "@/features/auth/current-member";
import type { TeamMember } from "@/features/team/team-service";
import { deleteOrganizationUser, updateOrganizationUser } from "./actions";

const roleLabels: Record<OrganizationRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  operator: "Operador",
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function TeamManager({
  initialMembers,
  currentUserId,
  editingUserId,
  canManage,
}: {
  initialMembers: TeamMember[];
  currentUserId: string;
  editingUserId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirmDialog();
  const members = initialMembers;
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filteredMembers = useMemo(() => {
    const query = normalizeSearch(debouncedSearch);
    if (!query) return members;

    return members.filter((member) =>
      [member.fullName, member.email, member.phone ?? ""]
        .some((value) => normalizeSearch(value).includes(query)),
    );
  }, [debouncedSearch, members]);

  function openEditor(userId: string) {
    router.replace(`/equipe?editar=${encodeURIComponent(userId)}`, { scroll: false });
  }

  function closeEditor() {
    router.replace("/equipe", { scroll: false });
  }

  async function changeRole(member: TeamMember, role: OrganizationRole) {
    if (member.userId === currentUserId && role !== "owner") {
      const confirmed = await confirm({
        title: "Alterar seu próprio acesso?",
        description: "Ao continuar, você perderá o acesso à administração da equipe. Um proprietário precisará restaurar essa permissão depois.",
        confirmLabel: "Alterar perfil",
        tone: "warning",
      });

      if (!confirmed) return;
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
    const confirmed = await confirm({
      title: "Excluir este membro?",
      description: <><strong>{member.fullName}</strong> será removido do Supabase Auth, do perfil e da organização. Esta ação não pode ser desfeita.</>,
      confirmLabel: "Excluir conta",
      tone: "danger",
    });

    if (!confirmed) return;

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

    if (member.userId === currentUserId && selectedRole !== "owner") {
      const confirmed = await confirm({
        title: "Alterar seu próprio acesso?",
        description: "Ao continuar, você perderá o acesso à administração da equipe. Um proprietário precisará restaurar essa permissão depois.",
        confirmLabel: "Salvar e alterar perfil",
        tone: "warning",
      });

      if (!confirmed) return;
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
      {confirmDialog}
      {busyMessage && <div className="team-feedback team-feedback-loading" role="status" aria-live="polite"><LoaderCircle className="feedback-spinner" size={15} />{busyMessage}</div>}
      {!busyMessage && feedback && <div className={`team-feedback team-feedback-${feedback.tone}`} role="status">{feedback.tone === "success" && <Check size={15} />}{feedback.message}</div>}

      <div className="team-search-bar">
        <label className="team-search-field">
          <span>Buscar membro</span>
          <div className="team-search-control">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, e-mail ou telefone"
              autoComplete="off"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" title="Limpar busca">
                <X size={16} />
              </button>
            )}
          </div>
        </label>
        <span className="team-search-count" role="status" aria-live="polite">
          {filteredMembers.length === members.length
            ? `${members.length} membro(s)`
            : `${filteredMembers.length} de ${members.length} membro(s)`}
        </span>
      </div>

      <div className="data-table-wrap" aria-busy={busyUserId !== null}>
        <table className="data-table team-table">
          <thead><tr><th>Membro</th><th>E-mail</th><th>Telefone</th><th>Identificador</th><th>Perfil de acesso</th>{canManage && <th className="align-right">Ações</th>}</tr></thead>
          <tbody>
            {filteredMembers.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isEditing = editingUserId === member.userId;
              const initials = member.fullName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

              if (canManage && isEditing) {
                const formId = `edit-member-${member.userId}`;
                return (
                  <tr key={`${member.userId}:${member.fullName}:${member.email}:${member.phone ?? ""}:${member.role}`} className="team-edit-row">
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
                  <td>{canManage ? <div className="role-control"><select className="role-select" value={member.role} disabled={busyUserId !== null} onChange={(event) => changeRole(member, event.target.value as OrganizationRole)} aria-label={`Perfil de ${member.fullName}`}><option value="owner">{roleLabels.owner}</option><option value="manager">{roleLabels.manager}</option><option value="operator">{roleLabels.operator}</option></select>{busyUserId === member.userId && busyMessage === "Atualizando perfil de acesso..." && <LoaderCircle className="feedback-spinner role-spinner" size={15} aria-label="Atualizando perfil" />}</div> : <span className="access-level is-readonly">{roleLabels[member.role]}</span>}</td>
                  {canManage && <td className="align-right"><div className="team-actions"><button className="icon-button edit-button" type="button" disabled={busyUserId !== null} onClick={() => openEditor(member.userId)} aria-label={`Editar ${member.fullName}`} title="Editar informações"><Pencil size={16} /></button><button className="icon-button danger-button" type="button" disabled={isSelf || busyUserId !== null} onClick={() => removeMember(member)} aria-label={`Remover ${member.fullName}`} title={isSelf ? "Seu próprio acesso não pode ser removido" : "Remover membro"}><Trash2 size={16} /></button></div></td>}
                </tr>
              );
            })}
            {filteredMembers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5}>
                  <div className="team-search-empty">
                    <SearchX size={22} />
                    <strong>Nenhum membro encontrado</strong>
                    <span>Tente buscar por outro nome, e-mail ou telefone.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
