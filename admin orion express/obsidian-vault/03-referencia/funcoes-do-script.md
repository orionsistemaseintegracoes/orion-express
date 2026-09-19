---
tags:
  - orion-express
  - referencia
---
# Referência — Funções do `script.js`

Inventário completo das funções do arquivo, agrupadas por área.

## Configuração e início
- `firebase.initializeApp(...)` — sobe o Firebase (sem `firebase-functions-compat`, tag removida do `index.html`).
- `auth.onAuthStateChanged` — **gate de operador**: confere o doc em `usuarios/{uid}` antes de liberar o painel. Exige doc existente **e `bloqueado !== true`**; conta sem registro (cliente) ou com `bloqueado: true` é deslogada com aviso no `#login-aviso`; depois inicia o app.
- `iniciarSincronizacao()` — registra os listeners `onSnapshot` (clientes, estoque, vendas, `config/pagamentos`, **`config/classificacoes`**, usuarios, **`caixas`**, **`movimentacoes_caixa`**); no snapshot de `usuarios`: **auto-kick** + `renderAvatarAtual(auth.currentUser)` — o avatar reflete a edição do doc em tempo real (ex.: admin muda a foto do funcionário logado em outra aba). No snapshot de `classificacoes`: preenche `marcasCadastradas`/`gruposCadastrados`/`subgruposCadastrados` e chama `renderizarListaClassificacoes()`, `preencherSelectsClassificacaoProduto()` e `carregarSelectsClassificacaoRelatorio()`. Nos snapshots de `caixas`/`movimentacoes_caixa`: mantém `caixaAtual` (único `ABERTO`) e `movimentacoesCaixa` e chama `renderizarCaixa()`.

## Autenticação
| Função | Ação |
|--------|------|
| `login()` | Login e-mail/senha (limpa o `#login-aviso` antes de tentar) |
| `obterAppCadastroTemp()` | Retorna a **app Firebase isolada** `cadastroTemp` (reusa se já existir; senão `firebase.initializeApp(firebaseConfig, 'cadastroTemp')`) — cria funcionário com Auth separado, **sem trocar a sessão do admin** |
| `cadastrarNovoFuncionario()` | **Admin-only**: cria a conta na app isolada (`firebase.auth(tempApp)` via `obterAppCadastroTemp()`) + nome + doc `usuarios/{uid}` (`role: 'funcionario'`, **`bloqueado: false`**) com a sessão do admin; **sem `auth.signOut()`** — o admin permanece logado |
| `logout()` | Sai (via switcher da sidebar) |
| `abrirModalCadastro()` / `fecharModalCadastro()` | Abre/fecha modal de cadastro (abrir exige admin; chamado pelo botão "Novo Funcionário" das [[Configuracoes]]) |
| `mostrarAvisoLogin(msg)` | Exibe aviso em `#login-aviso` (ex.: acesso negado) |
| `ocultarAvisoLogin()` | Esconde o `#login-aviso` |

Estado: `perfisEmCriacao` — `Set` de **e-mails** com cadastro em andamento; o gate do `onAuthStateChanged` usa-o para aguardar até ~5s (tentativas de 250ms) a gravação do doc em `usuarios`. Como a criação roda numa app isolada (`cadastroTemp`), o Auth principal **não muda** durante o cadastro — o Set permanece como defesa extra.

## Gestão de páginas
- `mostrarPagina(id)` — alterna a tela ativa (esconde todas `.page-content`, ativa o `nav-btn`).

## Utilitários
- `formatarMoeda(valor)` — formata pt-BR/BRL.
- `escapeDashboard()` — escapa HTML para o board.
- `dataDaVenda(venda)` — `Date` robusto a partir de `dataIso`/`data`.

## Número de Pedido
| Função | Ação |
|--------|------|
| `proximoNumeroPedido()` | **Async** — próximo `numeroPedido` via contador atômico `config/contador` (`runTransaction`, `padStart(3,'0')` → `001`, `002`, ...) |
| `numeroExibicao(venda)` | Retorna o nº a exibir (usando `numeroPedido`; fallback curto defensivo) |
| `migrarNumeroPedido()` | Sincroniza o contador com o maior `numeroPedido`, **reformata os existentes para ###** (ex.: `000027` → `027`) e numera pedidos antigos sem número (chamada no login) |

