---
tags:
  - orion-express
  - tela
---
# Tela — Pedidos (Histórico)

> `#vendas` em `index.html`. Acessível pela sidebar como **"Pedidos"**.

## Propósito
Histórico completo de pedidos/vendas em formato de **tabela**, com atualização de status.

> ℹ️ A coluna exibida é o **Nº do Pedido** (`numeroPedido`, sequência `001`, `002`, ... — mínimo de 3 dígitos `#001`, mesma lógica dos IDs de produto/cliente). O `id` do Firestore permanece apenas no banco como ID único. Ver [[Firebase-Banco-de-Dados]].

## Elementos
- Título **"Histórico de Pedidos/Vendas"**.
- Cartão "Pedidos Recentes" com tabela de colunas:

| Nº do Pedido | Data | Resumo | Total | Status |
|--------------|------|--------|-------|--------|
| `#001` (número sequencial) | `dd/mm/aaaa hh:mm` | `Qtdx Nome, ...` | R$ formatado | Pill colorida + dropdown |

- **Clique na linha** → abre modal [[Detalhes-e-Impressao-de-Comanda]].
- **Setinha (chevron)** na coluna Status → dropdown de troca de status:
  - 🕐 Em Preparação
  - 🏍️ Saiu para Entrega
  - ✅ Entregue
  - ⛔ Cancelar (Cancelado)

## Cores de status
| Status | Cor |
|--------|-----|
| Em Preparação | Amarelo (`fa-hourglass-half`) |
| Saiu para Entrega | Índigo (`fa-motorcycle`) |
| Entregue | Verde (`fa-check-circle`) |
| Cancelado | Vermelho (`fa-times-circle`) |
| Desconhecido | Cinza (`fa-question-circle`) |

## Funções
- `renderHistoricoVendas()` — monta as linhas; estado vazio: "Nenhuma venda registrada ainda."
- `updateOrderStatus(id, newStatus)` — grava novo status no Firestore e re-alerta o usuário.
- `toggleDropdown(event, id)` — abre/fecha dropdown (fecha todos ao clicar fora).

## Integrações
- → [[Status-de-Pedidos]]
- → [[Detalhes-e-Impressao-de-Comanda]]
- ← [[Firebase-Banco-de-Dados]] (coleção `vendas`)
