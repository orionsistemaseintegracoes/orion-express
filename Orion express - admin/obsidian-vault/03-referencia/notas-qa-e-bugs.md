---
tags:
  - orion-express
  - referencia
---
# Referência — Notas de QA e Problemas Conhecidos

## ==QA original (design-qa.md)==

- Aprovado em viewport 1600×900, tema escuro desktop, dados de validação.
- **Sem diferenças P0/P1/P2** entre o dashboard e as demais telas.
- Resultado: **passed**.

### Achados (nível P3)
| # | Achado |
|---|--------|
| P3 | Logo oficial é quadrada; a referência usava lockup horizontal. Identidade oficial preservada. |
| P3 | Prévia de Produtos usa placeholder sem URL de imagem; em prod vêm do campo `imagem`. |

### Fidelidade visual
- Tipografia: Poppins, hierarquia 29/20/14/12.
- Layout/sidebar/espaçamento/raios consistentes com o dashboard.
- Cores: superfícies azul-preto, bordas frias, acento azul.
- Navegação validada em Pedidos, Cardápio, Clientes, Produtos, Relatórios e Configurações.

## 🐞 Problemas encontrados na análise do código

### 1. Configurações sem função — ~~`salvarConfigLoja()` e `salvarBannerConfig()`~~
- ✅ **RESOLVIDO**: funções implementadas em `script.js` (tela [[Configuracoes]]).
  - `salvarConfigLoja()` grava `config/loja` e atualiza a sidebar.
  - `salvarBannerConfig()` grava `config/banner`.
  - `loadBannerConfig()` (login) carrega loja + banner.
  - Banner foi removido da tela [[Cardapio-Estoque]] — gestão centralizada em Configurações.

### 2. Formas de pagamento sempre "Outros"
- ✅ **RESOLVIDO**: `finalizarVenda()` (admin) e `checkout()` (cliente) agora gravam `formaPagamento` na venda.
- Admin: seletor obrigatório `#selectFormaPagamento` no PDV, opções vindas de `config/pagamentos` (gestão em [[Configuracoes]]).
- Cliente: seletor `#select-forma-pagamento` no checkout; `renderPaymentSummary` do dashboard passa a refletir a forma real.

### 3. ✅ RESOLVIDO — Status "Saiu para Entrega" no board
- Não existe status "Pronto" no fluxo (só `Em Preparação` → `Saiu para Entrega` → `Entregue`/`Cancelado`).
- Grupo `prontos` **removido**; a aba do board agora é **"Saiu para Entrega"** (`filtro='saiu'`, `count-saiu`) e filtra/exibe os pedidos com esse status. Pill mostra "Saiu para Entrega".
- **Causa raiz** (pedidos não apareciam na aba): `'Saiu para Entrega'` contém a substring **"entreg"** (de "Entrega"); como o `normalizarStatus()` checava `entreg`antes de `saiu`, caía no grupo `entregues`. Fix: **checar `saiu` antes de `entreg`**.

### 4. Venda + baixa de estoque não é transacional
- `finalizarVenda()`: `vendas.add(...)` e depois `batch` de estoque **em chamadas separadas**.
- Se o `batch` falhar após o `add`, a venda existiria sem a devida baixa de estoque.
- Sugestão: envolver ambos num `db.runTransaction()`.

### 5. Badges estáticos / placeholders
- ✅ **Sino de notificações corrigido**: badge dinâmico (`renderNotificacoes`) conta pedidos com status "novo"; clique abre o painel com os novos pedidos (abre detalhes ao clicar). Badge some quando não há pedidos novos.
- Cards de pedidos: thumbnails itens usam placeholder quando não há imagem.

### 6. Segurança do cadastro
- ✅ **RESOLVIDO** — cadastro de funcionários restrito ao **administrador** + gate de acesso por papel no painel:
  - `auth.onAuthStateChanged` consulta `usuarios/{uid}` e **bloqueia contas sem registro** (ex.: clientes): `auth.signOut()` + aviso **"Acesso negado: esta conta não é de um operador do painel."** em `#login-aviso`.
  - **Causa raiz** do acesso indevido de clientes era a antiga `garantirPerfilUsuario()` (criava perfil para **qualquer** login) — **removida**.
  - O cadastro **saiu da tela de login** (link "Cadastre-se aqui" removido; texto informativo aponta o cadastro para as [[Configuracoes]]).
  - O perfil de operador só é criado em `cadastrarNovoFuncionario()` (`role: 'funcionario'`); a conta é criada numa **app Firebase isolada** (`cadastroTemp` via `obterAppCadastroTemp()`), então `createUserWithEmailAndPassword` **não troca a sessão** — o admin **permanece logado** (sem `auth.signOut()`); `perfisEmCriacao` segue como defesa extra no gate do `onAuthStateChanged`.
  - `cadastrarNovoFuncionario()` e `abrirModalCadastro()` **bloqueiam não-admins** (alert "Somente o administrador pode cadastrar novos funcionários.") — a pendência de restringir a criação a admins foi resolvida.
  - Continua valendo: o cadastro **não concede `admin`** — elevação exige senha master ou admin logado.

