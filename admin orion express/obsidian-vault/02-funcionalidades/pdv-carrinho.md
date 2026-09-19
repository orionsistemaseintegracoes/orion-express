---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — PDV / Carrinho

> Lógica da [[Venda-Rapida-PDV]]: carrinho, validações de estoque e finalização.

## Estado
- `carrinho` (array) — itens com `{ id, nome, preco, qtdCarrinho, qtdEstoque }`. Volátil (some ao recarregar a página).

## Funções

### `renderizarProdutosVenda()`
- Cards dos produtos (imagem/nome/preço/estoque). Clique → `addToCart`.
- `qtd < 5` → destaque "(Baixo!)".
- Estoque vazio → aviso para cadastrar na aba "Estoque".

### `addToCart(id)`
1. Produto fora de estoque (`qtd <= 0`) → alert.
2. Já no carrinho → incrementa `qtdCarrinho` (respeitando limite de estoque).
3. Novo → push com `qtdCarrinho: 1`.

### `updateCartItemQtd(id, delta)`
- delta `-1` até 0 → **remove** o item.
- acima do estoque → alert de limite.
- senão atualiza `qtdCarrinho`.

### `renderizarCarrinho()`
- Lista de itens + subtotais.
- **Total** em `#carrinhoTotal`.
- `#btnFinalizarVenda` desabilitado quando vazio.

### `finalizarVenda()`
1. Carrinho vazio → alert.
2. Monta objeto `venda` (ver [[Firebase-Banco-de-Dados]]).
3. `vendas.add(venda)`.
4. **Baixa de estoque** com `batch()` (atômico): subtrai `qtdCarrinho` de cada produto.
5. Alert de sucesso + limpa carrinho.
6. Listeners atualizam o restante do app.

## Relações
- → [[Venda-Rapida-PDV]]
- → [[Fluxo-de-Uma-Venda]]
- → [[Firebase-Banco-de-Dados]]