## Estoque (produtos)
| Função | Ação |
|--------|------|
| `addProduto()` | Create/Update — lê e grava `marca`/`grupo`/`subgrupo`/**`codigoBarras`** no doc `estoque`; **valida** que a classificação exista nas listas cadastradas (comparação case-insensitive; alerta bloqueia se não cadastrada) e que o **código de barras** (opcional) seja **EAN-13** (13 dígitos com dígito verificador válido). No **Create** grava `codigo = proximoCodigoProduto()`; no **Update** mantém o `codigo` existente (grava o derivado se o cadastro antigo não tinha) |
| `calcularDigitoVerificadorEAN13(dozeDigitos)` | **NOVA** — calcula o 13º dígito (verificador) do EAN-13 a partir dos 12 primeiros |
| `tratarInputCodigoBarras(input)` | **NOVA** — sanitiza `#produto-codigo-barras` (só dígitos, máx. 13) e auto-completa o dígito verificador ao atingir 12 dígitos (`oninput`) |
| `obterCodigoProduto(produto)` | **NOVA** — ID único do produto (1, 2, 3, ...): usa o campo `codigo` gravado se existir; caso contrário deriva pela posição na lista ordenada por `lastUpdate`/nome (mantém produtos antigos numerados a partir de 1) |
| `proximoCodigoProduto()` | **NOVA** — Próximo ID: maior código existente + 1 (começa em 1) |
| `formatarCodigoProduto(codigo)` | **NOVA** — Formata ID para exibição com zero à esquerda (`1` → `#001`) |
| `editProduto(id)` | Preenche form p/ edição (inclui `marca`/`grupo`/`subgrupo`/`codigoBarras`); repopula os `<select>` (`preencherSelectsClassificacaoProduto`) e mantém valor legado visível via `definirClassificacaoSelecionada()` |
| `cancelEdit()` | Reseta form (volta os selects de classificação ao placeholder) |
| `deleteProduto(id)` | Delete (confirm) — **recusa se o produto já teve pedidos** (`produtoTemMovimentacao`) |
| `bloquearProduto(id, bloquear)` | **NOVA** — alterna `bloqueado` do produto (confirma; impede venda até liberar) |
| `ehProdutoBloqueado(produto)` | **NOVA** — `produto.bloqueado === true` |
| `produtoTemMovimentacao(produtoId)` | **NOVA** — true se alguma venda tem item com `id === produtoId` |
| `filtrarEstoqueStatus(filtro)` | **NOVA** — filtro da tabela do Cardápio: todos/liberados/bloqueados (estado `estoqueFiltroStatus`); reseta para página 1 |
| `filtrarEstoqueBusca()` | **NOVA** — re-renderiza a tabela do Cardápio aplicando busca por nome (`#estq-busca-nome`) e ID (`#estq-busca-codigo`); reseta para página 1 |
| `renderizarEstoque()` | Render tabela ID \| Produto \| Cód. Barras \| Marca \| Grupo \| Subgrupo \| Preço \| Qtd \| Status \| Ações (**ordena por ID crescente**, **10 por página**) |
| `mudarPaginaEstoque(delta)` | **NOVA** — Anterior/Próxima da tabela do Cardápio (estado `estoquePage`, via `renderizarPaginacaoGenerica('estoque',...)`) |
| `ehRegistroBanner(item)` | Detecta registro de banner (não é produto) |
| `produtosVendiveis()` | `db.estoque` sem os registros de banner |

## Configurações (loja + banner)
| Função | Ação |
|--------|------|
| `loadBannerConfig()` | Carrega loja + banner (chamada no login) |
| `salvarConfigLoja()` | Salva `config/loja` e atualiza a sidebar |
| `salvarBannerConfig()` | Salva `config/banner` |
| `aplicarLojaSidebar(nome, unidade)` | Helper: aplica nome/unidade na sidebar |
| `mostrarAbaConfig(aba)` | Alterna as 5 abas de Configurações (`estabelecimento`/`catalogo`/`aparencia`/`conta`/`log`) — padrão Relatórios. Ao abrir `log`: `carregarUsuariosFiltroLog()` + `renderizarLogOperacoes()` |

## Personalização do App (config/personalizacao)
| Função | Ação |
|--------|------|
| `loadPersonalizacao()` | Carrega cores, logo e toggle de login (chamada no login e quando deslogado); aplica CSS custom properties |
| `salvarPersonalizacao()` | Salva `config/personalizacao` e aplica cores + logo imediatamente |
| `previewLogoApp()` | Aplica a URL da logo (`#config-logo-url`) no preview e no login/sidebar (`aplicarLogoApp`) |
| `aplicarLogoApp(url)` | Aplica a logo em `#sidebar-logo-img` (sidebar) e `#login-logo` (login); URL vazia volta para `orion-logo.png` |
| `syncColorPicker(tipo)` | Sincroniza campo hex → color picker |
| `aplicarPreset(nome)` | Aplica preset (orion/azul/verde/escuro) nos campos e aplica cores |
| `aplicarCoresTema(c, aplicarLogin)` | Define CSS custom properties (`--tema-principal`, `--tema-botoes`, `--tema-fundo`, `--tema-texto`) e alterna as classes `personalizado`/`tema-login` no `body` |

Estado: `PRESETS` (objeto constante com combinações pré-definidas de cores). Doc Firestore: `config/personalizacao → { logoUrl, corPrincipal, corBotoes, corFundo, corTexto, aplicarLogin, lastUpdate }`.

## Formas de Pagamento (config/pagamentos)
| Função | Ação |
|--------|------|
| `renderizarSelectPagamento()` | Popula `#selectFormaPagamento` no PDV a partir de `metodosPagamento` |
| `renderizarListaPagamentos()` | Lista as formas no card de Configurações (`#lista-config-pagamentos`) |
| `salvarMetodosPagamento()` | Grava `config/pagamentos → { metodos }` |
| `adicionarMetodoPagamento()` | Adiciona (com validação de duplicado) |
| `removerMetodoPagamento(nome)` | Remove (com confirm) |
| `mostrarStatusPagamento(msg)` | Mensagem temporária `#config-pagamento-status` |

Estado: `metodosPagamento` (array em memória, alimentado pelo `onSnapshot` de `config/pagamentos` em `iniciarSincronizacao`); fallback `METODOS_PAGAMENTO_PADRAO = ['PIX','Cartão','Dinheiro','Outros']`.

## Classificação de Produtos (config/classificacoes)
| Função | Ação |
|--------|------|
| `obterListaClassificacao(tipo)` | Retorna a array em memória do tipo (`marca`→`marcasCadastradas`, `grupo`→`gruposCadastrados`, `subgrupo`→`subgruposCadastrados`) |
| `nomeClassificacao(tipo)` | Nome legível (`'Marca'`/`'Grupo'`/`'Subgrupo'`) |
| `renderizarListaClassificacoes()` | Lista as opções nos 3 blocos de Configurações (`#lista-config-marcas|grupos|subgrupos`) com 🗑 de remover |
| `salvarClassificacoes()` | Grava `config/classificacoes → { marcas, grupos, subgrupos, lastUpdate }` |
| `mostrarStatusClassificacao(msg)` | Mensagem temporária `#config-classificacao-status` |
| `adicionarClassificacao(tipo)` | Adiciona (Enter ou botão ADICIONAR; valida duplicado case-insensitive) e re-popula selects do Cardápio/Relatórios |
| `removerClassificacao(tipo, nome)` | Remove (com `confirm`) e re-popula selects do Cardápio/Relatórios |
| `preencherSelectsClassificacaoProduto()` | Popula os `<select>` `#produto-marca|grupo|subgrupo` do Cardápio **somente** com as opções cadastradas (preserva a seleção atual) |
| `definirClassificacaoSelecionada(tipo, valor)` | Define o valor do select ao editar; se o valor gravado não consta na lista (produto antigo), adiciona a opção temporariamente para manter visível |

Estado: `marcasCadastradas`, `gruposCadastrados`, `subgruposCadastrados` (arrays em memória, alimentadas pelo `onSnapshot` de `config/classificacoes` em `iniciarSincronizacao`).

## Clientes
| Função | Ação |
|--------|------|
| `addCliente()` | Create (nome+tel obrigatórios; grava `codigo` = próximo ID e `bloqueado: false`) |
| `deleteCliente(id)` | Delete (confirm) — **recusa com pedidos** (`clienteTemMovimentacao`) |
| `bloquearCliente(id, bloquear)` | Bloqueia/libera (confirm); bloqueado não gera novos pedidos |
| `ehClienteBloqueado(cliente)` | `cliente.bloqueado === true` |
| `clienteTemMovimentacao(clienteId)` | Venda existente com `venda.clienteId === clienteId` |
| `renderizarClientes()` | Render tabela (filtros status/nome/ID; **ordena por ID crescente**; **10 por página**) |
| `mudarPaginaClientes(delta)` | **NOVA** — Anterior/Próxima da tabela de Clientes (estado `clientesPage`) |
| `filtrarClientesStatus(filtro)` | Filtro Todos/Liberados/Bloqueados (`clientesFiltroStatus`) |
| `filtrarClientesBusca()` | Re-renderiza aplicando busca por nome (`cli-busca-nome`) e ID (`cli-busca-codigo`) |
| `obterCodigoCliente(cliente)` | ID sequencial: lê `codigo` ou deriva pela ordem de criação (legados a partir de 1) |
| `proximoCodigoCliente()` | Maior `codigo` + 1 (novo cadastro) |
| `formatarCodigoCliente(codigo)` | Formata para exibição `#001` |
| `renderizarSelectClientes()` | Popula o **dropdown** de clientes do PDV (`#listaSelectClientes` — **somente não bloqueados**, **sempre ordenados por ID crescente**, **20 por página** via `renderizarPaginacaoGenerica('select-cliente',...)`); **auto-seleciona o cadastro mais próximo do filtro** (`venda-busca-cliente-*`) e guarda no `<input hidden #selectCliente>`; **preserva seleção atual** se ainda combinar |
| `filtrarSelectClientes()` | Re-popula o dropdown do PDV (busca nome/ID; **reseta para a página 1**) |
| `clienteMaisProximo(clientes, buscaNome, buscaCodigo)` | Retorna o cadastro mais próximo do filtro: nome exato > começa com > contém > menor ID (ou o ID exato quando filtrado por código) |
| `toggleSelectClientes(event)` | **NOVA** — abre/fecha o dropdown de clientes do PDV (fecha os demais `.status-dropdown`) |
| `selecionarClientePDV(id)` | **NOVA** — seleciona cliente no dropdown (grava no `#selectCliente` hidden, atualiza label e fecha) |
| `mudarPaginaSelectClientes(delta)` | **NOVA** — Anterior/Próxima da lista de clientes do PDV (estado `selectClientesPage`, 20 por página) |
| `atualizarLabelClientePDV(id)` | **NOVA** — reflete no botão o cliente selecionado (ou placeholder) |

## PDV / Carrinho
| Função | Ação |
|--------|------|
| `renderizarProdutosVenda()` | Cards de produtos (exibem `ID #N`; **produtos bloqueados são ocultados**; filtra por nome/ID via `venda-busca-produto-*`; **ordena por ID**; **paginado 9 por tela** via `renderizarPaginacaoGenerica('venda-produtos',...)`) |
| `filtrarProdutosVenda()` | Re-renderiza os produtos da Venda Rápida (busca nome/ID; **reseta para a página 1**) |
| `mudarPaginaProdutosVenda(delta)` | **NOVA** — Anterior/Próxima da grade de produtos da Venda Rápida (estado `vendaProdutosPage`, 9 por página) |
| `addToCart(id)` | Adiciona/incrementa quantidade |
| `updateCartItemQtd(id, delta)` | +/- quantidade |
| `renderizarCarrinho()` | Render itens + total |
| `finalizarVenda()` | Grava venda + baixa estoque (batch) + registra movimentação VENDA no caixa (se aberto) |
| `registrarMovimentacaoVendaCaixa(vendaId, numeroPedido, formaPagamento, total, venda)` | Add/merge em `movimentacoes_caixa` (`tipo: 'VENDA'`, **`docId = venda_id`** — idempotente) com `caixa_id` do `caixaAtual`; só grava se houver caixa aberto; `try/catch` silencioso (não bloqueia a venda) |
| `conciliarVendasNoCaixa()` | Concilia no caixa aberto as vendas sem lançamento (PDV admin + painel do cliente), na **janela "sem caixa"** (após o último fechamento); deduplica pela lista `movimentacoesCaixa` |
| `obterInicioJanelaConciliacao()` | Data do fechamento do caixa `FECHADO` mais recente (ou abertura do atual se não houver) — limite da conciliação |

## Caixa (Gerenciamento de Caixa)
| Função | Ação |
|--------|------|
| `normalizarFormaPagamentoCaixa(forma)` | Rótulo do caixa: `PIX`→`PIX`, `Cartão`→`CARTAO`, `Dinheiro`→`DINHEIRO`, senão `OUTROS` |
| `renderizarCaixa()` | Orquestra a tela (badge, info, lançamentos, fechamento, histórico) a partir de `caixaAtual`/`movimentacoesCaixa` |
| `calcularEsperadoCaixa(caixa, movs)` | **Genérico** — esperado por forma de QUALQUER caixa: abertura + VENDA/SUPRIMENTO somam; SANGRIA/ESTORNO subtraem |
| `calcularEsperadoPorForma()` | Esperado `{ DINHEIRO, PIX, CARTAO, OUTROS }`: abertura + VENDA/SUPRIMENTO somam; SANGRIA/ESTORNO subtraem (agrupado por `forma_pagamento`) |
| `renderizarLancamentosCaixa()` | Formulário (tipo/forma/valor/observação) + tabela das movimentações do caixa aberto |
| `salvarLancamentoCaixa()` | Add em `movimentacoes_caixa` (com `confirm` se a sangria > esperado em Dinheiro) |
| `abrirCaixa(event)` | Add em `caixas` (`status: 'ABERTO'`, `sequencia`); bloqueia se `caixaAtual` já existir |
| `obterSequenciaCaixa(caixa)` | Sequência do caixa (`#N`) — gravada se existir, senão derivada pela ordem de `data_abertura` |
| `proximaSequenciaCaixa()` | Maior sequência existente + 1 (começa em 1) |
| `renderizarFechamentoCaixa()` | Esperado por forma + campo Dinheiro contado + diferença |
| `atualizarDiferencaCaixa()` | Calcula `contado - esperado.DINHEIRO` ao vivo (`#caixa-diferenca`) |
| `fecharCaixa()` | `update` do doc `caixas` (status FECHADO, datas, contado, esperado, diferença) + alert |
| `renderizarHistoricoCaixas()` | Tabela de caixas FECHADOS |

Estado: `caixasLista`, `caixaAtual` (o único `status === 'ABERTO'` ou `null`), `movimentacoesCaixa`, `tipoLancamentoAtual`. Ver [[Gerenciamento-de-Caixa]].

## Histórico / Status
| Função | Ação |
|--------|------|
| `renderHistoricoVendas()` | Tabela de pedidos |
| `updateOrderStatus(id, status)` | Atualiza status |
| `toggleDropdown(event, id)` | Dropdown de status |

## Dashboard e gráficos
| Função | Ação |
|--------|------|
| `renderDashboard()` | Orquestra tudo (inclui `renderRelatorios()`) |
| `renderOrderBoard()` | Board + contadores |
| `renderDashboardSummary()` | KPIs do dia |
| `renderDashboardSalesChart()` | Gráfico horário de vendas de hoje |
| `renderPaymentSummary()` | Formas de pagamento |
| `filtrarPedidosBoard(filtro)` | Filtro do board |
| `vendasDeHoje()` | Vendas do dia |

## Relatórios (tabelas + PDF)
| Função | Ação |
|--------|------|
| `renderRelatorios()` | Mantém os selects de produtos e de classificação atualizados (chamado por `renderDashboard()`) |
| `mostrarAbaRelatorio(aba)` | Alterna abas vendas/estoque/**clientes**/caixa |
| `carregarSelectProdutosRelatorio()` | Popula `#vendas-rel-produto` e `#estoque-rel-produto` (estoque + itens vendidos) |
| `preencherSelectProduto(id, nomes)` | Helper: preenche um select de produtos preservando a seleção |
| `carregarSelectsClassificacaoRelatorio()` | **NOVA** — popula os selects de Marca/Grupo/Subgrupo (`#vendas-rel-*` e `#estoque-rel-*`) usando como **base** as listas cadastradas (`marcasCadastradas` etc.) com **união** (Set) dos valores já usados nos produtos (compatibilidade com dados antigos) |
| `preencherSelectClassificacao(id, valores, textoVazio)` | **NOVA** — helper: preenche um select de classificação preservando a seleção (1ª opção = `textoVazio`) |
| `classificacaoDoItem(item)` | **NOVA** — resolve `marca`/`grupo`/`subgrupo` de um item de venda a partir de `estoque` (busca por `id`/`nome`) |
| `parseDateRange(val)` | Converte input `date` em `Date` |
| `coletarRelatorioVendas()` | Filtra `db.vendas` por período, produto e classificação → linhas por item |
| `gerarRelatorioVendas()` | Render tabela (11 colunas) + info + total |
| `situacaoEstoque(qtd)` | Situação (em estoque/baixo/sem estoque) |
| `filtrarRelatorioEstoque(filtro)` | Só marca a seleção de situação (todos/baixo/sem) |
| `filtrarRelatorioEstoqueStatus(filtro)` | **NOVA** — filtro de status do relatório de estoque: todos/liberados/bloqueados (estado `estoqueRelStatus`) |
| `produtosEstoqueFiltrados()` | Filtra estoque por situação + **status** + produto + **ID** + classificação e **ordena por ID crescente** |
| `gerarRelatorioEstoque()` | Gera e exibe o relatório de estoque (ID \| Produto \| Marca \| Grupo \| Subgrupo \| Preço \| Qtd \| Situação) |
| `abrirImpressaoRelatorio(t, s, html)` | Abre janela de impressão (PDF) |
| `exportarRelatorioVendasPDF()` | PDF do relatório de vendas (11 colunas) |
| `exportarRelatorioEstoquePDF()` | PDF do relatório de estoque (8 colunas, inclui ID) |
| `clientesRelFiltrados()` | **NOVA** — filtra `db.clientes` por status (`clientesRelStatus`), nome (`includes` case-insensitive) e **ID** (`obterCodigoCliente`); **ordena por ID crescente** |
| `filtrarRelatorioClientesStatus(filtro)` | **NOVA** — filtro de status do relatório de clientes: todos/liberados/bloqueados (estado `clientesRelStatus`); apenas marca a seleção, **não** gera o relatório |
| `gerarRelatorioClientes()` | **NOVA** — gera e exibe a listagem de clientes (volta à página 1) |
| `renderRelClientesPagina()` | **NOVA** — render da página atual (10 clientes) + `renderizarPaginacaoGenerica('clientes-rel',...)` |
| `mudarPaginaRelClientes(delta)` | **NOVA** — Anterior/Próxima da listagem de clientes |
| `exportarRelatorioClientesPDF()` | **NOVA** — PDF da listagem de clientes (7 colunas, inclui ID/Pedidos/Status) |
| `coletarRelatorioCaixa()` | **NOVA** — filtra `caixasLista` (só `FECHADO`) por período (`data_fechamento`) e sequência; retorna linhas + sub-totais Esperado/Contado/Diferença do período |
| `gerarRelatorioCaixa()` | **NOVA** — coleta dados e volta à **página 1** (`renderCaixaRelPagina()`); disparado pelo botão **GERAR** |
| `renderCaixaRelPagina()` | **NOVA** — render da página atual (10 caixas) + `renderizarPaginacaoGenerica('caixa-rel',...)` |
| `mudarPaginaRelCaixa(delta)` | **NOVA** — Anterior/Próxima do relatório de fechamentos |
| `verLancamentosRelCaixa(caixaId)` | **NOVA** — exibe resumo (esperado por forma) + lançamentos do caixa selecionado (guarda em `caixaRelMovs`) |
| `renderLancamentosRelCaixa()` | **NOVA** — render da página de lançamentos (10) + `renderizarPaginacaoGenerica('caixa-rel-lanc',...)` |
| `mudarPaginaRelCaixaLanc(delta)` | **NOVA** — Anterior/Próxima dos lançamentos do caixa |
| `exportarRelatorioCaixaPDF()` | **NOVA** — PDF do caixa selecionado (resumo + lançamentos) |

