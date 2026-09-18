---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Dashboard / Resumo

> KPIs e gráficos resumidos na aba [[Dashboard]] (coluna direita).

## `renderDashboard()` — orquestrador
Chama, em ordem:
1. Atualiza `#dash-vendas-total` (total geral de todas as vendas).
2. Destrói gráficos antigos.
3. `initChart()` · `initProdutosChart()` · `renderOrderBoard()` · `renderDashboardSummary()` · `renderDashboardSalesChart()` · `renderPaymentSummary()`.

## KPIs — `renderDashboardSummary()` (vendas de HOJE)
| KPI | Fórmula |
|-----|---------|
| Pedidos | nº de vendas de hoje (`vendasDeHoje()`) |
| Faturamento | soma dos `total` |
| Ticket médio | faturamento ÷ nº de pedidos |
| Novos clientes | **cadastros realizados hoje** — clientes de `db.clientes` cuja data de cadastro (`dataCadastro`/`since`, ver `dataCadastroDoCliente`) é o dia atual. Não conta clientes antigos que apenas fizeram pedido hoje. |

## Gráfico de vendas do dia — `renderDashboardSalesChart()`
- Linha, 25 pontos (0h–24h), soma o `total` pela hora da venda.

## Formas de pagamento — `renderPaymentSummary()`
- Agrupa vendas de hoje por `formaPagamento` / `pagamento` → `Pix | Cartão | Dinheiro | Outros`.
- Percentual de cada um sobre o total (barras + %).

> ✅ `finalizarVenda()`/`checkout()` agora gravam `formaPagamento` — `renderPaymentSummary` reflete a forma real. Ver [[Notas-QA-e-Bugs]].

## Gráficos de Relatórios (também criados aqui)
- `initChart()` — vendas diárias dos últimos 7 dias (linha).
- `initProdutosChart()` — top 5 produtos por unidades vendidas (barra).

## Helper — `vendasDeHoje()`
- Filtra `db.vendas` onde `dataDaVenda` é o dia corrente.
- **Exclui pedidos cancelados** (`ehVendaCancelada`, via `normalizarStatus === 'cancelados'`). Assim o resumo do dia, o gráfico de vendas do dia e as formas de pagamento do dia **não contam cancelados**; se o status voltar a não-cancelado, o pedido volta a ser considerado.
- Função auxiliar: `ehVendaCancelada(venda)`.
- Função auxiliar: `dataCadastroDoCliente(cliente)` — retorna `Date` do cadastro (suporta `dataCadastro` string ISO, `Date` e Timestamp do Firestore) ou `null`.

## Relações
- → [[Dashboard]]
- → [[Relatorios]]
- → [[Notas-QA-e-Bugs]]