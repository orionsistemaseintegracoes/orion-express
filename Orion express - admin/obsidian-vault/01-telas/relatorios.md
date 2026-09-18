---
tags:
  - orion-express
  - tela
---
# Tela — Relatórios

> `#relatorios` em `index.html`.

## Propósito
Gerar **relatórios filtravéis** exibidos em tela (tabela) com opção de **exportar em PDF** (via janela de impressão do navegador).

O MVP multi-filial acrescenta a aba **Balanço de Filiais**, com faturamento, despesas pagas, saldo operacional, contas pendentes e entradas fiscais por unidade. A coleta é compartilhada com a tela [[Balanco-de-Filiais]].

## Estrutura (5 abas)

Tabs: `mostrarAbaRelatorio('vendas'|'estoque'|'clientes'|'caixa'|'balanco-filiais')` — alterna as quatro consultas operacionais e o consolidado multi-filial.

> **Layout dos filtros (padrão das 3 abas)**: bloco com título **"Filtros"** (`<h3>`) acima dos campos de filtro (grade `grid`), e **abaixo** uma linha própria (`flex`) com os botões **GERAR** e **EXPORTAR PDF** sempre lado a lado — independente de quantos filtros forem adicionados, os botões não entram no grid de filtros.

### Aba 1 — Relatório de Vendas
- **Filtros**:
  - Data inicial (`#vendas-rel-inicio`) e data final (`#vendas-rel-fim`) — filtra por `dataDaVenda(venda)` no intervalo (dias inclusivos).
  - Produto (`#vendas-rel-produto`) — dropdown com a união dos nomes de produtos de `estoque` + itens de `vendas`. Vazio = todos.
  - Marca (`#vendas-rel-marca`) / Grupo (`#vendas-rel-grupo`) / Subgrupo (`#vendas-rel-subgrupo`) — dropdowns com **base nas listas cadastradas em [[Configuracoes]]** (`config/classificacoes`) + **união** com valores já usados nos produtos (compatibilidade com dados antigos; controle interno). Vazio = todos.
  - Botão **GERAR** e **EXPORTAR PDF**.
- **Resultado** (`#vendas-rel-tabela`, 11 colunas): uma linha por item vendido — Pedido (`numeroPedido`), Data/Hora, Produto, **Marca**, **Grupo**, **Subgrupo**, Qtd, Total do item, Cliente, Status, Forma de pagamento. Rodapé com total geral ("Total" em `colspan=7` + valor + `colspan=3`). Info `#vendas-rel-info` resume venda(s)/item(ns)/período/produto/marca/grupo/subgrupo.
- A classificação do item é resolvida em `coletarRelatorioVendas()` via `classificacaoDoItem(item)` — busca o produto em `estoque` por `id`/`nome` (**os itens de venda continuam sem `marca/grupo/subgrupo`**).
- **Apenas o botão GERAR exibe o relatório** — estado inicial é o placeholder "Clique em GERAR...". Não há geração automática ao acessar a tela nem no `onchange`.

### Aba 2 — Relatório de Estoque
- **Filtros** (botões `filtrarRelatorioEstoque`, marcação ativa):
  - **Todos** (`todos`) — lista completa.
  - **Estoque Baixo** (`baixo`) — `qtd > 0 && qtd < 5`.
  - **Sem Estoque** (`sem`) — `qtd <= 0`.
- **Filtros de classificação**: produto (`#estoque-rel-produto`), **ID** (`#estoque-rel-codigo`, numérico, opcional — filtra pelo `#N` do produto via `obterCodigoProduto`), Marca (`#estoque-rel-marca`), Grupo (`#estoque-rel-grupo`) e Subgrupo (`#estoque-rel-subgrupo`) — dropdowns com os produtos e as classificações (base das listas cadastradas + união com os valores usados; vazio = todos).
- **Filtro de Status** (`filtrarRelatorioEstoqueStatus`; estado `estoqueRelStatus`): **Todos / Liberados / Bloqueados** (`#estq-rel-status-todos|liberados|bloqueados`) — permite gerar o relatório só com produtos liberados ou só com os bloqueados.
- **Botão GERAR** → `gerarRelatorioEstoque()` exibe o relatório na tela (nada é gerado automaticamente).
- **Ordem**: produtos exibidos na **sequência crescente do ID** (`obterCodigoProduto`).
- **Resultado** (`#estoque-rel-corpo`, 8 colunas): **ID** (`#N`), Produto, **Marca**, **Grupo**, **Subgrupo**, Preço, Qtd, Situação (`Em estoque`/`Estoque baixo`/`Sem estoque`, colorida). Info `#estoque-rel-info` resume situação/filtro e quantidade de produtos.
- Usa `produtosVendiveis()` (exclui registros de banner). Filtros de situação + status + produto + **ID** + classificação aplicados em `produtosEstoqueFiltrados()`. Botão **EXPORTAR PDF** aplica os mesmos filtros (coluna ID incluída).

