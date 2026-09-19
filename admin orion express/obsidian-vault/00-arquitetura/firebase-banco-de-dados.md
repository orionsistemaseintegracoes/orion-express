---
tags:
  - orion-express
  - firebase
---
# Firebase — Banco de Dados (Firestore)

## Conexão

Configuração em `script.js` (projeto **`aura-smoke`**):

- `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`
- ⚠️ Comentário no código: substituir pelas chaves do novo projeto **"orion-express"** no Firebase Console.

> ⚠️ **Segurança**: a `apiKey` fica exposta no cliente (comum em Firebase web). A proteção real deve vir das **regras do Firestore** (`regras_firestore.rules` mencionado no código).

## Coleções

### `clientes`
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `id` | string (auto) | — |
| `codigo` | number | ID único de exibição do cliente (1, 2, 3, ...) — gravado no cadastro (`proximoCodigoCliente()`); clientes legados sem o campo têm ID derivado pela ordem de `since` (`obterCodigoCliente`) |
| `bloqueado` | boolean | `false` padrão (gravado no `add`); `true` = bloqueado pelo admin (fica fora do select do PDV e recusa novos pedidos; usado para clientes que já tiveram pedidos — estes não podem ser excluídos, só bloqueados) |
| `nome` | string | ✅ (validado) |
| `tel` | string | ✅ (validado) |
| `email` | string | ❌ |
| `endereco` | string | ❌ |
| `numero` | string | ❌ |
| `cep` | string | ❌ |
| `since` | timestamp / string (ISO) | Data/hora de cadastro (preenchido no admin via `serverTimestamp()` e no cliente com ISO string) |
| `data_cadastro` | string (ISO) | Preenchido no cadastro do perfil do cliente (`saveProfile`); no Supabase PostgreSQL o campo é `data_cadastro` (snake_case) |

> ✅ `codigo` é o **ID sequencial de exibição** do cliente (começa em 1, único). Exibido como `#001` na tela [[Clientes]]; **não** é o `id` do documento Firestore (campo `id`, auto). Gravado no Create; exclusões não reutilizam ID. [[Gestao-de-Clientes]] e [[Funcoes-do-script]].
>
> ✅ No Supabase, a tabela `clientes` utiliza a coluna `data_cadastro` (e `since`). O painel do cliente (`orion-express-cliente`) grava `data_cadastro` e `since` ao salvar perfil, e a camada `supabase-compat.js` higieniza e mapeia automaticamente qualquer chamada com `dataCadastro` para `data_cadastro`, prevenindo erros de cache de schema do PostgREST. No admin, `dataCadastroDoCliente()` lê `dataCadastro || data_cadastro || since`.

### `estoque` (produtos)
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `id` | string (auto) | — |
| `codigo` | number | ID único de exibição do produto (1, 2, 3, ...) — gravado no cadastro (`proximoCodigoProduto()`); produtos legados sem o campo têm ID derivado pela ordem de `lastUpdate` (`obterCodigoProduto`) |
| `bloqueado` | boolean | `false` padrão (gravado no `add`); `true` = bloqueado pelo admin (não aparece na Venda Rápida nem no catálogo do cliente; usado para produtos que já tiveram pedidos — estes não podem ser excluídos, só bloqueados) |
| `nome` | string | ✅ |
| `marca` | string | ❌ (controle interno do admin) |
| `grupo` | string | ❌ (controle interno do admin) |
| `subgrupo` | string | ❌ (controle interno do admin) |
| `codigoBarras` | string | ❌ (controle interno do admin — **código de barras EAN-13** do produto; opcional, exatamente 13 dígitos com dígito verificador validado; usado para estoque/separação/almoxarifado; **não** exibido na Venda Rápida nem no app do cliente) |
| `preco` | number | ✅ |
| `qtd` | number | ✅ |
| `imagem` | string (URL) | ❌ (usa placeholder) |
| `lastUpdate` | timestamp (server) | — |