> ⚠️ `initChart()`/`initProdutosChart()` (gráficos antigos de Relatórios) **não são mais usados** — canvases removidos do HTML.

## Detalhes / Impressão
| Função | Ação |
|--------|------|
| `abrirModalDetalhes(id)` | Abre modal com dados do pedido |
| `fecharModalDetalhes()` | Fecha modal de detalhes |
| `imprimirComandaAtual()` | Imprime comanda do pedido (cozinha) a partir do modal de detalhes |
| `imprimirComprovanteAtual()` | Imprime comprovante do pedido (recibo) a partir do modal de detalhes |
| `imprimirComandaMesaAtual()` | Imprime comanda de consumo da mesa ativa |

## Helpers do board
- `normalizarStatus()`, `statusVisual()`, `imagemDoItem()`, `atualizarAvatarAdmin()`.

## Perfil / Conta (Configurações)
- `carregarPerfilNoConfig()` — preenche nome/e-mail/foto do usuário logado ao abrir a tela; nome e foto vêm do doc `usuarios/{uid}` (`reg.nome`/`reg.photoURL`) com fallback para o Firebase Auth (`user.displayName`/`user.photoURL`); e-mail sempre `user.email`.
- `renderAvatarAtual(user, srcOverride)` — atualiza `#admin-avatar` e `#config-avatar` e o nome do perfil no header (`#admin-avatar-nome`). Busca o registro em `db.usuarios` pelo uid (`reg = db.usuarios.find(u => u.id === user.uid)`); `nome` = `reg.nome` (fallback `user.displayName`); `src` = `srcOverride || reg.photoURL || user.photoURL`; sem foto mostra o ícone `fa-user`. `title` = "Nome (email)"; esconde o span se não houver nome nem e-mail.
- `previewFotoPerfil()` — prevê o avatar ao digitar URL.
- `uploadFotoPerfil(event)` — envia imagem para Storage (`perfis/<uid>/avatar.<ext>`).
- `salvarPerfil()` — reautentica se trocar e-mail, `updateProfile` (nome/foto) e grava/mergeia o doc em `usuarios/{uid}` (`{ email, nome, photoURL }`); após gravar chama `renderAvatarAtual(user, fotoUrl)` para refletir imediatamente (o snapshot de `usuarios` mantém depois). O `updateProfile` continua sendo feito para a **própria conta logada** (mantém o Firebase Auth consistente), mas o avatar do painel **prioriza o doc** `usuarios`.
- `alterarSenhaPerfil()` — reautentica com a senha atual (`EmailAuthProvider`) e `updatePassword` — é o caminho pelo qual **qualquer operador** troca a **própria** senha (funciona no web SDK por ser a conta logada); o **admin** também usa este fluxo para a própria senha.