### 7. Cliente Firestore
- `apiKey` no cliente; proteção real depende de regras do Firestore (`regras_firestore.rules`).

### 8. ✅ RESOLVIDO (implementado) — Gestão de funcionários: bloqueio, exclusão e regras
- **`bloqueado` (boolean)** no doc `usuarios/{uid}`, `false` por padrão (definido em `cadastrarNovoFuncionario`).
- **Gate de acesso** (`auth.onAuthStateChanged`): além de exigir o doc existente, verifica `doc.data().bloqueado === true` → `auth.signOut()` + aviso **"Acesso negado: este operador está bloqueado pelo administrador."** em `#login-aviso`.
- **Auto-kick em tempo real**: no snapshot de `usuarios` (`iniciarSincronizacao`), se o doc do usuário logado (não-admin) tiver `bloqueado: true`, chama `auth.signOut()`.
- **Cartão Funcionários** ([[Configuracoes]]): badge "BLOQUEADO" + borda vermelha; linha "X pedido(s) no sistema" (`pedidosDoFuncionario`); botões BLOQUEAR/LIBERAR (`bloquearFuncionario`) e EXCLUIR (`excluirFuncionario`) **apenas se `pedidos === 0`** — com pedidos, mostra "Com pedidos, só pode ser bloqueado.". Admins e o próprio usuário não são gerenciáveis.
- **`salvarFuncionario`**: ao promover a `'admin'`, grava também `bloqueado: false` (admins não podem ser bloqueados).
- **Firestore rules publicadas** (ruleset `5fb85b19-b088-4985-aeeb-390cd30bc168`): `usuarios` com `read` autenticado; `create, delete` **somente ADMIN** (impede cliente de criar o próprio doc e ganhar acesso ao painel); `update` permite o próprio usuário editar o próprio perfil **desde que `bloqueado` não esteja entre as chaves alteradas** (`request.resource.data.diff(resource.data).affectedKeys().hasAny(['bloqueado'])` — impede auto-desbloqueio) ou um admin.
- ⚠️ **Dependência de bootstrap**: a regra ainda exige que o **primeiro admin exista** (criação manual via Console/Admin SDK — já feito: `teste@teste.com` é admin). Sem isso, `isAdminUsuarios()` nunca seria verdadeiro e ninguém conseguiria criar `usuarios` do zero.
- ⚠️ **Limite do web SDK**: `excluirFuncionario` remove o **doc** em `usuarios` (revoga acesso ao painel), mas **não exclui a conta do Firebase Auth** de outro usuário — remoção total requer Console/Admin SDK.

### 9. 🔄 REVERTIDO — Retorno à redefinição de senha por E-MAIL
- **Contexto**: o web SDK do Firebase **não permite** `updatePassword` de OUTRO usuário (só da própria conta logada). Foram experimentadas as trocas de senha **por dentro do sistema** (modal "Alterar senha" + script local `ferramentas/reset-senha.js` no plano Spark).
- **Decisão (reversão)**: a experimentação foi **descartada**. O usuário decidiu voltar ao **comportamento original**: redefinição de senha por **e-mail**.
- **Estado final implementado**:
  - Botão **"Reset senha (e-mail)"** de volta ao cartão Funcionários ([[Configuracoes]]) → `enviarResetSenhaFuncionario(email)` (**admin-only**).
  - `enviarResetSenhaFuncionario` chama `auth.sendPasswordResetEmail(email)` e exibe `alert("E-mail de redefinição de senha enviado para <email>.")`.
  - **Removidos**: o modal `#alterarSenhaModal` e todos os elementos `#alterar-senha-*` (alvo, uid, nova, confirm, resultado, comando e botões "Copiar") do `index.html`; as funções `abrirModalAlterarSenha`, `fecharModalAlterarSenha`, `salvarNovaSenhaFuncionario`, `copiarComandoAlterarSenha`, `mensagemErroAlterarSenha`, `const funcs` e qualquer referência a Cloud Functions; a tag `firebase-functions-compat.js` (já não carregada).
  - Pasta **`ferramentas/`** (`reset-senha.js` + `package.json`, experimento do script local) **deletada** do repositório.
  - Export `window.enviarResetSenhaFuncionario` **restaurado**; exports das funções removidas não existem mais.
- **Nota** (self-change): a troca da **própria** senha continua no cartão "Meu Perfil" (`alterarSenhaPerfil` — reautentica e `updatePassword`), preservada e independente do e-mail.
- ⏳ **Pendência**: nenhuma no fluxo. As pastas `functions/`, `firebase.json` e `.firebaserc` (Cloud Function `resetOperadorPassword`) continuam no repositório **opcionais/inertes** — não usadas no plano Spark (deploy conforme [[Cloud-Functions]]).

