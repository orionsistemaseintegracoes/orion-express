---
tags:
  - orion-express
  - tela
---
# Tela — Configurações

> `#config` em `index.html`.

## Propósito
Configurar dados da loja, o **banner do cardápio** exibido no app do cliente, as **formas de pagamento** disponíveis (compartilhadas com o cliente), a **classificação de produtos** (marcas/grupos/subgrupos — controle interno), a **personalização visual do app** (cores, logomarca, presets), o **perfil do usuário logado** (nome, e-mail, senha e foto) e o **Log de Operações** (auditoria/controladoria). Apenas o **administrador** gerencia os perfis dos funcionários.

## Elementos — 5 abas

A tela é organizada por **abas** (`mostrarAbaConfig(aba)`, padrão `report-tab`, mesmo visual dos Relatórios): **Estabelecimento**, **Catálogo**, **Aparência**, **Conta e Acesso** e **Log de Operações**. Cada aba agrupa cartões relacionados; a aba **Estabelecimento** é a ativa por padrão.

### ABA — Estabelecimento (`#config-aba-estabelecimento`)

#### Cartão 1 — Loja
- Campo **Nome da Loja** (`#config-loja-nome`).
- Campo **Unidade** (`#config-loja-unidade`).
- Botão **SALVAR LOJA** → `salvarConfigLoja()` — salva em `config/loja` e atualiza a sidebar.
- Mensagem `#config-status`.

#### Cartão 2 — Banner do Cardápio
- Campo **URL da Imagem do Banner** (`#config-banner-url`).
- Botão **SALVAR BANNER** → `salvarBannerConfig()` — salva em `config/banner`.
- Mensagem `#config-banner-status`.

### ABA — Catálogo (`#config-aba-catalogo`)

#### Cartão 3 — Formas de Pagamento
- Lista (`#lista-config-pagamentos`) com as formas cadastradas e botão 🗑 para remover.
- Campo **novo método** (`#novo-metodo-pagamento` + Enter) e botão **ADICIONAR**.
- Funções: `adicionarMetodoPagamento()`, `removerMetodoPagamento(nome)` → `salvarMetodosPagamento()` grava em `config/pagamentos`.
- Mensagem `#config-pagamento-status`.
- Formas são **compartilhadas** com o app do cliente (mesmo doc `config/pagamentos` popula o seletor do checkout).

#### Cartão 4 — Classificação de Produtos
- Cadastra as opções de **Marca**, **Grupo** e **Subgrupo** que poderão ser vinculadas aos produtos no [[Cardapio-Estoque]] (**controle interno** — não é exibida no app do cliente).
- 3 blocos (mesmo padrão visual do cartão Formas de Pagamento), cada um com lista + campo de novo item + botão **ADICIONAR**:
  - **Marcas**: lista `#lista-config-marcas` + campo `#nova-marca` (placeholder "Ex: Ignite, Podz...", Enter cadastra).
  - **Grupos**: lista `#lista-config-grupos` + campo `#novo-grupo` (placeholder "Ex: Descartável, Refil...").
  - **Subgrupos**: lista `#lista-config-subgrupos` + campo `#novo-subgrupo` (placeholder "Ex: 5000 puffs, 10.000 puffs...").
- Botão **ADICIONAR** (ou Enter) → `adicionarClassificacao(tipo)`; remoção pela 🗑 de cada item → `removerClassificacao(tipo, nome)` (com `confirm`).
- Funções: `adicionarClassificacao()` e `removerClassificacao()` (exportadas em `window.*`), `salvarClassificacoes()`, `renderizarListaClassificacoes()`, `mostrarStatusClassificacao(msg)`.
- Persistência: doc único **`config/classificacoes`** → `{ marcas, grupos, subgrupos, lastUpdate }` — **fonte única** dos selects de Marca/Grupo/Subgrupo no Cardápio e base dos filtros de classificação nos Relatórios.
- Mensagem `#config-classificacao-status`.

### ABA — Aparência (`#config-aba-aparencia`)

#### Cartão 5 — Personalização do App
- **Logomarca**: apenas campo de **URL da logo** (`#config-logo-url`); aplica via `previewLogoApp()` no `#config-logo-preview` e no login/sidebar. Preview com placeholder quando vazio. Não há upload de ficheiro (indisponível no plano Spark — Storage desativado).
- A logo escolhida é **aplicada na sidebar** (`#sidebar-logo-img`) e, se o toggle de login estiver ativo, **na tela de login** (`#login-logo`) via `aplicarLogoApp(url)` — em tempo real ao digitar a URL e ao salvar/carregar.
- **Cores do aplicativo**: 4 color pickers com campo hex:
  - Cor principal (`#config-cor-principal` / `#config-cor-principal-hex`)
  - Cor dos botões (`#config-cor-botoes` / `#config-cor-botoes-hex`)
  - Cor do fundo (`#config-cor-fundo` / `#config-cor-fundo-hex`)
  - Cor do texto (`#config-cor-texto` / `#config-cor-texto-hex`)
