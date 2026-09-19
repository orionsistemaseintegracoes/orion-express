---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Status de Pedidos

> Ciclo de vida dos pedidos + atualização pelo painel.

## Ciclo oficial
```
Em Preparação  →  Saiu para Entrega  →  Entregue
      ↘
     Cancelado
```
- **Padrão ao criar**: `'Em Preparação'` (gravado por `finalizarVenda()`).
- "Cancelado" também é status final (sem retorno no dropdown).

## Normalização (board / pill)
`normalizarStatus(status)` mapeia os textos em grupos para o [[Board-de-Pedidos]] e [[Pedidos]]:

| Grupo | Matches |
|-------|---------|
| `cancelados` | contém "cancel" |
| `entregues` | contém "entreg" / "conclu" |
| `saiu` | contém "saiu" |
| `preparo` | contém "preparo" / "preparacao" |
| `novos` | padrão (qualquer outro) |

> `'Saiu para Entrega'` normaliza para o grupo **`saiu`** (não existe grupo "prontos" — esse status não é usado no fluxo).

## Atualização de status — `updateOrderStatus(id, newStatus)`
1. Dropdown na tela [[Pedidos]] chama com um dos status disponíveis.
2. Atualiza no backend via `vendas.doc(id).update({ status: newStatus })`.
3. Atualização otimista imediata no array em memória `db.vendas`.
4. Dispara imediatamente `renderHistoricoVendas()` e `renderDashboard()`, garantindo que os cards, contadores do board e badges sejam atualizados sem depender de delays de websocket.
5. Notificação toast e registro de log do evento.

## Dropdown (`toggleDropdown`)
- Botão chevron na linha da tabela; fecha outros dropdowns abertos; clique fora fecha todos.

## Relações
- → [[Pedidos]]
- → [[Board-de-Pedidos]]
- → [[Dashboard]]
