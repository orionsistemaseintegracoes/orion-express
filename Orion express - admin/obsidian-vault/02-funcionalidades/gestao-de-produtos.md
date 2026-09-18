---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Gestão de Produtos (Estoque)

> CRUD de produtos da coleção `estoque` (tela [[Cardapio-Estoque]]).

## Operações

### Criar / Atualizar — `addProduto()`
1. Lê `#produto-id` (hidden), nome, imagem, `marca`, `grupo`, `subgrupo` (agora `<select>`, ver [[Cardapio-Estoque]]), **`codigoBarras`** (opcional), preço e qtd.
2. Valida: nome preenchido, preço e qtd numéricos.
3. **Valida a classificação**: `marca`/`grupo`/`subgrupo` só são aceitos se constarem nas listas cadastradas em [[Configuracoes]] (`config/classificacoes` — comparação case-insensitive); caso contrário, `alert` bloqueia a gravação.
4. **Valida o código de barras** (opcional): deve ser **EAN-13** — 13 dígitos com dígito verificador válido (`calcularDigitoVerificadorEAN13`).
5. Com `id` → `update` (atualiza). Sem `id` → `add` (cria).
6. Campo `lastUpdate` via `serverTimestamp()`.
7. Reseta formulário (`cancelEdit()`).

### Editar — `editProduto(id)`
1. Busca produto em `db.estoque`.
2. Preenche o formulário com os dados + `#produto-id` (inclui `codigoBarras`); repopula os `<select>` de classificação (`preencherSelectsClassificacaoProduto()`) e mantém valores legados visíveis via `definirClassificacaoSelecionada(tipo, valor)`.
3. Muda título para "Editar Produto" e botão para "ATUALIZAR PRODUTO".
4. Mostra botão "Cancelar" e rola até o formulário.

### Cancelar edição — `cancelEdit()`
- Reseta formulário, limpa `#produto-id`, restaura título/botão, esconde "Cancelar".

### Excluir — `deleteProduto(id)`
- `confirm()` → `doc(id).delete()`.

### Render — `renderizarEstoque()`
- Tabela com Produto | Cód. Barras | Marca | Grupo | Subgrupo | Preço | Qtd. | Ações.
- Marca/Grupo/Subgrupo/**Cód. Barras** são **controle interno** (opcionais; vazios exibidos como `-`); na edição/inclusão vêm das listas cadastradas em [[Configuracoes]].
- `qtd < 5` em **vermelho** (alerta de estoque baixo).
- Atualiza contador `#dash-produtos-total` (se existir).

## Relações
- → [[Cardapio-Estoque]]
- → [[PDV-Carrinho]] (estoque alimenta a Venda Rápida)
- → [[Firebase-Banco-de-Dados]]
