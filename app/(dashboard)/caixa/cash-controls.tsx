"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleAlert,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Wallet,
} from "lucide-react";
import type {
  CashLocationOption,
  CashRegisterOption,
  ManualCashMovementType,
  OpenCashSession,
} from "@/features/cash/cash-types";
import { formatCurrency } from "@/lib/utils/format";
import {
  closeCashSession,
  createCashRegister,
  openCashSession,
  recordCashMovement,
} from "./actions";

function moneyValue(value: FormDataEntryValue | null) {
  return Number(String(value ?? "").replace(",", "."));
}

function Feedback({ message, success }: { message: string; success: boolean }) {
  return (
    <div
      className={`sale-feedback ${success ? "sale-feedback-success" : "sale-feedback-error"}`}
      role={success ? "status" : "alert"}
    >
      {success ? <Check size={16} /> : <CircleAlert size={16} />}
      {message}
    </div>
  );
}

function CreateRegisterForm({ locations }: { locations: CashLocationOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    try {
      const result = await createCashRegister({
        name: String(formData.get("name") ?? ""),
        locationId: String(formData.get("locationId") ?? ""),
      });
      setFeedback({ message: result.message, success: result.success });
      if (result.success) {
        form.reset();
        router.refresh();
      }
    } catch {
      setFeedback({ message: "Não foi possível criar o caixa. Tente novamente.", success: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cash-card-form" onSubmit={submit} aria-busy={busy}>
      <div className="cash-form-title">
        <span className="sale-form-icon"><Landmark size={20} /></span>
        <div><span className="panel-kicker">Configuração</span><h2>Novo caixa</h2></div>
      </div>
      {feedback && <Feedback {...feedback} />}
      <div className="cash-form-fields">
        <label>
          <span>Nome <span className="required-mark">*</span></span>
          <input name="name" type="text" minLength={2} maxLength={80} placeholder="Ex.: Caixa principal" required disabled={busy} />
        </label>
        <label>
          Local de estoque
          <select name="locationId" defaultValue="" disabled={busy}>
            <option value="">Sem local vinculado</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
      </div>
      <button className="button button-secondary cash-form-submit" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="feedback-spinner" size={16} /> : <Plus size={16} />}
        {busy ? "Criando..." : "Criar caixa"}
      </button>
    </form>
  );
}

function OpenRegisterForm({ registers }: { registers: CashRegisterOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await openCashSession({
        cashRegisterId: String(formData.get("cashRegisterId") ?? ""),
        openingBalance: moneyValue(formData.get("openingBalance")),
      });
      if (!result.success) {
        setFeedback({ message: result.message, success: false });
        return;
      }
      router.replace("/caixa?sucesso=aberto", { scroll: false });
      router.refresh();
    } catch {
      setFeedback({ message: "Não foi possível abrir o caixa. Tente novamente.", success: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cash-card-form cash-open-form" onSubmit={submit} aria-busy={busy}>
      <div className="cash-form-title">
        <span className="sale-form-icon"><Wallet size={20} /></span>
        <div><span className="panel-kicker">Início do expediente</span><h2>Abrir caixa</h2></div>
      </div>
      {feedback && <Feedback {...feedback} />}
      <div className="cash-form-fields">
        <label>
          <span>Caixa <span className="required-mark">*</span></span>
          <select name="cashRegisterId" defaultValue={registers[0]?.id} required disabled={busy}>
            {registers.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name}{register.locationName ? ` · ${register.locationName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Saldo inicial <span className="required-mark">*</span></span>
          <input name="openingBalance" type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" defaultValue="0.00" required disabled={busy} />
        </label>
      </div>
      <button className="button button-primary cash-form-submit" type="submit" disabled={busy || !registers.length}>
        {busy ? <LoaderCircle className="feedback-spinner" size={16} /> : <Wallet size={16} />}
        {busy ? "Abrindo..." : "Abrir caixa"}
      </button>
    </form>
  );
}

function MovementForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [movementType, setMovementType] = useState<ManualCashMovementType>("cash_in");
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    try {
      const result = await recordCashMovement({
        cashSessionId: sessionId,
        movementType,
        amount: moneyValue(formData.get("amount")),
        description: String(formData.get("description") ?? ""),
      });
      setFeedback({ message: result.message, success: result.success });
      if (result.success) {
        form.reset();
        setMovementType("cash_in");
        router.refresh();
      }
    } catch {
      setFeedback({ message: "Não foi possível registrar a movimentação.", success: false });
    } finally {
      setBusy(false);
    }
  }

  const isInflow = movementType === "cash_in" || movementType === "deposit";
  return (
    <form className="cash-card-form" onSubmit={submit} aria-busy={busy}>
      <div className="cash-form-title">
        <span className={`cash-direction-icon ${isInflow ? "is-in" : "is-out"}`}>
          {isInflow ? <ArrowDownToLine size={19} /> : <ArrowUpFromLine size={19} />}
        </span>
        <div><span className="panel-kicker">Movimentação avulsa</span><h2>Entrada ou saída</h2></div>
      </div>
      {feedback && <Feedback {...feedback} />}
      <div className="cash-form-fields cash-movement-fields">
        <label>
          <span>Tipo <span className="required-mark">*</span></span>
          <select value={movementType} onChange={(event) => setMovementType(event.target.value as ManualCashMovementType)} disabled={busy}>
            <option value="cash_in">Entrada avulsa</option>
            <option value="deposit">Suprimento</option>
            <option value="cash_out">Saída avulsa</option>
            <option value="withdrawal">Sangria</option>
          </select>
        </label>
        <label>
          <span>Valor <span className="required-mark">*</span></span>
          <input name="amount" type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" placeholder="0,00" required disabled={busy} />
        </label>
        <label className="cash-description-field">
          <span>Descrição <span className="required-mark">*</span></span>
          <input name="description" type="text" minLength={2} maxLength={200} placeholder="Motivo da movimentação" required disabled={busy} />
        </label>
      </div>
      <button className={`button ${isInflow ? "button-primary" : "button-secondary"} cash-form-submit`} type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="feedback-spinner" size={16} /> : <Check size={16} />}
        {busy ? "Registrando..." : "Registrar movimentação"}
      </button>
    </form>
  );
}

function CloseRegisterForm({ session }: { session: OpenCashSession }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [countedOverride, setCountedOverride] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const countedValue = countedOverride ?? session.expectedBalance.toFixed(2);
  const countedBalance = Number(countedValue.replace(",", "."));
  const difference = useMemo(
    () => (Number.isFinite(countedBalance) ? countedBalance - session.expectedBalance : 0),
    [countedBalance, session.expectedBalance],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await closeCashSession({
        cashSessionId: session.id,
        countedBalance,
        notes: String(formData.get("notes") ?? ""),
      });
      if (!result.success) {
        setFeedback({ message: result.message, success: false });
        return;
      }
      const query = new URLSearchParams({ sucesso: "fechado" });
      query.set("diferenca", String(result.difference ?? 0));
      router.replace(`/caixa?${query.toString()}`, { scroll: false });
      router.refresh();
    } catch {
      setFeedback({ message: "Não foi possível fechar o caixa. Tente novamente.", success: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cash-card-form cash-close-form" onSubmit={submit} aria-busy={busy}>
      <div className="cash-form-title">
        <span className="cash-direction-icon is-neutral"><LockKeyhole size={19} /></span>
        <div><span className="panel-kicker">Conferência</span><h2>Fechamento diário</h2></div>
      </div>
      {feedback && <Feedback {...feedback} />}
      <div className="cash-closing-summary">
        <span>Saldo esperado <strong>{formatCurrency(session.expectedBalance)}</strong></span>
        <span className={difference === 0 ? "is-balanced" : difference > 0 ? "is-surplus" : "is-shortage"}>
          Diferença <strong>{formatCurrency(difference)}</strong>
        </span>
      </div>
      <div className="cash-form-fields cash-close-fields">
        <label>
          <span>Saldo contado <span className="required-mark">*</span></span>
          <input value={countedValue} onChange={(event) => setCountedOverride(event.target.value)} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required disabled={busy} />
        </label>
        <label>
          Observações
          <textarea name="notes" maxLength={1000} rows={3} placeholder="Justifique diferenças ou registre informações do turno" disabled={busy} />
        </label>
      </div>
      {difference !== 0 && (
        <div className="cash-difference-warning" role="status">
          <CircleAlert size={15} />
          O valor contado apresenta {difference > 0 ? "sobra" : "falta"} de {formatCurrency(Math.abs(difference))}.
        </div>
      )}
      <button className="button button-primary cash-form-submit" type="submit" disabled={busy || !Number.isFinite(countedBalance)}>
        {busy ? <LoaderCircle className="feedback-spinner" size={16} /> : <LockKeyhole size={16} />}
        {busy ? "Fechando..." : "Fechar caixa"}
      </button>
    </form>
  );
}

export function CashControls({
  openSession: session,
  registers,
  locations,
  canManageRegisters,
}: {
  openSession: OpenCashSession | null;
  registers: CashRegisterOption[];
  locations: CashLocationOption[];
  canManageRegisters: boolean;
}) {
  if (session) {
    return (
      <section className="cash-action-grid">
        <article className="panel"><MovementForm sessionId={session.id} /></article>
        <article className="panel"><CloseRegisterForm session={session} /></article>
      </section>
    );
  }

  return (
    <section className={`cash-action-grid ${!canManageRegisters ? "cash-action-grid-single" : ""}`}>
      {registers.length ? (
        <article className="panel"><OpenRegisterForm registers={registers} /></article>
      ) : (
        <article className="panel cash-unavailable-card">
          <CircleAlert size={22} />
          <div><h2>Nenhum caixa cadastrado</h2><p>{canManageRegisters ? "Crie o primeiro caixa para iniciar o controle diário." : "Solicite a um proprietário ou gerente que cadastre um caixa."}</p></div>
        </article>
      )}
      {canManageRegisters && <article className="panel"><CreateRegisterForm locations={locations} /></article>}
    </section>
  );
}