> ✅ `marca`/`grupo`/`subgrupo` são campos **opcionais** gravados por `addProduto()` a partir das listas cadastradas no doc `config/classificacoes` ([[Configuracoes]]) — no Cardápio são `<select>` e `addProduto()` **valida** (case-insensitive) que o valor exista nas listas cadastradas. Classificação **interna do admin**: usada como colunas/filtros nos [[Relatorios]] e **não** altera a exibição do app do cliente (os listeners `listenToProducts`/`renderProducts` ignoram campos extras).
>
> ✅ `codigo` é o **ID sequencial de exibição** do produto (começa em 1, único). Exibido como `#001` no Cardápio, Venda Rápida e Relatório de Estoque (coluna + filtro `#estoque-rel-codigo`); **não** é o `id` do documento Firestore (campo `id`, auto). O `codigo` é gravado no Create; no Update é mantido (gravado o derivado se o cadastro antigo não tinha). [[Cardapio-Estoque]] e [[Funcoes-do-script]].
>
> ✅ `bloqueado` é o **status de venda** do produto (`false` por padrão). Produtos com pedidos (`produtoTemMovimentacao`) **não** podem ser excluídos — apenas bloqueados/liberados pelo admin (`bloquearProduto`). O catálogo do cliente (`orion-express-cliente`) filtra `bloqueado !== true`.

### `vendas` (pedidos)
| Campo | Tipo | Nota |
|-------|------|------|
| `id` | string (auto) | ID único do Firestore (não exibido como número de pedido) |
| `total` | number | Somatório dos itens |
| `numeroPedido` | string | Número sequencial do pedido (`001`, `002`, ... — **3 dígitos mínimos**, `padStart(3,'0')`) gerado na criação; pedidos antigos com 6 dígitos (`000027`) são **reformatados** para `###` pela migração `migrarNumeroPedido` (ex.: `027`) |
| `itens` | array | `[{ id, nome, preco, qtdCarrinho, qtdEstoque }]` |
| `formaPagamento` | string | Forma de pagamento escolhida (ex.: `PIX`, `Cartão`) |
| `clienteId` | string\|null | `null` = "Cliente Balcão" |
| `clienteNome` | string | Vindo do cliente ou "Cliente Balcão" |
| `dataIso` | string (ISO) | Ordena a coleção (`orderBy('dataIso','desc')`) |
| `data` | string | Data/hora formatada pt-BR |
| `status` | string | Padrão `'Em Preparação'` |
| `userId` / `userName` | string | Quem registrou a venda |

