---
tags:
  - orion-express
  - arquitetura
---
# Visão Geral do Sistema

## O que é

Sistema administrativo **Orion Express** para gerenciar pedidos online, vendas no balcão (PDV), cardápio/estoque, clientes e relatórios. É um **SPA** (single-page application): a troca de telas acontece via JavaScript sem recarregar a página, alternando a classe `hidden` dos blocos `#page`.

## Estrutura de execução

```
Browser (index.html + script.js)
        │
        ▼
┌─────────────────────────────────────┐
│  Firebase Auth (usuários)           │
│  Firebase Firestore (dados)         │
└─────────────────────────────────────┘
```

- **Autenticação**: controla quem acessa o painel (login/cadastro de funcionário).
- **Dados**: lidos e escritos no Firestore; o app mantém um cache local (`db`) sincronizado em tempo real por listeners `onSnapshot`.
- **Cloud Functions**: **não usadas no plano Spark** e **não referenciadas pela UI**. A redefinição de senha de OUTRO perfil é por **e-mail** (`auth.sendPasswordResetEmail` — botão "Reset senha (e-mail)" do cartão Funcionários), pois o web SDK não permite `updatePassword` de outra conta. A callable `resetOperadorPassword` (`functions/index.js`) fica apenas como alternativa para migração ao plano **Blaze** — ver [[Cloud-Functions]].

## Estado da aplicação (`script.js`)

| Variável | Tipo | Descrição |
|----------|------|-----------|
| `db` | objeto | Cache local das coleções `clientes`, `estoque`, `vendas`, `usuarios` |
| `carrinho` | array | Itens do carrinho da Venda Rápida (volátil) |
| `boardFilter` | string | Filtro ativo no board de pedidos |
| `pedidoAtualIdModal` | string\|null | ID do pedido aberto no modal de detalhes |
| `vendasChartInstance`, `produtosChartInstance`, `dashboardSalesChartInstance` | Chart | Instâncias dos gráficos Chart.js |

## Ciclo de vida

1. `firebase.initializeApp(firebaseConfig)` → inicializa Firebase (Auth, Firestore, Storage).
2. `auth.onAuthStateChanged` → logado **com doc em `usuarios/{uid}` e `bloqueado !== true`** (operador ativo): mostra `#main-app`, inicia sincronização, carrega banner, mostra Dashboard. Conta **sem registro** ou **bloqueada** → `signOut()` + aviso no `#login-aviso`. Deslogado: mostra `#login-page`.
3. `iniciarSincronizacao()` → registra 3 listeners `onSnapshot` (clientes, estoque, vendas).
4. Navegação por `mostrarPagina(id)` troca o conteúdo visível.

## Fluxo de dados

- **Escrita de vendas**: `finalizarVenda()` grava em `vendas` e dá baixa no estoque via `batch` (transação atômica).
- **Leitura**: listeners atualizam `db` e chamam as funções de renderização (`renderizarEstoque`, `renderizarClientes`, `renderHistoricoVendas`, `renderDashboard` etc.).

## Relações

- ← [[Estrutura-de-Arquivos]]
- ← [[Tecnologias]]
- ← [[Firebase-Banco-de-Dados]]
- → [[Fluxo-de-Uma-Venda]]
