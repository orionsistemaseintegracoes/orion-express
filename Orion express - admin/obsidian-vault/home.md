---
tags:
  - orion-express
  - index
---
# Orion Express — Admin (Mapa do Sistema)

> PDV + Gestão de Pedidos online da **Orion Express**. Aplicação web de página única (SPA), tema escuro, alimentada em tempo real pelo **Firebase** (Firestore + Auth).

- 📁 Pasta do projeto: `orion-express-admin`
- 🧩 Arquivos: `index.html`, `style.css`, `script.js`, `functions/` (opcional — só se migrar para o plano Blaze), `firebase.json`, `.firebaserc`, `orion-logo.png`, `design-qa.md`

## Mapa de Telas

| # | Tela | Nota |
|---|------|------|
| 1 | [[Login]] | Acesso (login/senha); cadastro de funcionário é exclusivo do admin nas [[Configuracoes]] |
| 2 | [[Dashboard]] | Board de pedidos + resumo do dia + gráficos |
| 3 | [[Pedidos]] | Histórico de pedidos/vendas (tabela) |
| 4 | [[Cardapio-Estoque]] | CRUD de produtos + banner do cardápio |
| 5 | [[Clientes]] | CRUD de clientes |
| 6 | [[Venda-Rapida-PDV]] | PDV Express — nova venda rápida |
| 7 | [[Gerenciamento-de-Caixa]] | Caixa — abertura, lançamentos e fechamento |
| 8 | [[Relatorios]] | Gráficos de vendas (7 dias) e top 5 produtos |
| 9 | [[Configuracoes]] | Dados da loja + banner do cardápio |
| 10 | [[Balanco-de-Filiais]] | Consolidado financeiro e fiscal básico por filial |
| — | [[Detalhes-e-Impressao-de-Comanda]] | Modal de detalhes do pedido (aberto de várias telas) |

## Funcionalidades

- [[Autenticacao]] — Login, logout (Firebase Auth) e cadastro de funcionário exclusivo do admin
- [[Sincronizacao-Tempo-Real]] — `onSnapshot` nas coleções
- [[Board-de-Pedidos]] — Kanban-like de pedidos com filtros e busca
- [[Status-de-Pedidos]] — Ciclo de status + dropdown de atualização
- [[PDV-Carrinho]] — Carrinho de venda rápida com baixa de estoque
- [[Gerenciamento-de-Caixa]] — Controle do caixa (abertura, lançamentos, fechamento)
- [[Gestao-de-Produtos]] — CRUD estoque
- [[Gestao-de-Clientes]] — CRUD clientes
- [[Dashboard-Resumo]] — KPIs, gráfico horário e formas de pagamento
- [[Banner-do-Cardapio]] — Configuração do banner exibido no app do cliente
- [[Detalhes-e-Impressao-de-Comanda]] — Modal + impressão de comanda para cozinha

## Arquitetura e Referência

- [[Visao-Geral]] — Visão geral do sistema
- [[Estrutura-de-Arquivos]] — O que cada arquivo faz
- [[Tecnologias]] — Stack e bibliotecas
- [[Cloud-Functions]] — Cloud Function `resetOperadorPassword` (alternativa histórica/opcional p/ plano **Blaze**) — **não ativa**; no Spark a redefinição de senha de outro perfil é por **e-mail** (`auth.sendPasswordResetEmail`)
- [[Firebase-Banco-de-Dados]] — Coleções e documentos do Firestore
- [[Funcoes-do-script]] — Inventário de funções do `script.js`
- [[Fluxo-de-Uma-Venda]] — Sequência de uma venda do início ao fim
- [[Notas-QA-e-Bugs]] — Resultado do QA e problemas conhecidos

## Tags de navegação

`#tela` · `#funcionalidade` · `#firebase` · `#pendencias`