> ✅ `formaPagamento` agora é gravado por `finalizarVenda()` (admin) e `checkout()` (cliente) — o `renderPaymentSummary` do dashboard usa `formaPagamento`/`pagamento` (bug [#2](Notas-QA-e-Bugs.md) resolvido).

> ℹ️ Os **itens de venda continuam sem classificação** (`{ id, nome, preco, qtdCarrinho, qtdEstoque }`). `marca`/`grupo`/`subgrupo` são resolvidos **somente** na geração dos relatórios por `classificacaoDoItem(item)`, que busca o produto em `estoque` por `id`/`nome` ([[Funcoes-do-script]]).

### `caixas` (gerenciamento de caixa)
| Campo | Tipo | Nota |
|-------|------|------|
| `id` | string (auto) | ID do caixa (referenciado em `movimentacoes_caixa.caixa_id`) |
| `sequencia` | number | Sequência do caixa (1, 2, 3...) — começa em 1; preenchida ao abrir (`proximaSequenciaCaixa()`); para caixas antigos sem o campo, é derivada pela ordem de `data_abertura` |
| `usuario_abertura_id` | string | UID do operador que abriu |
| `usuario_abertura_nome` | string | Nome exibido do operador de abertura |
| `data_abertura` | string (ISO) | Ordena a coleção (`orderBy('data_abertura','desc')`) |
| `valor_abertura` | number | Dinheiro físico inicial |
| `status` | string | `'ABERTO'` ou `'FECHADO'` |
| `data_fechamento` | string (ISO)\|null | Preenchido no fecho |
| `usuario_fechamento_id` | string\|null | Quem fechou |
| `valor_informado_fechamento` | number\|null | Dinheiro **contado** no fecho |
| `valor_esperado_fechamento` | number\|null | Esperado calculado em **Dinheiro** no fecho |
| `diferenca` | number\|null | `contado - esperado` (negativo = falta, positivo = sobra) |

> Apenas **um caixa `ABERTO`** por vez. `abrirCaixa()` bloqueia se `caixaAtual` já existe. Ver [[Gerenciamento-de-Caixa]].

### `movimentacoes_caixa` (lançamentos do caixa)
| Campo | Tipo | Nota |
|-------|------|------|
| `id` | string (auto) | |
| `caixa_id` | string | Caixa a que pertence (ABERTO, na prática) |
| `tipo` | string | `VENDA` · `SANGRIA` · `SUPRIMENTO` · `ESTORNO` |
| `forma_pagamento` | string | `DINHEIRO` · `PIX` · `CARTAO` · `OUTROS` (mais Dinheiro na abertura) |
| `valor` | number | Valor positivo do lançamento |
| `data_hora` | string (ISO) | Ordena (`orderBy('data_hora','desc')`) |
| `usuario_id` | string | UID de quem registrou |
| `venda_id` | string\|null | Preenchido para `VENDA` |
| `observacao` | string | Ex.: "Pedido 001" ou observação de sangria |

> **Esperado por forma** = (abertura só em `DINHEIRO`) + `VENDA`/`SUPRIMENTO` 👉 soma, `SANGRIA`/`ESTORNO` 👉 subtrai, agrupado por `forma_pagamento`. No fecho só o **Dinheiro** é contado manualmente; PIX/Cartão são informativos.

> **VENDA automática**: vendas do PDV admin (`finalizarVenda`) e do **painel do cliente** (`checkout`) entram no caixa aberto. O PDV grava direto (`registrarMovimentacaoVendaCaixa`); os pedidos do cliente são alcançados pela **conciliação** `conciliarVendasNoCaixa()` (roda nos listeners de `vendas`/`caixas`/`movimentacoes_caixa`). Lançamento idempotente: doc com `id = venda_id` (campo `venda_id`). **Janela de conciliação**: só vendas criadas **após o fechamento do caixa anterior** (`data_fechamento` do último `FECHADO`, via `obterInicioJanelaConciliacao()`) — ou seja, apenas o período "sem caixa" (ex.: pedido #000025 feito com caixa fechado) é atribuído ao novo caixa aberto. Vendas históricas de períodos com caixa não são puxadas retroativamente. **Não bloqueia a venda** se o caixa fechar/falhar (`try/catch` silencioso).

### `config/pagamentos`
| Campo | Tipo | Nota |
|-------|------|------|
| `metodos` | array de string | Formas de pagamento disponíveis (ex.: `['PIX','Cartão']`) |
| `lastUpdate` | timestamp | — |

Documento único com **id fixo** `pagamentos`. Compartilhado entre **admin** (PDV + Configurações) e **cliente** (checkout). Fallback quando vazio/inexistente: `['PIX', 'Cartão', 'Dinheiro', 'Outros']`.

### `config/classificacoes`
| Campo | Tipo | Nota |
|-------|------|------|
| `marcas` | array de string | Marcas cadastradas (controle interno) |
| `grupos` | array de string | Grupos cadastrados (controle interno) |
| `subgrupos` | array de string | Subgrupos cadastrados (controle interno) |
| `lastUpdate` | timestamp | — |

Documento único com **id fixo** `classificacoes`. **Fonte única** dos selects de Marca/Grupo/Subgrupo do [[Cardapio-Estoque]] (`preencherSelectsClassificacaoProduto`) e base dos filtros de classificação dos [[Relatorios]] (`carregarSelectsClassificacaoRelatorio`, que faz **união** com valores já usados nos produtos — compatibilidade com dados antigos). Gravado por `salvarClassificacoes()` na tela [[Configuracoes]] (via `adicionarClassificacao()` / `removerClassificacao()`). **Não** é compartilhado com o app do cliente.

### `config/banner`
| Campo | Tipo | Nota |
|-------|------|------|
| `url` | string | URL da imagem do banner do cardápio (app cliente) |
| `lastUpdate` | timestamp | — |

Documento único com **id fixo** `banner`.

### `config/loja`
| Campo | Tipo | Nota |
|-------|------|------|
| `nome` | string | Nome da loja exibido na sidebar |
| `unidade` | string | Unidade/endereço curto exibido na sidebar |
| `lastUpdate` | timestamp | — |

Documento único com **id fixo** `loja`. Gravado por `salvarConfigLoja()` na tela [[Configuracoes]].

### `usuarios` (contas de acesso)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `email` | string | E-mail usado no login (Firebase Auth) |
| `nome` | string | Nome de exibição |
| `photoURL` | string | Foto do perfil (Storage ou URL) |
| `role` | string | `'admin'` ou `'funcionario'` |
| `bloqueado` | boolean | `false` por padrão; `true` = operador bloqueado pelo admin (perde acesso ao painel) |
| `criadoEm` | timestamp | Data de criação |
| `senhaAlteradaEm` | timestamp (server) | Gravado **apenas** pela Cloud Function `resetOperadorPassword` ([[Cloud-Functions]] — alternativa para o Blaze, **não ativa**); a redefinição no Spark é por e-mail (`auth.sendPasswordResetEmail`), que **não** grava este campo |

Criado **somente** por `cadastrarNovoFuncionario()` (**exclusivo do admin**, **`role: 'funcionario'`**, **`bloqueado: false`**) — a conta é criada numa **app Firebase isolada** (`cadastroTemp` via `obterAppCadastroTemp()`), portanto `createUserWithEmailAndPassword` **não troca a sessão do admin**; o `set()` do doc é feito com a **sessão do admin** (`dbFirestore`, regras permitem admin gravar em qualquer doc de `usuarios`) e o admin **permanece logado** (sem `auth.signOut()`). O gate de acesso (`auth.onAuthStateChanged`) consulta `usuarios/{uid}` a cada login e bloqueia: **sem doc = conta de cliente** (`signOut()` + aviso "Acesso negado: esta conta não é de um operador do painel.") **ou `bloqueado === true`** (`signOut()` + aviso "Acesso negado: este operador está bloqueado pelo administrador.") no `#login-aviso`. Atualizado por `salvarPerfil()` (merge), `promoverParaAdmin()` (senha master), `salvarFuncionario()` (admin), `bloquearFuncionario()`/`excluirFuncionario()` (admin). A redefinição de senha por **e-mail** (`auth.sendPasswordResetEmail`) **não altera o doc**; só a Cloud Function `resetOperadorPassword` (alternativa Blaze, não ativa) gravaria `senhaAlteradaEm` via Admin SDK. Ver [[Configuracoes]].

> **Corrida do cadastro**: `perfisEmCriacao` (Set de e-mails) permanece, mas a criação é feita numa **app isolada** (`cadastroTemp`) — o `onAuthStateChanged` do painel **não é disparado** pelo cadastro; o Set é defesa extra caso a sessão mude por outro meio.
> **Banco atual (QA)**: `usuarios` tem apenas **2 registros** — `teste@teste.com` (`admin`) e `teste4@teste4.com` (`funcionario`).

> **Regras de Firestore** (`firestore.rules`, ruleset **`5fb85b19-b088-4985-aeeb-390cd30bc168`**):
> - `usuarios`: **`read`** autenticado; **`create, delete`** somente **ADMIN** — impede que um cliente crie o próprio doc e ganhe acesso ao painel (fecha o vetor de escalation); **`update`** permite (a) o próprio usuário editar o próprio perfil, **desde que as chaves alteradas NÃO incluam `bloqueado`**, ou (b) um admin.
> - Função `isAdminUsuarios()`: usuário tem `role == 'admin'` no próprio doc (`exists()` + `get(...).data.role`).
> - Anti auto-desbloqueio: `request.resource.data.diff(resource.data).affectedKeys().hasAny(['bloqueado'])` na permissão de `update` do próprio usuário.
> ⚠️ **Gotcha**: use a **função `exists(...)`**. A propriedade `get(...).exists` nega a escrita (`Missing or insufficient permissions`) mesmo o doc existindo — verificada e corrigida em produção (ruleset `8848c62a…`).

## Status possíveis de `vendas.status`

`Em Preparação` · `Saiu para Entrega` · `Entregue` · `Cancelado`

Normalização do board: `novos` / `preparo` / `saiu` / `entregues` / `cancelados`. Ver [[Status-de-Pedidos]].

## Numeração de pedido

- `numeroPedido` é gerado por um **contador atômico compartilhado** em `config/contador` (leitura + incremento em transação via `proximoNumeroPedido()`). Assim o admin e o **app do cliente** seguem a mesma sequência (`001`, `002`, ... — **mínimo de 3 dígitos**, `padStart(3,'0')`; mesma lógica dos IDs de produto/cliente `#001`) sem duplicar.
- O `id` do Firestore **continua como ID único no banco**; o número de pedido é exibido no lugar do ID nas telas e na comanda/comprovante.
- **Sincronização do contador** (garante o contador ≥ maior `numeroPedido`, **reformata os existentes para `###`** e numera os pedidos antigos **sem número**, do mais antigo ao mais recente):
  - Admin: `migrarNumeroPedido()` (login) — reformata formatos legados (ex.: `000027` → `027`).
  - Cliente: `sincronizarContadorPedido()` (no `init`).

## Padrão de leitura

`iniciarSincronizacao()` registra:
1. `clientes.onSnapshot` → atualiza `db.clientes` + re-render.
2. `estoque.onSnapshot` → atualiza `db.estoque` + re-render.
3. `vendas.orderBy('dataIso','desc').onSnapshot` → atualiza `db.vendas` + re-render.
4. `config/pagamentos.onSnapshot` → atualiza `metodosPagamento` + re-render (seletor PDV e lista de Configurações).
5. `config/classificacoes.onSnapshot` → atualiza `marcasCadastradas`/`gruposCadastrados`/`subgruposCadastrados` + `renderizarListaClassificacoes()`, `preencherSelectsClassificacaoProduto()` e `carregarSelectsClassificacaoRelatorio()`. (Fonte única da classificação no Cardápio e base dos filtros dos Relatórios.)
6. `usuarios.onSnapshot` → atualiza `db.usuarios` + **auto-kick em tempo real**: se o doc do usuário logado (que não seja admin) tiver `bloqueado: true`, chama `auth.signOut()`; senão `renderAvatarAtual(auth.currentUser)` (avatar/nome refletem a edição do doc em tempo real) + `renderListaFuncionarios()` (cartão do admin).
7. `caixas.orderBy('data_abertura','desc').onSnapshot` → atualiza `caixasLista` + define `caixaAtual` (o primeiro `status === 'ABERTO'`, ou `null`) + `renderizarCaixa()` + `conciliarVendasNoCaixa()`.
8. `movimentacoes_caixa.orderBy('data_hora','desc').onSnapshot` → atualiza `movimentacoesCaixa`, marca `movCaixaCarregado = true`, chama `renderizarCaixa()` + `conciliarVendasNoCaixa()`.
9. `logs.orderBy('timestamp','desc').onSnapshot` → atualiza `db.logs` (auditoria/controladoria) e re-renderiza a aba Log de Operações se estiver visível.

## Log de Operações (auditoria/controladoria) — coleção `logs`

- **Regra de negócio**: toda mutação relevante do painel registra um log via **`registrarLog(acao, entidade, registroId, descricao, detalhes)`** — apêndice imutável (regras: operador só **lê** e **cria**; `update`/`delete` = `false`).
- Campos do doc:
  | Campo | Tipo | Descrição |
  |-------|------|-----------|
  | `acao` | string | `incluir` · `editar` · `excluir` · `bloquear` · `desbloquear` · `venda` · `status` · `promover` · `login` · `caixa_abrir` · `caixa_fechar` · `caixa_lancamento` |
  | `entidade` | string | `produto` · `cliente` · `venda` · `config` · `perfil` · `usuario` · `caixa` |
  | `registroId` | string/null | ID do registro (doc), quando aplicável |
  | `descricao` | string | Texto legível (ex.: `Produto "X" cadastrado`, `Venda #027 finalizada — R$ 45,00 (PIX)`) |
  | `detalhes` | object/null | Dados extras (ex.: `{ nome, preco, qtd }` da inclusão; itens da venda) |
  | `usuarioId` / `usuarioNome` / `usuarioEmail` | string | Quem executou (nome usa `displayName` com fallback para e-mail) |
  | `timestamp` | timestamp (server) | Quando |
- Ações instrumentadas: CRUD de **produtos** (`addProduto`, `deleteProduto`, `bloquearProduto`), **clientes** (`addCliente`, `deleteCliente`, `bloquearCliente`), **vendas** (`finalizarVenda`, `updateOrderStatus`), **caixa** (`abrirCaixa`, `fecharCaixa`, `salvarLancamentoCaixa`), **configurações** (`salvarConfigLoja`, `salvarBannerConfig`, `salvarPersonalizacao`, `adicionar/removerMetodoPagamento`, `adicionar/removerClassificacao`) e **perfil/usuários** (`salvarPerfil`, `promoverParaAdmin`, `cadastrarNovoFuncionario`, `salvarFuncionario`, `bloquearFuncionario`, `excluirFuncionario`, login).
- Falha de registro **não bloqueia** a operação principal (erro vai só ao console).
- Consulta na aba **Log de Operações** de [[Configuracoes]].

No **cliente** (orion-express-cliente): `listenToPaymentMethods()` escuta `config/pagamentos` e popula o seletor do checkout.

## Relações

- → [[Sincronizacao-Tempo-Real]]
- → [[Autenticacao]]
- → [[Funcoes-do-script]]
- → [[Gerenciamento-de-Caixa]]
