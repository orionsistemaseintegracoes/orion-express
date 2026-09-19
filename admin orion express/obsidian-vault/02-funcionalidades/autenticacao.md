---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Autenticação

> Firebase Auth (e-mail/senha). Gerencia a sessão e a visibilidade das telas.

## Visão geral
O app usa `auth.onAuthStateChanged` como **única fonte de verdade** para saber se há usuário logado:

| Estado | Ação |
|--------|------|
| `user` presente **e operador ativo** (doc existe em `usuarios/{uid}` **e `bloqueado !== true`**) | Libera: esconde `#login-page`, mostra `#main-app`, inicia sincronização, carrega banner, atualiza avatar, navega para Dashboard |
| `user` presente **sem registro** em `usuarios` (conta de cliente) | Bloqueia: `auth.signOut()` + aviso **"Acesso negado: esta conta não é de um operador do painel."** em `#login-aviso`; permanece no login |
| `user` presente **com `bloqueado: true`** (operador bloqueado pelo admin) | Bloqueia: `auth.signOut()` + aviso **"Acesso negado: este operador está bloqueado pelo administrador."** em `#login-aviso`; permanece no login |
| `user` ausente | Esconde `#main-app`, mostra `#login-page` |

## Fluxos

### Login — `login()`
1. Lê e-mail/senha dos campos.
2. Valida preenchimento (`alert` se vazio).
3. `ocultarAvisoLogin()` — limpa avisos antigos.
4. `auth.signInWithEmailAndPassword(email, senha)`.
5. Erro → `alert` (mensagem limpa do prefixo `Firebase: Error `).

### Cadastro de funcionário — `cadastrarNovoFuncionario()` (somente ADMIN)
1. **Bloqueio de não-admin**: `if (!ehAdministrador()) return alert("Somente o administrador pode cadastrar novos funcionários.")`.
2. Valida e-mail, senha (mínimo 6) e nome.
3. Adiciona o e-mail em `perfisEmCriacao` (Set global) **antes** de criar a conta.
4. Obtém uma **app Firebase isolada** via `obterAppCadastroTemp()` (reusa `firebase.app('cadastroTemp')` ou cria com `firebase.initializeApp(firebaseConfig, 'cadastroTemp')`) e cria a conta em `firebase.auth(tempApp).createUserWithEmailAndPassword(email, senha)` — **a sessão do admin (Auth principal `auth`) NÃO é trocada**.
5. `userCredential.user.updateProfile({ displayName: nome })` (na conta temporária).
6. Cria o registro de **operador**: `usuarios/{uid}.set({ email, nome, photoURL: '', role: 'funcionario', bloqueado: false, criadoEm })` usando `dbFirestore` com a **sessão do admin ativa** (regras do Firestore permitem admin gravar em qualquer doc de `usuarios`).
7. `fecharModalCadastro()` + `alert("Funcionário X cadastrado com sucesso! Ele já pode acessar o painel com o e-mail ...")` — **sem `signOut()`: o admin permanece logado**.
8. Em `finally`: remove o e-mail de `perfisEmCriacao`, `tempAuth.signOut()` e `tempApp.delete().catch(...)` para descartar a instância temporária.

### Logout — `logout()`
- Acionado pelo clique no **switcher de loja** na sidebar (`store-switcher`, title "Clique para sair").
- `auth.signOut()` → `onAuthStateChanged` volta para o login.

### Troca de senha
- **Própria senha (qualquer operador)** — `alterarSenhaPerfil()` no cartão "Meu Perfil" das [[Configuracoes]]: reautentica com a senha atual (`EmailAuthProvider`) e `user.updatePassword(novaSenha)`. Funciona no web SDK porque é a conta logada. O admin também usa este fluxo para a própria senha (auto-serviço preservado).
- **Senha de OUTRO perfil (somente ADMIN)** — botão **"Reset senha (e-mail)"** no cartão Funcionários das [[Configuracoes]] → `enviarResetSenhaFuncionario(email)`: **admin-only**, chama `auth.sendPasswordResetEmail(email)` (o funcionário recebe no e-mail o link de redefinição) e exibe `alert("E-mail de redefinição de senha enviado para <email>.")`. A Cloud Function `resetOperadorPassword` **NÃO é usada no Spark** — permanece apenas como alternativa para migração futura ao plano Blaze (ver [[Cloud-Functions]]).

## Como redefinir a senha de um funcionário (e-mail)

> Fluxo **admin-only**. O web SDK só troca a senha da **própria** conta logada; para **outro** perfil o painel usa a redefinição por **e-mail** (`auth.sendPasswordResetEmail`), que funciona no plano Spark sem Cloud Functions nem scripts locais.

