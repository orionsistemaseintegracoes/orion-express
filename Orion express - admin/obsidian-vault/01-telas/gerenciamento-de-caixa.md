---
tags:
  - orion-express
  - tela
---
# Tela — Gerenciamento de Caixa

> `#caixa` em `index.html`. Acessível pela sidebar como **"Caixa"**, logo abaixo de **"Venda Rápida"**. Navegação via `mostrarPagina('caixa')` (o botão `#btn-caixa` fica entre `#btn-venda` e `#btn-relatorios`).

## Propósito
Controle do dinheiro ao longo do expediente: **abrir** o caixa com um valor inicial, registrar **sangrias/suprimentos/estornos** (as vendas são lançadas automaticamente) e **fechar** conferindo o dinheiro contado contra o esperado.

## Estado (em memória)
- `caixasLista` — todos os caixas (mais recentes primeiro; alimentado por `caixas` listener).
- `caixaAtual` — o caixa com `status === 'ABERTO'` (ou `null`). **No máximo um aberto por vez.**
- `movimentacoesCaixa` — lançamentos de caixa (alimentado por `movimentacoes_caixa` listener; filtrados por `caixa_id === caixaAtual.id` no render).
- `movCaixaCarregado` — `true` após o primeiro snapshot de `movimentacoes_caixa` (gancho de deduplicação da conciliação).

## Sequência do caixa
Cada abertura recebe uma **sequência** (`#1`, `#2`, `#3`...) por `proximaSequenciaCaixa()` (maior sequência existente + 1, começando em 1) e é gravada no campo `sequencia` do doc. Caixas antigos sem o campo têm a sequência **derivada** pela ordem de `data_abertura` (`obterSequenciaCaixa`). Exibida no badge/info, no histórico e no relatório; o relatório permite **filtrar pela sequência** (`#caixa-rel-seq`).

## Layout (2 colunas)

### Coluna esquerda (2/3)
1. **Caixa Atual** — badge (`CAIXA ABERTO` verde / `SEM CAIXA ABERTO` cinza) + **Sequência `#N`**, aberto por, aberto em (pt-BR), valor de abertura.
2. **Lançamentos do Caixa** — formulário (Tipo: Sangria/`Suprimento`/`Estorno`, Forma: `DINHEIRO`/`PIX`/`CARTAO`/`OUTROS`, Valor, Observação) + botão **REGISTRAR LANÇAMENTO** + tabela das movimentações do caixa aberto (hora, tipo, forma, valor com sinal, observação/pedido).

### Coluna direita (1/3)
3. **Abrir Caixa** — campo valor de abertura + botão **ABRIR CAIXA** (`abrirCaixa`). Oculto quando `caixaAtual` existe.
4. **Fechar Caixa** — esperado por forma (Dinheiro/PIX/Cartão/Outros), campo **Dinheiro contado**, **Diferença** ao vivo, botão **FECHAR CAIXA** (`fecharCaixa`). Oculto quando não há caixa aberto.

### Histórico de Caixas (rodapé da página)
Tabela dos caixas FECHADOS: Seq (`#N`) \| Data \| Status \| Abertura \| Esperado \| Contado \| Diferença (vermelho se negativa, verde se positiva).

## Regras de negócio
| Cenário | Comportamento |
|---------|---------------|
| Abrir com caixa já `ABERTO` | `alert("Já existe um caixa aberto...")` — bloqueado |
| Sangria maior que o esperado em Dinheiro | `confirm` antes de prosseguir |
| Fechar sem informar dinheiro contado | `alert("Informe o valor de dinheiro contado.")` |
| Diferença | `contado(DINHEIRO) - esperado(DINHEIRO)`; abertura + VENDA/SUPRIMENTO somam, SANGRIA/ESTORNO subtraem |
| PIX/Cartão no fecho | **Informativos** — não precisam ser contados (vão direto ao banco/app) |

