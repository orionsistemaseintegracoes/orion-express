---
tags:
  - orion-express
  - tela
  - filiais
---
# Tela — Balanço de Filiais

> `#balanco-filiais` em `index.html`. Disponível apenas para administradores.

## Propósito

Consolidar os dados operacionais das filiais autorizadas em um único período, sem misturar a operação diária da filial ativa.

## Indicadores do MVP

- Faturamento: vendas não canceladas no período. Pedidos originados no app do cliente só entram após aceite do operador (`estoqueBaixado: true`).
- Despesas pagas: movimentos de caixa do tipo `DESPESA`.
- Saldo operacional: faturamento menos despesas pagas.
- Contas pendentes: valor da conta menos baixas já realizadas.
- Entradas fiscais: entradas confirmadas, incluindo quantidade de registros com número ou chave de nota.

## Separação de dados

- Documentos novos recebem `filialId`.
- Documentos antigos sem `filialId` são tratados como pertencentes à filial `matriz` durante a transição.
- Administradores enxergam o consolidado de todas as filiais.
- Funcionários operam apenas nas filiais cadastradas em `usuarios/{uid}.filiais`.
- A filial ativa é persistida no navegador em `orion_filial_ativa`.

## Relatório

A aba `Balanço de Filiais` em Relatórios usa a mesma coleta da tela e exporta pela rotina de impressão existente.

## Migração

`npm run migrate:filiais` executa somente uma simulação. Para gravar o vínculo dos documentos antigos com a Matriz, é necessário configurar Application Default Credentials e executar deliberadamente `npm run migrate:filiais -- --apply` antes de publicar as regras multi-filial. A migração é pré-requisito para funcionários, catálogo do cliente e regras que exigem `filialId`.

O arquivo `serviceaccountkey.json` não é carregado pelo script e está ignorado no `.gitignore`. Se uma chave real já tiver sido compartilhada ou versionada, ela deve ser revogada e substituída no Google Cloud.

## Limitação fiscal

O indicador fiscal do MVP resume entradas com nota. Ele não representa apuração tributária de ICMS, PIS, COFINS, ISS ou outros impostos.
