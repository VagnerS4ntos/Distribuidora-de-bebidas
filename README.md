# Brava — gestão de distribuidora de bebidas

Base em **Next.js 16.4.2**, TypeScript e Supabase para controlar vendas, produtos, estoque, compras e financeiro de uma distribuidora.

## Executar localmente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha a URL e a chave publicável do Supabase.
3. No SQL Editor do Supabase, execute o conteúdo de [`SQL Editor.txt`](./SQL%20Editor.txt).
4. Inicie com `npm run dev` e abra `http://localhost:3000`.

Sem o Supabase configurado, o painel abre com dados de demonstração. Com as variáveis configuradas e um usuário vinculado a uma organização, ele passa a consultar as tabelas `sales`, `products`, `inventory_balances` e `financial_entries`.

## Estrutura

- `app/`: rotas do App Router, organizadas por autenticação e painel.
- `components/`: elementos reutilizáveis de interface e layout.
- `features/`: regras de leitura e domínio por área do negócio.
- `lib/supabase/`: clientes do Supabase para browser e servidor.
- `supabase/`: reservado para migrations e testes do banco.
- `types/`: tipos compartilhados do domínio.

O arquivo `SQL Editor.txt` é a fonte de verdade inicial do banco; ele já inclui RLS e os módulos de estoque, caixa, compras, vendas, financeiro, retornáveis e auditoria.
