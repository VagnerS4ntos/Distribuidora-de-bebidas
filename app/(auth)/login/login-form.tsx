"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="login-form">
      <label>
        E-mail
        <input
          name="email"
          type="email"
          placeholder="voce@empresa.com"
          autoComplete="email"
          required
        />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button-primary button-full" disabled={isPending}>
        {isPending ? "Entrando..." : "Entrar"}
      </button>
      <small className="auth-hint">
        Use um usuário cadastrado no Supabase Auth e vinculado à organização.
      </small>
    </form>
  );
}
