"use server";

import { refresh, revalidatePath } from "next/cache";
import type { OrganizationRole } from "@/features/auth/current-member";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreateUserState = {
  status?: "success" | "error";
  message?: string;
};

export type DeleteUserResult = {
  success: boolean;
  message: string;
};

export type UpdateUserInput = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  role: OrganizationRole;
};

export type UpdateUserResult = {
  success: boolean;
  message: string;
  member?: {
    fullName: string;
    email: string;
    phone: string | null;
    role: OrganizationRole;
  };
};

const allowedRoles = new Set<OrganizationRole>([
  "owner",
  "manager",
  "operator",
]);

async function notifyTeamChanged(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { error } = await admin
    .from("organizations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  if (error) {
    console.error("Não foi possível publicar a atualização da equipe.", error);
  }
}

export async function createOrganizationUser(
  _previousState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const supabase = await createClient();
  const {
    data: { user: currentUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !currentUser) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", currentUser.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      status: "error",
      message: "Somente usuários com perfil owner podem criar contas.",
    };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "operator") as OrganizationRole;

  if (fullName.length < 2) {
    return { status: "error", message: "Informe o nome completo do usuário." };
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { status: "error", message: "Informe um e-mail válido." };
  }

  if (password.length < 8) {
    return {
      status: "error",
      message: "A senha temporária deve ter pelo menos 8 caracteres.",
    };
  }

  if (!allowedRoles.has(role)) {
    return {
      status: "error",
      message: "Selecione um perfil de acesso válido.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      status: "error",
      message:
        "Configure SUPABASE_SECRET_KEY no .env.local e reinicie o servidor.",
    };
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: fullName, full_name: fullName },
    });

  if (createError || !created.user) {
    const alreadyExists =
      createError?.code === "email_exists" ||
      createError?.message.toLowerCase().includes("already") ||
      createError?.message.toLowerCase().includes("registered");

    return {
      status: "error",
      message: alreadyExists
        ? "Já existe um usuário com esse e-mail."
        : "Não foi possível criar o usuário.",
    };
  }

  const createdUserId = created.user.id;
  const { data: savedProfile, error: profileError } = await admin
    .from("profiles")
    .upsert(
      { id: createdUserId, full_name: fullName, phone: phone || null },
      { onConflict: "id" },
    )
    .select("id, full_name")
    .single();

  const nameWasSaved = savedProfile?.full_name.trim() === fullName;

  const { error: memberError } =
    profileError || !nameWasSaved
      ? { error: profileError ?? new Error("O nome não foi salvo no perfil.") }
      : await admin.from("organization_members").insert({
          organization_id: membership.organization_id,
          user_id: createdUserId,
          role,
        });

  if (profileError || !nameWasSaved || memberError) {
    await admin.auth.admin.deleteUser(createdUserId);
    return {
      status: "error",
      message: "A conta não pôde ser vinculada à organização e foi desfeita.",
    };
  }

  await notifyTeamChanged(admin, membership.organization_id);

  revalidatePath("/equipe");
  refresh();
  return {
    status: "success",
    message: `${fullName} já pode entrar com a senha temporária.`,
  };
}

