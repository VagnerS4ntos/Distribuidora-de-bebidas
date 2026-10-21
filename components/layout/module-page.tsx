import Link from "next/link";
import { ArrowUpRight, Construction, Plus } from "lucide-react";

type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  stats: Array<{ label: string; value: string; detail: string }>;
  items: Array<{ label: string; description: string; href: string }>;
};

export function ModulePage({ eyebrow, title, description, actionLabel, stats, items }: ModulePageProps) {
  return (
    <>
      <section className="page-heading">
        <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        <button className="button button-primary"><Plus size={17} />{actionLabel}</button>
      </section>
      <section className="module-stat-grid">
        {stats.map((stat) => <article className="module-stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.detail}</small></article>)}
      </section>
      <section className="module-layout">
        <article className="panel module-placeholder">
          <span className="construction-icon"><Construction size={23} /></span>
          <h2>Módulo pronto para integrar</h2>
          <p>Este espaço já está separado no projeto. Ao configurar o Supabase, conecte as ações e listagens à tabela correspondente do seu esquema.</p>
          <div className="implementation-note">A segurança por organização e papéis já está prevista no SQL com RLS.</div>
        </article>
        <article className="panel module-links">
          <div className="panel-head"><div><span className="panel-kicker">Fluxos relacionados</span><h2>Próximos passos</h2></div></div>
          <ul>
            {items.map((item) => <li key={item.label}><Link href={item.href}><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={17} /></Link></li>)}
          </ul>
        </article>
      </section>
    </>
  );
}
