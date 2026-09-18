---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Sincronização em Tempo Real

> `iniciarSincronizacao()` em `script.js`. Base de todo o painel.

## Como funciona
Usa **listeners `onSnapshot`** do Firestore, que disparam a cada mudança nos dados. O objeto `db` é **alimentado somente** por esses listeners (cache local sempre atualizado).

```js
db = { clientes: [], estoque: [], vendas: [], usuarios: [] };
```

## Listeners

| Coleção | Ação ao atualizar |
|---------|-------------------|
| `clientes` | `renderizarClientes()`, `renderizarSelectClientes()`, `renderDashboard()` |
| `estoque` | `renderizarEstoque()`, `renderizarProdutosVenda()`, `renderDashboard()` |
| `vendas` (orderBy `dataIso` desc) | `renderHistoricoVendas()`, `renderDashboard()` |
| `config/pagamentos` | atualiza `metodosPagamento` + `renderizarSelectPagamento()`, `renderizarListaPagamentos()` |
| `usuarios` | **Auto-kick**: se o doc do usuário logado (que não seja admin) tiver `bloqueado: true` → `auth.signOut()`; senão `renderListaFuncionarios()` |

## Efeitos visíveis
- Novo pedido chega **sozinho** no Dashboard (sem refresh).
- Baixa de estoque reflete na Venda Rápida e no Cardápio instantaneamente.
- Novo cliente aparece no seletor do PDV.
- **Bloquear um funcionário pelo admin derruba a sessão dele em tempo real** (`auth.signOut()`), mesmo com o painel aberto.

## Início
- Chamado em `auth.onAuthStateChanged` quando o usuário loga.

## Pontos de atenção
- Se o usuário não tiver permissão de leitura (regras do Firestore), os listeners falham silenciosamente (erro no console) e as telas ficam vazias.
- Sem `onSnapshot` há a necessidade de múltiplos `addEventListener`/`setInterval` — aqui foi evitado por design.

## Relações
- → [[Firebase-Banco-de-Dados]]
- → [[Visao-Geral]]
