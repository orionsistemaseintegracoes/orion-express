---
tags:
  - orion-express
  - firebase
  - arquitetura
---
# Cloud Functions — `resetOperadorPassword` (alternativa para o plano Blaze)

> Callable HTTPS gerida pelo **Admin SDK** para trocar a senha de um perfil de operador. O web SDK do Firebase **não permite** alterar a senha de OUTRO usuário (só a da própria conta logada) — por isso a troca de senha de outro perfil precisa de algo com Admin SDK.

> ⚠️ **NÃO ATIVA — o projeto permanece no plano Spark (gratuito)**. Neste plano **não** usamos Cloud Functions e a UI **não a referencia em nenhum ponto**: a redefinição de senha de outro perfil é feita por **e-mail** (`auth.sendPasswordResetEmail` — botão "Reset senha (e-mail)"). Esta função só entraria em uso **se** o projeto migrar para o plano **Blaze** e o deploy for executado. Fluxo ativo em "Como redefinir a senha de um funcionário (e-mail)" ([[Autenticacao]]).

## Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `functions/index.js` | A função `resetOperadorPassword` |
| `functions/package.json` | Deps: `firebase-admin ^11.11.1`, `firebase-functions ^4.9.0`; engine **node 18**; `main: index.js` |
| `firebase.json` | Só functions (source `functions`, runtime `nodejs18`) |
| `.firebaserc` | Projeto padrão: `aura-smoke` |

## Assinatura e regra de negócio

- Nome: `resetOperadorPassword` (callable via `functions.https.onCall`).
- Entrada (`data`): `{ uid: string, novaSenha: string }`.
- Retorno em sucesso: `{ ok: true }`. Erros via `HttpsError` (códigos padrão da SDK).

## Fluxo de execução (server-side)

1. **Autenticação**: `context.auth` obrigatório — sem, lança `unauthenticated` ("Faça login para continuar.").
2. **Entrada**: `targetUid` precisa ser string não vazia (`invalid-argument` "Informe o perfil de destino."); `novaSenha` string com **mínimo 6 caracteres** (`invalid-argument` "A nova senha deve ter no mínimo 6 caracteres.").
3. **Chamador é operador?** Lê `usuarios/{callerUid}` em Firestore; sem doc → `permission-denied` "Conta sem perfil de operador.".
4. **Autorização**:
   - `targetUid == callerUid` → permitido para **qualquer operador** (funcionário ou admin).
   - `targetUid != callerUid` → **somente se `caller.role == 'admin'`**; caso contrário `permission-denied` **"Somente o administrador pode alterar a senha de outro perfil."**.
5. **Alvo existe**: `usuarios/{targetUid}`; sem doc → `not-found` "Perfil de destino não encontrado.".
6. **Aplica**: `admin.auth().updateUser(targetUid, { password: novaSenha })`.
7. **Auditoria**: grava `usuarios/{targetUid} → { senhaAlteradaEm: admin.firestore.FieldValue.serverTimestamp() }` (merge/update).
8. Retorna `{ ok: true }`.

## Cliente (script.js) — REMOVIDO no Spark

- ~~`const funcs = (typeof firebase.functions === 'function') ? firebase.functions() : null;`~~ **REMOVIDO** — a tag `firebase-functions-compat.js` não é mais carregada no `index.html`.
- O cartão Funcionários ([[Configuracoes]]) **não referencia a Cloud Function**: o botão é **"Reset senha (e-mail)"** → `enviarResetSenhaFuncionario(email)` (admin-only), que chama `auth.sendPasswordResetEmail(email)` e exibe alert de confirmação. A redefinição por e-mail roda inteira no Firebase Auth do plano gratuito.
- ~~`mensagemErroAlterarSenha(error)`~~ **REMOVIDO** — o helper que tratava erros de função não implantada não existe mais.

## ⚠️ Estado no plano Spark (ativo)

O projeto está no plano **Spark** (gratuito) e **permanecerá nele** — portanto a Cloud Function **não é usada** e **não está implantada** (a **Cloud Functions API está desativada** no projeto `aura-smoke`; deploy exige **plano Blaze**). Deploy de Cloud Functions exige **plano Blaze** (pay-as-you-go).

**Fluxo em uso (Spark)**: a redefinição de senha de outro perfil é feita por **e-mail** — o admin clica em **"Reset senha (e-mail)"** no cartão Funcionários (`enviarResetSenhaFuncionario` → `auth.sendPasswordResetEmail`). O painel **não executa** `updateUser` de outra conta. O experimento de troca de senha por dentro do sistema (script local `ferramentas/reset-senha.js`) foi **descartado** — a pasta `ferramentas/` foi removida do repositório. Ver [[Autenticacao]].

**Limitação da conta de serviço**: a conta de serviço (`serviceAccountKey.json`) **NÃO tem permissão** para habilitar a Cloud Functions API — a tentativa de `serviceusage...:enable` retorna `403 AUTH_PERMISSION_DENIED`. Habilitar a API exige o **dono do projeto** no console do Google Cloud + **plano Blaze** (billing). O deploy também exige `firebase login` (conta com acesso ao projeto) + `firebase deploy --only functions` — a conta de serviço **não é suficiente** nesta configuração.

A pasta `functions/`, o `firebase.json` e o `.firebaserc` foram **mantidos no repositório** como material de referência para uma eventual migração ao plano Blaze (não são usados no Spark).

### Passo a passo de deploy (somente se migrar para o plano Blaze)

1. **Habilitar a API** (etapa explícita, feita **no console antes do deploy**): Firebase Console → `aura-smoke` → Build → Functions → ativar, ou em `https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=aura-smoke`. ⚠️ **Exige o dono do projeto**: a conta de serviço (`serviceAccountKey.json`) **não consegue** habilitar (403 `AUTH_PERMISSION_DENIED`).
2. **Fazer upgrade para plano Blaze** (Spark não suporta Cloud Functions): Console → Plano do projeto → Blaze. A região/dados podem ser alterados depois.
3. **Instalar o Firebase CLI**: `npm i -g firebase-tools`.
4. **Login**: `firebase login`.
5. **Inicializar** (já existem `firebase.json` e `functions/index.js`): `firebase init functions` — aceitar `functions/index.js` existente.
6. **Instalar deps**: `cd functions && npm i`.
7. **Deploy**: `firebase deploy --only functions`.

> Fonte: dica de deploy nos comentários de `functions/index.js`.
> Relações: [[Tecnologias]] · [[Firebase-Banco-de-Dados]] · [[Notas-QA-e-Bugs]] · [[Configuracoes]]