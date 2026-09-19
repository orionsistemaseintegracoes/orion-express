---
tags:
  - orion-express
  - arquitetura
---
# Estrutura de Arquivos

| Arquivo | Papel |
|---------|-------|
| `index.html` | Tela única (login + todas as páginas admin + modais). ~2641 linhas. |
| `style.css` | Sistema visual: tema escuro "Orion", componentes compartilhados, temas. |
| `script.js` | Toda a lógica: CRUDs, PDV, dashboard, gráficos, impressão (utilizando API Firebase mockada). |
| `supabase-compat.js` | Camada de compatibilidade Firebase → Supabase (emulação de Firestore, Auth e Storage). |
| `AGENTS.md` | Regras de trabalho do repositório e **Regra de Ouro** de desenvolvimento. |
| `seed-firestore.js` | Script utilitário para população inicial/seeding de dados. |
| `check-vendas.js` | Script utilitário para inspeção/verificação de registros de vendas. |
| `firebase.json` | Config do Firebase CLI (legado / histórico). |
| `.firebaserc` | Projeto padrão do Firebase CLI (`aura-smoke`). |
| `functions/index.js` | **Cloud Function** callable `resetOperadorPassword` (legado/opcional para plano Blaze). |
| `orion-logo.png` | Logo oficial usada no login, sidebar e impressão. |
| `design-qa.md` | Resultado do Design QA do sistema visual. Ver [[Notas-QA-e-Bugs]]. |

## `index.html` — blocos principais

| Bloco | Conteúdo |
|-------|----------|
| `#login-page` | Tela de login (e-mail/senha) — sem link de cadastro; texto informativo aponta o cadastro para Configurações |
| `#cadastroModal` | Modal de cadastro de novo funcionário |
| `#main-app` | Aplicação autenticada (sidebar + main) |
| `aside.admin-sidebar` | Navegação entre as 8 telas + switcher da loja (clique = logout) |
| `#dashboard` | Board de pedidos + resumo do dia |
| `#venda` | PDV Express — Venda Rápida |
| `#caixa` | Gerenciamento de Caixa |
| `#vendas` | Histórico de pedidos/vendas |
| `#estoque` | Cardápio & Estoque (CRUD produtos + banner) |
| `#clientes` | Cadastro de clientes |
| `#relatorios` | Relatórios com gráficos |
| `#config` | Configurações (loja + banner) |
| `#modalDetalhesPedido` | Modal de detalhes do pedido + impressão de comanda |

## `style.css` — seções

1. Base: fonte Poppins, scrollbar, animações, componentes (`.nav-btn`, `.input-field`).
2. Tema claro (`.light-theme`) — sobrescritas opcionais.
3. Sistema visual "Orion" (`--orion-*`): sidebar 308px, board de pedidos, painel de resumo.
4. Sistema compartilhado aplicado a todas as telas exceto `#dashboard`.
5. Responsividade: `@media` 1250px / 1023px / 700px.

## `script.js` — seções

1. Configuração Firebase + inicialização.
2. Cache local `db` e estado do carrinho.
3. Sincronização em tempo real (`onSnapshot`).
4. Autenticação (login, cadastro, logout, sessão).
5. Gestão de modais e de páginas.
6. Utilitários (`formatarMoeda`).
7. CRUD Estoque + Banner do cardápio.
8. CRUD Clientes.
9. PDV / Vendas (carrinho) + Caixa.
10. Histórico de vendas e status.
11. Dashboard e gráficos.
12. Modal de detalhes e impressão de comanda.
13. Helpers do board (normalização de status etc.).

## Relações

- → [[Visao-Geral]]
- → [[Funcoes-do-script]]