- **Toggle "Aplicar cores na tela de login"** (`#config-aplicar-login`).
- **Presets**: Orion (azul), Aura (laranja + cinza), Verde, Escuro — `aplicarPreset(nome)` preenche os campos e aplica via `aplicarCoresTema()`.
- **SALVAR PERSONALIZAÇÃO** → `salvarPersonalizacao()` grava em `config/personalizacao` e aplica CSS custom properties (`--tema-principal`, `--tema-botoes`, `--tema-fundo`, `--tema-texto`) + a logo.
- Mensagem `#config-personalizacao-status`.
- **Carregamento**: `loadPersonalizacao()` (chamado no login e também quando deslogado) preenche campos, aplica cores salvas e a logo.
- Persistência: doc único **`config/personalizacao`** → `{ logoUrl, corPrincipal, corBotoes, corFundo, corTexto, aplicarLogin, lastUpdate }`.

### ABA — Conta e Acesso (`#config-aba-conta`)

#### Cartão 6 — Meu Perfil
- **Foto**: upload (`#perfil-foto-upload` → `uploadFotoPerfil()`) p/ Firebase Storage em `perfis/<uid>/avatar.<ext>` **ou** campo de URL (`#config-perfil-foto-url`); preview no `#config-avatar`.
- **Nome de exibição** (`#config-perfil-nome`) e **E-mail** (`#config-perfil-email`).
- **SALVAR PERFIL** → `salvarPerfil()`: se o e-mail mudou, exige a senha atual (reautentica via `EmailAuthProvider`) antes de `updateEmail`; depois `updateProfile({displayName, photoURL})` **e** grava/mergeia o doc em `usuarios/{uid}` (`{ email, nome, photoURL }`); ao final chama `renderAvatarAtual(user, fotoUrl)` para refletir imediatamente (o snapshot de `usuarios` mantém depois).
- **Alterar senha**: `#perfil-senha-atual` + `#perfil-senha-nova` → `alterarSenhaPerfil()` (reautentica com a senha atual e `updatePassword`). É o único meio de um **funcionário não-admin** trocar a **própria** senha; o **admin** também usa este fluxo para a própria senha (para outros perfis, usa "Reset senha (e-mail)" no cartão de Funcionários).
- Mensagem `#config-perfil-status`.
- Avatar do header (`#admin-avatar`) e o do cartão têm como **fonte canônica o doc `usuarios/{uid}`** (`reg.photoURL` via snapshot `db.usuarios`), com fallback para o Firebase Auth (`user.photoURL`); o **nome do perfil** (`#admin-avatar-nome`) aparece abaixo do avatar do header (`reg.nome` com fallback `displayName`/e-mail) — tudo via `renderAvatarAtual`.

#### Cartão 7 — Tornar-se Administrador (não-admin)
- Visível apenas para quem **não** é admin (`config-master-card`).
- Campo de **senha master** (`#perfil-senha-master` + Enter) e botão **TORNAR-SE ADMIN** → `promoverParaAdmin()`.
- A senha master é validada por **hash SHA-256** armazenado em `SENHA_MASTER_HASH` (nunca em texto puro). Senha correta → `usuarios/{uid}.role = 'admin'`.
- Após promover, o usuário passa a ver o cartão de Funcionários.

#### Cartão 8 — Funcionários (somente administrador)
- Visível apenas quando o usuário logado tem `role: 'admin'` (`config-funcionarios-card` oculto para funcionários).
- Botão **Novo Funcionário** (classe `bg-green-600`) acima de `#lista-funcionarios` → `abrirModalCadastro()` (abre o `#cadastroModal`, exclusivo do admin).
- Lista todas as contas de `usuarios` (`#lista-funcionarios`) — `renderListaFuncionarios()`. Por funcionário mostra:
  - foto, nome, e-mail, **seletor de papel** (Funcionário/Administrador), campos de edição (nome e URL da foto);
  - linha **"X pedido(s) no sistema"** (contagem via `pedidosDoFuncionario(uid)` = nº de vendas `db.vendas` com `userId === uid`);
  - quando `bloqueado: true`: **badge "BLOQUEADO"** (vermelho) junto ao nome e **borda do cartão vermelha** (`border-red-500/60`; nome em `text-red-400`).
