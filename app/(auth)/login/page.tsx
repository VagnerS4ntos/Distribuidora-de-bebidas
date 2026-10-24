import Link from "next/link";
import { ArrowLeft, GlassWater, LockKeyhole } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-brand"><span><GlassWater size={22} /></span><strong>Santo Gole</strong></div>
        <div><span className="eyebrow">Gestão que acompanha o seu ritmo</span><h1>Mais controle, menos improviso.</h1><p>Vendas, estoque, compras e financeiro integrados para a sua distribuidora de bebidas.</p></div>
        <div className="auth-feature"><LockKeyhole size={17} /> Seus dados são isolados por organização e protegidos por regras de acesso.</div>
      </section>
      <section className="auth-card-wrap">
        <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Voltar ao painel</Link>
        <div className="auth-card">
          <span className="eyebrow">Acesso</span><h2>Entre na sua conta</h2><p>Acesse os dados da sua organização com segurança.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