### Aba 3 — Relatório de Clientes
- **Filtros** (estado `clientesRelStatus`):
  - **Status** (`filtrarRelatorioClientesStatus`): **Todos / Liberados / Bloqueados** (`#cli-rel-status-todos|liberados|bloqueados`) — apenas marca a seleção; **não** popula tela.
  - **Nome** (`#clientes-rel-nome`, case-insensitive, `includes`).
  - **ID** (`#clientes-rel-codigo`, numérico exato — filtra pelo `#N` via `obterCodigoCliente`).
  - Botões **GERAR** (`gerarRelatorioClientes()`) e **EXPORTAR PDF**.
- **Exibição**: apenas o botão **GERAR** exibe o relatório (igual a Vendas/Estoque/Caixa) — estado inicial é o placeholder "Clique em GERAR...". Filtros de status e busca apenas condicionam o resultado; não geram a listagem.
- **Ordem**: clientes exibidos na **sequência crescente do ID** (`obterCodigoCliente`).
- **Resultado** (`#clientes-rel-corpo`, 7 colunas): **ID** (`#N`), Nome, Telefone, E-mail, Endereço (com Nº), **Pedidos** (quantidade de vendas com `venda.clienteId === c.id`), Status (badge LIBERADO/BLOQUEADO). Info `#clientes-rel-info` resume status e quantidade de clientes. **10 clientes por página** (`#clientes-rel-pagination`; `mudarPaginaRelClientes`/`renderRelClientesPagina`). Novo GERAR reseta para página 1.
- Filtros aplicados em `clientesRelFiltrados()`. **EXPORTAR PDF** (`exportarRelatorioClientesPDF`) aplica os mesmos filtros.

### Aba 4 — Fechamento de Caixa
- **Filtros**: Data inicial (`#caixa-rel-inicio`), data final (`#caixa-rel-fim`) — filtra por **`data_fechamento`** no intervalo (dias inclusivos) — e **Sequência do caixa** (`#caixa-rel-seq`, numérico, opcional) — filtra pelo `#N` do caixa (gravado/derivado via `obterSequenciaCaixa`). Botões **GERAR** e **EXPORTAR PDF**.
- **Exibição**: **não** é mais automática — ao abrir a aba exibe o placeholder **"Clique em <b>GERAR</b> para exibir os fechamentos de caixa."** (igual a Vendas/Estoque); o usuário precisa clicar em **GERAR** (`gerarRelatorioCaixa()`).
- **Resultado** (`#caixa-rel-corpo`, 9 colunas): Seq (`#N`), Aberto em, Fechado em, Aberto por, Abertura, Esperado (Dinheiro), Contado, Diferença, e botão **"Ver lançamentos"** (`verLancamentosRelCaixa(caixaId)`). **10 caixas por página** (`#caixa-rel-pagination` — Anterior/Próxima + "Página X de Y · N fechamento(s)"; `mudarPaginaRelCaixa`/`renderCaixaRelPagina`). Novo GERAR reseta para a página 1.
- **Detalhe** (`#caixa-rel-detalhe`, oculto até selecionar): título com **Caixa #N** + data, resumo (aberto por, abertura, diferença e esperado por forma Dinheiro/PIX/Cartão/Outros) e tabela de **lançamentos** (`#caixa-rel-lancamentos`): Hora, Tipo, Forma, Valor (±), Observação (número do pedido/sangria). **10 lançamentos por página** (`#caixa-rel-lanc-pagination`; `mudarPaginaRelCaixaLanc`/`renderLancamentosRelCaixa`).
- `caixaRelSelecionado` guarda o caixa ativo para o PDF; `coletarRelatorioCaixa()` filtra `caixasLista` (só `FECHADO`) por período **e sequência**, reusa `calcularEsperadoCaixa(caixa, movs)` e soma os sub-totais do período (Esperado/Contado/Diferença).