- **SALVAR** → `salvarFuncionario(uid)` grava `usuarios/{uid}`; se o papel for alterado para `'admin'`, grava também **`bloqueado: false`** (admins não podem ser bloqueados).
- **Reset senha (e-mail)** (ícone `fa-key`) → `enviarResetSenhaFuncionario('${email}')`: **admin-only**, chama `auth.sendPasswordResetEmail(email)` (envia ao funcionário o link de redefinição) e exibe `alert("E-mail de redefinição de senha enviado para <email>.")`.
- Para funcionários que **não são "você" nem admin** (`possoGestao`):
  - Botão **BLOQUEAR** (cinza, ícone `fa-ban`) / **LIBERAR** (verde, `fa-unlock`) → `bloquearFuncionario(uid, bloquear)` alterna o campo `bloqueado`;
  - Botão **EXCLUIR** (vermelho, `fa-trash`) → `excluirFuncionario(uid)` **somente se `pedidos === 0`**. Se `pedidos > 0`, mostra o aviso **"Com pedidos, só pode ser bloqueado."** em vez do botão de excluir.
  - Admins e o **próprio usuário** (marcado "(você)") **não** têm BLOQUEAR/LIBERAR nem EXCLUIR.
- Regras: o próprio usuário não pode alterar o próprio papel (select desabilitado); o **último administrador não pode ser rebaixado**.
- Limitação: trocar **e-mail** de outro funcionário não é possível pelo web SDK (exige login como aquele usuário); a **senha** de outro perfil é redefinida pelo admin com o botão **"Reset senha (e-mail)"** (`auth.sendPasswordResetEmail` — o funcionário recebe o link no e-mail; ver [[Autenticacao]]); funcionário não-admin troca apenas a própria senha no cartão "Meu Perfil" (`alterarSenhaPerfil`). Excluir pelo web SDK remove **o doc em `usuarios`** (revoga o acesso ao painel); a conta do Firebase Auth continua existindo (remoção total só via Console/Admin SDK).
- Mensagem `#config-funcionarios-status`.

### ABA — Log de Operações (`#config-aba-log`)
- **Auditoria/controladoria**: consulta de todas as ações registradas no sistema — quem fez, o quê e quando (coleção `logs`; ver [[Firebase-Banco-de-Dados]]).
- **Filtros** (`onchange`/`oninput` → `filtrarLogOperacoes()`): **Tipo de ação** (`#log-filtro-acao`), **Entidade** (`#log-filtro-entidade`), **Usuário** (`#log-filtro-usuario`, populado por `carregarUsuariosFiltroLog()` com os operadores que registraram ações + `db.usuarios`), período **De/Até** (`#log-filtro-de`/`#log-filtro-ate`, datas) e **busca livre** (`#log-busca` — descrição, ID do registro ou entidade).
- Botões: **LIMPAR FILTROS** (`limparFiltrosLogOperacoes()`) e **ATUALIZAR** (`recarregarLogOperacoes()`, re-popula usuários e re-renderiza).
- **Tabela** (`#log-corpo`, 5 colunas): **Data/Hora** (timestamp, `pt-BR`), **Usuário** (nome + e-mail), **Ação** (badge colorido), **Entidade** e **Descrição** (texto legível do que foi feito). Ação vazia exibida como `—`.
- **Paginação**: **20 registros por página** (`LOG_POR_PAGINA`; `#log-pagination` via `renderizarPaginacaoGenerica('log',...)`; `mudarPaginaLogOperacoes`/`logPage`). Filtros resetam para a **página 1**.
- **Live**: `db.logs` é mantido pelo `onSnapshot` de `logs` (ordem `timestamp` desc) em `iniciarSincronizacao()`; ao abrir a aba (`mostrarAbaConfig('log')`) popula usuários e re-renderiza.
- Rótulos: `rotuloAcaoLog(acao)` (INCLUSÃO verde / EDIÇÃO azul / EXCLUSÃO vermelho / BLOQUEIO laranja / DESBLOQUEIO teal / VENDA âmbar / STATUS roxo / PROMOÇÃO rosa / LOGIN índigo / ABERTURA·FECHAMENTO·LANÇAMENTO ciano) e `rotuloEntidadeLog(entidade)` (Produto, Cliente, Venda, Configurações, Perfil, Usuário, Caixa).

