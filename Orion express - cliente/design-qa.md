# Design QA — Painel do Cliente

Status final: aprovado.

## Referência visual

- Painel administrativo Orion Express em tema azul-marinho, cartões escuros, bordas discretas e destaque azul.
- Fonte, contraste, raios, espaçamento e navegação foram harmonizados com a referência.

## Desktop — 1440 × 900

- [x] Menu lateral fixo, com identidade Orion e estados ativos.
- [x] Cabeçalho alinhado ao conteúdo e sem sobreposição.
- [x] Grade responsiva com quatro colunas em telas largas e três em desktops menores.
- [x] Banner, catálogo e aviso de visitante respeitam a largura útil.
- [x] Carrinho abre como painel lateral.
- [x] Sem rolagem horizontal.

## Mobile — 393 × 852

- [x] Cabeçalho compacto e legível.
- [x] Banner sem corte de conteúdo.
- [x] Grade de duas colunas sem overflow horizontal.
- [x] Navegação inferior fixa com área segura.
- [x] Botão do carrinho destacado e acessível.
- [x] Cartões mantêm preço, estoque e ação visíveis.

## Fluxos verificados

- [x] Catálogo carregado com dados reais do Firebase.
- [x] Estado de visitante e bloqueio de pedidos sem login preservados.
- [x] Alternância de tema preservada com a nova identidade azul.
- [x] Registro de configuração do banner removido da grade de produtos.
- [x] Cadastro manual, carrinho, pedidos e detalhes continuam conectados às funções existentes.
