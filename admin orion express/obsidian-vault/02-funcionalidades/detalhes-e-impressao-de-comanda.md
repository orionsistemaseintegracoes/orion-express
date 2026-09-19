---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Detalhes do Pedido e Impressão de Comanda

> Modal `#modalDetalhesPedido`, aberto a partir do [[Dashboard]] ou da tabela [[Pedidos]].

## Abrir — `abrirModalDetalhes(id)`
1. Busca venda em `db.vendas`.
2. Preenche:
   - **Nº do pedido** (`#modal-pedido-id`, `#${numeroExibicao}`), Data, Status (com cor: verde=Entregue, vermelho=Cancelado, âmbar=demais).
   - **Dados do Cliente**: nome (ou "Cliente Balcão") + endereço (montado do cliente vinculado ou "Retirada / Balcão").
   - **Itens do Pedido**: tabela Qtd | Produto | Total.
   - **Total do Pedido** (`#modal-pedido-total`).
3. Mostra o modal.

## Fechar — `fecharModalDetalhes()`
- Esconde o modal e limpa `pedidoAtualIdModal`.

## Imprimir comanda — `imprimirComandaAtual()`
- Abre janela 300×600 centralizada com `window.open`.
- Possui verificação de bloqueador de popups do navegador (`showToast` preventivo).
- Gera comanda estilo cupom (fonte `Courier New`, 12px):
  - Cabeçalho **ORION EXPRESS** + `Pedido #${numeroExibicao}` + data.
  - Cliente, Status.
  - Itens (`Qtdx Nome` / subtotal).
  - **TOTAL**.
- `window.print()` automático ao carregar e fecha a janela.
- Só funciona com modal aberto (usa `pedidoAtualIdModal`).
- *(Nota: A impressão de comanda de mesas do módulo de Mesas utiliza `imprimirComandaMesaAtual()`)*.

## Relações
- → [[Pedidos]]
- → [[Board-de-Pedidos]]
- → [[Funcoes-do-script]]
