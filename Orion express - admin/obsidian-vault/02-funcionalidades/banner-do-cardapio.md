---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Banner do Cardápio

> Configuração da imagem de banner exibida no **app do cliente** (cardápio), salva em `config/banner`.

## Contexto
O banner é gerenciado **exclusivamente** na tela [[Configuracoes]] (Cartão "Banner do Cardápio").
✅ Removido da tela [[Cardapio-Estoque]].

> ℹ️ Registros indevidos de banner existentes na coleção `estoque` (ex.: `banner_config`) são **filtrados** das listas de produtos (não aparecem em produto de venda/cardápio/catálogo). Detecção por `ehRegistroBanner()` (nome/id/tipo "banner").

## Fluxo funcional (Configurações)
- **Carregar** — `loadBannerConfig()` (chamada no login): preenche `#config-banner-url` com o valor salvo (se existir).
- **Salvar** — `salvarBannerConfig()`:
  1. Lê `#config-banner-url`.
  2. `config.doc('banner').set({ url, lastUpdate })`.
  3. Mostra `#config-banner-status` ("Banner salvo com sucesso!") por 3s.

## Estrutura no Firestore
- Documento fixo: `config → banner` → `{ url, lastUpdate }`.

## Funções
- `salvarBannerConfig()` · `loadBannerConfig()`

## Relações
- → [[Configuracoes]]
- → [[Firebase-Banco-de-Dados]]