---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Board de Pedidos

> Kanban-like (lista única filtrada por status) exibido no [[Dashboard]].

## Elementos
- **Busca** `#busca-pedido`: filtra por **número do pedido** (`numeroExibicao`, aceita `015` ou `#015`), ID do Firestore, nome do cliente ou nomes dos itens.
- **Abas** `#board-tabs` com filtro `todos | novos | preparo | saiu | entregues` + **contadores**.
- **Lista de cards** `#board-list`: **8 pedidos por página**, ordenados do mais recente (`dataDaVenda` desc), com **paginação** `#board-pagination` (Anterior/Próxima + "Página X de Y · N pedido(s)"). Botões desabilitados nas bordas; paginação some com 1 página ou 0 resultados.
- **Mudança de página**: `mudarPagina(delta)`; `boardPage`/`PEDIDOS_POR_PAGINA` (8). Nova busca/filtro (`filtrarPedidosBoard`) reseta para a página 1.

## Card do pedido
```
#001                 [pill status]
Nome do cliente       R$ total
🚚 Delivery | 🕐 Hoje, 14:32   (pedidos do dia)
🚚 Delivery | 🕐 06/08/2026, 23:42   (pedidos antigos)
[thumb][thumb][thumb] +2
```
- O **nº do pedido** (`#001`) vem de `numeroExibicao(venda)` (campo `numeroPedido`, mínimo de 3 dígitos).
- Thumbnails: imagem do item (via `imagemDoItem`) ou ícone `fa-utensils`; até 3 + `+N`.
- Delivery x Retirada: baseado na existência de `clienteEndereco`/`endereco` na venda.
- **Data/hora do card**: pedidos do dia exibem `Hoje, HH:MM`; pedidos de outros dias exibem `DD/MM/AAAA, HH:MM` (comparação `date.toDateString() === hoje`).
- Clique → `abrirModalDetalhes(id)`.

## Filtro e contadores
- `filtrarPedidosBoard(filtro)` atualiza `boardFilter` e re-renderiza.
- Contadores `count-novos|preparo|saiu|entregues` são calculados sobre **todas** as vendas (`normalizarStatus`), mesmo com filtro "todos" ativo.
- Normalização: `novos` (padrão), `preparo`, `saiu` ("Saiu para Entrega"), `entregues` (entregue/concluído), `cancelados`.
- Estado vazio: ícone clipboard + "Nenhum pedido encontrado."

## Visual (status pill)
| Status | Cor |
|--------|-----|
| Novo | Verde-escuro (`status-new`) |
| Em preparo | Azul (`status-preparing`) |
| Pronto | Roxo (`status-ready`) |
| Entregue | Cinza claro (`status-delivered`) |
| Cancelado | Vermelho (`status-cancelled`) |

## Funções
`filtrarPedidosBoard`, `renderOrderBoard`, `statusVisual`, `normalizarStatus`, `dataDaVenda`, `imagemDoItem`, `escapeDashboard`.

## Relações
- → [[Dashboard]]
- → [[Status-de-Pedidos]]
- → [[Detalhes-e-Impressao-de-Comanda]]