## Funcionários (somente admin)
- `ehAdministrador()` — true se o próprio usuário tem `role: 'admin'` em `usuarios/{uid}`.
- `pedidosDoFuncionario(uid)` — conta as vendas com `userId === uid` (`db.vendas`); alimenta a linha "X pedido(s) no sistema".
- `renderListaFuncionarios()` — lista as contas no cartão de Configurações: badge **BLOQUEADO** (vermelho) + borda vermelha quando `bloqueado`, linha de **pedidos**, seletor de papel, botões **BLOQUEAR** (`bloquearFuncionario`, cinza `fa-ban`) / **LIBERAR** (verde `fa-unlock`) / **EXCLUIR** (vermelho `fa-trash`, apenas se `pedidos === 0`; com pedidos mostra "Com pedidos, só pode ser bloqueado.") e o botão **"Reset senha (e-mail)"** (ícone `fa-key`) → `enviarResetSenhaFuncionario('${email}')`. Admins e o próprio usuário não são gerenciáveis (`possoGestao`).
- `bloquearFuncionario(uid, bloquear)` — **admin-only**; guarda: não pode bloquear a própria conta nem perfis que não sejam `funcionario`; grava `update({ bloqueado })` e confirma por `alert`.
- `excluirFuncionario(uid)` — **admin-only**; se `pedidosDoFuncionario(uid) > 0` **nega** orientando a usar BLOQUEAR; senão `confirm()` e `doc(uid).delete()`. ⚠️ O web SDK **não exclui a conta do Firebase Auth** de outro usuário — remove o perfil/doc em `usuarios` (revoga o acesso ao painel), mas a conta de autenticação continua no Auth (remoção total: Console/Admin SDK).
- `salvarFuncionario(uid)` — atualiza nome/foto/papel de outro usuário; **se o papel mudar para `'admin'`, grava também `bloqueado: false`** (admins não podem ser bloqueados).
- `enviarResetSenhaFuncionario(email)` — **admin-only**; redefinição de senha de **outro** perfil por **e-mail**: `auth.sendPasswordResetEmail(email)` + `alert("E-mail de redefinição de senha enviado para <email>.")`. Exige e-mail cadastrado (alert "Funcionário sem e-mail cadastrado."). Não manipula a senha do outro usuário pelo web SDK.
- ~~`abrirModalAlterarSenha` / `fecharModalAlterarSenha` / `salvarNovaSenhaFuncionario` / `copiarComandoAlterarSenha` / `mensagemErroAlterarSenha`~~ **REMOVIDAS** — experimento de troca de senha por dentro do sistema **descartado** (reversão); o modal `#alterarSenhaModal` e a pasta `ferramentas/` não existem mais.