export async function deleteOrganizationUser(
  targetUserId: string,
): Promise<DeleteUserResult> {
  const supabase = await createClient();
  const {
    data: { user: currentUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !currentUser) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  if (targetUserId === currentUser.id) {
    return {
      success: false,
      message: "Você não pode excluir a própria conta.",
    };
  }

  const { data: ownerMembership, error: ownerError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", currentUser.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (ownerError || !ownerMembership) {
    return {
      success: false,
      message: "Somente um owner pode excluir membros da organização.",
    };
  }

  const { data: targetMembership, error: targetError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", ownerMembership.organization_id)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetError || !targetMembership) {
    return {
      success: false,
      message: "O membro não foi encontrado nesta organização.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      success: false,
      message:
        "Configure SUPABASE_SECRET_KEY no .env.local e reinicie o servidor.",
    };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(
    targetMembership.user_id,
    false,
  );

  if (deleteError) {
    const ownsStorageObjects = deleteError.message
      .toLowerCase()
      .includes("storage");

    return {
      success: false,
      message: ownsStorageObjects
        ? "Esse usuário possui arquivos no Storage. Remova ou transfira esses arquivos antes de excluir a conta."
        : "Não foi possível excluir a conta.",
    };
  }

  await notifyTeamChanged(admin, ownerMembership.organization_id);

  revalidatePath("/equipe");
  return {
    success: true,
    message: "Usuário excluído com sucesso.",
  };
}

export async function updateOrganizationUser(
  input: UpdateUserInput,
): Promise<UpdateUserResult> {
  const supabase = await createClient();
  const {
    data: { user: currentUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !currentUser) {
    return { success: false, message: "Sua sessão expirou. Entre novamente." };
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (fullName.length < 2 || fullName.length > 120) {
    return { success: false, message: "Informe um nome válido." };
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { success: false, message: "Informe um e-mail válido." };
  }

  if (!allowedRoles.has(input.role)) {
    return { success: false, message: "Selecione um perfil de acesso válido." };
  }

  const { data: ownerMembership, error: ownerError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", currentUser.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (ownerError || !ownerMembership) {
    return {
      success: false,
      message: "Somente um owner pode atualizar membros da organização.",
    };
  }

  const { data: targetMembership, error: targetError } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", ownerMembership.organization_id)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (targetError || !targetMembership) {
    return {
      success: false,
      message: "O membro não foi encontrado nesta organização.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      success: false,
      message:
        "Configure SUPABASE_SECRET_KEY no .env.local e reinicie o servidor.",
    };
  }

  const [
    { data: authData, error: authReadError },
    { data: profile, error: profileReadError },
  ] = await Promise.all([
    admin.auth.admin.getUserById(input.userId),
    admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", input.userId)
      .single(),
  ]);

  if (authReadError || !authData.user || profileReadError || !profile) {
    return {
      success: false,
      message: "Não foi possível carregar os dados atuais.",
    };
  }

  const originalEmail = authData.user.email ?? "";
  const originalMetadata = authData.user.user_metadata ?? {};
  const originalRole = targetMembership.role as OrganizationRole;
  const nextRole = input.role;

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(
    input.userId,
    {
      email,
      user_metadata: {
        ...originalMetadata,
        display_name: fullName,
        full_name: fullName,
      },
    },
  );

  if (authUpdateError) {
    const duplicateEmail = authUpdateError.message
      .toLowerCase()
      .includes("email");
    return {
      success: false,
      message: duplicateEmail
        ? "Esse e-mail já está em uso ou não pode ser atualizado."
        : "Não foi possível atualizar o usuário.",
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", input.userId);

  const { error: roleError } =
    profileError || nextRole === originalRole
      ? { error: profileError }
      : await admin
          .from("organization_members")
          .update({ role: nextRole })
          .eq("organization_id", ownerMembership.organization_id)
          .eq("user_id", input.userId);

  if (profileError || roleError) {
    await Promise.all([
      admin.auth.admin.updateUserById(input.userId, {
        email: originalEmail,
        user_metadata: originalMetadata,
      }),
      admin
        .from("profiles")
        .update({ full_name: profile.full_name, phone: profile.phone })
        .eq("id", input.userId),
      admin
        .from("organization_members")
        .update({ role: originalRole })
        .eq("organization_id", ownerMembership.organization_id)
        .eq("user_id", input.userId),
    ]);

    return {
      success: false,
      message:
        "A atualização não foi concluída e os dados anteriores foram restaurados.",
    };
  }

  await notifyTeamChanged(admin, ownerMembership.organization_id);

  revalidatePath("/equipe");
  refresh();
  return {
    success: true,
    message: "Informações atualizadas com sucesso.",
    member: {
      fullName,
      email,
      phone: phone || null,
      role: nextRole,
    },
  };
}
