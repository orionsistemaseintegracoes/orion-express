---
tags:
  - orion-express
  - arquitetura
---
# Tecnologias

## Stack

| Tecnologia                          | Uso                              | Onde                                                                       |
| ----------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| HTML5 + CSS3                        | Estrutura e estilos              | `index.html`, `style.css`                                                  |
| JavaScript (vanilla, ES6+)          | Toda a lógica                    | `script.js`                                                                |
| **Tailwind CSS** (CDN)              | Utilitários de layout            | `<script src="https://cdn.tailwindcss.com">`                               |
| **Chart.js** (CDN)                  | Gráficos do dashboard/relatórios | `<script src=".../chart.js">`                                              |
| **Font Awesome 6** (CDN)            | Ícones                           | `<link .../font-awesome/6.4.0/...>`                                        |
| **Firebase JS SDK 10.7.1 (compat)** | Auth + Firestore + Storage | `firebase-app-compat`, `firebase-firestore-compat`, `firebase-auth-compat`, `firebase-storage-compat` |
| **Google Fonts — Poppins**          | Tipografia                       | `style.css` (`@import`)                                                    |

> As **Cloud Functions** (`functions/index.js`, `resetOperadorPassword`) **NÃO são usadas no plano Spark** — ficam no repositório apenas como alternativa para migração futura ao plano **Blaze**. Ver [[Cloud-Functions]].

## Firebase

- **Firestore**: banco de dados NoSQL (coleções `clientes`, `estoque`, `vendas`, `config`). Ver [[Firebase-Banco-de-Dados]].
- **Auth**: e-mail/senha. Login, cadastro de funcionário e logout. A senha de **outro** perfil é redefinida pelo administrador via **e-mail** (`auth.sendPasswordResetEmail`, botão "Reset senha (e-mail)" no cartão Funcionários) — o web SDK só consegue alterar a senha da **própria** conta logada, que é feita no perfil (`alterarSenhaPerfil` — re-auth + `updatePassword`). Ver [[Autenticacao]].
- ~~Cloud Functions~~ **Opcional (não usado no Spark)**: a callable `resetOperadorPassword` existe em `functions/index.js` e só teria uso se o projeto migrar para o plano **Blaze** (aplica `admin.auth().updateUser` + grava `senhaAlteradaEm` no servidor). Ver [[Cloud-Functions]].
- Uso da **API compat** (`firebase.*` global), não modular.

## Decisões notáveis

- **CDN em vez de build**: não há bundler/npm. Tudo carregado via CDN no `<head>`.
- **Tempo real**: `onSnapshot` dispensa recarregar a página para ver novos pedidos.
- **Baixa de estoque atômica**: `dbFirestore.batch()` ao finalizar venda.
- **Impressão**: comanda gerada em janela `window.open` + `document.write` + `window.print()`.
- **Plano Spark sem Cloud Functions**: senha de **outro** perfil é redefinida por **e-mail** (`auth.sendPasswordResetEmail`, botão "Reset senha (e-mail)" do cartão Funcionários). Cada usuário troca a **própria** senha pelo perfil (`alterarSenhaPerfil`, client-side).

## Relações

- → [[Visao-Geral]]
- → [[Firebase-Banco-de-Dados]]
