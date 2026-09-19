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
| **Supabase JS SDK + Compat Layer**  | Auth + Firestore Emulation + Storage | `@supabase/supabase-js` + `supabase-compat.js`                             |
| **Google Fonts — Poppins**          | Tipografia                       | `style.css` (`@import`)                                                    |

> As **Cloud Functions** (`functions/index.js`, `resetOperadorPassword`) **NÃO são usadas no plano Spark** — ficam no repositório apenas como alternativa para migração futura ao plano **Blaze**. Ver [[Cloud-Functions]].

## Backend (Supabase + Camada de Compatibilidade)

- **Supabase client (`@supabase/supabase-js`)**: backend de dados (PostgreSQL) e autenticação.
- **Camada `supabase-compat.js`**: emula a API legada do Firebase (`firebase.firestore()`, `firebase.auth()`, `onSnapshot`, `CollectionRef`, `DocRef`, `batch()`, `runTransaction()`, `storage()`), permitindo que `script.js` funcione sem grandes refatorações.
- **Tabelas / Coleções**: `clientes`, `estoque`, `vendas`, `config`, `usuarios`. Ver [[Firebase-Banco-de-Dados]].
- **Auth**: Supabase Auth mapeado para os métodos de Auth do mock (`signInWithEmailAndPassword`, `signUp`, `onAuthStateChanged`).

## Decisões notáveis

- **CDN em vez de build**: não há bundler/npm. Tudo carregado via CDN no `<head>`.
- **Camada de Compatibilidade Supabase**: transição transparente da API do Firebase para o backend Supabase sem alterar os métodos chamados em `script.js`.
- **Tempo real**: `onSnapshot` emulado via subscrição de canais Supabase (`postgres_changes`).
- **Baixa de estoque atômica**: emulada via `batch()` e transações no `supabase-compat.js`.
- **Impressão**: comanda gerada em janela `window.open` + `document.write` + `window.print()`.

## Relações

- → [[Visao-Geral]]
- → [[Firebase-Banco-de-Dados]]
