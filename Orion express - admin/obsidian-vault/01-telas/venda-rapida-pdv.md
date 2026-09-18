---
tags:
  - orion-express
  - tela
---
# Tela — Venda Rápida (PDV Express)

> `#venda` em `index.html`. Acessível pela sidebar como **"Venda Rápida"**.

## Propósito
Registrar vendas no balcão: adicionar produtos ao carrinho e **finalizar a venda**, com baixa automática de estoque.

## Estrutura (2 colunas)

### Coluna esquerda (2/3) — Produtos Disponíveis
- **Filtros**: título **"Filtros"** com **Buscar por nome** (`#venda-busca-produto-nome`) e **Buscar por ID** (`#venda-busca-produto-codigo`) — ambos `oninput="filtrarProdutosVenda()"` (case-insensitive `includes` + ID exato); produtos **ordena** por ID crescente; trocar filtro volta para a **página 1**.
- **Paginação**: **9 produtos por tela** (`#venda-produtos-pagination` — Anterior/Próxima + "Página X de Y · N registro(s)"; `mudarPaginaProdutosVenda`/`vendaProdutosPage` via `renderizarPaginacaoGenerica('venda-produtos',...)` com `REGISTROS_POR_PAGINA_VENDA = 9`) — padrão das demais telas, porém com 9 registros.
- Grade de cards clicáveis (até 3 por linha). Cada card:
  - Imagem do produto (ou placeholder `Sem Foto`)
  - Nome
  - Preço (âmbar)
  - Estoque: `Estoque: X` e `(Baixo!)` em vermelho quando `qtd < 5`
- Clique no card → `addToCart(id)`.
- Estado vazio: "Nenhum produto encontrado."
- ℹ️ Registros de banner (`banner_config`) são **excluídos** da lista (via `produtosVendiveis()`/`ehRegistroBanner()`) — não são produtos de venda. Ver [[Banner-do-Cardapio]].

### Coluna direita (1/3) — Carrinho de Vendas
- Lista de itens: nome, `Qtd x preço`, botões ➖/➕ e subtotal.
- **Filtros de Cliente**: título "Filtros de Cliente" com **Buscar por nome** (`#venda-busca-cliente-nome`) e **Buscar por ID** (`#venda-busca-cliente-codigo`) — ambos `oninput="filtrarSelectClientes()"`.
  - **Auto-seleção**: ao digitar nome/ID, o `#selectCliente` é **populado automaticamente** com o cadastro **mais próximo** do filtro (`clienteMaisProximo`: nome exato > começa com > contém > menor ID; se houver filtro de ID, o próprio ID).
- **Dropdown de Cliente** (substitui o `<select>` nativo — lista paginada):
  - Botão `#selectClienteBtn` mostra o cliente selecionado (ou "— Selecione o Cliente —"); ao clicar abre `#selectClienteDropdown` (mesmo padrão do `status-dropdown`).
  - Lista `#listaSelectClientes` exibe **20 cadastros por página** (`LIMITE_SELECT_CLIENTES = 20`) com Anterior/Próxima + "Página X de Y · N registro(s)" (`#select-cliente-pagination` via `renderizarPaginacaoGenerica('select-cliente',...)`; `mudarPaginaSelectClientes`/`selectClientesPage`).
  - Cada linha: `#NNN · Nome (Telefone)`; a linha do cliente selecionado fica destacada (âmbar + check), clicável → `selecionarClientePDV(id)`.
  - **Ordenação**: sempre por **ID crescente** (`obterCodigoCliente`), tanto sem filtro quanto filtrado.
  - Valor guardado no `<input type="hidden" id="selectCliente">` (lido por `finalizarVenda()`); label atualizado via `atualizarLabelClientePDV`.
  - Sem filtro, lista todos os não bloqueados (pagina); com filtro, apenas os relacionados. Trocar filtro volta para a **página 1**.
- Seletor **Forma de Pagamento** (`#selectFormaPagamento`) — **obrigatório**; opções vêm de `config/pagamentos`.
- **Total** (`#carrinhoTotal`).
- Botão **FINALIZAR VENDA** (`#btnFinalizarVenda`) — desabilitado com carrinho vazio.

## Regras de negócio
| Cenário | Comportamento |
|---------|---------------|
| Produto com `qtd <= 0` | `alert("Produto fora de estoque...")` |
| Adicionar além do estoque | `alert("Limite de estoque (X) atingido...")` |
| `updateCartItemQtd` com delta negativo até 0 | Item é **removido** do carrinho |
| Venda finalizada | Grava `vendas`, dá baixa em estoque via `batch`, limpa carrinho |
| Cliente não selecionado | `alert("Selecione o cliente para finalizar a venda.")` — bloqueia `finalizarVenda` (**obrigatório**) |
| Forma de pagamento não selecionada | `alert("Selecione a forma de pagamento.")` — bloqueia `finalizarVenda` |

## Fluxo `finalizarVenda()`
1. Valida carrinho não vazio, **cliente selecionado** e **forma de pagamento selecionada**.
2. Monta objeto `venda` (total, itens, cliente, **formaPagamento**, datas, status `'Em Preparação'`, usuário logado).
3. `vendas.add(venda)` (guarda o `vendaDoc` retornado).
4. `batch` atualiza `qtd` de cada produto (subtrai `qtdCarrinho`).
5. Se houver **caixa aberto**, registra a movimentação **VENDA** em `movimentacoes_caixa` via `registrarMovimentacaoVendaCaixa(vendaDoc.id, numeroPedido, formaPagamento, total, venda)` — doc idempotente (`docId = venda_id`), `try/catch` silencioso (não bloqueia a venda).
6. `alert` de sucesso + limpa carrinho.
7. `onSnapshot` de `vendas`/`estoque`/`caixas` atualiza todas as telas automaticamente.

> 🔗 Ao finalizar com caixa aberto, o valor entra automaticamente na tela [[Gerenciamento-de-Caixa]] na forma correspondente (Dinheiro/PIX/Cartão). Pedidos do **painel do cliente** também são conciliados no caixa pelo admin (`conciliarVendasNoCaixa()`).

## Funções
- `renderizarProdutosVenda()`, `filtrarProdutosVenda()`, `mudarPaginaProdutosVenda(delta)`, `addToCart(id)`, `updateCartItemQtd(id, delta)`, `renderizarCarrinho()`, `finalizarVenda()`, `renderizarSelectClientes()`, `filtrarSelectClientes()`, `clienteMaisProximo(clientes, buscaNome, buscaCodigo)`, `toggleSelectClientes(event)`, `selecionarClientePDV(id)`, `mudarPaginaSelectClientes(delta)`, `atualizarLabelClientePDV(id)`
- Formas de pagamento: `renderizarSelectPagamento()` (popula `#selectFormaPagamento`), `metodosPagamento`/`METODOS_PAGAMENTO_PADRAO`, `salvarMetodosPagamento()`, `adicionarMetodoPagamento()`, `removerMetodoPagamento()` — ver [[Configuracoes]].

## Integrações
- → [[PDV-Carrinho]]
- → [[Fluxo-de-Uma-Venda]]
- → [[Firebase-Banco-de-Dados]] (baixa em `estoque`, grava em `vendas`)
