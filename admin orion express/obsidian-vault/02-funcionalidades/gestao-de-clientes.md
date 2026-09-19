---
tags:
  - orion-express
  - funcionalidade
---
# Funcionalidade — Gestão de Clientes

> CRUD de clientes da coleção `clientes` (tela [[Clientes]]).

## Operações

### Criar — `addCliente()` (Admin) e `saveProfile()` (Painel Cliente)
1. **Admin (`addCliente`)**:
   - Lê nome, telefone, email, endereço, número e CEP.
   - Valida: **nome e telefone obrigatórios**.
   - `clientes.add({..., codigo: proximoCodigoCliente(), bloqueado: false, since})` com `since` = `serverTimestamp()` — **`codigo`** é o ID único sequencial (maior existente + 1) e **`bloqueado`** inicia `false`.
   - `alert` de sucesso + reset do formulário.
2. **Cliente (`saveProfile`)**:
   - Salva o perfil do cliente na coleção `clientes` utilizando o UID de autenticação (`doc(currentUser.uid).set(perfil)`).
   - Campos persistidos no Supabase: `nome`, `tel`, `endereco`, `numero`, `cep`, `email`, `data_cadastro` e `since`.
   - Campos voláteis/de sessão (`pagamentoPreferido`, `dataCadastro`) são mantidos em `userProfile` em memória.
   - `supabase-compat.js` higieniza e converte `dataCadastro` em `data_cadastro` para conformidade estrita com o PostgREST.

### Excluir — `deleteCliente(id)`
- **Com movimentação** (`clienteTemMovimentacao`): recusa com `alert("...já possui pedidos registrados e não pode ser excluído...")` — apenas bloqueio.
- **Sem movimentação**: `confirm("Tem certeza que deseja remover o cliente ...?")` → `doc(id).delete()`.
- **Exclusões não reutilizam ID**: o `codigo` permanece único.

### Bloquear/liberar — `bloquearCliente(id, bloquear)` + `ehClienteBloqueado`
- Alterna campo `bloqueado` com `confirm`; cliente bloqueado **fica fora do `#selectCliente`** e `finalizarVenda()` recusa novos pedidos (defensivo).

### Render — `renderizarClientes()`
- Aplica filtros de status (todos/liberados/bloqueados — `filtrarClientesStatus`) e de busca: nome (`cli-busca-nome`, `includes` case-insensitive) e ID (`cli-busca-codigo`, número exato).
- Tabela: ID (`#001`) | Nome | Telefone | E-mail | Endereço | Status | Ações.
- Badge **LIBERADO/BLOQUEADO**; linha bloqueada `opacity-60`; excluir **desabilitado** para clientes com pedidos ou bloqueados.
- E-mail/endereço com fallback `-`.
- Endereço montado: `{endereco}, Nº {numero}`.
- Atualiza contador `#dash-clientes-total` (se existir).

### ID de movimentação
- `clienteTemMovimentacao(clienteId)` = existe venda com `venda.clienteId === clienteId` (a venda grava `clienteId`/`clienteNome`).

### IDs — helpers (espelham os de produto)
- `obterCodigoCliente(cliente)` → lê `cliente.codigo` ou deriva pela ordem de criação (numera legados a partir de 1).
- `proximoCodigoCliente()` → maior `codigo` + 1 (novos cadastros).
- `formatarCodigoCliente(codigo)` → `#001`.
- `filtrarClientesBusca()` → re-renderiza aplicando nome/ID.

### Seletor — `renderizarSelectClientes()`
- Popula `#selectCliente` (PDV) com `Nome (Telefone)` por cliente **não bloqueado** (bloqueados ficam de fora).
- Chamado no `onfocus` do select e em cada atualização de `clientes`.
- ⚠️ **Obrigatório na Venda Rápida**: `finalizarVenda()` valida `clienteId` (se vazio, `alert("Selecione o cliente para finalizar a venda.")`) — o cliente **não é mais opcional**; não há mais "Cliente Balcão" para venda sem cliente selecionado.

## Limitações
- **Sem edição de cliente** no painel (só criar/excluir).
- Se um cliente for excluído, as vendas antigas mantêm `clienteNome` gravado.

## Relações
- → [[Clientes]]
- → [[PDV-Carrinho]]
- → [[Firebase-Banco-de-Dados]]