## Evolução a administrador (senha master)
- `SENHA_MASTER_HASH` — SHA-256 da senha master (número fixo, sem texto em claro).
- `promoverParaAdmin()` — valida a senha digitada pelo hash e sobe o próprio `role` para `admin`.
- `hashSenha(texto)` — SHA-256 via WebCrypto (`crypto.subtle`; exige HTTPS/localhost).

## Exportações globais
No fim do arquivo, funções são expostas em `window.*` para uso em `onclick` do HTML:
`mostrarPagina`, `addCliente`, `deleteCliente`, `bloquearCliente`, `mudarPaginaClientes`, `filtrarClientesBusca`, `filtrarClientesStatus`, `addProduto`, `editProduto`, `cancelEdit`, `deleteProduto`, `addToCart`, `updateCartItemQtd`, `finalizarVenda`, `updateOrderStatus`, `toggleDropdown`, `renderizarSelectClientes`, `filtrarProdutosVenda`, `filtrarSelectClientes`, `mudarPaginaProdutosVenda`, `toggleSelectClientes`, `selecionarClientePDV`, `mudarPaginaSelectClientes`, `abrirModalDetalhes`, `fecharModalDetalhes`, `imprimirComandaAtual`, `imprimirComprovanteAtual`, `imprimirComandaMesaAtual`, `filtrarPedidosBoard`, `mudarPagina`, `toggleNotificacoes`, `fecharNotificacoes`, `salvarPerfil`, `enviarResetSenhaProprio`, `uploadFotoPerfil`, `previewFotoPerfil`, `salvarFuncionario`, `enviarResetSenhaFuncionario`, `promoverParaAdmin`, `mostrarAbaRelatorio`, `mostrarAbaConfig`, `gerarRelatorioVendas`, `exportarRelatorioVendasPDF`, `filtrarRelatorioEstoque`, `gerarRelatorioEstoque`, `exportarRelatorioEstoquePDF`, `filtrarRelatorioClientesStatus`, `gerarRelatorioClientes`, `exportarRelatorioClientesPDF`, `mudarPaginaRelClientes`, `mudarPaginaEstoque`, `adicionarClassificacao`, `removerClassificacao`, `previewLogoApp`, `aplicarLogoApp`, `syncColorPicker`, `aplicarPreset`, `salvarPersonalizacao`, `abrirCaixa`, `salvarLancamentoCaixa`, `fecharCaixa`, `atualizarDiferencaCaixa`, `gerarRelatorioCaixa`, `verLancamentosRelCaixa`, `exportarRelatorioCaixaPDF`, `mudarPaginaRelCaixa`, `mudarPaginaRelCaixaLanc`, `login`, `logout`, `abrirModalCadastro`, `fecharModalCadastro`, `cadastrarNovoFuncionario`, `salvarConfigLoja`, `salvarBannerConfig`, `adicionarMetodoPagamento`, `filtrarLogOperacoes`, `limparFiltrosLogOperacoes`, `mudarPaginaLogOperacoes`, `recarregarLogOperacoes`.

