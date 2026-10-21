"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, KeyRound, UserPlus } from "lucide-react";
import {
  createOrganizationUser,
  type CreateUserState,
} from "./actions";

const initialState: CreateUserState = {};

export function CreateUserForm({ adminConfigured }: { adminConfigured: boolean }) {
  const [state, formAction, isPending] = useActionState(
    createOrganizationUser,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="create-user-form">
      <div className="team-invite-copy create-user-copy">
        <span className="team-invite-icon"><UserPlus size={20} /></span>
        <div>
          <strong>Criar usuário</strong>
          <small>A conta será criada no Supabase Auth e vinculada à sua organização.</small>
        </div>
      </div>

      <div className="create-user-fields">
        <label><span>Nome completo <b className="required-mark" aria-hidden="true">*</b></span><input name="full_name" autoComplete="name" required aria-required="true" minLength={2} maxLength={120} /></label>
        <label><span>E-mail</span><input name="email" type="email" autoComplete="email" required /></label>
        <label><span>Telefone</span><input name="phone" type="tel" autoComplete="tel" placeholder="Opcional" /></label>
        <label><span>Perfil</span><select name="role" defaultValue="operator"><option value="operator">Operador</option><option value="manager">Gerente</option><option value="owner">Proprietário</option></select></label>
        <label className="password-field"><span>Senha temporária</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button className="button button-primary" disabled={isPending || !adminConfigured}><KeyRound size={16} />{isPending ? "Criando..." : "Criar acesso"}</button>
      </div>

      {!adminConfigured && (
        <div className="team-feedback team-feedback-error create-user-feedback" role="alert">
          Configure <code>SUPABASE_SECRET_KEY</code> no <code>.env.local</code> para habilitar a criação no Auth.
        </div>
      )}
      {state.message && (
        <div className={`team-feedback team-feedback-${state.status} create-user-feedback`} role={state.status === "error" ? "alert" : "status"}>
          {state.status === "success" && <Check size={15} />}{state.message}
        </div>
      )}
    </form>
  );
}