### Aba 5 — Balanço de Filiais

- Disponível somente para administradores.
- Reúne faturamento confirmado, despesas pagas, saldo operacional, contas pendentes e entradas fiscais de todas as filiais.
- Pedidos do cliente pendentes de aceite não entram no faturamento.
- Usa `renderizarRelatorioBalancoFiliais()` e `exportarBalancoFiliaisPDF('rel-balanco')`.

## Exportação PDF
- `abrirImpressaoRelatorio(titulo, subtitulo, tabelaHtml)` abre uma janela com HTML mínimo (estilos inline) e dispara `window.print()` → o usuário salva como PDF.
- Vendas: `exportarRelatorioVendasPDF()` reutiliza `coletarRelatorioVendas()` (mesmos filtros da tela).
- Estoque: `exportarRelatorioEstoquePDF()` aplica o filtro ativo (situação + produto + classificação).
- Caixa: `exportarRelatorioCaixaPDF()` usa o `caixaRelSelecionado` (fallback: último fechamento do período) e imprime resumo + lançamentos daquele caixa.
- Clientes: `exportarRelatorioClientesPDF()` usa os filtros ativos (status + nome + ID).

## Comportamento
- Os relatórios **não** são gerados ao acessar a tela. Eles aparecem apenas após ação do usuário: **GERAR** (vendas/estoque/caixa). Estado inicial = placeholder "Clique em <b>GERAR</b> para exibir o relatório de ...".
- `renderRelatorios()` (chamado por `renderDashboard()`) apenas mantém o **seletor de produtos** (`carregarSelectProdutosRelatorio()`) e os **filtros de classificação** (`carregarSelectsClassificacaoRelatorio()`) atualizados em tempo real (via `onSnapshot` de `clientes`/`estoque`/`vendas` e do `config/classificacoes`), sem re-gerar os relatórios.
- Estado vazio: linhas "Clique em GERAR..." / "Os produtos aparecerão aqui...".

## Funções
- Tabs: `mostrarAbaRelatorio(aba)`.
- Vendas: `carregarSelectProdutosRelatorio()`, `carregarSelectsClassificacaoRelatorio()`, `preencherSelectClassificacao(id, valores, textoVazio)`, `classificacaoDoItem(item)`, `parseDateRange(val)`, `coletarRelatorioVendas()`, `gerarRelatorioVendas()`, `exportarRelatorioVendasPDF()`.
- Estoque: `situacaoEstoque(qtd)`, `filtrarRelatorioEstoque(filtro)`, `produtosEstoqueFiltrados()`, `gerarRelatorioEstoque()`, `exportarRelatorioEstoquePDF()` (+ helpers de ID `obterCodigoProduto`/`formatarCodigoProduto`, ver [[Cardapio-Estoque]]).
- Clientes: `clientesRelFiltrados()`, `filtrarRelatorioClientesStatus(filtro)`, `gerarRelatorioClientes()`, `renderRelClientesPagina()`, `mudarPaginaRelClientes(delta)`, `exportarRelatorioClientesPDF()` (+ helpers de ID `obterCodigoCliente`/`formatarCodigoCliente`, ver [[Clientes]]).
- Caixa: `coletarRelatorioCaixa()`, `gerarRelatorioCaixa()` (coleta + volta à página 1), `renderCaixaRelPagina()` (render da página), `verLancamentosRelCaixa(caixaId)`, `renderLancamentosRelCaixa()` (página dos lançamentos), `mudarPaginaRelCaixa(delta)`, `mudarPaginaRelCaixaLanc(delta)`, `exportarRelatorioCaixaPDF()`, `calcularEsperadoCaixa(caixa, movs)` (genérico), `obterSequenciaCaixa(caixa)`, estado `caixaRelSelecionado`/`caixaRelDados`/`caixaRelMovs`.
- Impressão: `abrirImpressaoRelatorio(titulo, subtitulo, tabelaHtml)`.

> ℹ️ Os gráficos antigos (`vendasChart`/`produtosChart`, `initChart`/`initProdutosChart`) foram **removidos** da tela e não são mais chamados por `renderDashboard()`.

## Integrações
- → [[Firebase-Banco-de-Dados]] (dados de `vendas` e `estoque`)
- → [[Funcoes-do-script]]
- → [[Notas-QA-e-Bugs]]