## Log de Operações (auditoria/controladoria)

| Função | Ação |
|--------|------|
| `registrarLog(acao, entidade, registroId, descricao, detalhes)` | **NOVA** — grava um registro em `logs` (apêndice imutável, `timestamp` server) com o operador logado (uid/nome/e-mail). Falha de registro **não bloqueia** a operação principal (erro vai só ao console) |
| `usuarioLogadoLabel()` | Retorna o nome/e-mail do usuário logado para rótulos |
| `carregarUsuariosFiltroLog()` | Popula `#log-filtro-usuario` com os operadores que registraram ações + `db.usuarios` |
| `filtrarLogOperacoes()` | Re-renderiza o log aplicando os filtros (reseta `logPage = 1`) |
| `limparFiltrosLogOperacoes()` | Limpa todos os filtros da aba Log |
| `mudarPaginaLogOperacoes(delta)` | Anterior/Próxima da tabela do log (estado `logPage`, via `renderizarPaginacaoGenerica('log',...)`) |
| `recarregarLogOperacoes()` | Re-popula usuários e re-renderiza |
| `renderizarLogOperacoes()` | Render da tabela `#log-corpo` (Data/Hora · Usuário · Ação · Entidade · Descrição) com filtros e **20 por página** (`LOG_POR_PAGINA`) |
| `rotuloAcaoLog(acao)` / `rotuloEntidadeLog(entidade)` | Rótulos/badges de cor para ação e entidade |

> Nota: num script clássico (sem build), as `function` top-level já são globais por hoisting — o export explícito em `window` é o que garante o funcionamento quando o `script.js` é processado por **build/bundler em módulo ES** (ex.: Vite na produção). Qualquer nova função usada em `onclick` deve ser adicionada a esse bloco.

## Relações
- → [[Estrutura-de-Arquivos]]
- → [[Notas-QA-e-Bugs]]