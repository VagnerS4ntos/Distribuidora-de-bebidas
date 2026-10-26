# Santo Gole — gestão de distribuidora de bebidas

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

O módulo **Equipe** é exibido para membros com papel `owner` ou `manager`. Gerentes possuem acesso somente para consulta; criação de contas, edição de dados e perfis e exclusões continuam exclusivas de proprietários. A migration `20261021213237_owner_manage_profiles.sql` permite que membros da mesma organização apareçam com nome e telefone, sem expor perfis de outras organizações.

## Criação de usuários

Qualquer usuário autenticado com papel `owner` pode criar contas pela página **Equipe**. A criação usa `SUPABASE_SECRET_KEY` exclusivamente no servidor, cadastra o usuário no Supabase Auth e o vincula à organização atual.

Ao excluir um membro, a operação também acontece no servidor e remove permanentemente a conta do Supabase Auth. As chaves estrangeiras com `on delete cascade` removem o registro correspondente de `profiles` e o vínculo em `organization_members`.

Owners também podem editar nome, e-mail, telefone e papel dos membros, inclusive os próprios dados e papel. Ao rebaixar o próprio acesso, o usuário deixa de acessar a administração da equipe. A exclusão da própria conta continua bloqueada.

O layout do painel usa uma única assinatura Realtime filtrada pela organização. Depois de criar, editar ou excluir um membro, outras sessões abertas nessa organização atualizam automaticamente a lista, o nome e o perfil exibidos no cabeçalho e a navegação permitida. Uma consulta leve ao `updated_at`, executada a cada cinco segundos somente enquanto a aba estiver visível, funciona como contingência caso o canal seja interrompido. Para habilitar o fluxo instantâneo, execute a migration `20261021223000_enable_team_realtime.sql` no SQL Editor.

Para impedir cadastros fora desse fluxo, desative **Allow new users to sign up** nas configurações de Auth do projeto Supabase. A criação administrativa continuará funcionando.

## Registro de vendas

Os botões **Nova venda** do cabeçalho e da página de vendas abrem o cadastro completo do pedido. A conclusão registra a venda, os itens, o pagamento, a receita financeira e a auditoria, além de baixar o saldo e criar os movimentos de estoque em uma única transação. Execute a migration `20261022012254_create_completed_sale.sql` no SQL Editor antes de registrar a primeira venda.

As quantidades dos produtos são inteiras. As páginas **Vendas** e **Produtos** também acompanham inserções e alterações de vendas da organização em tempo real, atualizando indicadores, histórico e saldos exibidos. Para ativar esse comportamento, execute também a migration `20261022020929_enforce_integer_sale_quantities_and_enable_sales_realtime.sql`.
