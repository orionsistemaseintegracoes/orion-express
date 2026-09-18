---
tags:
  - orion-express
  - referencia
---
# Referência — Fluxo de uma Venda

Sequência completa de uma venda no balcão, do produto ao histórico.

```
Funcionário logado (Firebase Auth)
        │
        ▼
[1] Abre "Venda Rápida"  (mostrarPagina('venda'))
        │
        ▼
[2] Produtos aparecem: renderizarProdutosVenda()
        │  (db.estoque atualizado via onSnapshot)
        ▼
[3] Clica no card -> addToCart(id)
        │  - valida estoque
        ▼
[4] Ajusta quantidades updateCartItemQtd(id, +/-)
        │  - opcional: seleciona cliente #selectCliente
        ▼
[5] FINALIZAR VENDA -> finalizarVenda()
        │  - monta venda (total, itens, numeroPedido=proximoNumeroPedido(), cliente, status='Em Preparação', user)
        │  - vendas.add(venda)
        │  - batch: baixa qtd no estoque (atômico)
        │
        └─► limpa carrinho
              │
              ▼
[6] Listeners onSnapshot disparam
        │  vendas → renderHistoricoVendas + renderDashboard
        │  estoque → renderizarEstoque + renderizarProdutosVenda
        ▼
[7] Pedido visível em tempo real no Dashboard (board) e em Pedidos (tabela)
        │
        ▼
[8] Operação altera status updateOrderStatus(id, 'Saiu para Entrega'|'Entregue'|'Cancelado')
        ▼
[9] Clique em detalhes -> abrirModalDetalhes(id)
        ▼
[10] IMPRIMIR COMANDA -> imprimirComandaAtual()  (janela de impressão)
```

## Pontos críticos
- **Estoque** é o mesmo cadastrado em [[Cardapio-Estoque]].
- **Cliente** opcional; sem seleção vira "Cliente Balcão".
- **Status inicial** sempre `'Em Preparação'`.
- **Baixa de estoque** é atômica via `batch` (parte falhou = venda não sai? — `add` e `batch` não estão envoltos numa transação única; ver [[Notas-QA-e-Bugs]]).
- Formas de pagamento **não** são coletadas nesta tela.

## Funções envolvidas
- [[PDV-Carrinho]] · [[Fluxo-de-Uma-Venda]] · [[Firebase-Banco-de-Dados]]