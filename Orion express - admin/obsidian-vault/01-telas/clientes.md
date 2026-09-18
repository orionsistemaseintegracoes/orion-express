---
tags:
  - orion-express
  - tela
---
# Tela — Clientes

> `#clientes` em `index.html`.

## Propósito
Cadastro e consulta de clientes (base usada também pela [[Venda-Rapida-PDV]] no seletor de cliente).

## Estrutura (2 colunas)

### Coluna esquerda — Adicionar Novo Cliente
- Campos:
  - Nome Completo **\*** (`#cliente-nome`)
  - Telefone/WhatsApp **\*** (`#cliente-tel`)
  - E-mail (`#cliente-email`)
  - Endereço (Rua/Av) (`#cliente-endereco`) + Nº (`#cliente-numero`)
  - CEP (`#cliente-cep`)
- Botão **SALVAR CLIENTE** → `addCliente()`.

### Coluna direita — Clientes Cadastrados
- **Cabeçalho + Filtros**: título "Filtros" com busca por nome (`#cli-busca-nome`, `oninput="filtrarClientesBusca()"`), por ID (`#cli-busca-codigo`, número exato) e filtro de **Status** Todos/Liberados/Bloqueados (`filtrarClientesStatus`/`clientesFiltroStatus`).
- Tabela: **ID** (`#001` por `formatarCodigoCliente(obterCodigoCliente(c))`) | Nome | Telefone | E-mail | Endereço | **Status** | Ações (7 colunas)
- **Ordenação**: cadastros exibidos na **sequência crescente do ID** (`obterCodigoCliente`).
- **Paginação**: **10 clientes por página** (`#clientes-pagination` — Anterior/Próxima + "Página X de Y · N registro(s)"; `mudarPaginaClientes`/`renderizarClientes` + `renderizarPaginacaoGenerica('clientes',...)`). Trocar filtro de busca/status reseta para a **página 1**.
- **Status**: badge LIBERADO/BLOQUEADO; linha bloqueada com `opacity-60`.
- **Ações**: 🔒 BLOQUEAR/LIBERAR (`bloquearCliente`, com `confirm`); 🗑️ Excluir (`deleteCliente`) **desabilitado** para clientes com pedidos ou bloqueados.
- Estado vazio: "Nenhum cliente cadastrado."

## Regras de negócio
| Cenário | Comportamento |
|---------|---------------|
| Nome ou Telefone vazios | `alert("Os campos Nome e Telefone são obrigatórios.")` |
| Cadastro com sucesso | `alert` + reset do formulário (`bloqueado: false`) |
| ID do novo cliente | `proximoCodigoCliente()` = maior código existente + 1 (novo campo `codigo`) |
| Excluir cliente **sem** pedidos | `confirm("Tem certeza que deseja remover o cliente ...?")` → `doc(id).delete()` |
| Excluir cliente **com** pedidos (`clienteTemMovimentacao`) | Recusa: `alert("...já possui pedidos registrados e não pode ser excluído...")` — só bloqueio |
| Bloquear/liberar | `bloquearCliente(id, bloquear)` com `confirm`; bloqueado não gera novos pedidos |
| Busca por nome | Case-insensitive, `includes` |
| Busca por ID | Número exato (≡ código `#00N`) |

## Observações
- **Não há edição de cliente** (apenas criar, excluir e bloquear/liberar).
- **Movimentação do cliente**: uma venda armazena `clienteId` (e `clienteNome`); `clienteTemMovimentacao(id)` = existe venda com `venda.clienteId === id`.
- Cliente **bloqueado** fica fora do `#selectCliente` do PDV (`renderizarSelectClientes` filtra) e `finalizarVenda()` recusa (defensivo).
- O **ID `codigo`** é um controle único sequencial (inicia em 1 para os cadastros antigos, derivado pela ordem de criação). Exclusões **não** reutilizam ID; é distinto do `id` do documento Firestore.
- O e-mail/endereço são exibidos com fallback `-`.

## Funções
- `addCliente()`, `deleteCliente(id)`, `bloquearCliente(id, bloquear)`, `renderizarClientes()`, `filtrarClientesBusca()`, `filtrarClientesStatus(filtro)`, `mudarPaginaClientes(delta)`, `obterCodigoCliente()`, `proximoCodigoCliente()`, `formatarCodigoCliente()`, `ehClienteBloqueado()`, `clienteTemMovimentacao()`

## Integrações
- → [[Gestao-de-Clientes]]
- → [[PDV-Carrinho]]
