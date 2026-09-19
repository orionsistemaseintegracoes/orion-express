---
tags:
  - orion-express
  - tela
---
# Tela — Login

> `#login-page` em `index.html`. Primeira tela exibida quando não há sessão ativa.

## Propósito
Autenticar funcionários no painel administrativo via **Firebase Auth** (e-mail + senha).

## Elementos da tela
- **Logo** Orion Express (imagem `orion-logo.png`, com fallback de texto se a imagem falhar).
- Título "Portal de Vendas" + subtítulo.
- Campo **E-mail do Funcionário** (`#login-email`, type=email).
- Campo **Senha** (`#login-senha`, type=password).
- Botão **ENTRAR** → `login()`.
- Aviso de bloqueio (`#login-aviso`, classes `hidden text-red-400 text-sm font-semibold mb-4`) — exibido quando a conta **não é de um operador** do painel.
- Texto informativo: *"Acesso restrito aos operadores do sistema. Novos funcionários são cadastrados pelo administrador nas **Configurações**."* — o cadastro **não** é feito nesta tela.

## Comportamento
| Ação | Resultado |
|------|-----------|
| Botão ENTRAR sem e-mail ou senha | `alert("Por favor, preencha E-mail e Senha para continuar.")` |
| Credenciais corretas (doc em `usuarios/{uid}` existe **e `bloqueado !== true`**) | `auth.signInWithEmailAndPassword` → gate libera o painel |
| Conta de cliente / sem registro em `usuarios` | `auth.signOut()` + aviso **"Acesso negado: esta conta não é de um operador do painel."** em `#login-aviso` |
| Operador com `bloqueado: true` (bloqueado pelo admin) | `auth.signOut()` + aviso **"Acesso negado: este operador está bloqueado pelo administrador."** em `#login-aviso` |
| Credenciais erradas | `alert("Erro ao fazer login: ...")` |
| Antes de autenticar | `ocultarAvisoLogin()` limpa avisos antigos |
| Campos vazios ao cadastrar | `alert("Preencha todos os campos...")` |
| Senha < 6 caracteres | `alert("A senha deve ter no mínimo 6 caracteres.")` |

## Cadastro de novo funcionário (`#cadastroModal`)
- O modal **permanece no HTML oculto**, mas **não é aberto pelo login** — apenas pela tela [[Configuracoes]] (botão "Novo Funcionário" → `abrirModalCadastro()`), **exclusivo do administrador**.
- Modal com **E-mail**, **Senha** e **Nome Completo**.
- Botão **CADASTRAR FUNCIONÁRIO** → `cadastrarNovoFuncionario()` (bloqueia não-admins):
  1. `if (!ehAdministrador())` → `alert("Somente o administrador pode cadastrar novos funcionários.")`.
  2. Adiciona o e-mail a `perfisEmCriacao`.
  3. Cria a conta numa **app Firebase isolada** (`obterAppCadastroTemp()` → `firebase.auth(tempApp).createUserWithEmailAndPassword(email, senha)` no app `cadastroTemp`) — o cadastro **não** mexe na sessão do admin.
  4. `user.updateProfile({ displayName: nome })` (na conta temporária).
  5. Grava `usuarios/{uid}` com `{ email, nome, photoURL: '', role: 'funcionario', bloqueado: false, criadoEm }` usando `dbFirestore` com a **sessão do admin** (regras permitem admin gravar em qualquer doc de `usuarios`).
  6. `fecharModalCadastro()` + alert de sucesso — admin **permanece logado** (sem `signOut`). Em `finally`: limpa `perfisEmCriacao`, `tempAuth.signOut()` e `tempApp.delete()`.
- Fechar (X ou `fecharModalCadastro()`) limpa os campos do modal.

## Integrações
- [[Autenticacao]] — fluxo completo de sessão
- [[Firebase-Banco-de-Dados]] — coleção de usuários (Auth, não Firestore)

## Como testar / pontos de atenção
- Exibir quando deslogado; esconder quando logado.
- O gate consulta `usuarios/{uid}` antes de liberar: contas de **clientes** (sem doc) e **operadores bloqueados** (`bloqueado: true`) são deslogadas com aviso em `#login-aviso`.
- O cadastro **não está mais na tela de login**: é feito **apenas pelo administrador** nas [[Configuracoes]] e cria o perfil `funcionario` em `usuarios` — sem esse doc, o acesso ao painel é negado.
