# Brava — gestão de distribuidora de bebidas

Base em **Next.js 16.4.2**, TypeScript e Supabase para controlar vendas, produtos, estoque, compras e financeiro de uma distribuidora.

## Executar localmente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha a URL, a chave publicável e a chave secreta do Supabase.
3. No SQL Editor do Supabase, execute o conteúdo de [`SQL Editor.txt`](./SQL%20Editor.txt).
4. Em projetos que já receberam o esquema inicial, execute também as migrations pendentes de [`supabase/migrations`](./supabase/migrations), em ordem cronológica.
5. Inicie com `npm run dev` e abra `http://localhost:3000`.

Sem o Supabase configurado, o painel abre com dados de demonstração. Com as variáveis configuradas e um usuário vinculado a uma organização, ele passa a consultar as tabelas `sales`, `products`, `inventory_balances` e `financial_entries`.

## Estrutura

- `app/`: rotas do App Router, organizadas por autenticação e painel.
- `components/`: elementos reutilizáveis de interface e layout.
- `features/`: regras de leitura e domínio por área do negócio.
- `lib/supabase/`: clientes do Supabase para browser e servidor.
- `supabase/`: reservado para migrations e testes do banco.
- `types/`: tipos compartilhados do domínio.

O arquivo `SQL Editor.txt` é a fonte de verdade inicial do banco; ele já inclui RLS e os módulos de estoque, caixa, compras, vendas, financeiro, retornáveis e auditoria.

O módulo **Equipe** é exibido somente para membros com papel `owner`. A migration `20261021213237_owner_manage_profiles.sql` permite que membros da mesma organização apareçam com nome e telefone, sem expor perfis de outras organizações.

## Criação de usuários

Qualquer usuário autenticado com papel `owner` pode criar contas pela página **Equipe**. A criação usa `SUPABASE_SECRET_KEY` exclusivamente no servidor, cadastra o usuário no Supabase Auth e o vincula à organização atual.

Ao excluir um membro, a operação também acontece no servidor e remove permanentemente a conta do Supabase Auth. As chaves estrangeiras com `on delete cascade` removem o registro correspondente de `profiles` e o vínculo em `organization_members`.

Owners também podem editar nome, e-mail, telefone e papel dos membros, inclusive os próprios dados e papel. Ao rebaixar o próprio acesso, o usuário deixa de acessar a administração da equipe. A exclusão da própria conta continua bloqueada.

Para impedir cadastros fora desse fluxo, desative **Allow new users to sign up** nas configurações de Auth do projeto Supabase. A criação administrativa continuará funcionando.