1. **Painel** → [[Configuracoes]] → cartão **Funcionários** → botão **"Reset senha (e-mail)"** (`enviarResetSenhaFuncionario(email)`, admin-only).
2. O Firebase envia um **e-mail de redefinição** para o endereço cadastrado do funcionário.
3. O painel confirma com `alert("E-mail de redefinição de senha enviado para <email>.")`.
4. O funcionário clica no link do e-mail e define a nova senha na página do Firebase Auth.

> Nenhuma senha de outro perfil é manipulada pelo web SDK; a Cloud Function `resetOperadorPassword` (Admin SDK) continua documentada em [[Cloud-Functions]] apenas como alternativa para o plano **Blaze**.

### 🔧 O e-mail de redefinição NÃO está chegando — checklist (Firebase Console)

O código está **correto** (`auth.sendPasswordResetEmail(email)`). Quando o Firebase Auth "aceita" o pedido mas o e-mail não chega, é **configuração do Console** (ou caixa de spam), não do `script.js`:

1. **Caixa de spam/lixeira** — o remetente padrão (`no-reply@<authDomain>` ou o domínio customizado) costuma cair no spam. Verificar spam/lixeira primeiro (os alerts agora lembram disso).
2. **Template de e-mail ativo e com remetente válido** — Firebase Console → **Authentication → Templates** → tipo **Password reset**: deve estar **enabled**; conferir **From name**/**From email**/**Reply-to** válidos (um remetente em branco/inválido faz o envio falhar silenciosamente). Ajuste também o **subject**/**message** se precisar.
3. **Domínio do remetente** — se usar **customize domain**, o domínio deve estar **verificado** (SPF/DKIM/TXT). O padrão (`<project>.firebaseapp.com`) funciona sem verificação, mas é mais propenso a spam.
4. **`ActionCodeSettings` / URL de ação** — por padrão o link é `https://<authDomain>/__/auth/action?mode=resetPassword&oobCode=...` (já provisionado). Só configuração se usou **customize action URL** (deve estar publicada e acessível). O `script.js` **não** passa `actionCodeSettings` — comportamento padrão.
5. **⚠️ E-mail salvo no doc `usuarios` ≠ e-mail real do Firebase Auth** — `enviarResetSenhaFuncionario` envia para o e-mail do **doc Firestore**; se ele divergir da conta real do Auth, com **email enumeration protection** ativa o Firebase **não envia e não acusa erro**. Conferir em **Authentication → Users** se a conta existe **exatamente** com o e-mail exibido no cartão de Funcionários. (O doc é gravado em `salvarPerfil`/`salvarFuncionario` — ajustado para persistir o e-mail informado.)
6. **E-mail do próprio perfil** — o botão **"Reset senha (e-mail)"** do Meu Perfil (`enviarResetSenhaProprio`) usa `auth.currentUser.email` (fonte canônica do Auth), então não depende do doc.
7. **Auth habilitado** — **Authentication → Sign-in method → Email/Password** ativo (sem isso o login nem funciona).
8. **Teste direto no Console** — **Authentication → Users → ⋮ → Reset password** para o mesmo e-mail: se o Console também não entregar, o problema é 100% do lado do Firebase/remetente (não do painel).

> O envio de e-mails de redefinição usa a infraestrutura de e-mail do Firebase (gratuito, sem SMTP próprio). Se a necessidade for crítica e persistir mesmo com o template/domínio corretos, a alternativa é a Cloud Function `resetOperadorPassword` ([[Cloud-Functions]]) ou um `ActionCodeSettings` com `url` próprio — opcional no plano Spark.

### 🧪 Se o CONSOLE também diz "enviado" mas o e-mail não chega (Diagnóstico A → Firebase)

Quando `Authentication → Users → ⋮ → Reset password` confirma o envio mas o e-mail **não chega na caixa de entrada, no spam, nem na lixeira**, está **confirmado**: o problema é a **entrega de e-mail do Firebase** (o painel não tem participação). Próximas verificações:

1. **Testar num outro provedor/endereço** — enviar o reset para um e-mail de outro domínio (Outlook/Hotmail, Yahoo, outro Gmail que você controle). Se chegar lá e não no `@gmail.com`, é filtragem específica do Gmail contra o domínio remetente do Firebase.
2. **Conferir o remetente do template** — `Authentication → Templates → Password reset`: o **From** costuma ser `no-reply@<project-id>.firebaseapp.com`. Provedores (principalmente Gmail) silenciosamente descartam e-mails desse domínio (reputação/SPF). A correção é configurar um **domínio de remetente próprio verificado** (`customize domain`, seguindo instruções de verificação do próprio Console — melhora SPF/DKIM/DMARC e a entrega).
3. **Gmail: mais pastas** — além de Entrada/Spam, procurar em **"Todas as mensagens"**, abas (Promoções/Atualizações), **filtros** e **bloqueados**.
4. **Buscar por remetente/assunto** — procurar no Gmail por `noreply`/`@firebaseapp.com` ou pelo título do template ("Redefina sua senha"/"Reset your password").
5. **Audit logs** — em Google Cloud Console → **IAM & Admin → Audit Logs**, habilitar `Data access` do Identity Platform (ou conferir `Logs Explorer` filtrando por `authentication`/`sendEmail`) para ver se houve erro/bounce no envio.
6. **Solução definitiva (recomendada se crítico)**: enviar o e-mail de reset **pela própria aplicação** em vez do Firebase: gerar o link com o **Admin SDK** (`generatePasswordResetLink`) e despachar via **SMTP próprio** (Brevo/SendGrid/Gmail/Google Workspace). No plano Spark isso NÃO roda direto no Front (exige um backend/Cloud Function — plano Blaze, ver [[Cloud-Functions]]). É o único jeito de controlar de verdade a entrega (remetente, SPF/DKIM e reputação).

### Gate de acesso (segurança)
- `auth.onAuthStateChanged` consulta `usuarios/{uid}` **a cada login** (`doc.get()`).
- Só libera o painel se o doc **existir** (operador: `admin` ou `funcionario`) **e `bloqueado !== true`**:
  - Conta sem doc (cliente) → `auth.signOut()` + `mostrarAvisoLogin("Acesso negado: esta conta não é de um operador do painel.")`.
  - Doc com `bloqueado === true` → `auth.signOut()` + `mostrarAvisoLogin("Acesso negado: este operador está bloqueado pelo administrador.")`.
- **Auto-kick em tempo real**: o snapshot de `usuarios` em `iniciarSincronizacao()` também `auth.signOut()` se o usuário logado (que não seja admin) for marcado como `bloqueado: true` — o bloqueio derruba o operador imediatamente, sem esperar novo login.
- **Corrida do cadastro**: `perfisEmCriacao` permanece (Set de e-mails; o gate aguarda até ~5s pelo doc se o `onAuthStateChanged` disparar com e-mail em criação), mas o `createUserWithEmailAndPassword` roda na app **isolada** `cadastroTemp` — o Auth principal **nunca muda** durante o cadastro, então o gate não é acionado pelo cadastro.
- `mostrarAvisoLogin(msg)` / `ocultarAvisoLogin()` controlam o `#login-aviso` da tela de login.

## Modais
- `abrirModalCadastro()` — **admin-only** (`if (!ehAdministrador()) return alert(...)`); abre o `#cadastroModal`, chamado pelo botão "Novo Funcionário" das [[Configuracoes]] (não há mais link de cadastro na tela de login).
- `fecharModalCadastro()` — fecha o `#cadastroModal` (limpa campos ao fechar).

## Segurança / observações
- **Gate de operador**: apenas contas com doc em `usuarios/{uid}` acessam o painel, desde que **`bloqueado !== true`** (operadores bloqueados perdem o acesso imediatamente, inclusive em sessão ativa). Contas de **clientes** (sem doc) são deslogadas com aviso. Cliente e operador usam a mesma autenticação; a existência do doc é o que separa os acessos.
- **Bloqueio/liberação** de funcionários é feito pelo admin no cartão de [[Configuracoes]] (`bloquearFuncionario` — `update({ bloqueado })`); a exclusão de perfil (`excluirFuncionario`) só é permitida para funcionários **sem pedidos**.
- **`garantirPerfilUsuario()` foi removida** — ela criava perfil para **qualquer** login (causa raiz do acesso indevido de clientes). O perfil só é criado em `cadastrarNovoFuncionario()`.
- 🔒 O cadastro de funcionário é **exclusivo do administrador** (via [[Configuracoes]]) — `cadastrarNovoFuncionario()` e `abrirModalCadastro()` bloqueiam não-admins. Cria perfil `funcionario`, **sem** conceder `admin` — elevação exige senha master (`promoverParaAdmin`) ou admin logado.
- Nome do usuário é salvo em `displayName` e usado nas vendas (`venda.userName`).
- 🔑 **Redefinição de senha de terceiros**: o **admin** dispara o e-mail de redefinição pelo botão **"Reset senha (e-mail)"** no cartão Funcionários (`enviarResetSenhaFuncionario` → `auth.sendPasswordResetEmail(email)`), sem manipular senha de outro perfil pelo web SDK. A Cloud Function `resetOperadorPassword` é apenas alternativa para o plano **Blaze** ([[Cloud-Functions]]).
- Avatar do admin (header/cartão) tem como **fonte canônica o doc `usuarios/{uid}`** (`reg.photoURL`/`reg.nome` via snapshot `db.usuarios`), com fallback para o Firebase Auth (`user.photoURL`/`user.displayName`); sem foto mostra ícone `fa-user`. Ver [[Configuracoes]] e [[Notas-QA-e-Bugs]].

## Relações
- → [[Login]]
- → [[Firebase-Banco-de-Dados]]
