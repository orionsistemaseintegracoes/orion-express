---
tags:
  - orion-express
  - tela
---
# Tela — Dashboard

> `#dashboard` em `index.html`. Tela inicial após o login.

## Propósito
Visão operacional do dia: **board de pedidos** em tempo real + **resumo financeiro**.

## Estrutura

### Header
- Título **"Pedidos"**.
- Ícones: **sino de notificações** (`toggleNotificacoes`) — badge dinâmico com nº de pedidos **novos**; clique abre o painel com os novos pedidos (e detalhes ao clicar no item). Sacola (pedidos recentes), avatar do admin (`#admin-avatar` — foto do doc `usuarios/{uid}` (`reg.photoURL`), com fallback para o Firebase Auth (`user.photoURL`); sem foto, ícone `fa-user`) com o **nome do perfil logado** logo abaixo (`#admin-avatar-nome`, `reg.nome` com fallback `displayName`/e-mail) — tudo via `renderAvatarAtual`.

### Coluna esquerda — Board de Pedidos
- **Busca** (`#busca-pedido`) → filtra por número do pedido (`numeroExibicao`/`#015`), ID, cliente ou item (`filtrarPedidosBoard`).
- **Abas de status** (`#board-tabs`): Todos, Novos, Em preparo, Saiu para Entrega, Entregues — com contadores.
- **Cards de pedidos** (`#board-list`): **8 por página** (paginação `#board-pagination`), do mais recente. Cada card mostra: nº (`#015`), cliente, entrega (Delivery/Retirada), data/hora (`Hoje, HH:MM` ou `DD/MM/AAAA, HH:MM`), miniaturas dos itens (até 3 + `+N`), pill de status e total.
- Clique no card → abre [[Detalhes-e-Impressao-de-Comanda]].

### Coluna direita — Resumo (`#summary-column`)
1. **Resumo do dia**: Pedidos, Faturamento, Ticket médio, Novos clientes (**cadastros novos de hoje**).
2. **Gráfico de vendas** (`#graficoVendasHoje`): linha, faturamento por hora do dia de hoje.
3. **Formas de pagamento** (`#lista-pagamento`): Pix, Cartão, Dinheiro, Outros com barras de %.

> Os resumos do dia **excluem pedidos cancelados** (`vendasDeHoje` + `ehVendaCancelada`).

## Dados exibidos (funções)
- `renderDashboard()` → dispara tudo abaixo.
- `renderOrderBoard()` → board + contadores.
- `renderDashboardSummary()` → 4 KPIs do dia.
- `renderDashboardSalesChart()` → gráfico horário.
- `renderPaymentSummary()` → formas de pagamento.
- Footer: "Orion Express — Pedidos online".

## Particularidades / limites
- Contadores de status são calculados sobre **todas** as vendas (não só hoje).
- Novo pedido aparece automaticamente graças ao `onSnapshot`.

## Relações
- → [[Board-de-Pedidos]]
- → [[Dashboard-Resumo]]
- → [[Status-de-Pedidos]]