## Banco de contas (`usuarios/{uid}`)- Cada conta tem doc em Firestore: `{ email, nome, photoURL, role: 'admin'|'funcionario', bloqueado: boolean, criadoEm, senhaAlteradaEm }`.
- `senhaAlteradaEm` (timestamp server) é gravado **apenas** pela Cloud Function `resetOperadorPassword` ([[Cloud-Functions]] — alternativa para o plano Blaze, **atualmente não ativa**). No plano Spark a redefinição de senha de outro perfil é por **e-mail** (`auth.sendPasswordResetEmail`), que **não** altera o doc em `usuarios` nem grava `senhaAlteradaEm`. Ver [[Autenticacao]].
- **Criação do doc**: **somente** em `cadastrarNovoFuncionario()` (que **exige** `ehAdministrador()`) com **`role: 'funcionario'`** e **`bloqueado: false`** — a conta é criada numa **app Firebase isolada** (`cadastroTemp` via `obterAppCadastroTemp()`), então `createUserWithEmailAndPassword` **não troca a sessão**; o `set()` do doc é feito com a **sessão do admin** (`dbFirestore`; as regras permitem admin gravar em qualquer doc de `usuarios`) e o admin **permanece logado** (sem `auth.signOut()`).
- **Gate no login**: `onAuthStateChanged` consulta `usuarios/{uid}` e **só libera o painel se o doc existir E `bloqueado !== true`**. Conta sem registro (cliente) ou operador bloqueado é deslogada com aviso em `#login-aviso` ("...não é de um operador do painel." / "...está bloqueado pelo administrador.").
- **Auto-kick**: o snapshot de `usuarios` em `iniciarSincronizacao()` encerra a sessão em tempo real se o usuário logado (não-admin) for marcado como `bloqueado: true`.
- A elevação a admin ocorre só via **senha master** (`promoverParaAdmin`) ou pelo admin (cartão Funcionários).
- `salvarPerfil()` grava/mergeia o próprio registro mantendo `role`; o avatar do painel **prioriza o doc** `usuarios` (o `updateProfile` no Auth continua sendo feito para a própria conta logada, mantendo o Firebase Auth consistente).

## Comportamento (funcional)
- **Navegação por abas**: `mostrarAbaConfig(aba)` alterna visibilidade das 5 abas (`estabelecimento` | `catalogo` | `aparencia` | `conta` | `log`) e a classe `active` nos botões — mesmo padrão dos Relatórios (`report-tab`). Aba ativa ao entrar na tela: **Estabelecimento**. Ao abrir a aba **log**, chama `carregarUsuariosFiltroLog()` + `renderizarLogOperacoes()`.
- **Carregamento**: `loadBannerConfig()` (chamado no login) preenche os campos de loja e banner e aplica nome/unidade na sidebar (`#sidebar-loja-nome`, `#sidebar-loja-unidade`). `loadPersonalizacao()` carrega cores salvas e aplica CSS custom properties (funciona mesmo com a aba Aparência oculta).
- **Perfil**: ao abrir a tela (`mostrarPagina('config')`), `carregarPerfilNoConfig()` preenche nome/e-mail/foto do usuário logado.
- **Salvar Loja**: grava `config/loja → { nome, unidade, lastUpdate }` e reflete na sidebar imediatamente.
- **Salvar Banner**: grava `config/banner → { url, lastUpdate }`.
- **Personalização**: `config/personalizacao` armazena cores, logo e toggle de login; `aplicarCoresTema()` define CSS custom properties em `:root`; presets pré-definem combinações de cores.
- **Formas de Pagamento**: `onSnapshot` de `config/pagamentos` (`iniciarSincronizacao`) mantém `metodosPagamento` atualizado; remoção/adicionar grava o array `metodos`; padrão: `['PIX', 'Cartão', 'Dinheiro', 'Outros']`.
- **Classificação de Produtos**: `onSnapshot` de `config/classificacoes` (`iniciarSincronizacao`) mantém `marcasCadastradas`/`gruposCadastrados`/`subgruposCadastrados` e chama `renderizarListaClassificacoes()`, `preencherSelectsClassificacaoProduto()` e `carregarSelectsClassificacaoRelatorio()`. Adicionar/remover grava o doc (`salvarClassificacoes`) e re-popula os selects do Cardápio/Relatórios.
- Mensagens de sucesso somem após 3s.

## Observações
- O banner foi **removido** da tela [[Cardapio-Estoque]]; aqui é o único local de gestão.
- Ver [[Banner-do-Cardapio]] para o fluxo do banner e [[Firebase-Banco-de-Dados]] para `config/loja`, `config/pagamentos`, `config/classificacoes` e `config/personalizacao`.

## Relações
- → [[Banner-do-Cardapio]]
- → [[Firebase-Banco-de-Dados]]