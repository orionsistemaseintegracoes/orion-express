# AGENTS.md — Regras de trabalho — Orion Express Admin

## REGRA DE OURO

Toda vez que você for fazer **qualquer alteração ou implementação** neste projeto:

1. **Consulte o vault do Obsidian** em `obsidian-vault/` (comece por `Home.md` e navegue pelas telas/funcionalidades afetadas).
2. **Certifique-se de que o sistema continuará funcionando** sem quebrar:
   - nenhuma **função** (scripts/CRUDs/PDV/dashboard/listeners do Firebase/impressão), ou
   - o **design/sistema visual** (tema escuro "Orion", componentes, responsividade — `style.css`).

Em caso de dúvida sobre impacto, leia as notas do vault e a documentação do sistema antes de editar.

## Documentação canônica do sistema
- Estrutura: `obsidian-vault/00-Arquitetura/`
- Telas: `obsidian-vault/01-Telas/`
- Funcionalidades: `obsidian-vault/02-Funcionalidades/`
- Referência (funções, fluxo de venda, bugs conhecidos): `obsidian-vault/03-Referencia/`
- Problemas conhecidos: `obsidian-vault/03-Referencia/Notas-QA-e-Bugs.md`

## Arquivos do projeto
- `index.html` — única tela (login + páginas admin + modais)
- `style.css` — sistema visual
- `script.js` — toda a lógica da aplicação
- `supabase-compat.js` — camada de compatibilidade Firebase → Supabase
- `orion-logo.png`, `design-qa.md`

## Regras técnicas
- Não adicionar comentários ao código salvo quando solicitado.
- Preservar o sistema visual "Orion" e evitar regressões de estilo/design.