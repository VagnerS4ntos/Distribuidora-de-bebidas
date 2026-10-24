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