### 10. ✅ RESOLVIDO — Foto/nome do perfil não atualizavam no avatar do painel
- **Sintoma**: a foto/nome do avatar do header não refletiam a edição feita pelo **admin** no cartão Funcionários (ex.: admin troca a foto do funcionário logado em outra aba e o avatar dele não muda).
- **Causa raiz**: o avatar lia apenas `user.photoURL`/`user.displayName` (Firebase Auth). O web SDK **não permite** `updateProfile` de **OUTRO** usuário — o admin grava a foto do funcionário no doc `usuarios/{uid}`, mas o avatar nunca lia esse doc.
- **Solução**: o avatar passou a usar como **fonte canônica o doc `usuarios`** (via snapshot `db.usuarios`), com fallback para o Firebase Auth:
  - `renderAvatarAtual(user, srcOverride)`: `reg = db.usuarios.find(u => u.id === user.uid)`; `nome` = `reg.nome` (fallback `user.displayName`); `src` = `srcOverride || reg.photoURL || user.photoURL`.
  - Snapshot de `usuarios` em `iniciarSincronizacao()`: com usuário logado, chama `renderAvatarAtual(auth.currentUser)` — a edição do doc reflete no avatar em tempo real.
  - `carregarPerfilNoConfig()`: nome/foto do cartão "Meu Perfil" carregam de `reg.nome`/`reg.photoURL` (fallback Auth); e-mail continua `user.email`.
  - `salvarPerfil()`: após gravar o doc em `usuarios/{uid}`, chama `renderAvatarAtual(user, fotoUrl)` (reflexo imediato; o snapshot mantém depois).
- **Observação**: o `updateProfile` no Auth continua sendo feito para a **própria conta logada** (mantém o Firebase Auth consistente), mas o avatar do painel **prioriza o doc** `usuarios`.

### 9. ✅ RESOLVIDO — "Escolher ficheiro" da logo não atualizava
- **Causa raiz**: Firebase **Storage não está habilitado** no projeto `aura-smoke` — o bucket `aura-smoke.firebasestorage.app` (e o `appspot`) **não existem**, então `firebase.storage().ref('config/logo-app.*').put(file)` falha sempre. O campo de URL funcionava porque não dependia do Storage.
- **Fix**: funcionalidade de upload de logo **removida** — o projeto não possui bucket de Storage e a conversão para data URL não era confiável. Agora a Logomarca usa **apenas campo de URL** (`#config-logo-url`), consistente com as demais telas (banner, perfil, produtos).
- **Caveat**: com data URL, o `logoUrl` fica embutido no doc `config/personalizacao` (base64) em vez de um link do Storage; funciona para `src` da sidebar/login e do preview. Se o Storage for habilitado depois, o fluxo volta a usar a URL do bucket automaticamente.

