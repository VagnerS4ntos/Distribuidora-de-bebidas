# Migrations do Supabase

O esquema inicial fornecido para este projeto está em `../../SQL Editor.txt`.

Execute-o uma única vez no **SQL Editor** de um projeto novo no Supabase antes de apontar as variáveis de ambiente para ele. Em seguida, registre alterações incrementais nesta pasta em arquivos datados, por exemplo: `202610210001_adiciona_campos_de_entrega.sql`.

Depois do esquema inicial, execute as migrations desta pasta em ordem. A migration
`20261021223000_enable_team_realtime.sql` adiciona somente `public.organizations`
à publicação do Realtime usada pela tela **Equipe**.

A migration `20261022012254_create_completed_sale.sql` cria a operação transacional
usada pelo cadastro de vendas para gravar pedido, itens, pagamento, receita financeira,
auditoria e baixa de estoque de forma atômica.

A migration `20261022020929_enforce_integer_sale_quantities_and_enable_sales_realtime.sql`
exige quantidades inteiras nos novos itens de venda e adiciona `public.sales` à
publicação do Realtime usada pelas páginas **Vendas** e **Produtos**.

A migration `20261023013251_create_product_with_initial_stock_and_enable_product_realtime.sql`
cria o cadastro transacional de produto com saldo inicial e movimento de estoque,
e adiciona produtos, categorias e saldos à publicação do Realtime.

A migration `20261024153141_implement_inventory_management.sql` cria o ajuste
transacional e auditável de saldo, adiciona índices das consultas da tela **Estoque**
e habilita seus saldos, movimentos, locais e produtos na publicação do Realtime.

A migration `20261024154621_enforce_integer_inventory_adjustments.sql` atualiza
o ajuste manual para aceitar somente quantidades inteiras, em passos de uma unidade.

A migration `20261024162649_enable_customers_realtime.sql` adiciona um índice
para a listagem por status e publica `public.customers` no Realtime.

A migration `20261024163845_enable_suppliers_realtime.sql` adiciona um índice
para a listagem por status e publica `public.suppliers` no Realtime.

A migration `20261024165611_implement_purchase_management.sql` cria as operações
transacionais de pedido e recebimento de compras, atualiza custo e estoque,
gera a conta a pagar ao concluir e habilita as tabelas relacionadas no Realtime.

A migration `20261024172800_add_purchase_request_and_receipt_dates.sql` permite
informar a data da solicitação e a data de cada recebimento, refletindo a data
escolhida nos movimentos de estoque e na conta a pagar gerada ao concluir.

A migration `20261024234342_allow_backdated_purchase_receipts.sql` permite que
um novo recebimento use uma data anterior a outro recebimento já registrado,
mantendo apenas os limites da data da solicitação e da data atual.

A migration `20261024234744_create_purchase_receipt_history.sql` cria o histórico
de recebimentos parciais ligado ao pedido, incluindo data, local, responsável e
itens recebidos, e recupera o histórico anterior pelos movimentos de estoque.

A migration `20261025000517_implement_financial_management.sql` cria as operações
transacionais de lançamentos e pagamentos, adiciona índices para a listagem do
Financeiro e habilita categorias, lançamentos e pagamentos no Realtime.

A migration `20261025120000_implement_cash_register_management.sql` implementa o
caixa diário com abertura, entradas, saídas, sangria, suprimento e fechamento
auditável. Ela integra vendas e pagamentos financeiros em dinheiro ao caixa aberto,
protege as operações por funções transacionais e habilita as tabelas no Realtime.

A migration `20261025160000_implement_sale_cancellations_and_returns.sql` cria o
histórico de cancelamentos e devoluções parciais ou totais. A operação recompõe
o estoque, registra o estorno financeiro, movimenta o caixa quando o pagamento
foi em dinheiro, grava auditoria e publica os novos registros no Realtime.

A migration `20261025173000_enforce_detailed_role_permissions.sql` aplica a matriz
de acesso detalhada. Proprietários mantêm acesso completo; gerentes podem operar
cadastros, estoque, compras, financeiro, caixa e relatórios sem gerenciar a equipe
ou excluir registros; operadores podem consultar os dados e registrar vendas, sem
alterar cadastros, estoque, compras, financeiro ou caixa.
