---
tags:
  - orion-express
  - tela
---
# Tela — Cardápio & Estoque

> `#estoque` em `index.html`. Acessível pela sidebar como **"Cardápio"**.

## Propósito
CRUD completo de produtos.

## Estrutura (2 colunas)

### Coluna esquerda — Formulário de produto
- Título dinâmico: **"Adicionar Novo Produto"** ou **"Editar Produto"** (com botão "Cancelar").
- Campos:
  - Nome do Produto (`#produto-nome`)
  - URL da Imagem (`#produto-imagem`)
  - Marca (`#produto-marca`) — `<select>` populado **somente** com as marcas cadastradas em [[Configuracoes]]
  - Grupo (`#produto-grupo`) — `<select>` populado **somente** com os grupos cadastrados em [[Configuracoes]]
  - Subgrupo (`#produto-subgrupo`) — `<select>` populado **somente** com os subgrupos cadastrados em [[Configuracoes]]
  - Código de Barras (**EAN-13**, `#produto-codigo-barras`) — opcional; 13 dígitos com **dígito verificador validado**; auto-completa o 13º dígito ao digitar os 12 primeiros; **controle interno** do admin (estoque/separação/almoxarifado) — **não** aparece na Venda Rápida nem no app do cliente
  - Preço R$ (`#produto-preco`)
  - Quantidade em Estoque (`#produto-qtd`)
  - `#produto-id` (hidden) — preenchido no modo edição
> ℹ️ **ID do produto** (`codigo`): sequência única iniciando em **1** para os cadastros existentes (derivada pela ordem de `lastUpdate`; produtos legados sem o campo são numerados 1..N automaticamente). Novos produtos recebem `proximoCodigoProduto()` (maior + 1) no momento do cadastro. Exibido como `#001` nas telas de cardápio e relatórios; usado como filtro no [[Relatorios]]. O `id` do doc do Firestore é distinto deste ID de exibição.
> ℹ️ **Marca/Grupo/Subgrupo** são **controle interno do admin** (opcionais) e **não são mais texto livre**: viraram `<select>` preenchidos pelas listas cadastradas no cartão "Classificação de Produtos" das [[Configuracoes]] (`config/classificacoes`). `addProduto()` **valida** (case-insensitive) que o valor escolhido exista nas listas cadastradas. Não alteram a exibição no app do cliente (os readers do cliente ignoram campos extras) e servem como colunas/filtros nos [[Relatorios]].
> ℹ️ O **banner do cardápio** não fica mais aqui — foi movido para a tela [[Configuracoes]].
- Botão **SALVAR PRODUTO / ATUALIZAR PRODUTO** → `addProduto()`.

### Coluna direita — Itens Atuais em Estoque
- Tabela: ID | Produto | Cód. Barras | Marca | Grupo | Subgrupo | Preço | Qtd. | **Status** (LIBERADO/BLOQUEADO) | Ações (colspan do vazio = 10).
- Título **"Filtros"** acima dos filtros, com:
  - **Buscar por nome** (`#estq-busca-nome`, filtra pelo texto no nome do produto, case-insensitive).
  - **Buscar por ID** (`#estq-busca-codigo`, numérico — filtra pelo `#N` exato do produto via `obterCodigoProduto`).
  - **Status**: **Todos / Liberados / Bloqueados** (`filtrarEstoqueStatus`; botão `report-filter` ativo) — permite localizar produtos bloqueados, que ficam com a linha `opacity-60`.
- As buscas combinam com o filtro de status (`renderizarEstoque`). Campos com `oninput="filtrarEstoqueBusca()"`.
- **Ordenação**: produtos exibidos na **sequência crescente do ID** (`obterCodigoProduto`).
- **Paginação**: **10 produtos por página** (`#estoque-pagination` — Anterior/Próxima + "Página X de Y · N registro(s)"; `mudarPaginaEstoque`/`renderizarEstoque` + `renderizarPaginacaoGenerica('estoque',...)`). Trocar filtro de busca/status reseta para a **página 1**.
- Marca/Grupo/Subgrupo vazios aparecem como `-`.
- **Qtd. < 5** aparece em vermelho (aviso de estoque baixo).
- Ações: ✏️ Editar (`editProduto`) · 🔒 **BLOQUEAR/LIBERAR** (`bloquearProduto`, alterna `bloqueado`) · 🗑️ Excluir (`deleteProduto`, com `confirm`) — o botão de excluir fica **desabilitado** (cinza) para produtos com **pedidos** ou **bloqueados**.

## Regras de negócio
| Cenário | Comportamento |
|---------|---------------|
| Nome/Preço/Qtd. inválidos | `alert("Preencha todos os campos corretamente...")` |
| Código de barras inválido | Opcional — se preenchido, deve ser **EAN-13** (13 dígitos com dígito verificador válido): `alert("Código de barras inválido. O EAN-13 deve ter exatamente 13 dígitos.")` ou `"O dígito verificador (13º) não confere."` |
| Classificação fora das listas cadastradas | `addProduto()` bloqueia: `alert("Não é possível vincular: <Marca/Grupo/Subgrupo> ... não está cadastrada nas Configurações...")` (comparação **case-insensitive**) |
| Produto com `id` | **Update** no Firestore; mantém `codigo` existente (mesmo sem `codigo`, grava o derivado para numerar cadastros antigos) |
| Produto sem `id` | **Add** no Firestore; recebe `codigo = proximoCodigoProduto()` (maior + 1, começa em 1) |
| Excluir produto | `confirm()` antes de apagar — **bloqueado se o produto já teve pedidos** (`produtoTemMovimentacao`): com vendas, `deleteProduto` recusa com `alert` e a coluna Ações mostra o botão de excluir **desabilitado** |
| Produto com pedidos | **Não pode ser excluído** — só pode ser **BLOQUEADO** (impede venda) até ser liberado |
| Produto bloqueado | Não aparece na **Venda Rápida** (admin) nem no **catálogo do cliente** (`products` filtra `bloqueado !== true`); localizável no Cardápio pelo filtro "Bloqueados" |
| Qtd < 5 | Destaque vermelho na tabela e na Venda Rápida |
| Produto antigo com classificação legada | `editProduto()` repopula os `<select>` e usa `definirClassificacaoSelecionada()` para manter visível o valor ainda não cadastrado (opção temporária até ser corrigido) |

## Funções
- `addProduto()`, `editProduto(id)`, `cancelEdit()`, `deleteProduto(id)`, `renderizarEstoque()`, `preencherSelectsClassificacaoProduto()`, `definirClassificacaoSelecionada(tipo, valor)`
- EAN-13: `calcularDigitoVerificadorEAN13(12digitos)`, `tratarInputCodigoBarras(input)` (sanitiza dígitos/máx. 13 e completa o verificador).
- Bloqueio: `bloquearProduto(id, bloquear)`, `ehProdutoBloqueado(produto)`, `produtoTemMovimentacao(produtoId)`, `filtrarEstoqueStatus(filtro)` (estado `estoqueFiltroStatus`).
- Paginação: `mudarPaginaEstoque(delta)` (estado `estoquePage`).
- `cancelEdit()` reseta o form (volta os `<select>` de classificação ao placeholder).

## Integrações
- → [[Gestao-de-Produtos]]
- → [[PDV-Carrinho]] (produtos aparecem na Venda Rápida)