### 10. ✅ IMPLEMENTADO — Tela de Gerenciamento de Caixa (nova)
- **Contexto**: nova tela `#caixa` (sidebar, item **"Caixa"** logo abaixo de **"Venda Rápida"**) para controle do dinheiro do expediente. Ver [[Gerenciamento-de-Caixa]].
- **Coleções novas**: `caixas` e `movimentacoes_caixa` (escopo Admin — ver [[Firebase-Banco-de-Dados]]). ⚠️ **RESOLVIDO (14/01)**: `firestore.rules` agora possui regras para `caixas` e `movimentacoes_caixa` — `read`/`write` somente `isSignedIn() && isOperador()` (`exists()` em `usuarios/{uid}`, impedindo clientes do app). ⏳ **Pendência: publicar o novo `firestore.rules`** (`firebase deploy --only firestore:rules` ou colar no Console) — sem essa publicação, `abrirCaixa()` falha com *"Missing or insufficient permissions"* (regra-espelho `/{document=**}` nega tudo que não está declarado).
- **VENDA automática**: `finalizarVenda()` registra a movimentação `VENDA` (forma normalizada) se houver caixa aberto; falhas de caixa **não bloqueiam a venda** (`try/catch` silencioso).
- **Pedidos do painel do cliente**: `checkout()` (cliente) grava em `vendas`, mas **não** escreve no caixa. ✅ **RESOLVIDO (14/01 + fix caixa fechado + fix janela)**: `conciliarVendasNoCaixa()` roda nos listeners de `vendas`/`caixas`/`movimentacoes_caixa` e lança no caixa aberto as vendas **ainda sem lançamento** (docId = venda_id, idempotente).
  - ⚠️ **Bug 1 (pedido #000025)**: o filtro `dataIso >= data_abertura` fazia vendas criadas com **caixa fechado** nunca serem lançadas → o filtro foi removido.
  - ⚠️ **Bug 2 (fix)**: sem nenhum limite, ao abrir o caixa eram lançadas **TODAS** as vendas históricas ("desde o primeiro pedido"). ✅ **CORRIGIDO**: a conciliação agora usa `obterInicioJanelaConciliacao()` = `data_fechamento` do último caixa `FECHADO` — só vendas do período "sem caixa" (ex.: #000025) entram no novo caixa; vendas antigas de períodos com caixa não são puxadas retroativamente.
- **Sequência de caixa (14/01)**: cada abertura grava `sequencia` (1, 2, 3...) via `proximaSequenciaCaixa()`; caixas antigos ganham sequência derivada (`obterSequenciaCaixa`). Exibida no badge/info, histórico (#N) e relatório; o relatório filtra por **Sequência** (`#caixa-rel-seq`).
- **Fechamento**: esperado por forma (só `DINHEIRO` é contado; PIX/Cartão informativos); número **atômico** de um caixa aberto por vez (`abrirCaixa` bloqueia duplicado).
- **Relatório de Fechamento de Caixa** (abaa nova nos [[Relatorios]]): consulta fechamentos por período e exibe os **lançamentos** de cada caixa (Ver lançamentos) + PDF (`exportarRelatorioCaixaPDF`). Reutiliza `calcularEsperadoCaixa(caixa, movs)` (genérico). ✅ implementado (14/01).
- **Paginação do Relatório de Caixa (14/01)**: padrão do projeto (`REGISTROS_POR_PAGINA = 10`) — **10 caixas por página** no relatório (`renderCaixaRelPagina`/`mudarPaginaRelCaixa`) e **10 lançamentos por página** no detalhe ("Ver lançamentos" — `renderLancamentosRelCaixa`/`mudarPaginaRelCaixaLanc`), via `renderizarPaginacaoGenerica('caixa-rel'`/`'caixa-rel-lanc')`. Novo GERAR reseta para página 1.
- **Limitação conhecida**: a tela não cancela/estorna vendas (estorno é lançamento manual de valor); não há sangria automática nem conciliação com `vendas.status == 'Cancelado'`. O fechamento considera somente os lançamentos registrados naquele caixa.

### 11. ✅ IMPLEMENTADO — ID sequencial dos produtos
- **Contexto**: cada produto cadastrado ganha um **ID único de exibição** (1, 2, 3...), gravado como `codigo` no doc `estoque`. Começa em **1 para os cadastros existentes** (produtos legados sem o campo recebem ID derivado pela ordem de `lastUpdate` via `obterCodigoProduto()`); novos produtos recebem `proximoCodigoProduto()` (maior + 1) no Create e mantêm no Update.
- **Exibição**: tabela do Cardápio e cards da Venda Rápida mostram `#001`, `#002`, ... (`formatarCodigoProduto`).
- **Relatório**: aba de Estoque ganhou coluna **ID** e o filtro **ID** (`#estoque-rel-codigo`, numérico opcional); o **PDF** inclui a coluna ID e o filtro no subtítulo.
- **Atenção**: `codigo` é distinto do `id` (documento Firestore, auto). A numeração não realinha quando um produto é excluído (próximo = maior + 1); exclusões não reutilizam ID.

### 12. ✅ IMPLEMENTADO — Bloqueio/liberação de produtos (com pedidos não exclui)
- **Contexto**: produto que **já teve pedido** (`produtoTemMovimentacao` = alguma venda com item cujo `id === produto.id`) não pode mais ser excluído — apenas **bloqueado** (impedido de vender). Produto **sem pedidos** pode ser excluído (mantém o `confirm()` já existente em `deleteProduto`).
- **Campo novo**: `bloqueado` (boolean, `false` por padrão — gravado no `add`; nos docs antigos trata-se como `false` via `ehProdutoBloqueado`).
- **Comportamento**:
  - `deleteProduto(id)`: recusa com `alert("...já possui pedidos registrados...")` se houver movimentação.
  - `bloquearProduto(id, bloquear)`: alterna `bloqueado` com `confirm`.
  - Tabela do Cardápio ganhou coluna **Status** (badge LIBERADO/BLOQUEADO) + botão 🔒 BLOQUEAR/LIBERAR + filtro **Todos/Liberados/Bloqueados** (`filtrarEstoqueStatus`/`estoqueFiltroStatus`) para localizar bloqueados; linha bloqueada com `opacity-60`; excluir desabilitado (cinza) para produtos com pedidos ou bloqueados.
  - **Venda Rápida** (admin): `renderizarProdutosVenda()` oculta produtos bloqueados.
  - **Catálogo do cliente**: `listenToProducts()` filtra `produto.bloqueado !== true` e `addToCart` recusa bloqueados (defensivo) — ver projeto `orion-express-cliente`.
- **`estoqueFiltroStatus`** (state, default `'todos'`) controla o filtro da tabela do Cardápio.

### 13. ✅ AJUSTADO — Ordem do Relatório de Estoque + filtro de status
- **Ordem**: `produtosEstoqueFiltrados()` agora **ordena por ID crescente** (`obterCodigoProduto`) — antes usava a ordem do snapshot do Firestore, podendo exibir `#010`/`#011` antes de `#001..#009`. O PDF herda a mesma ordenação.
- **Filtro de Status no relatório**: novo grupo **Todos / Liberados / Bloqueados** (`#estq-rel-status-*`; `filtrarRelatorioEstoqueStatus`; estado `estoqueRelStatus`) na aba de Estoque; o PDF inclui o status ativo no subtítulo (`labelsStatus`).

### 14. ✅ AJUSTADO — Relatório de Fechamento de Caixa sem carga automática
- **Antes**: ao abrir a aba, `renderRelatorioCaixaAutomatico()` chamava `gerarRelatorioCaixa()` e já exibia os fechamentos (comportamento diferente de Vendas/Estoque).
- **Agora**: igual aos demais relatórios — ao acessar a tela exibe apenas o placeholder **"Clique em <b>GERAR</b> para exibir os fechamentos de caixa."**; os dados só aparecem após clicar em **GERAR** (`gerarRelatorioCaixa()`). A função `renderRelatorioCaixaAutomatico()` e a chamada em `mostrarAbaRelatorio()` foram **removidas**.

### 15. ✅ IMPLEMENTADO — Título "Filtros" + busca no Cardápio
- A tabela do Cardápio ganhou o título **"Filtros"** e dois campos de busca: **nome** (`#estq-busca-nome`, case-insensitive, `includes`) e **ID** (`#estq-busca-codigo`, número exato). Ambos com `oninput` → `filtrarEstoqueBusca()`, que re-renderiza combinando com o filtro de status (todos/liberados/bloqueados).

### 16. ✅ IMPLEMENTADO — ID sequencial dos clientes + busca por nome/ID
- **Contexto**: espelha a lógica de [[#11. ✅ IMPLEMENTADO — ID sequencial dos produtos]] para a coleção `clientes`. Cada cliente ganha um **ID único sequencial** (1, 2, 3...), gravado como `codigo` no doc. Começa em **1 para os cadastros existentes** (`obterCodigoCliente()` deriva pela ordem de `since`, numerando os legados); novos cadastros recebem `proximoCodigoCliente()` (maior + 1) no Create.
- **Exibição**: a tabela da tela [[Clientes]] ganhou a coluna **ID** (primeira, `#001`, `#002`...) — colspan do estado vazio passou para 6.
- **Busca**: título "Filtros" + dois campos — **nome** (`#cli-busca-nome`, case-insensitive, `includes`) e **ID** (`#cli-busca-codigo`, número exato). Ambos com `oninput` → `filtrarClientesBusca()`, que re-renderiza aplicando os filtros.
- **Atenção**: `codigo` é distinto do `id` (documento Firestore, auto). A numeração não realinha quando um cliente é excluído; exclusões não reutilizam ID.

### 17. ✅ IMPLEMENTADO — Bloqueio/liberação de clientes (com pedidos não exclui)
- **Contexto**: espelha [[#12. ✅ IMPLEMENTADO — Bloqueio/liberação de produtos (com pedidos não exclui)]] para a coleção `clientes`. Cliente que **já teve pedido** (`clienteTemMovimentacao(id)` = alguma venda com `venda.clienteId === id`) não pode mais ser excluído — apenas **bloqueado** (impedido de gerar novos pedidos). Cliente **sem pedidos** pode ser excluído (mantém o `confirm()` já existente em `deleteCliente`, agora com o nome no texto).
- **Campo novo**: `bloqueado` (boolean, `false` por padrão — gravado no `addCliente`; nos docs antigos trata-se como `false` via `ehClienteBloqueado`).
- **Comportamento**:
  - `deleteCliente(id)`: recusa com `alert("...já possui pedidos registrados...")` se houver movimentação.
  - `bloquearCliente(id, bloquear)`: alterna `bloqueado` com `confirm`.
  - Tabela de [[Clientes]] ganhou coluna **Status** (badge LIBERADO/BLOQUEADO) + botão 🔒 BLOQUear/LIBERAR + filtro **Todos/Liberados/Bloqueados** (`filtrarClientesStatus`/`clientesFiltroStatus`); linha bloqueada com `opacity-60`; excluir desabilitado (cinza) para clientes com pedidos ou bloqueados — colspan do estado vazio passou para 7.
  - **PDV**: `renderizarSelectClientes()` não lista clientes bloqueados no `#selectCliente`; `finalizarVenda()` recusa (defensivo) se o cliente selecionado estiver bloqueado.
- **`clientesFiltroStatus`** (state, default `'todos'`) controla o filtro da tabela de Clientes.

### 18. ✅ IMPLEMENTADO — Relatório de Clientes
- **Contexto**: nova aba **Relatório de Clientes** nos [[Relatorios]], entre Estoque e Fechamento de Caixa (4 abas no total).
- **Filtros**: **Status** Todos/Liberados/Bloqueados (`filtrarRelatorioClientesStatus`/`clientesRelStatus`, `#cli-rel-status-*`), **Nome** (`#clientes-rel-nome`) e **ID** (`#clientes-rel-codigo`, número exato) — aplicados em `clientesRelFiltrados()`, **ordenado por ID crescente** (`obterCodigoCliente`). Os filtros (inclusive o de status) **apenas condicionam o resultado** — a listagem só é exibida ao clicar em **GERAR** (igual a Vendas/Estoque/Caixa); não há `oninput`.
- **Resultado** (7 colunas): ID (`#N`), Nome, Telefone, E-mail, Endereço, **Pedidos** (vendas com `venda.clienteId === c.id`) e Status. **10 clientes por página** (`renderRelClientesPagina`/`mudarPaginaRelClientes`). Novo GERAR reseta para página 1.
- **PDF**: `exportarRelatorioClientesPDF()` aplica os mesmos filtros (status/nome/ID) e inclui ID/Pedidos/Status no subtítulo/colunas.
- **Exports** `window.*`: `filtrarRelatorioClientesStatus`, `gerarRelatorioClientes`, `exportarRelatorioClientesPDF`, `mudarPaginaRelClientes`.

### 19. ✅ IMPLEMENTADO — Paginação + ordenação no Cardápio (Itens Atuais em Estoque)
- **Paginação**: tabela do Cardápio agora exibe **10 produtos por página** (`#estoque-pagination` com Anterior/Próxima + "Página X de Y · N registro(s)"; `mudarPaginaEstoque`/`estoquePage` via `renderizarPaginacaoGenerica('estoque',...)`) — padrão das demais telas.
- **Ordenação**: `renderizarEstoque()` **ordena por ID crescente** (`obterCodigoProduto`) — corrige `#010`/`#011` aparecerem antes de `#001..#009`.
- Trocar filtro de busca (`filtrarEstoqueBusca`) ou de status (`filtrarEstoqueStatus`) **reseta para a página 1**.
- **Export** `window.*`: `mudarPaginaEstoque`.

### 20. ✅ IMPLEMENTADO — Paginação + ordenação na tela de Clientes
- **Paginação**: tabela de Clientes agora exibe **10 cadastros por página** (`#clientes-pagination` com Anterior/Próxima + "Página X de Y · N registro(s)"; `mudarPaginaClientes`/`clientesPage` via `renderizarPaginacaoGenerica('clientes',...)`) — padrão das demais telas.
- **Ordenação**: `renderizarClientes()` **ordena por ID crescente** (`obterCodigoCliente`).
- Trocar filtro de busca (`filtrarClientesBusca`) ou de status (`filtrarClientesStatus`) **reseta para a página 1**.
- **Export** `window.*`: `mudarPaginaClientes`.

### 21. ✅ IMPLEMENTADO — Número do pedido com 3 dígitos (#001, #002) em vez de 6 (#000001)
- **Contexto**: o `numeroPedido` era formatado com `padStart(6,'0')` (`000001`, `000027`...), diferente da lógica dos IDs de produto/cliente (`#001`, `#002`, 3 dígitos). Ajustado para seguir a **mesma lógica**: **3 dígitos mínimos** (`padStart(3,'0')`).
- **O que mudou**:
  - **Admin** (`script.js`): `proximoNumeroPedido()` agora retorna `padStart(3,'0')`; `numeroExibicao` fallback `'000'`/`slice(0,3)`.
  - **Cliente** (`orion-express-cliente/script.js`): `proximoNumeroPedido()` `padStart(3,'0')`; `numeroExibicao` igual.
  - **Migração**: `migrarNumeroPedido()` (roda no login do admin) agora **reformata os pedidos existentes** gravados com 6 dígitos para o novo formato (`000027` → `027`, `000001` → `001`, ...) — mantém a mesma sequência numérica, apenas muda o padding; numera os sem número como antes.
  - Placeholder do modal de detalhes (`#modal-pedido-id`) ajustado para `#000`.
- **Qual o limite?** O `padStart(3,'0')` define apenas o **mínimo de 3 dígitos** de exibição (`#001`...`#999`); depois de 999 o número naturalmente passa a 4 dígitos (`#1000`) — **não há corte**. O contador em `config/contador` é numérico (sem padding), então continua ilimitado.
- ⚠️ **Observação**: pedidos legados são reformatados automaticamente no próximo login do admin; até lá podem ainda exibir o formato antigo.
- ⚠️ **Busca de pedidos**: passou a aceitar/pesquisar `015` ou `#015` (antes `000015`/`#000015`).

### 22. ✅ IMPLEMENTADO — Venda Rápida: Cliente e Forma de Pagamento obrigatórios
- **Antes**: o cliente era **opcional** (venda sem cliente ia como "Cliente Balcão"); só a forma de pagamento era obrigatória.
- **Agora**: na tela [[Venda-Rapida-PDV]] ambos são **obrigatórios**:
  - `finalizarVenda()` valida `clienteId` antes do total: `alert("Selecione o cliente para finalizar a venda.")`.
  - Forma de pagamento já validada (inalterada): `alert("Selecione a forma de pagamento.")`.
  - Labels com asterisco vermelho `*` e atributo `required` nos dois `<select>` (`#selectCliente`, `#selectFormaPagamento`).
  - `renderizarSelectClientes()` removeu o texto "(Opcional)" do placeholder.

## Filtros de busca na Venda Rápida (nota #23)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - **Produtos** (`renderizarProdutosVenda`): inputs `#venda-busca-produto-nome` (case-insensitive `includes`) e `#venda-busca-produto-codigo` (ID exato, `type=number`) em `oninput="filtrarProdutosVenda()"`; lista passa a **ordena por ID crescente**; estado vazio: "Nenhum produto encontrado."
  - **Clientes** (`renderizarSelectClientes`): inputs `#venda-busca-cliente-nome` e `#venda-busca-cliente-codigo` em `oninput="filtrarSelectClientes()"`; opções ganharam prefixo `#NNN ·`; ordenação por ID crescente; **seleção atual é preservada** ao re-popular o select (evita perder cliente enquanto digita).
  - Produtos bloqueados continuam ocultos e clientes bloqueados continuam fora do `#selectCliente` mesmo com filtros ativos.
  - Exportados em `window.*`: `filtrarProdutosVenda`, `filtrarSelectClientes`.

## Auto-seleção de cliente no filtro do PDV (nota #25)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - Ao **digitar** nome/ID em `#venda-busca-cliente-nome`/`#venda-busca-cliente-codigo`, o `#selectCliente` é **preenchido automaticamente** com o cadastro mais próximo (`clienteMaisProximo`: nome exato > prefixo > contém > menor ID; com filtro de ID, o próprio ID).
  - Se não for o correto, ao **clicar** no `#selectCliente` são exibidas as **opções relacionadas ao filtro** para alteração (sem filtro, volta a listar todos os não bloqueados).
  - **Preservação**: a seleção atual é mantida enquanto ainda combinar com o filtro; opções com filtro ativo = somente relacionadas (`baseOptions`).
  - Sem filtro ativo, o campo lista todos os clientes não bloqueados (comportamento original preservado).
  - Bloqueados continuam fora da lista mesmo com auto-seleção.

## Limite de registros no seletor de cliente do PDV (nota #26)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - O **`<select>` nativo foi substituído por um dropdown customizado** (`#selectClienteBtn` + `#selectClienteDropdown`, mesmo padrão do `status-dropdown`), pois `<select>` não suporta paginação.
  - **Lista paginada**: `#listaSelectClientes` exibe **20 cadastros por página** (`LIMITE_SELECT_CLIENTES = 20`, botões Anterior/Próxima + "Página X de Y · N registro(s)" via `renderizarPaginacaoGenerica('select-cliente',...)`).
  - Valor do cliente segue no **`<input type="hidden" id="selectCliente">`** (lido por `finalizarVenda()` — inalterado); label do botão via `atualizarLabelClientePDV`.
  - Linha do cliente selecionado **destacada** (âmbar + check `fa fa-check`).
  - Abrir fecha os demais `.status-dropdown`; clique fora fecha (handler global existente).
  - Filtros continuam auto-selecionando o **mais próximo** e resetam para a **página 1**.
  - Exportados em `window.*`: `toggleSelectClientes`, `selecionarClientePDV`, `mudarPaginaSelectClientes`.

## Ordenação do dropdown de clientes por ID (nota #27)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - O dropdown `#listaSelectClientes` agora **ordena sempre por ID crescente** — antes, sem filtro ativo, usava a ordem de inserção do array `db.clientes` (`baseOptions` agora aplica `.sort((a,b) => obterCodigoCliente(a) - obterCodigoCliente(b))` em ambos os casos: sem filtro e com filtro).

## Paginação na Venda Rápida (nota #24)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - **Produtos** da Venda Rápida agora **paginam 9 por tela** (`REGISTROS_POR_PAGINA_VENDA = 9`; `#venda-produtos-pagination` com Anterior/Próxima + "Página X de Y · N registro(s)" via `renderizarPaginacaoGenerica('venda-produtos',...)`; `mudarPaginaProdutosVenda`/`vendaProdutosPage`).
  - **Filtro de busca volta para a página 1** (`filtrarProdutosVenda` reseta `vendaProdutosPage = 1`).
  - Página fora do intervalo é **ajustada** no re-render (ex.: filtrar com menos páginas), mesmo padrão de `renderizarEstoque`/`renderizarClientes`.
  - Grade continua `md:grid-cols-3` → **3 linhas × 3 colunas** por tela.
  - Export `window.*`: `mudarPaginaProdutosVenda`.

## E-mail de redefinição de senha não chega (nota #28)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy/reconfiguração:
  - **O código está correto** (`auth.sendPasswordResetEmail(email)` em `enviarResetSenhaProprio`/`enviarResetSenhaFuncionario`). O não-envio é, na prática, **configuração do Firebase Console** ou **spam**.
  - **Ajustes no `script.js`**:
    - Alerts de sucesso agora orientam verificar **spam/lixeira**.
    - `salvarPerfil()` persiste o **e-mail informado** no campo (não mais `user.email`, que podia ficar desatualizado) no doc `usuarios` — evita divergência com o e-mail real do Firebase Auth (que faz o reset falhar silenciosamente com **email enumeration protection** ativa).
  - **Checklist de configuração** (detalhado em [[Autenticacao]]): caixa de spam → template **Password reset** ativo com From válido (Authentication → Templates) → domínio verificado se customizado → conta existe no Auth com o e-mail exato do doc `usuarios` → teste direto em Authentication → Users → **⋮ → Reset password** (mesmo resultado que o painel).
  - ⚠️ **Não existe coleção `funcionarios` no sistema** — o painel usa apenas `usuarios`. A presença/ausência do e-mail numa coleção Firestore (`usuarios`/`funcionarios`) **não afeta o envio**: `auth.sendPasswordResetEmail(email)` atua só no **Firebase Authentication** (Authentication → Users). O "Reset senha (e-mail)" do Meu Perfil usa `auth.currentUser.email` (Auth, sem depender de coleção).
  - 🔎 **Diagnóstico confirmado (07-2026)**: o **próprio Console do Firebase** (`Authentication → Users → ⋮ → Reset password`) também diz "enviado" e o e-mail **não chega** (Entrada/Spam/Lixeira). → O problema é **entrega de e-mail do Firebase**, não o painel. Próximos passos (detalhados em [[Autenticacao]]): testar outro provedor, verificar o **From do template** (`no-reply@<project-id>.firebaseapp.com` costuma ser descartado pelo Gmail), checar auditoria (Cloud Console → Audit Logs/Logs Explorer), e, se crítico, migrar o envio para **SMTP próprio via Admin SDK** (`generatePasswordResetLink` + Brevo/SendGrid — plano Blaze, [[Cloud-Functions]]).
  - Firebase envia e-mails de redefinição pela própria infra (gratuita); alternativa em caso de falha crítica: Cloud Function `resetOperadorPassword` ([[Cloud-Functions]]) ou `ActionCodeSettings`.

## Código de barras no cadastro de produtos (nota #29)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - Novo campo **Código de Barras (EAN-13)** (`#produto-codigo-barras`) no formulário de produto (Cardápio), entre Subgrupo e Preço — **controle interno** do admin (estoque/separação/almoxarifado).
  - **Opcional**; se preenchido, deve ser **EAN-13**: 13 dígitos com **dígito verificador** válido (`calcularDigitoVerificadorEAN13` — verifica que o 13º dígito confere; `alert("Código de barras inválido. O EAN-13 deve ter exatamente 13 dígitos.")` ou `"...O dígito verificador (13º) não confere."`).
  - **Auto-preenchimento**: ao digitar 12 dígitos, o 13º (verificador) é calculado automaticamente (`tratarInputCodigoBarras` no `oninput`; campo com `maxlength="13"` e só dígitos).
  - Gravado no Firestore como `codigoBarras` (coleção `estoque`) no `add` e no `update`; `editProduto()` repopula o campo.
  - Nova coluna **Cód. Barras** na tabela do Cardápio (ID | Produto | **Cód. Barras** | Marca | Grupo | Subgrupo | Preço | Qtd. | Status | Ações) — `colspan` do vazio passou de 9 para **10**; vazio exibido como `-`.
  - **Não** é exibido na Venda Rápida nem no app do cliente (uso interno) — `listenToProducts`/`renderProducts` ignoram o campo extra.
  - `cancelEdit()` limpa o campo via `form.reset()`.
  - Exportados em `window.*`: `calcularDigitoVerificadorEAN13`, `tratarInputCodigoBarras`.

## Log de Operações / auditoria (nota #30)
- ⚠️ **Testado na conversa?** Verificar em produção após deploy:
  - Nova **coleção `logs`** (Firestore) — auditoria/controladoria: registra **quem fez, o quê e quando** em `registrarLog(acao, entidade, registroId, descricao, detalhes)`. Campos: `acao`, `entidade`, `registroId`, `descricao`, `detalhes`, `usuarioId`/`usuarioNome`/`usuarioEmail`, `timestamp` (server).
  - **Instrumentado**: produtos (`addProduto` incluir/editar, `deleteProduto`, `bloquearProduto`), clientes (`addCliente`, `deleteCliente`, `bloquearCliente`), vendas (`finalizarVenda`, `updateOrderStatus`), caixa (`abrirCaixa`, `fecharCaixa`, `salvarLancamentoCaixa`), configurações (`salvarConfigLoja`, `salvarBannerConfig`, `salvarPersonalizacao`, `adicionar/removerMetodoPagamento`, `adicionar/removerClassificacao`), perfil/usuários (`salvarPerfil`, `promoverParaAdmin`, `cadastrarNovoFuncionario`, `salvarFuncionario`, `bloquearFuncionario`, `excluirFuncionario`, **login**). Falha de registro **não bloqueia** a operação (erro só no console).
  - **Aba Log de Operações** em Configurações (`mostrarAbaConfig('log')`): filtros por ação (`#log-filtro-acao`), entidade (`#log-filtro-entidade`), usuário (`#log-filtro-usuario`), período De/Até (`#log-filtro-de`/`-ate`) e busca livre (`#log-busca`); botões **LIMPAR FILTROS** e **ATUALIZAR**; tabela `#log-corpo` (Data/Hora · Usuário · Ação badge colorido · Entidade · Descrição) com **20 por página** (`LOG_POR_PAGINA`, `#log-pagination`); `db.logs` via `onSnapshot` de `logs` (ordem `timestamp` desc).
  - **Regras `firestore.rules`**: `logs` — operador **lê e cria**; **`update`/`delete` = `false`** (apêndice imutável). ⚠️ **Deploy das regras necessário** (`firebase deploy --only firestore:rules`) para a tela funcionar.
  - ⚠️ **Depende do ruleset atualizado**: sem o deploy, a leitura/escrita em `logs` falha com "Missing or insufficient permissions".

## Observações de robustez
- `db` e `carrinho` são **estado em memória**; refresh da página perde o carrinho.
- Renderização por `innerHTML` com concatenação de strings (sem escape em diversos pontos) — atenção a XSS se dados vierem de fontes externas; `escapeDashboard` é aplicado apenas no board.

## Relações
- ← [[Configuracoes]]
- ← [[Dashboard]]
- ← [[Autenticacao]]
- ← [[Firebase-Banco-de-Dados]]