## Fluxo de fechamento
1. `calcularEsperadoPorForma()` agrupa as movimentações do caixa aberto por `forma_pagamento`.
2. O operador informa apenas o **Dinheiro contado** (`#caixa-contado-dinheiro`).
3. `atualizarDiferencaCaixa()` atualiza a diferença ao vivo no `#caixa-diferenca`.
4. `fecharCaixa()` grava `update` no doc `caixas`: `status: 'FECHADO'`, `data_fechamento`, `usuario_fechamento_id`, `valor_informado_fechamento` (contado), `valor_esperado_fechamento` (esperado DINHEIRO), `diferenca`.

## Venda automática (PDV + app do CLIENTE)
- **PDV admin** (`finalizarVenda`): grava a venda e registra a movimentação `VENDA` (idempotente — doc com `id = venda_id`, campo `venda_id`).
- **Painel do cliente** (`checkout`): grava em `vendas` mas **não** escreve no caixa. Para cobrir esses pedidos, o painel admin roda `conciliarVendasNoCaixa()` nos listeners de `vendas`, `caixas` e `movimentacoes_caixa`: a cada sincronização, **vendas ainda sem lançamento** são lançadas como `VENDA` no caixa aberto.
- **Janela de conciliação** (`obterInicioJanelaConciliacao`): só entram vendas criadas **após o fechamento do caixa anterior** (período "sem caixa", ex.: pedido #000025 feito com caixa fechado ao abrir o próximo caixa). Vendas históricas de períodos com caixa **não** são puxadas retroativamente (evita inundar o novo caixa com todo o histórico).
- Deduplicação: usa a lista `movimentacoesCaixa` (via `venda_id` ou id do doc) — cada venda gera **no máximo um** lançamento pelo mesmo caixa.
- Forma normalizada via `normalizarFormaPagamentoCaixa` (`PIX`→`PIX`, `Cartão`→`CARTAO`, `Dinheiro`→`DINHEIRO`, senão `OUTROS`).
- `try/catch` silencioso: **não bloqueia a venda** se o caixa estiver fechado ou der erro.

## Funções
- `renderizarCaixa()` — orquestra badge/info (com **Sequência #N**), lançamentos, fechamento e histórico.
- `calcularEsperadoPorForma()` — monta `{ DINHEIRO, PIX, CARTAO, OUTROS }` com sinais por tipo.
- `renderizarLancamentosCaixa()` / `salvarLancamentoCaixa()` — formulário + add em `movimentacoes_caixa`.
- `abrirCaixa(event)` — add em `caixas` (`status: 'ABERTO'`, `sequencia`) com validação de duplicado.
- `obterSequenciaCaixa(caixa)` — sequência (gravada ou derivada por `data_abertura`).
- `proximaSequenciaCaixa()` — maior sequência + 1 (começa em 1).
- `renderizarFechamentoCaixa()` / `atualizarDiferencaCaixa()` / `fecharCaixa()` — fecho e diferença.
- `renderizarHistoricoCaixas()` — tabela de caixas fechados (com Seq).
- `conciliarVendasNoCaixa()` — **conciliação automática** das vendas do PDV e do painel do cliente no caixa aberto (janela = após último fechamento).
- `obterInicioJanelaConciliacao()` — data do fechamento do caixa anterior (limite da conciliação).
- `registrarMovimentacaoVendaCaixa(...)` — VENDA idempotente do PDV/painel cliente.
- `normalizarFormaPagamentoCaixa(forma)` — rotula a forma da venda para o caixa.

## Exportações (`window.*`)
`abrirCaixa`, `salvarLancamentoCaixa`, `fecharCaixa`, `atualizarDiferencaCaixa`.

## Integrações
- → [[Venda-Rapida-PDV]] (a VENDA alimenta o caixa)
- → [[Firebase-Banco-de-Dados]] (coleções `caixas` e `movimentacoes_caixa`)
- → [[Funcoes-do-script]]