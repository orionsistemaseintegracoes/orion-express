/* ================= CONFIGURAÇÃO DO FIREBASE ================= */
// Projeto "orion-express-pdv" (homologação)
// (Authentication → Adicionar domínio Netlify; Firestore → regras em regras_firestore.rules)
const firebaseConfig = {
  apiKey: "AIzaSyDP_mtmsPpISG6u72_0tbAHSEgq5MH5KbU",
  authDomain: "orion-express-pdv.firebaseapp.com",
  projectId: "orion-express-pdv",
  storageBucket: "orion-express-pdv.firebasestorage.app",
  messagingSenderId: "449346341852",
  appId: "1:449346341852:web:996c5c931636d5baec1d19",
  measurementId: "G-8SXSDJNQYC"
};

// Inicializa o Firebase (Compat)
firebase.initializeApp(firebaseConfig);
const dbFirestore = firebase.firestore();
// Inicializa o Firebase Auth
const auth = firebase.auth();

/* ================= TOAST NOTIFICATIONS ================= */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ================= MODAL DE CONFIRMAÇÃO ================= */
let _confirmacaoCallback = null;

function abrirModalConfirmacao({ titulo, mensagem, detalhe, textoBtn, corBtn, icone, iconeCor, onConfirm } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmacao');
    const elTitulo = document.getElementById('confirmacao-titulo');
    const elMensagem = document.getElementById('confirmacao-mensagem');
    const elDetalhe = document.getElementById('confirmacao-detalhe');
    const elBtn = document.getElementById('confirmacao-btn-acao');
    const elIcone = document.getElementById('confirmacao-icone');
    if (!modal || !elTitulo || !elMensagem || !elBtn || !elIcone) {
      resolve(false);
      return;
    }
    elTitulo.textContent = titulo || 'Confirmar ação';
    elMensagem.textContent = mensagem || '';
    elDetalhe.textContent = detalhe || '';
    elDetalhe.classList.toggle('hidden', !detalhe);
    elBtn.textContent = textoBtn || 'Confirmar';
    elBtn.className = `px-6 py-2.5 rounded-lg font-bold transition-colors shadow-lg ${corBtn || 'bg-red-600 hover:bg-red-500 text-white'}`;
    elIcone.className = `mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${iconeCor || 'bg-amber-500/20 text-amber-400'}`;
    elIcone.innerHTML = `<i class="fa ${icone || 'fa-question'} text-2xl"></i>`;
    _confirmacaoCallback = () => {
      resolve(true);
      if (typeof onConfirm === 'function') onConfirm();
    };
    elBtn.onclick = () => {
      const cb = _confirmacaoCallback;
      fecharModalConfirmacao();
      if (cb) cb();
    };
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });
}

function fecharModalConfirmacao() {
  const modal = document.getElementById('modalConfirmacao');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  _confirmacaoCallback = null;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModalConfirmacao(); });

/* ================= BANCO DE DADOS LOCAL (CACHE EM TEMPO REAL) ================= */
// Este objeto 'db' é alimentado **somente** pelos listeners do Firebase.
let db = {
  clientes: [],
  estoque: [],
  vendas: [],
  usuarios: [],
  logs: []
};

// Estado do Carrinho (Volátil)
let carrinho = [];

// Filtro de status na tabela do Cardápio: 'todos' | 'liberados' | 'bloqueados'
let estoqueFiltroStatus = 'todos';

// Filtro de status na tabela de Clientes: 'todos' | 'liberados' | 'bloqueados'
let clientesFiltroStatus = 'todos';
let clientesPage = 1;

// Formas de pagamento configuradas (compartilhadas com o app do cliente via config/pagamentos)
const METODOS_PAGAMENTO_PADRAO = ['PIX', 'Cartão', 'Dinheiro', 'Outros'];
let metodosPagamento = [];

// Classificação de produtos (controle interno, cadastrada na tela de Configurações):
// marcas, grupos e subgrupos que podem ser vinculados aos produtos do Cardápio.
let marcasCadastradas = [];
let gruposCadastrados = [];
let subgruposCadastrados = [];

// Estado do Caixa (tela Gerenciamento de Caixa)
// caixaAtual: caixa com status 'ABERTO' (no máximo um por vez)
let caixasLista = [];
let caixaAtual = null;
let movimentacoesCaixa = []; // todas as movimentações (filtradas pelo caixa aberto no render)
let movCaixaCarregado = false; // true após o primeiro snapshot de movimentacoes_caixa

// Estado da tela Entradas de Mercadoria
// fornecedoresLista: fornecedores cadastrados (coleção 'fornecedores')
// entradasLista: entradas (coleção 'entradas'); movimentacoesEstoque: auditoria (coleção 'movimentacoes_estoque')
let fornecedoresLista = [];
let entradasLista = [];
let movimentacoesEstoque = [];
let entradaEditandoId = null; // id da entrada em edição no modal (null = nova)
let entradaItens = []; // itens temporários do formulário de entrada
let entradaModoConsulta = false; // true = modal aberto apenas p/ consulta (readonly)
let entradasPage = 1;
let entradasFiltroStatus = '';
let entradasFiltroFornecedor = '';
let fornecedoresPage = 1;
let fornecedoresFiltroStatus = 'todos';

// Estado da tela Contas a Pagar
// contasPagarLista: contas (coleção 'contas_pagar'); a baixa gera débito (DESPESA) no caixa.
let contasPagarLista = [];
let contasPageEmAberto = 1;
let contasPagePagas = 1;
let contasFiltroFornecedor = '';
let contasFiltroBusca = '';
let contasAba = 'emAberto';
let contaPagarEditandoId = null; // id da conta em edição no modal (null = nova)
let contaPagarEntradaId = null; // entrada vinculada à conta no modal (null = avulsa)
let contaPagarBaixaId = null; // id da conta em processo de baixa

// Estado da tela Comanda por Mesa
let mesasLista = [];
let mesaAtualId = null;
let comandaItens = [];

/* ================= SINCRONIZAÇÃO EM TEMPO REAL ================= */
// O uso de onSnapshot garante que 'db' esteja sempre sincronizado.
function iniciarSincronizacao() {
  // Mesas: Atualiza lista e a grade
  dbFirestore.collection('mesas').orderBy('numero', 'asc').onSnapshot((snapshot) => {
    mesasLista = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    const qtdInput = document.getElementById('mesas-qtd');
    if (qtdInput && mesasLista.length > 0) {
      qtdInput.value = mesasLista.length;
    }
    if (typeof renderizarMesas === 'function') renderizarMesas();
  });

  // Clientes: Atualiza lista e o SELECT de venda
  dbFirestore.collection('clientes').onSnapshot((snapshot) => {
    db.clientes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderizarClientes();
    renderizarSelectClientes();
    renderizarCadastroClientes(); // Atualiza tela Cadastros → Clientes
    renderDashboard(); // Atualiza dashboard (formas de pagamento / novos clientes)
  });

  // Estoque: Atualiza lista e o menu de venda
  dbFirestore.collection('estoque').onSnapshot((snapshot) => {
    db.estoque = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderizarEstoque();
    renderizarProdutosVenda();
    renderizarCadastroEstoque(); // Atualiza tela Cadastros → Produtos
    renderDashboard(); // Atualiza dashboard com produtos
  });

  // Vendas: Atualiza lista de pedidos no PDV e o Dashboard
  dbFirestore.collection('vendas').orderBy('dataIso', 'desc').onSnapshot((snapshot) => {
    db.vendas = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderHistoricoVendas();
    renderDashboard(); // Atualiza dashboard com vendas
    conciliarVendasNoCaixa(); // Lança no caixa aberto as vendas ainda não conciliadas (PDV e cliente)
  });

  // Caixas: mantém o caixa aberto (no máximo um) e o histórico de fechamentos
  dbFirestore.collection('caixas').orderBy('data_abertura', 'desc').onSnapshot((snapshot) => {
    caixasLista = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    caixaAtual = caixasLista.find(c => c.status === 'ABERTO') || null;
    renderizarCaixa(); // Atualiza tela de Caixa
    conciliarVendasNoCaixa(); // Concilia vendas pendentes quando um caixa é aberto
  });

  // Movimentações de caixa (VENDA, SANGRIA, SUPRIMENTO, ESTORNO)
  dbFirestore.collection('movimentacoes_caixa').orderBy('data_hora', 'desc').onSnapshot((snapshot) => {
    movimentacoesCaixa = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    movCaixaCarregado = true;
    renderizarCaixa(); // Atualiza tela de Caixa
    conciliarVendasNoCaixa(); // Reutiliza a lista completa p/ deduplicar por venda_id
  });

  // Formas de pagamento configuradas (config/pagamentos)
  dbFirestore.collection('config').doc('pagamentos').onSnapshot((doc) => {
    const data = doc.data();
    metodosPagamento = (data && Array.isArray(data.metodos) && data.metodos.length)
      ? data.metodos
      : METODOS_PAGAMENTO_PADRAO;
    renderizarSelectPagamento();
    renderizarListaPagamentos();
  });

  // Classificação de produtos (config/classificacoes) — controle interno.
  dbFirestore.collection('config').doc('classificacoes').onSnapshot((doc) => {
    const data = doc.data() || {};
    marcasCadastradas = Array.isArray(data.marcas) ? data.marcas : [];
    gruposCadastrados = Array.isArray(data.grupos) ? data.grupos : [];
    subgruposCadastrados = Array.isArray(data.subgrupos) ? data.subgrupos : [];
    renderizarListaClassificacoes();
    preencherSelectsClassificacaoProduto();
    carregarSelectsClassificacaoRelatorio();
  });

  // Fornecedores (tela Entradas): mantém lista, tabela e selects sincronizados.
  dbFirestore.collection('fornecedores').orderBy('nome').onSnapshot((snapshot) => {
    fornecedoresLista = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderizarFornecedores();
    renderizarCadastroFornecedores(); // Atualiza tela Cadastros → Fornecedores
    preencherSelectFornecedores();
    preencherFiltroFornecedoresEntradas();
  });

  // Entradas de mercadoria (tela Entradas): cabeçalho + itens + status.
  // Ordena pela data de criação (dataIso) — mais recentes primeiro.
  dbFirestore.collection('entradas').orderBy('dataIso', 'desc').onSnapshot((snapshot) => {
    entradasLista = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderizarEntradas();
  });

  // Contas a pagar (tela Contas a Pagar): contas e baixas.
  dbFirestore.collection('contas_pagar').orderBy('dataIso', 'desc').onSnapshot((snapshot) => {
    contasPagarLista = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderizarContasPagar();
    renderizarEntradas(); // Atualiza o estado do botão "gerar conta" na lista de entradas
  });

  // Movimentações de estoque (auditoria): mantém em memória; sem tela própria nesta fase.
  dbFirestore.collection('movimentacoes_estoque').orderBy('dataIso', 'desc').onSnapshot((snapshot) => {
    movimentacoesEstoque = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  });

  // Perfis / usuários de acesso (contas do sistema)
  dbFirestore.collection('usuarios').onSnapshot((snapshot) => {
    db.usuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Auto-kick: se o operador logado for bloqueado, sai do painel em tempo real.
    const euLogado = auth.currentUser?.uid;
    if (euLogado) {
      const meuDoc = db.usuarios.find(u => u.id === euLogado);
      if (meuDoc && meuDoc.bloqueado === true && !ehAdministrador()) {
        auth.signOut();
        return;
      }
    }
    // Atualiza avatar/nome do header quando o perfil do logado muda (ex.: admin editou a foto).
    if (euLogado) renderAvatarAtual(auth.currentUser);
    renderListaFuncionarios();
    aplicarRestricoesNav();
  });

  // Log de operações (auditoria): mantém db.logs em memória para a tela de Configurações.
  // Retenção de 30 dias: consulta limitada no Firestore (não baixa o histórico inteiro),
  // evitando lentidão conforme a coleção cresce. O TTL do Firestore apaga os antigos.
  const logRetencaoDias = 30;
  const logLimiteData = new Date(Date.now() - logRetencaoDias * 24 * 60 * 60 * 1000);
  dbFirestore.collection('logs')
    .where('timestamp', '>=', logLimiteData)
    .orderBy('timestamp', 'desc')
    .onSnapshot((snapshot) => {
      db.logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (document.getElementById('config-aba-log') && !document.getElementById('config-aba-log').classList.contains('hidden')) {
        renderizarLogOperacoes();
      }
    });
}

/* ================= NÚMERO DE PEDIDO ================= */
// Número sequencial de pedido (ex.: "001"). O campo `id` (Firestore) permanece como ID único no banco.
// Contador atômico compartilhado com o app do cliente (config/contador) para sequência única.
// Formato: 3 dígitos mínimos (#001, #002, ...), mesma lógica dos IDs de produto/cliente.

// Próximo número de pedido via contador atômico no Firestore
async function proximoNumeroPedido() {
  const ref = dbFirestore.collection('config').doc('contador');
  const resultado = await dbFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? Number(snap.data().numero || 0) : 0;
    const proximo = atual + 1;
    tx.set(ref, { numero: proximo }, { merge: true });
    return proximo;
  });
  return String(resultado).padStart(3, '0');
}

// Exibe o número do pedido (usa numeroPedido; fallback defensivo curto se ainda não migrado).
function numeroExibicao(venda) {
  if (!venda) return '000';
  if (venda.numeroPedido) return venda.numeroPedido;
  return String(venda.id || '').slice(0, 3);
}

// Migração: garante a sequência para pedidos existentes.
// Sementa o contador no maior numeroPedido atual, reformata os existentes para ###
// (ex.: "000027" → "027", mesma lógica de #001/#002) e numera os sem número (mais antigos primeiro).
async function migrarNumeroPedido() {
  try {
    const snapshot = await dbFirestore.collection('vendas').orderBy('dataIso', 'asc').get();

    // 1. Maior numeroPedido atual + lista de docs com formato antigo (6 dígitos) para reformatar
    let max = 0;
    const reformatar = [];
    snapshot.docs.forEach(doc => {
      const n = parseInt(doc.data().numeroPedido, 10);
      if (Number.isNaN(n)) return;
      if (n > max) max = n;
      const novo = String(n).padStart(3, '0');
      if (doc.data().numeroPedido !== novo) reformatar.push({ id: doc.id, novo });
    });

    // 2. Garante contador >= max (empotente)
    const ref = dbFirestore.collection('config').doc('contador');
    const atualSnap = await ref.get();
    const atual = atualSnap.exists ? Number(atualSnap.data().numero || 0) : 0;
    if (max > atual) {
      await ref.set({ numero: max }, { merge: true });
    }

    // 3. Reescreve os pedidos existentes no formato ### (ex.: 000027 → 027)
    for (const item of reformatar) {
      await dbFirestore.collection('vendas').doc(item.id).update({ numeroPedido: item.novo });
    }
    if (reformatar.length) {
      console.log(`[Migração] ${reformatar.length} pedido(s) reformatados para ###.`);
    }

    // 4. Numera os pedidos sem número, continuando a sequência do contador
    const pendentes = snapshot.docs.filter(doc => {
      const n = doc.data().numeroPedido;
      return n === undefined || n === null || n === '';
    });
    for (const doc of pendentes) {
      const numero = await proximoNumeroPedido();
      await dbFirestore.collection('vendas').doc(doc.id).update({ numeroPedido: numero });
    }
    if (pendentes.length) {
      console.log(`[Migração] ${pendentes.length} pedido(s) receberam numeroPedido.`);
    }
  } catch (error) {
    console.error("Erro ao migrar numeroPedido:", error);
  }
}

/* ================= SISTEMA DE AUTENTICAÇÃO FIREBASE (NOVO) ================= */

// Perfis em criação (cadastro de novo funcionário) — aguardados pelo gate de acesso.
// Guarda EMAILS (não UIDs) para vencer a corrida: o SDK dispara onAuthStateChanged
// com o novo usuário antes do set() no Firestore.
const perfisEmCriacao = new Set();
let usuarioAtualUidAutenticado = null;

// Função que gerencia o estado da sessão (Login/Logout) e a visibilidade das telas.
// SEGURANÇA: só permite entrar no painel quem tem registro em `usuarios/{uid}`
// (operador: administrador ou funcionário). Contas de clientes ficam bloqueadas.
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // Verifica se a conta é OPERADOR ativo (existe em "usuarios" e NÃO está bloqueada)
    let permitido = false;
    let bloqueado = false;
    try {
      const doc = await dbFirestore.collection('usuarios').doc(user.uid).get();
      permitido = doc.exists;
      bloqueado = !!(doc.exists && doc.data().bloqueado === true);

      // AUTO-ADMIN: se a coleção 'usuarios' está vazia, o primeiro usuário
      // a logar é automaticamente criado como admin (setup inicial do banco).
      if (!permitido) {
        const snapshot = await dbFirestore.collection('usuarios').limit(1).get();
        if (snapshot.empty) {
          await dbFirestore.collection('usuarios').doc(user.uid).set({
            nome: user.displayName || user.email.split('@')[0],
            email: user.email,
            role: 'admin',
            bloqueado: false,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
          permitido = true;
          console.log("Primeiro admin criado automaticamente:", user.email);
        }
      }

      if (!permitido && perfisEmCriacao.has(user.email)) {
        // Perfil recém-criado: aguarda a gravação (máx ~5s) antes de liberar
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 250));
          const novo = await dbFirestore.collection('usuarios').doc(user.uid).get();
          if (novo.exists) { permitido = true; break; }
        }
      }
    } catch (error) {
      console.error("Erro ao verificar operador:", error);
    }

    if (!permitido) {
      // Não é operador: encerra a sessão e bloqueia o acesso ao painel
      console.log("Acesso negado ao painel:", user.email);
      await auth.signOut();
      document.getElementById('login-page').classList.remove('hidden');
      document.getElementById('main-app').classList.add('hidden');
      mostrarAvisoLogin("Acesso negado: esta conta não é de um operador do painel.");
      return;
    }

    if (bloqueado) {
      // Operador bloqueado pelo administrador: encerra a sessão e bloqueia o acesso
      console.log("Usuário bloqueado:", user.email);
      await auth.signOut();
      document.getElementById('login-page').classList.remove('hidden');
      document.getElementById('main-app').classList.add('hidden');
      mostrarAvisoLogin("Acesso negado: este operador está bloqueado pelo administrador.");
      return;
    }

    // Operador autenticado
    console.log("Operador logado:", user.email);
    ocultarAvisoLogin();

    // Se o operador já estiver autenticado e com a app aberta na tela, não re-inicializa tudo nem reseta a tela
    if (usuarioAtualUidAutenticado === user.uid && !document.getElementById('main-app').classList.contains('hidden')) {
      atualizarAvatarAdmin(user);
      return;
    }

    usuarioAtualUidAutenticado = user.uid;
    registrarLog('login', 'perfil', user.uid, `Operador fez login no painel (${user.email || user.uid})`);
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    iniciarSincronizacao(); // Inicia a sincronização com o banco de dados
    migrarNumeroPedido(); // Garante a numeração sequencial dos pedidos existentes
    loadBannerConfig(); // Carrega a configuração do banner
    loadPersonalizacao(); // Carrega personalização do app (cores, logo)
    loadExibicaoCardapio(); // Carrega configuração de exibição do cardápio
    loadHorarioFuncionamento(); // Carrega horário de funcionamento da loja
    atualizarAvatarAdmin(user);

    // Restaura a página em que o usuário estava antes, ou abre 'dashboard' como padrão
    let paginaParaAbrir = 'dashboard';
    try {
      const salva = sessionStorage.getItem('orion_pagina_ativa');
      if (salva && document.getElementById(salva)) {
        paginaParaAbrir = salva;
      }
    } catch (e) {}

    mostrarPagina(paginaParaAbrir);
    // Aplica restrições de nav após sync carregar (timeout garante que db.usuarios já veio)
    setTimeout(() => aplicarRestricoesNav(), 1500);
  } else {
    // Usuário deslogado
    usuarioAtualUidAutenticado = null;
    console.log("Usuário deslogado");
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    loadPersonalizacao(); // Aplica cores salvas na tela de login (doc público)
  }
});

function mostrarAvisoLogin(msg) {
  const el = document.getElementById('login-aviso');
  ocultarAvisoLogin();
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function ocultarAvisoLogin() {
  const el = document.getElementById('login-aviso');
  if (el) el.classList.add('hidden');
}


// 1. Login com Email e Senha
async function login() {
  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;

  if (!email || !senha) {
    return showToast("Por favor, preencha E-mail e Senha para continuar.", "error");
  }

  ocultarAvisoLogin();
  try {
    await auth.signInWithEmailAndPassword(email, senha);
    // onAuthStateChanged cuidará da navegação para a tela principal
  } catch (error) {
    console.error("Erro no login:", error);
    showToast("Erro ao fazer login: " + error.message.replace('Firebase: Error ', ''), "error");
  }
}

// Retorna a app temporária usada para criar funcionários sem alterar a sessão atual.
function obterAppCadastroTemp() {
  try {
    return firebase.app('cadastroTemp'); // já existe
  } catch (e) {
    return firebase.initializeApp(firebaseConfig, 'cadastroTemp'); // cria isolada
  }
}

// 2. Cadastro de Novo Funcionário (somente ADMINISTRADOR, pela tela de Configurações)
async function cadastrarNovoFuncionario() {
  if (!ehAdministrador()) {
    return showToast("Somente o administrador pode cadastrar novos funcionários.", "error");
  }
  const email = document.getElementById('cadastro-email').value;
  const senha = document.getElementById('cadastro-senha').value;
  const nome = document.getElementById('cadastro-nome').value;

  if (!email || !senha || !nome) {
    return showToast("Preencha todos os campos para cadastrar o novo funcionário.", "error");
  }
  if (senha.length < 6) {
    return showToast("A senha deve ter no mínimo 6 caracteres.", "error");
  }

  perfisEmCriacao.add(email); // continua informativo (o gate do Auth principal não é acionado)

  let novoUid = null;
  let tempApp = null;
  let tempAuth = null;
  try {
    // Cria a conta numa app do Firebase ISOLADA. Assim o createUserWithEmailAndPassword
    // não troca a sessão do administrador que continua logado no painel.
    tempApp = obterAppCadastroTemp();
    tempAuth = firebase.auth(tempApp);

    // Se o e-mail já tem conta (ex.: o usuário já se cadastrou como cliente no projeto),
    // ADOTA a conta existente (promove a funcionário) em vez de tentar criar outra.
    let metodosExistentes = [];
    try {
      metodosExistentes = await tempAuth.fetchSignInMethodsForEmail(email);
    } catch (e) {
      // Se a consulta falhar, seguimos tentando criar e tratamos o erro abaixo.
      console.warn("Não foi possível consultar métodos de login existentes:", e);
    }
    let jaExisteConta = Array.isArray(metodosExistentes) && metodosExistentes.length > 0;

    let operador = null;
    if (jaExisteConta) {
      // Requer a senha ATUAL da conta existente para comprovar o acesso a ela.
      const cred = await tempAuth.signInWithEmailAndPassword(email, senha);
      operador = cred.user;
      await operador.updateProfile({ displayName: nome || operador.displayName || '' });
    } else {
      try {
        const userCredential = await tempAuth.createUserWithEmailAndPassword(email, senha);
        operador = userCredential.user;
        // Adiciona o nome de exibição (opcional, mas bom para identificação)
        await operador.updateProfile({ displayName: nome });
      } catch (e) {
        if (e && e.code === 'auth/email-already-in-use') {
          // Conta detectada somente na hora de criar → adota em cima dela.
          jaExisteConta = true;
          const cred = await tempAuth.signInWithEmailAndPassword(email, senha);
          operador = cred.user;
          await operador.updateProfile({ displayName: nome || operador.displayName || '' });
        } else {
          throw e;
        }
      }
    }
    novoUid = operador.uid;

    // Cria o registro de OPERADOR em 'usuarios/{uid}' usando a sessão do ADMIN
    // (regra do Firestore: admin pode gravar em qualquer doc de usuarios).
    await dbFirestore.collection('usuarios').doc(novoUid).set({
      email,
      nome,
      photoURL: '',
      role: 'funcionario',
      bloqueado: false,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    fecharModalCadastro();
    registrarLog('incluir', 'usuario', novoUid, `Funcionário "${nome}" cadastrado (${email})`, { email, nome, role: 'funcionario' });
    showToast(jaExisteConta
      ? `Conta existente (${email}) promovida a funcionário "${nome}".`
      : `Funcionário ${nome} cadastrado com sucesso!`, "success");

  } catch (error) {
    console.error("Erro no cadastro:", error);
    if (error && error.code === 'auth/wrong-password') {
      showToast('Este e-mail já possui uma conta (ex.: de cliente), mas a senha informada não confere com a senha atual dela. Informe a senha correta da conta existente para promovê-la a funcionário.', "error");
    } else if (error && error.code === 'auth/invalid-credential') {
      showToast('Este e-mail já possui uma conta (ex.: de cliente) ou a senha está incorreta. Informe a senha atual da conta existente para promovê-la a funcionário.', "info");
    } else {
      showToast("Erro ao cadastrar: " + error.message.replace("Firebase: Error ", ""), "error");
    }
  } finally {
    perfisEmCriacao.delete(email);
    // Remove a app temporária, mantendo intacta a sessão do administrador.
    if (tempAuth) { try { await tempAuth.signOut(); } catch (e) { console.error(e); } }
    if (tempApp) { tempApp.delete().catch(() => { }); }
  }
}

// 4. Logout (usando Firebase)
function logout() {
  auth.signOut();
  // onAuthStateChanged cuidará da navegação de volta para a tela de login
}

/* ================= GESTÃO DE MODAL ================= */
function abrirModalCadastro() {
  if (!ehAdministrador()) {
    return showToast("Somente o administrador pode cadastrar novos funcionários.", "error");
  }
  document.getElementById('cadastroModal').classList.remove('hidden');
  document.getElementById('cadastroModal').classList.add('flex');
}

function fecharModalCadastro() {
  document.getElementById('cadastroModal').classList.add('hidden');
  document.getElementById('cadastroModal').classList.remove('flex');
  document.getElementById('cadastro-email').value = '';
  document.getElementById('cadastro-senha').value = '';
  document.getElementById('cadastro-nome').value = '';
}


/* ================= GESTÃO DE PÁGINAS ================= */
let paginaAtualAtiva = 'dashboard';

function mostrarPagina(id) {
  if (!podeAcessarModulo(id)) {
    showToast('Você não tem permissão para acessar este módulo.', "error");
    return;
  }
  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetPage = document.getElementById(id);
  if (targetPage) {
    targetPage.classList.remove('hidden');
    const targetButton = document.getElementById(`btn-${id}`);
    if (targetButton) {
      targetButton.classList.add('active');
    }
    paginaAtualAtiva = id;
    try { sessionStorage.setItem('orion_pagina_ativa', id); } catch (e) {}

    // Lógica para inicializar gráficos/IA se necessário
    if (id === 'dashboard') renderDashboard(); // Chame renderDashboard para garantir a re-renderização
    if (id === 'config') {
      carregarPerfilNoConfig();
      renderizarControleAcesso();
      const qtdInput = document.getElementById('mesas-qtd');
      if (qtdInput && mesasLista.length > 0) {
        qtdInput.value = mesasLista.length;
      }
    }
    if (id === 'cadastros') { renderizarCadastroEstoque(); renderizarCadastroClientes(); renderizarCadastroFornecedores(); } // Atualiza tela Cadastros
    if (id === 'entradas') { renderizarEntradas(); preencherSelectFornecedores(); } // Atualiza tela Entradas
    if (id === 'contas') renderizarContasPagar(); // Atualiza tela Contas a Pagar

  }
  aplicarRestricoesNav();
}

window.addEventListener('load', () => {
  if (!auth.currentUser) {
    document.getElementById('login-page').classList.remove('hidden');
  }
});

/* ================= UTILITÁRIOS ================= */

// Função para formatar moeda
function formatarMoeda(valor) {
  return parseFloat(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/* ================= LOG DE OPERAÇÕES (AUDITORIA/CONTROLADORIA) ================= */
// Registra toda mutação relevante no banco: quem fez, o quê, quando.
// A coleção 'logs' é somente-leitura/apêndice (regras no firestore.rules).
// Se o registro falhar, NÃO bloqueia a operação principal (erro só no console).
async function registrarLog(acao, entidade, registroId, descricao, detalhes) {
  try {
    const user = auth.currentUser;
    // Retenção de 30 dias: campo expiresAt permite ao TTL do Firestore apagar
    // automaticamente os registros antigos (política de limpeza do banco).
    const logRetencaoDias = 30;
    const expiresAt = new Date(Date.now() + logRetencaoDias * 24 * 60 * 60 * 1000);
    await dbFirestore.collection('logs').add({
      acao,
      entidade,
      registroId: registroId || null,
      descricao: descricao || '',
      detalhes: detalhes || null,
      usuarioId: user ? user.uid : null,
      usuarioNome: user ? (user.displayName || user.email || 'Desconhecido') : 'Desconhecido',
      usuarioEmail: user ? (user.email || '') : '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt
    });
  } catch (error) {
    console.error("Erro ao registrar log de operação:", error);
  }
}

// Retorna o usuário logado atual (nome + email) para rótulos.
function usuarioLogadoLabel() {
  const user = auth.currentUser;
  return user ? (user.displayName || user.email || 'Desconhecido') : 'Desconhecido';
}

/* ================= CRUD ESTOQUE (COM addProduto) ================= */

// Calcula o dígito verificador do EAN-13 (décimo terceiro dígito) a partir dos 12 primeiros dígitos.
function calcularDigitoVerificadorEAN13(dozeDigitos) {
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    const digito = parseInt(dozeDigitos[i], 10);
    soma += (i % 2 === 0) ? digito : digito * 3;
  }
  return (10 - (soma % 10)) % 10;
}

// Sanitiza o campo de código de barras: só dígitos, máx. 13; completa o dígito verificador ao atingir 12.
function tratarInputCodigoBarras(input) {
  let valor = (input.value || '').replace(/\D/g, '').slice(0, 13);
  if (valor.length === 12) {
    valor += String(calcularDigitoVerificadorEAN13(valor));
  }
  input.value = valor;
}

// Compara os campos do produto antigo com os novos e retorna uma descrição
// detalhada de exatamente o que foi alterado (ex.: "Saldo de estoque: 77 → 50").
function descreverAlteracoesProduto(antigo, novo) {
  if (!antigo || !novo) return '';
  const alteracoes = [];
  const comparar = (campo, rotulo, transformar) => {
    const a = transformar ? transformar(antigo[campo]) : antigo[campo];
    const b = transformar ? transformar(novo[campo]) : novo[campo];
    if (String(a ?? '') !== String(b ?? '')) {
      alteracoes.push(`${rotulo}: ${a ?? '—'} → ${b ?? '—'}`);
    }
  };
  comparar('nome', 'Nome', v => (v || '').trim());
  comparar('descricao', 'Descrição', v => (v || '').trim());
  comparar('marca', 'Marca', v => (v || '').trim());
  comparar('grupo', 'Grupo', v => (v || '').trim());
  comparar('subgrupo', 'Subgrupo', v => (v || '').trim());
  comparar('codigoBarras', 'Código de barras', v => (v || '').trim());
  comparar('preco', 'Preço', v => (v === undefined || v === null || isNaN(v)) ? '' : Number(v));
  comparar('qtd', 'Saldo de estoque', v => (v === undefined || v === null || isNaN(v)) ? '' : Number(v));
  return alteracoes.join(' | ');
}

// Função de adicionar/atualizar produto no Firebase
async function addProduto() {
  const id = document.getElementById('produto-id').value;
  const nome = document.getElementById('produto-nome').value.trim();
  const descricao = document.getElementById('produto-descricao').value.trim();
  const imagem = document.getElementById('produto-imagem').value.trim();
  const marca = document.getElementById('produto-marca').value.trim();
  const grupo = document.getElementById('produto-grupo').value.trim();
  const subgrupo = document.getElementById('produto-subgrupo').value.trim();
  const codigoBarras = document.getElementById('produto-codigo-barras').value.trim().replace(/\D/g, '');
  const preco = parseFloat(document.getElementById('produto-preco').value);
  const qtd = parseInt(document.getElementById('produto-qtd').value);

  if (!nome || isNaN(preco) || isNaN(qtd)) {
    return showToast("Preencha todos os campos corretamente: Nome, Preço e Quantidade.", "error");
  }

  // Validação do código de barras EAN-13: opcional; se preenchido, deve ter 13 dígitos com dígito verificador válido.
  if (codigoBarras) {
    if (!/^\d{13}$/.test(codigoBarras)) {
      return showToast("Código de barras inválido. O EAN-13 deve ter exatamente 13 dígitos.", "error");
    }
    if (calcularDigitoVerificadorEAN13(codigoBarras.slice(0, 12)) !== parseInt(codigoBarras[12], 10)) {
      return showToast("Código de barras inválido. O dígito verificador (13º) não confere.", "error");
    }
  }

  // Validação da classificação: só aceita valores cadastrados nas Configurações.
  const classificacaoInvalida =
    (marca && !marcasCadastradas.some(v => v.toLowerCase() === marca.toLowerCase()) ? 'Marca "' + marca + '"' : '') ||
    (grupo && !gruposCadastrados.some(v => v.toLowerCase() === grupo.toLowerCase()) ? 'Grupo "' + grupo + '"' : '') ||
    (subgrupo && !subgruposCadastrados.some(v => v.toLowerCase() === subgrupo.toLowerCase()) ? 'Subgrupo "' + subgrupo + '"' : '');
  if (classificacaoInvalida) {
    return showToast(`Não é possível vincular: ${classificacaoInvalida} não está cadastrada nas Configurações. Cadastre a opção e tente novamente.`, "error");
  }

  try {
    if (id) {
      const existente = db.estoque.find(p => p.id === id);
      const codigo = Number(existente && existente.codigo) > 0
        ? Number(existente.codigo)
        : obterCodigoProduto(existente);
      await dbFirestore.collection('estoque').doc(id).update({
        nome, descricao, imagem, marca, grupo, subgrupo, codigoBarras, preco, qtd, codigo,
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
      });
      const alteracoes = descreverAlteracoesProduto(existente, {
        nome, descricao, imagem, marca, grupo, subgrupo, codigoBarras, preco, qtd
      });
      const descricaoLog = alteracoes
        ? `Produto "${nome}" atualizado — ${alteracoes}`
        : `Produto "${nome}" atualizado`;
      registrarLog('editar', 'produto', id, descricaoLog, {
        alteracoes: alteracoes || null,
        nome, descricao, marca, grupo, subgrupo, codigoBarras, preco, qtd
      });
      showToast(`Produto "${nome}" atualizado`, "success");
    } else {
      const docRef = await dbFirestore.collection('estoque').add({
        nome, descricao, imagem, marca, grupo, subgrupo, codigoBarras, preco, qtd,
        codigo: proximoCodigoProduto(),
        bloqueado: false,
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
      });
      registrarLog('incluir', 'produto', docRef.id, `Produto "${nome}" cadastrado`, { nome, descricao, marca, grupo, subgrupo, codigoBarras, preco, qtd });
      showToast(`Produto "${nome}" adicionado com sucesso`, "success");
    }
    cancelEdit();
  } catch (error) {
    console.error("Erro ao salvar produto:", error);
    showToast("Erro ao salvar o produto: " + error.message, "error");
  }
}

function editProduto(id) {
  const produto = db.estoque.find(p => p.id === id);
  if (!produto) return;

  document.getElementById('produto-id').value = id;
  document.getElementById('produto-nome').value = produto.nome;
  document.getElementById('produto-descricao').value = produto.descricao || '';
  document.getElementById('produto-imagem').value = produto.imagem || '';
  preencherSelectsClassificacaoProduto();
  definirClassificacaoSelecionada('marca', produto.marca);
  definirClassificacaoSelecionada('grupo', produto.grupo);
  definirClassificacaoSelecionada('subgrupo', produto.subgrupo);
  document.getElementById('produto-codigo-barras').value = produto.codigoBarras || '';
  document.getElementById('produto-preco').value = produto.preco;
  document.getElementById('produto-qtd').value = produto.qtd;
  document.getElementById('btn-salvar-produto').textContent = 'ATUALIZAR PRODUTO';
  document.getElementById('estoque-title-text').textContent = 'Editar Produto';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');

  document.querySelector('.lg:col-span-1').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  document.getElementById('form-estoque').reset();
  document.getElementById('produto-id').value = '';
  document.getElementById('btn-salvar-produto').textContent = 'SALVAR PRODUTO';
  document.getElementById('estoque-title-text').textContent = 'Adicionar Novo Produto';
  document.getElementById('btn-cancel-edit').classList.add('hidden');
}

/* ================= CONFIGURAÇÕES (LOJA + BANNER) ================= */
// Carrega dados salvos da loja (config/loja) e do banner (config/banner)
async function loadBannerConfig() {
  try {
    const lojaDoc = await dbFirestore.collection('config').doc('loja').get();
    if (lojaDoc.exists) {
      const data = lojaDoc.data() || {};
      const nomeEl = document.getElementById('config-loja-nome');
      const unidadeEl = document.getElementById('config-loja-unidade');
      if (nomeEl) nomeEl.value = data.nome || '';
      if (unidadeEl) unidadeEl.value = data.unidade || '';
      if (data.nome) nomeLoja = data.nome;
      aplicarLojaSidebar(data.nome, data.unidade);
    }
    const bannerDoc = await dbFirestore.collection('config').doc('banner').get();
    if (bannerDoc.exists) {
      const urlEl = document.getElementById('config-banner-url');
      if (urlEl) urlEl.value = bannerDoc.data().url || '';
    }
  } catch (error) {
    console.error("Erro ao carregar configurações:", error);
  }
}

// Aplica o nome/unidade da loja na sidebar
function aplicarLojaSidebar(nome, unidade) {
  const nomeEl = document.getElementById('sidebar-loja-nome');
  const unidadeEl = document.getElementById('sidebar-loja-unidade');
  if (nome && nomeEl) nomeEl.textContent = nome;
  if (unidade && unidadeEl) unidadeEl.textContent = unidade;
}

// Salva os dados da loja
async function salvarConfigLoja() {
  const nome = document.getElementById('config-loja-nome').value.trim();
  const unidade = document.getElementById('config-loja-unidade').value.trim();
  try {
    await dbFirestore.collection('config').doc('loja').set({
      nome,
      unidade,
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    });
    aplicarLojaSidebar(nome, unidade);
    registrarLog('editar', 'config', 'loja', `Dados da loja atualizados (${nome || 'sem nome'}${unidade ? ' — ' + unidade : ''})`, { nome, unidade });
    const status = document.getElementById('config-status');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
  } catch (error) {
    console.error("Erro ao salvar a loja:", error);
    showToast("Erro ao salvar a loja: " + error.message, "error");
  }
}

// Salva o banner do cardápio (config/banner)
async function salvarBannerConfig() {
  const url = document.getElementById('config-banner-url').value.trim();
  try {
    await dbFirestore.collection('config').doc('banner').set({ url, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() });
    registrarLog('editar', 'config', 'banner', 'Banner do cardápio atualizado', { url });
    const status = document.getElementById('config-banner-status');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
  } catch (error) {
    console.error("Erro ao salvar o banner:", error);
    showToast("Erro ao salvar o banner: " + error.message, "error");
  }
}

/* ================= PERSONALIZAÇÃO DO APP ================= */
const PRESETS = {
  orion: { principal: '#1677ff', botoes: '#0d6efd', fundo: '#020715', texto: '#f4f7fd' },
  aura: { principal: '#f59e0b', botoes: '#f59e0b', fundo: '#171717', texto: '#f4f4f5' },
  verde: { principal: '#10B981', botoes: '#059669', fundo: '#F5F7FA', texto: '#071426' },
  escuro: { principal: '#6366F1', botoes: '#4F46E5', fundo: '#0f172a', texto: '#e2e8f0' }
};

// Preset atualmente ativo (persistido em config/personalizacao). O preset 'aura'
// ativa o estilo antigo do projeto (body.preset-aura) via CSS escopado.
let presetAtivo = '';
let nomeLoja = 'ORION EXPRESS';

function syncColorPicker(tipo) {
  const hex = document.getElementById(`config-cor-${tipo}-hex`);
  const picker = document.getElementById(`config-cor-${tipo}`);
  if (hex && picker && /^#[0-9A-Fa-f]{6}$/.test(hex.value)) {
    picker.value = hex.value;
  }
}

function aplicarPreset(nome) {
  const p = PRESETS[nome];
  if (!p) return;
  presetAtivo = nome;
  document.body.classList.toggle('preset-aura', nome === 'aura');
  document.getElementById('config-cor-principal').value = p.principal;
  document.getElementById('config-cor-principal-hex').value = p.principal;
  document.getElementById('config-cor-botoes').value = p.botoes;
  document.getElementById('config-cor-botoes-hex').value = p.botoes;
  document.getElementById('config-cor-fundo').value = p.fundo;
  document.getElementById('config-cor-fundo-hex').value = p.fundo;
  document.getElementById('config-cor-texto').value = p.texto;
  document.getElementById('config-cor-texto-hex').value = p.texto;
  const toggleLogin = document.getElementById('config-aplicar-login');
  aplicarCoresTema(p, toggleLogin ? toggleLogin.checked : false);
}

function aplicarCoresTema(c, aplicarLogin) {
  const root = document.documentElement;
  root.style.setProperty('--tema-principal', c.principal);
  root.style.setProperty('--tema-botoes', c.botoes);
  root.style.setProperty('--tema-fundo', c.fundo);
  root.style.setProperty('--tema-texto', c.texto);
  document.body.classList.add('personalizado');
  document.body.classList.toggle('tema-login', !!aplicarLogin);
}

// Aplica a logo personalizada na sidebar e na tela de login
function aplicarLogoApp(url) {
  const logoLogin = document.getElementById('login-logo');
  const logoSidebar = document.getElementById('sidebar-logo-img');
  if (url) {
    if (logoLogin) {
      logoLogin.src = url;
      logoLogin.style.display = '';
      const fallbackLogin = document.getElementById('pdv-logo-fallback');
      if (fallbackLogin) fallbackLogin.style.display = 'none';
    }
    if (logoSidebar) {
      logoSidebar.src = url;
      logoSidebar.style.display = '';
      const fallbackSidebar = document.getElementById('pdv-sidebar-fallback');
      if (fallbackSidebar) fallbackSidebar.style.display = 'none';
    }
    // Atualiza favicon do navegador
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  } else {
    if (logoLogin) logoLogin.src = 'orion-logo.png';
    if (logoSidebar) logoSidebar.src = 'orion-logo.png';
    // Restaura favicon padrão
    let link = document.querySelector("link[rel~='icon']");
    if (link) link.href = 'orion-logo.png';
  }
}

function previewLogoApp() {
  const url = document.getElementById('config-logo-url').value.trim();
  const preview = document.getElementById('config-logo-preview');
  if (url) {
    preview.innerHTML = `<img src="${escapeDashboard(url)}" class="w-full h-full object-contain">`;
    aplicarLogoApp(url);
  } else {
    preview.innerHTML = '<i class="fas fa-image text-gray-500 text-2xl"></i>';
    aplicarLogoApp('');
  }
}

async function loadPersonalizacao() {
  try {
    const doc = await dbFirestore.collection('config').doc('personalizacao').get();
    if (!doc.exists) return;
    const d = doc.data();
    if (d.logoUrl) {
      const el = document.getElementById('config-logo-url');
      if (el) el.value = d.logoUrl;
      previewLogoApp();
      aplicarLogoApp(d.logoUrl);
    }
    if (d.corPrincipal) {
      document.getElementById('config-cor-principal').value = d.corPrincipal;
      document.getElementById('config-cor-principal-hex').value = d.corPrincipal;
    }
    if (d.corBotoes) {
      document.getElementById('config-cor-botoes').value = d.corBotoes;
      document.getElementById('config-cor-botoes-hex').value = d.corBotoes;
    }
    if (d.corFundo) {
      document.getElementById('config-cor-fundo').value = d.corFundo;
      document.getElementById('config-cor-fundo-hex').value = d.corFundo;
    }
    if (d.corTexto) {
      document.getElementById('config-cor-texto').value = d.corTexto;
      document.getElementById('config-cor-texto-hex').value = d.corTexto;
    }
    const toggleLogin = document.getElementById('config-aplicar-login');
    if (toggleLogin) toggleLogin.checked = !!d.aplicarLogin;
    presetAtivo = d.preset === 'aura' ? 'aura' : '';
    document.body.classList.toggle('preset-aura', presetAtivo === 'aura');
    aplicarCoresTema({
      principal: d.corPrincipal || '#1677ff',
      botoes: d.corBotoes || '#1677ff',
      fundo: d.corFundo || '#020715',
      texto: d.corTexto || '#f4f7fd'
    }, !!d.aplicarLogin);
  } catch (err) {
    console.error('Erro ao carregar personalização:', err);
  }
}

async function salvarPersonalizacao() {
  const data = {
    logoUrl: document.getElementById('config-logo-url').value.trim(),
    corPrincipal: document.getElementById('config-cor-principal').value,
    corBotoes: document.getElementById('config-cor-botoes').value,
    corFundo: document.getElementById('config-cor-fundo').value,
    corTexto: document.getElementById('config-cor-texto').value,
    aplicarLogin: document.getElementById('config-aplicar-login').checked,
    preset: presetAtivo || '',
    lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await dbFirestore.collection('config').doc('personalizacao').set(data);
    aplicarCoresTema({
      principal: data.corPrincipal,
      botoes: data.corBotoes,
      fundo: data.corFundo,
      texto: data.corTexto
    }, data.aplicarLogin);
    aplicarLogoApp(data.logoUrl);
    registrarLog('editar', 'config', 'personalizacao', 'Personalização do app atualizada (cores/logo)', {
      corPrincipal: data.corPrincipal, corBotoes: data.corBotoes, corFundo: data.corFundo, corTexto: data.corTexto, aplicarLogin: data.aplicarLogin, logoUrl: data.logoUrl
    });
    const status = document.getElementById('config-personalizacao-status');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
  } catch (err) {
    console.error('Erro ao salvar personalização:', err);
    showToast('Erro ao salvar: ' + err.message, "error");
  }
}

/* ================= EXIBIÇÃO NO CARDÁPIO ================= */
async function salvarExibicaoCardapio() {
  const mostrarEstoque = document.getElementById('config-mostrar-estoque').checked;
  try {
    await dbFirestore.collection('config').doc('personalizacao').set(
      { mostrarEstoque, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    const status = document.getElementById('config-exibicao-status');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
    registrarLog('editar', 'config', 'personalizacao', 'Exibição do cardápio atualizada', { mostrarEstoque });
  } catch (err) {
    console.error('Erro ao salvar exibição do cardápio:', err);
    showToast('Erro ao salvar: ' + err.message, "error");
  }
}

function loadExibicaoCardapio() {
  const toggle = document.getElementById('config-mostrar-estoque');
  if (!toggle) return;
  dbFirestore.collection('config').doc('personalizacao').get().then(doc => {
    if (doc.exists && doc.data().mostrarEstoque !== undefined) {
      toggle.checked = doc.data().mostrarEstoque;
    }
  }).catch(err => console.error('Erro ao carregar exibição do cardápio:', err));
}

/* ================= HORÁRIO DE FUNCIONAMENTO ================= */
let lojaAberta = true;

function verificarLojaAberta(horarioAbertura, horarioFechamento) {
  const agora = new Date();
  const [ah, am] = horarioAbertura.split(':').map(Number);
  const [fh, fm] = horarioFechamento.split(':').map(Number);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosAbertura = ah * 60 + am;
  const minutosFechamento = fh * 60 + fm;
  if (minutosFechamento > minutosAbertura) {
    return minutosAgora >= minutosAbertura && minutosAgora < minutosFechamento;
  } else {
    return minutosAgora >= minutosAbertura || minutosAgora < minutosFechamento;
  }
}

function loadHorarioFuncionamento() {
  const toggle = document.getElementById('config-horario-automatico');
  const inputAbertura = document.getElementById('config-horario-abertura');
  const inputFechamento = document.getElementById('config-horario-fechamento');
  if (!toggle || !inputAbertura || !inputFechamento) return;
  dbFirestore.collection('config').doc('personalizacao').get().then(doc => {
    if (doc.exists) {
      const d = doc.data();
      if (d.horarioAutomatico !== undefined) toggle.checked = d.horarioAutomatico;
      if (d.horarioAbertura) inputAbertura.value = d.horarioAbertura;
      if (d.horarioFechamento) inputFechamento.value = d.horarioFechamento;
    }
    atualizarStatusLojaAdmin();
  }).catch(err => console.error('Erro ao carregar horário de funcionamento:', err));
}

async function salvarHorarioFuncionamento() {
  const toggle = document.getElementById('config-horario-automatico');
  const inputAbertura = document.getElementById('config-horario-abertura');
  const inputFechamento = document.getElementById('config-horario-fechamento');
  if (!toggle || !inputAbertura || !inputFechamento) return;
  const data = {
    horarioAutomatico: toggle.checked,
    horarioAbertura: inputAbertura.value,
    horarioFechamento: inputFechamento.value,
    lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    await dbFirestore.collection('config').doc('personalizacao').set(data, { merge: true });
    const status = document.getElementById('config-horario-status');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
    registrarLog('editar', 'config', 'personalizacao', 'Horário de funcionamento atualizado', data);
    atualizarStatusLojaAdmin();
  } catch (err) {
    console.error('Erro ao salvar horário de funcionamento:', err);
    showToast('Erro ao salvar: ' + err.message, "error");
  }
}

function atualizarStatusLojaAdmin() {
  const toggle = document.getElementById('config-horario-automatico');
  const inputAbertura = document.getElementById('config-horario-abertura');
  const inputFechamento = document.getElementById('config-horario-fechamento');
  const dot = document.getElementById('config-horario-status-dot');
  const texto = document.getElementById('config-horario-status-texto');
  if (!toggle || !inputAbertura || !inputFechamento || !dot || !texto) return;
  const automatico = toggle.checked;
  const abertura = inputAbertura.value;
  const fechamento = inputFechamento.value;
  if (!automatico) {
    dot.className = 'w-3 h-3 rounded-full bg-gray-500';
    texto.textContent = 'Controle automático desativado';
    lojaAberta = true;
    return;
  }
  lojaAberta = verificarLojaAberta(abertura, fechamento);
  if (lojaAberta) {
    dot.className = 'w-3 h-3 rounded-full bg-green-500';
    texto.textContent = `Loja aberta — atendimento até às ${fechamento}`;
  } else {
    dot.className = 'w-3 h-3 rounded-full bg-red-500';
    texto.textContent = `Loja fechada — atendimento das ${abertura} às ${fechamento}`;
  }
}

/* ================= FORMAS DE PAGAMENTO ================= */
function renderizarSelectPagamento() {
  const select = document.getElementById('selectFormaPagamento');
  if (!select) return;
  select.innerHTML = '<option value="">-- Selecione a forma de pagamento --</option>' +
    metodosPagamento.map(m => `<option value="${escapeDashboard(m)}">${escapeDashboard(m)}</option>`).join('');
}

function renderizarListaPagamentos() {
  const lista = document.getElementById('lista-config-pagamentos');
  if (!lista) return;
  if (metodosPagamento.length === 0) {
    lista.innerHTML = '<p class="text-sm text-gray-500 italic">Nenhuma forma de pagamento cadastrada.</p>';
    return;
  }
  lista.innerHTML = metodosPagamento.map(m => `
    <div class="flex items-center justify-between bg-neutral-700/40 rounded-lg px-3 py-2">
      <span class="text-white font-medium">${escapeDashboard(m)}</span>
      <button onclick="removerMetodoPagamento(decodeURIComponent('${encodeURIComponent(m)}'))" class="text-red-500 hover:text-red-400 p-1" title="Remover">
        <i class="fa fa-trash"></i>
      </button>
    </div>`).join('');
}

async function salvarMetodosPagamento() {
  await dbFirestore.collection('config').doc('pagamentos').set({
    metodos: metodosPagamento,
    lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function mostrarStatusPagamento(mensagem) {
  const status = document.getElementById('config-pagamento-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 3000);
}

async function adicionarMetodoPagamento() {
  const input = document.getElementById('novo-metodo-pagamento');
  const nome = input.value.trim();
  if (!nome) return showToast("Digite o nome da forma de pagamento.", "error");
  if (metodosPagamento.some(m => m.toLowerCase() === nome.toLowerCase())) {
    return showToast("Essa forma de pagamento já está cadastrada.", "error");
  }
  metodosPagamento.push(nome);
  input.value = '';
  try {
    await salvarMetodosPagamento();
    registrarLog('incluir', 'config', 'pagamento', `Forma de pagamento "${nome}" cadastrada`, { nome });
    mostrarStatusPagamento('Forma de pagamento salva!');
  } catch (error) {
    console.error("Erro ao salvar forma de pagamento:", error);
    showToast("Erro ao salvar: " + error.message, "error");
  }
}

async function removerMetodoPagamento(nome) {
  if (!confirm(`Remover a forma de pagamento "${nome}"?`)) return;
  metodosPagamento = metodosPagamento.filter(m => m !== nome);
  try {
    await salvarMetodosPagamento();
    registrarLog('excluir', 'config', 'pagamento', `Forma de pagamento "${nome}" removida`, { nome });
    mostrarStatusPagamento('Forma de pagamento removida!');
  } catch (error) {
    console.error("Erro ao remover forma de pagamento:", error);
    showToast("Erro ao remover: " + error.message, "error");
  }
}

/* ===== CLASSIFICAÇÃO DE PRODUTOS (marcas / grupos / subgrupos) ===== */
// Listas de classificação são exibidas na tela de Configurações e servem
// de fonte única para os selects de vínculo no Cardápio (controle interno).

function obterListaClassificacao(tipo) {
  if (tipo === 'marca') return marcasCadastradas;
  if (tipo === 'grupo') return gruposCadastrados;
  if (tipo === 'subgrupo') return subgruposCadastrados;
  return [];
}

function nomeClassificacao(tipo) {
  if (tipo === 'marca') return 'Marca';
  if (tipo === 'grupo') return 'Grupo';
  return 'Subgrupo';
}

function renderizarListaClassificacoes() {
  ['marca', 'grupo', 'subgrupo'].forEach(tipo => {
    const lista = document.getElementById(`lista-config-${tipo}s`);
    if (!lista) return;
    const valores = obterListaClassificacao(tipo);
    if (valores.length === 0) {
      lista.innerHTML = `<p class="text-sm text-gray-500 italic">Nenhum${tipo === 'grupo' ? '' : 'a'} ${nomeClassificacao(tipo).toLowerCase()} cadastr${tipo === 'grupo' ? 'o' : 'a'}.</p>`;
      return;
    }
    lista.innerHTML = valores.map(v => `
      <div class="flex items-center justify-between bg-neutral-700/40 rounded-lg px-3 py-2">
        <span class="text-white font-medium">${escapeDashboard(v)}</span>
        <button onclick="removerClassificacao('${tipo}', decodeURIComponent('${encodeURIComponent(v)}'))" class="text-red-500 hover:text-red-400 p-1" title="Remover">
          <i class="fa fa-trash"></i>
        </button>
      </div>`).join('');
  });
}

async function salvarClassificacoes() {
  await dbFirestore.collection('config').doc('classificacoes').set({
    marcas: marcasCadastradas,
    grupos: gruposCadastrados,
    subgrupos: subgruposCadastrados,
    lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function mostrarStatusClassificacao(mensagem) {
  const status = document.getElementById('config-classificacao-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 3000);
}

async function adicionarClassificacao(tipo) {
  const input = document.getElementById(`novo-${tipo}`);
  const nome = input.value.trim();
  if (!nome) return showToast(`Digite o nome da ${nomeClassificacao(tipo).toLowerCase()}.`, "error");
  const lista = obterListaClassificacao(tipo);
  if (lista.some(v => v.toLowerCase() === nome.toLowerCase())) {
    return showToast(`Essa ${nomeClassificacao(tipo).toLowerCase()} já está cadastrada.`, "error");
  }
  lista.push(nome);
  input.value = '';
  // Re-renderiza os selects do Cardápio mantendo a seleção atual.
  try {
    await salvarClassificacoes();
    preencherSelectsClassificacaoProduto();
    preencherSelectsClassificacaoCadastro();
    carregarSelectsClassificacaoRelatorio();
    registrarLog('incluir', 'config', 'classificacao', `${nomeClassificacao(tipo)} "${nome}" cadastrada`, { tipo, nome });
    mostrarStatusClassificacao(`${nomeClassificacao(tipo)} salva!`);
  } catch (error) {
    console.error("Erro ao salvar classificação:", error);
    showToast("Erro ao salvar: " + error.message, "error");
  }
}

async function removerClassificacao(tipo, nome) {
  if (!confirm(`Remover ${nomeClassificacao(tipo).toLowerCase()} "${nome}"?`)) return;
  const lista = obterListaClassificacao(tipo);
  const index = lista.findIndex(v => v === nome);
  if (index !== -1) lista.splice(index, 1);
  try {
    await salvarClassificacoes();
    preencherSelectsClassificacaoProduto();
    preencherSelectsClassificacaoCadastro();
    carregarSelectsClassificacaoRelatorio();
    registrarLog('excluir', 'config', 'classificacao', `${nomeClassificacao(tipo)} "${nome}" removida`, { tipo, nome });
    mostrarStatusClassificacao(`${nomeClassificacao(tipo)} removida!`);
  } catch (error) {
    console.error("Erro ao remover classificação:", error);
    showToast("Erro ao remover: " + error.message, "error");
  }
}

// Popular selects de Marca/Grupo/Subgrupo no Cardápio com as opções cadastradas.
function preencherSelectsClassificacaoProduto() {
  ['marca', 'grupo', 'subgrupo'].forEach(tipo => {
    const select = document.getElementById(`produto-${tipo}`);
    if (!select) return;
    const atual = select.value;
    const valores = obterListaClassificacao(tipo);
    select.innerHTML = `<option value="">${tipo === 'marca' ? 'Selecione uma marca cadastrada...' : tipo === 'grupo' ? 'Selecione um grupo cadastrado...' : 'Selecione um subgrupo cadastrado...'}</option>` +
      valores.map(v => `<option value="${escapeDashboard(v)}">${escapeDashboard(v)}</option>`).join('');
    if (atual && valores.includes(atual)) select.value = atual;
  });
}

function preencherSelectsClassificacaoCadastro() {
  ['marca', 'grupo', 'subgrupo'].forEach(tipo => {
    const select = document.getElementById(`cad-produto-${tipo}`);
    if (!select) return;
    const atual = select.value;
    const valores = obterListaClassificacao(tipo);
    select.innerHTML = `<option value="">${tipo === 'marca' ? 'Selecione uma marca...' : tipo === 'grupo' ? 'Selecione um grupo...' : 'Selecione um subgrupo...'}</option>` +
      valores.map(v => `<option value="${escapeDashboard(v)}">${escapeDashboard(v)}</option>`).join('');
    if (atual && valores.includes(atual)) select.value = atual;
  });
}

// Define o valor atual do select ao editar um produto. Se o valor gravado ainda
// não consta na lista cadastrada (produto antigo), adiciona a opção temporariamente
// para que o vínculo existente continue visível até ser corrigido.
function definirClassificacaoSelecionada(tipo, valor) {
  const select = document.getElementById(`produto-${tipo}`);
  if (!select || !valor) return;
  if ([...select.options].some(o => o.value === valor)) {
    select.value = valor;
    return;
  }
  const opt = document.createElement('option');
  opt.value = valor;
  opt.textContent = valor;
  select.appendChild(opt);
  select.value = valor;
}

// Função de renderização da tabela de estoque
// Registro de banner (não é um produto). Não deve aparecer como item de venda/cardápio.
function ehRegistroBanner(item) {
  if (!item) return false;
  const nome = String(item.nome || '').toLowerCase().trim();
  const id = String(item.id || '').toLowerCase().trim();
  const tipo = String(item.tipo || '').toLowerCase().trim();
  return nome === 'banner_config' || nome === 'banner' ||
    id === 'banner_config' || id === 'banner' ||
    tipo === 'banner' || item.isBanner === true;
}

// Só produtos realmente vendáveis (exclui o banner de configuração)
function produtosVendiveis() {
  return db.estoque.filter(p => !ehRegistroBanner(p));
}

// Produto bloqueado (não pode ser vendido até ser liberado)
function ehProdutoBloqueado(produto) {
  return produto && produto.bloqueado === true;
}

// Verifica se o produto já teve movimentação (gerou ao menos um pedido/venda).
// A venda armazena o id do produto em cada item de 'itens'.
function produtoTemMovimentacao(produtoId) {
  return db.vendas.some(v => (v.itens || []).some(i => i && i.id === produtoId));
}

// Alterna o bloqueio de um produto (bloquear/liberar)
async function bloquearProduto(id, bloquear) {
  const produto = db.estoque.find(p => p.id === id);
  if (!produto) return;
  const acao = bloquear ? 'Bloquear' : 'Liberar';
  const acaoLower = bloquear ? 'bloquear' : 'liberar';
  abrirModalConfirmacao({
    titulo: `${acao} produto?`,
    mensagem: `Você está prestes a ${acaoLower} o produto`,
    detalhe: `"${produto.nome}"`,
    textoBtn: `${acao} produto`,
    corBtn: bloquear ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icone: bloquear ? 'fa-ban' : 'fa-unlock',
    iconeCor: bloquear ? 'bg-orange-500/20' : 'bg-emerald-500/20',
    onConfirm: async () => {
      try {
        await dbFirestore.collection('estoque').doc(id).update({
          bloqueado: !!bloquear,
          lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        registrarLog(bloquear ? 'bloquear' : 'desbloquear', 'produto', id,
          `Produto "${produto.nome}" ${bloquear ? 'bloqueado' : 'liberado'}`);
        showToast(`Produto "${produto.nome}" ${bloquear ? 'bloqueado' : 'liberado'} com sucesso!`, "success");
      } catch (error) {
        console.error("Erro ao bloquear produto:", error);
        showToast(`Não foi possível ${acaoLower} o produto "${produto.nome}".`, "error");
      }
    }
  });
}

// Filtro de status da tabela do Cardápio (todos / liberados / bloqueados)
function filtrarEstoqueStatus(filtro) {
  estoqueFiltroStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('estq-status-' + f);
    if (el) el.classList.toggle('active', estoqueFiltroStatus === f);
  });
  estoquePage = 1;
  renderizarEstoque();
}

// Busca por nome e/ou ID na tabela do Cardápio
function filtrarEstoqueBusca() {
  estoquePage = 1;
  renderizarEstoque();
}

// ID único do produto (1, 2, 3, ...). Usa o campo 'codigo' gravado se existir;
// caso contrário deriva pela posição na lista ordenada por criação/atualização
// (mantém os produtos antigos numerados a partir de 1).
function obterCodigoProduto(produto) {
  if (!produto) return 0;
  if (Number(produto.codigo) > 0) return Number(produto.codigo);
  // Produtos legados sem o campo 'codigo': deriva um ID na ordem de criação,
  // pulando os códigos já usados por outros produtos (evita colisões com os gravados).
  const usados = new Set(
    produtosVendiveis()
      .map(p => Number(p.codigo))
      .filter(c => Number.isFinite(c) && c > 0)
  );
  const ordenado = [...produtosVendiveis()].sort((a, b) => {
    const ta = a.lastUpdate ? (a.lastUpdate.seconds || a.lastUpdate || 0) : 0;
    const tb = b.lastUpdate ? (b.lastUpdate.seconds || b.lastUpdate || 0) : 0;
    return (ta - tb) || String(a.nome || '').localeCompare(String(b.nome || ''));
  });
  let proximo = 1;
  for (const p of ordenado) {
    if (Number(p.codigo) > 0) continue;
    while (usados.has(proximo)) proximo++;
    if (p.id === produto.id) return proximo;
    usados.add(proximo);
    proximo++;
  }
  return 0;
}

// Próximo ID de produto: maior código existente + 1 (começa em 1)
function proximoCodigoProduto() {
  return produtosVendiveis()
    .map(p => obterCodigoProduto(p))
    .reduce((max, c) => Math.max(max, Number(c) || 0), 0) + 1;
}

// Formata o ID do produto com zero à esquerda: 1 -> "001" (exibição)
function formatarCodigoProduto(codigo) {
  return '#' + String(codigo).padStart(3, '0');
}

function renderizarEstoque() {
  const tbody = document.getElementById('tabelaEstoque');
  if (!tbody) return;

  const buscaNome = (document.getElementById('estq-busca-nome').value || '').trim().toLowerCase();
  const buscaCodigo = parseInt(document.getElementById('estq-busca-codigo').value, 10);

  const produtos = produtosVendiveis().filter(p => {
    if (estoqueFiltroStatus === 'liberados') return !ehProdutoBloqueado(p);
    if (estoqueFiltroStatus === 'bloqueados') return ehProdutoBloqueado(p);
    return true;
  }).filter(p => {
    if (buscaNome && !String(p.nome || '').toLowerCase().includes(buscaNome)) return false;
    if (buscaCodigo && obterCodigoProduto(p) !== buscaCodigo) return false;
    return true;
  }).sort((a, b) => obterCodigoProduto(a) - obterCodigoProduto(b));

  if (produtos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-gray-500 italic">Nenhum produto cadastrado.</td></tr>`;
    renderizarPaginacaoGenerica('estoque', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(produtos.length / REGISTROS_POR_PAGINA));
  if (estoquePage > totalPaginas) estoquePage = totalPaginas;
  const inicio = (estoquePage - 1) * REGISTROS_POR_PAGINA;
  const pagina = produtos.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  tbody.innerHTML = pagina.map(produto => {
    const bloqueado = ehProdutoBloqueado(produto);
    const temMov = produtoTemMovimentacao(produto.id);
    return `
    <tr class="border-b border-gray-700 hover:bg-neutral-700/50 ${bloqueado ? 'opacity-60' : ''}">
      <td class="p-3 text-gray-400">${formatarCodigoProduto(obterCodigoProduto(produto))}</td>
      <td class="p-3 font-medium">${escapeDashboard(produto.nome)}</td>
      <td class="p-3 text-gray-500 text-xs">${escapeDashboard(produto.codigoBarras || '-')}</td>
      <td class="p-3">${escapeDashboard(produto.marca || '-')}</td>
      <td class="p-3">${escapeDashboard(produto.grupo || '-')}</td>
      <td class="p-3">${escapeDashboard(produto.subgrupo || '-')}</td>
      <td class="p-3">${formatarMoeda(produto.preco)}</td>
      <td class="p-3 text-center ${produto.qtd < 5 ? 'text-red-400 font-bold' : 'text-green-400'}">${produto.qtd}</td>
      <td class="p-3 text-center">
        ${bloqueado
        ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
        : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}
      </td>
      <td class="p-3 text-center">
        <div class="flex items-center justify-center gap-2">
          <button onclick="editProduto('${produto.id}')" class="text-blue-500 hover:text-blue-400 p-1" title="Editar produto">
            <i class="fa fa-pen"></i>
          </button>
          <button onclick="bloquearProduto('${produto.id}', ${bloqueado ? 'false' : 'true'})"
            class="${bloqueado ? 'text-emerald-500 hover:text-emerald-400' : 'text-orange-500 hover:text-orange-400'} p-1"
            title="${bloqueado ? 'Liberar produto' : 'Bloquear produto'}">
            <i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i>
          </button>
          ${temMov || bloqueado
        ? `<button disabled class="text-neutral-600 p-1 cursor-not-allowed"
                 title="${bloqueado ? 'Produto bloqueado: primeiro libere para depois poder excluir.' : 'Produto com pedidos: só pode ser bloqueado, não excluído.'}">
                 <i class="fa fa-trash"></i>
               </button>`
        : `<button onclick="deleteProduto('${produto.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir produto">
                 <i class="fa fa-trash"></i>
               </button>`}
        </div>
      </td>
    </tr>`;
  }).join('');

  renderizarPaginacaoGenerica('estoque', produtos.length, totalPaginas, estoquePage);

  const dashProdutosTotal = document.getElementById('dash-produtos-total');
  if (dashProdutosTotal) dashProdutosTotal.textContent = produtosVendiveis().length;
}

function mudarPaginaEstoque(delta) {
  estoquePage = Math.max(1, estoquePage + delta);
  renderizarEstoque();
}

// Função para deletar produto (só permite excluir se NÃO tiver movimentação/pedidos)
async function deleteProduto(id) {
  if (produtoTemMovimentacao(id)) {
    return showToast("Este produto já possui pedidos registrados e não pode ser excluído. Você pode bloqueá-lo para impedir novas vendas.", "error");
  }
  const produto = db.estoque.find(p => p.id === id);
  if (!produto) return;
  abrirModalConfirmacao({
    titulo: 'Excluir produto?',
    mensagem: 'Você está prestes a excluir o produto',
    detalhe: `"${produto.nome}"`,
    textoBtn: 'Excluir produto',
    corBtn: 'bg-red-600 hover:bg-red-500 text-white',
    icone: 'fa-trash',
    iconeCor: 'bg-red-500/20',
    onConfirm: async () => {
      try {
        await dbFirestore.collection('estoque').doc(id).delete();
        registrarLog('excluir', 'produto', id, `Produto "${produto.nome}" excluído`, { nome: produto.nome });
        showToast(`Produto "${produto.nome}" excluído com sucesso!`, "success");
      } catch (error) {
        console.error("Erro ao deletar produto:", error);
        showToast(`Não foi possível excluir o produto "${produto.nome}".`, "error");
      }
    }
  });
}


/* ================= CRUD CLIENTES ================= */

// ID único do cliente (1, 2, 3, ...). Usa o campo 'codigo' gravado se existir;
// caso contrário deriva pela posição na lista ordenada por criação/atualização
// (mantém os clientes antigos numerados a partir de 1).
function obterCodigoCliente(cliente) {
  if (!cliente) return 0;
  if (Number(cliente.codigo) > 0) return Number(cliente.codigo);
  const ordenado = [...db.clientes].sort((a, b) => {
    const ta = a.since ? (a.since.seconds || a.since || 0) : (a.dataCadastro ? new Date(a.dataCadastro).getTime() / 1000 : 0);
    const tb = b.since ? (b.since.seconds || b.since || 0) : (b.dataCadastro ? new Date(b.dataCadastro).getTime() / 1000 : 0);
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const idx = ordenado.findIndex(c => c.id === cliente.id);
  return idx >= 0 ? idx + 1 : 0;
}

// Próximo ID de cliente: maior código existente + 1 (começa em 1)
function proximoCodigoCliente() {
  return db.clientes
    .map(c => obterCodigoCliente(c))
    .reduce((max, c) => Math.max(max, Number(c) || 0), 0) + 1;
}

// Formata o ID do cliente com zero à esquerda: 1 -> "001" (exibição)
function formatarCodigoCliente(codigo) {
  return '#' + String(codigo).padStart(3, '0');
}

// Busca por nome e/ou ID na tabela de Clientes
function filtrarClientesBusca() {
  clientesPage = 1;
  renderizarClientes();
}

// Filtro de status da tabela de Clientes (todos / liberados / bloqueados)
function filtrarClientesStatus(filtro) {
  clientesFiltroStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('cli-status-' + f);
    if (el) el.classList.toggle('active', clientesFiltroStatus === f);
  });
  clientesPage = 1;
  renderizarClientes();
}

// Cliente bloqueado (não pode gerar novos pedidos até ser liberado)
function ehClienteBloqueado(cliente) {
  return cliente && cliente.bloqueado === true;
}

// Verifica se o cliente já teve movimentação (gerou ao menos um pedido/venda).
// A venda armazena o id do cliente em 'clienteId'.
function clienteTemMovimentacao(clienteId) {
  return db.vendas.some(v => v.clienteId && v.clienteId === clienteId);
}

// Alterna o bloqueio de um cliente (bloquear/liberar)
async function bloquearCliente(id, bloquear) {
  const cliente = db.clientes.find(c => c.id === id);
  if (!cliente) return;
  const acao = bloquear ? 'Bloquear' : 'Liberar';
  const acaoLower = bloquear ? 'bloquear' : 'liberar';
  abrirModalConfirmacao({
    titulo: `${acao} cliente?`,
    mensagem: `Você está prestes a ${acaoLower} o cliente`,
    detalhe: `"${cliente.nome}"`,
    textoBtn: `${acao} cliente`,
    corBtn: bloquear ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icone: bloquear ? 'fa-ban' : 'fa-unlock',
    iconeCor: bloquear ? 'bg-orange-500/20' : 'bg-emerald-500/20',
    onConfirm: async () => {
      try {
        await dbFirestore.collection('clientes').doc(id).update({
          bloqueado: !!bloquear
        });
        registrarLog(bloquear ? 'bloquear' : 'desbloquear', 'cliente', id,
          `Cliente "${cliente.nome}" ${bloquear ? 'bloqueado' : 'liberado'}`);
        showToast(`Cliente "${cliente.nome}" ${bloquear ? 'bloqueado' : 'liberado'} com sucesso!`, "success");
      } catch (error) {
        console.error("Erro ao bloquear cliente:", error);
        showToast(`Não foi possível ${acaoLower} o cliente.`, "error");
      }
    }
  });
}

// Função de adicionar/atualizar cliente no Firebase
async function addCliente() {
  const nome = document.getElementById('cliente-nome').value.trim();
  const tel = document.getElementById('cliente-tel').value.trim();
  const email = document.getElementById('cliente-email').value.trim();
  const endereco = document.getElementById('cliente-endereco').value.trim();
  const numero = document.getElementById('cliente-numero').value.trim();
  const cep = document.getElementById('cliente-cep').value.trim();

  if (!nome || !tel) {
    return showToast("Os campos Nome e Telefone são obrigatórios.", "error");
  }

  try {
    const docRef = await dbFirestore.collection('clientes').add({
      nome: nome,
      tel: tel,
      email: email,
      endereco: endereco,
      numero: numero,
      cep: cep,
      codigo: proximoCodigoCliente(),
      bloqueado: false,
      since: firebase.firestore.FieldValue.serverTimestamp()
    });
    registrarLog('incluir', 'cliente', docRef.id, `Cliente "${nome}" cadastrado`, { nome, tel, email });
    showToast(`Cliente "${nome}" cadastrado`, "success");
    document.getElementById('form-clientes').reset();
  } catch (error) {
    console.error("Erro ao adicionar cliente:", error);
    showToast("Erro ao salvar o cliente: " + error.message, "error");
  }
}

// Função de renderização da tabela de clientes
function renderizarClientes() {
  const tbody = document.getElementById('tabelaClientes');
  if (!tbody) return;

  const buscaNome = (document.getElementById('cli-busca-nome').value || '').trim().toLowerCase();
  const buscaCodigo = parseInt(document.getElementById('cli-busca-codigo').value, 10);

  const clientes = db.clientes.filter(c => {
    if (clientesFiltroStatus === 'liberados') return !ehClienteBloqueado(c);
    if (clientesFiltroStatus === 'bloqueados') return ehClienteBloqueado(c);
    return true;
  }).filter(c => {
    if (buscaNome && !String(c.nome || '').toLowerCase().includes(buscaNome)) return false;
    if (buscaCodigo && obterCodigoCliente(c) !== buscaCodigo) return false;
    return true;
  }).sort((a, b) => obterCodigoCliente(a) - obterCodigoCliente(b));

  if (clientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500 italic">Nenhum cliente cadastrado.</td></tr>`;
    renderizarPaginacaoGenerica('clientes', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(clientes.length / REGISTROS_POR_PAGINA));
  if (clientesPage > totalPaginas) clientesPage = totalPaginas;
  const inicio = (clientesPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = clientes.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  tbody.innerHTML = pagina.map(cliente => {
    const bloqueado = ehClienteBloqueado(cliente);
    const temMov = clienteTemMovimentacao(cliente.id);
    return `
    <tr class="border-b border-gray-700 hover:bg-neutral-700/50 ${bloqueado ? 'opacity-60' : ''}">
      <td class="p-3 text-gray-400">${formatarCodigoCliente(obterCodigoCliente(cliente))}</td>
      <td class="p-3 font-medium">${escapeDashboard(cliente.nome)}</td>
      <td class="p-3">${escapeDashboard(cliente.tel)}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(cliente.email || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(cliente.endereco || '-')} ${cliente.numero ? `, Nº ${escapeDashboard(cliente.numero)}` : ''}</td>
      <td class="p-3 text-center">
        ${bloqueado
        ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
        : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}
      </td>
      <td class="p-3 text-center">
        <div class="flex items-center justify-center gap-2">
          <button onclick="bloquearCliente('${cliente.id}', ${bloqueado ? 'false' : 'true'})"
            class="${bloqueado ? 'text-emerald-500 hover:text-emerald-400' : 'text-orange-500 hover:text-orange-400'} p-1"
            title="${bloqueado ? 'Liberar cliente' : 'Bloquear cliente'}">
            <i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i>
          </button>
          ${temMov || bloqueado
        ? `<button disabled class="text-neutral-600 p-1 cursor-not-allowed"
                 title="${bloqueado ? 'Cliente bloqueado: primeiro libere para depois poder excluir.' : 'Cliente com pedidos: só pode ser bloqueado, não excluído.'}">
                 <i class="fa fa-trash"></i>
               </button>`
        : `<button onclick="deleteCliente('${cliente.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir cliente">
                 <i class="fa fa-trash"></i>
               </button>`}
        </div>
      </td>
    </tr>`;
  }).join('');

  renderizarPaginacaoGenerica('clientes', clientes.length, totalPaginas, clientesPage);

  const dashClientesTotal = document.getElementById('dash-clientes-total');
  if (dashClientesTotal) dashClientesTotal.textContent = db.clientes.length;
}

function mudarPaginaClientes(delta) {
  clientesPage = Math.max(1, clientesPage + delta);
  renderizarClientes();
}

// Função para deletar cliente (só permite excluir se NÃO tiver movimentação/pedidos)
async function deleteCliente(id) {
  if (clienteTemMovimentacao(id)) {
    return showToast("Este cliente já possui pedidos registrados e não pode ser excluído. Você pode bloqueá-lo para impedir novas vendas.", "error");
  }
  const cliente = db.clientes.find(c => c.id === id);
  if (!cliente) return;
  abrirModalConfirmacao({
    titulo: 'Excluir cliente?',
    mensagem: 'Você está prestes a excluir o cliente',
    detalhe: `"${cliente.nome}"`,
    textoBtn: 'Excluir cliente',
    corBtn: 'bg-red-600 hover:bg-red-500 text-white',
    icone: 'fa-trash',
    iconeCor: 'bg-red-500/20',
    onConfirm: async () => {
      try {
        await dbFirestore.collection('clientes').doc(id).delete();
        registrarLog('excluir', 'cliente', id, `Cliente "${cliente.nome}" excluído`, { nome: cliente.nome });
        showToast(`Cliente "${cliente.nome}" excluído com sucesso!`, "success");
      } catch (error) {
        console.error("Erro ao deletar cliente:", error);
        showToast(`Não foi possível excluir o cliente "${cliente.nome}".`, "error");
      }
    }
  });
}


/* ================= PDV/VENDAS ================= */

// Renderiza os produtos disponíveis para venda
function renderizarProdutosVenda() {
  const lista = document.getElementById('listaProdutosVenda');
  if (!lista) return;

  const buscaNome = (document.getElementById('venda-busca-produto-nome').value || '').trim().toLowerCase();
  const buscaCodigo = parseInt(document.getElementById('venda-busca-produto-codigo').value, 10);

  const produtos = produtosVendiveis().filter(p => !ehProdutoBloqueado(p))
    .filter(p => {
      if (buscaNome && !String(p.nome || '').toLowerCase().includes(buscaNome)) return false;
      if (buscaCodigo && obterCodigoProduto(p) !== buscaCodigo) return false;
      return true;
    })
    .sort((a, b) => obterCodigoProduto(a) - obterCodigoProduto(b));

  const totalPaginas = Math.max(1, Math.ceil(produtos.length / REGISTROS_POR_PAGINA_VENDA));
  if (vendaProdutosPage > totalPaginas) vendaProdutosPage = totalPaginas;
  const inicio = (vendaProdutosPage - 1) * REGISTROS_POR_PAGINA_VENDA;
  const pagina = produtos.slice(inicio, inicio + REGISTROS_POR_PAGINA_VENDA);

  renderizarPaginacaoGenerica('venda-produtos', produtos.length, totalPaginas, vendaProdutosPage);

  if (pagina.length === 0) {
    lista.innerHTML = `<p class="text-gray-500 italic col-span-3">Nenhum produto encontrado.</p>`;
    return;
  }

  lista.innerHTML = pagina.map(p => `
    <div class="bg-neutral-900 p-4 rounded-lg border border-gray-700 hover:border-amber-500/50 transition-all cursor-pointer shadow-md flex flex-col gap-3" onclick="addToCart('${p.id}')">
      <div class="h-32 w-full bg-neutral-800 rounded-md overflow-hidden relative group">
        <img src="${p.imagem || 'https://placehold.co/400x300/333/999?text=Sem+Foto'}" alt="${p.nome}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300">
      </div>
      <div>
        <p class="text-xs text-gray-500 mb-1">ID ${formatarCodigoProduto(obterCodigoProduto(p))}</p>
        <h4 class="font-bold text-white text-lg truncate" title="${p.nome}">${p.nome}</h4>
        <p class="text-amber-500 font-bold text-xl">${formatarMoeda(p.preco)}</p>
        <p class="text-sm ${p.qtd < 5 ? 'text-red-400' : 'text-gray-400'}">Estoque: ${p.qtd} ${p.qtd < 5 ? '(Baixo!)' : ''}</p>
      </div>
    </div>
  `).join('');
}

// Filtra os produtos da Venda Rápida por nome e/ou ID (volta para a página 1)
function filtrarProdutosVenda() {
  vendaProdutosPage = 1;
  renderizarProdutosVenda();
}

// Anterior/Próxima da grade de produtos da Venda Rápida
function mudarPaginaProdutosVenda(delta) {
  vendaProdutosPage = Math.max(1, vendaProdutosPage + delta);
  renderizarProdutosVenda();
}

// Adicionar produto ao carrinho
function addToCart(produtoId) {
  const produto = db.estoque.find(p => p.id === produtoId);
  if (!produto || produto.qtd <= 0) {
    return showToast("Produto fora de estoque ou não encontrado.", "error");
  }

  const itemIndex = carrinho.findIndex(item => item.id === produtoId);

  if (itemIndex > -1) {
    // Atualiza quantidade, verificando limite de estoque
    if (carrinho[itemIndex].qtdCarrinho < produto.qtd) {
      carrinho[itemIndex].qtdCarrinho += 1;
    } else {
      return showToast(`Limite de estoque (${produto.qtd}) atingido para ${produto.nome}.`, "error");
    }
  } else {
    // Adiciona novo item ao carrinho
    carrinho.push({
      id: produto.id,
      nome: produto.nome,
      preco: produto.preco,
      qtdCarrinho: 1,
      qtdEstoque: produto.qtd
    });
  }

  renderizarCarrinho();
}

// Atualiza a quantidade de um item no carrinho (direto na tela do carrinho)
function updateCartItemQtd(id, delta) {
  const itemIndex = carrinho.findIndex(item => item.id === id);
  if (itemIndex === -1) return;

  const novoQtd = carrinho[itemIndex].qtdCarrinho + delta;
  const estoqueAtual = db.estoque.find(p => p.id === id)?.qtd || 0;

  if (novoQtd <= 0) {
    // Remove se for menor ou igual a zero
    carrinho.splice(itemIndex, 1);
  } else if (novoQtd > estoqueAtual) {
    return showToast(`Limite de estoque (${estoqueAtual}) atingido para ${carrinho[itemIndex].nome}.`, "error");
  } else {
    carrinho[itemIndex].qtdCarrinho = novoQtd;
  }

  renderizarCarrinho();
}

// Renderiza o carrinho de compras
function renderizarCarrinho() {
  const listaCarrinho = document.getElementById('listaCarrinho');
  const carrinhoTotalEl = document.getElementById('carrinhoTotal');
  const btnFinalizarVenda = document.getElementById('btnFinalizarVenda');

  if (!listaCarrinho || !carrinhoTotalEl || !btnFinalizarVenda) return;

  if (carrinho.length === 0) {
    listaCarrinho.innerHTML = `<p class="text-center text-gray-500 italic py-10">Adicione um produto para iniciar a venda.</p>`;
    carrinhoTotalEl.textContent = formatarMoeda(0);
    btnFinalizarVenda.disabled = true;
    return;
  }

  let total = 0;
  listaCarrinho.innerHTML = carrinho.map(item => {
    const subtotal = item.preco * item.qtdCarrinho;
    total += subtotal;

    return `
      <div class="flex items-center justify-between bg-neutral-700/50 p-3 rounded-lg">
        <div class="flex-grow">
          <p class="font-semibold text-white truncate">${item.nome}</p>
          <p class="text-sm text-gray-400">${item.qtdCarrinho} x ${formatarMoeda(item.preco)}</p>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="updateCartItemQtd('${item.id}', -1)" class="text-red-500 hover:text-red-400 p-1">
            <i class="fa fa-minus-circle"></i>
          </button>
          <span class="text-white font-bold">${item.qtdCarrinho}</span>
          <button onclick="updateCartItemQtd('${item.id}', 1)" class="text-green-500 hover:text-green-400 p-1">
            <i class="fa fa-plus-circle"></i>
          </button>
        </div>
        <span class="font-bold text-amber-400 w-20 text-right">${formatarMoeda(subtotal)}</span>
      </div>
    `;
  }).join('');

  carrinhoTotalEl.textContent = formatarMoeda(total);
  btnFinalizarVenda.disabled = false;
}

// Finaliza a venda (salva no Firebase)
async function finalizarVenda() {
  if (carrinho.length === 0) return showToast("Carrinho vazio!", "error");

  const formaPagamento = document.getElementById('selectFormaPagamento').value;
  if (!formaPagamento) return showToast("Selecione a forma de pagamento.", "error");

  const clienteId = document.getElementById('selectCliente').value;
  if (!clienteId) return showToast("Selecione o cliente para finalizar a venda.", "error");
  const clienteSelecionado = db.clientes.find(c => c.id === clienteId);
  if (clienteSelecionado && ehClienteBloqueado(clienteSelecionado)) {
    return showToast("Este cliente está bloqueado e não pode gerar novos pedidos.", "error");
  }
  const total = carrinho.reduce((sum, item) => sum + (item.preco * item.qtdCarrinho), 0);
  const data = new Date();
  const numeroPedido = await proximoNumeroPedido(); // Sequência 000001, 000002, ...

  const venda = {
    total: total,
    itens: carrinho,
    numeroPedido: numeroPedido,
    formaPagamento: formaPagamento,
    pagamento: formaPagamento, // Compatível com renderPaymentSummary do dashboard
    clienteId: clienteId || null,
    clienteNome: db.clientes.find(c => c.id === clienteId)?.nome || 'Cliente Balcão',
    dataIso: data.toISOString(),
    data: data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR'),
    status: 'Em Preparação', // Novo status inicial
    userId: auth.currentUser?.uid || 'unknown',
    userName: auth.currentUser?.displayName || auth.currentUser?.email || 'Desconhecido'
  };

  try {
    // 1. Salva a venda
    const vendaDoc = await dbFirestore.collection('vendas').add(venda);

    // 2. Atualiza o estoque (em lote para atomicidade)
    const batch = dbFirestore.batch();
    for (const item of carrinho) {
      const produtoRef = dbFirestore.collection('estoque').doc(item.id);
      const novoQtd = db.estoque.find(p => p.id === item.id).qtd - item.qtdCarrinho;
      batch.update(produtoRef, {
        qtd: novoQtd
      });
    }
    await batch.commit();

    // 3. Registra a movimentação de caixa (se houver caixa aberto)
    await registrarMovimentacaoVendaCaixa(vendaDoc.id, numeroPedido, formaPagamento, total, venda);

    registrarLog('venda', 'venda', vendaDoc.id,
      `Venda #${numeroPedido} finalizada — ${formatarMoeda(total)} (${formaPagamento}) — ${venda.clienteNome}`,
      { numeroPedido, total, formaPagamento, clienteId, itens: carrinho.map(i => ({ nome: i.nome, qtd: i.qtdCarrinho, preco: i.preco })) });

    showToast(`Venda finalizada`, "success");

    // 4. Limpa o carrinho
    carrinho = [];
    renderizarCarrinho();

  } catch (error) {
    console.error("Erro ao finalizar venda:", error);
    showToast("Erro ao finalizar a venda: " + error.message, "error");
  }
}

// Registra a movimentação VENDA no caixa aberto (sem bloquear a venda se o caixa estiver fechado).
// Idempotente: o doc em 'movimentacoes_caixa' usa o id da VENDA como id (docId = venda_id).
async function registrarMovimentacaoVendaCaixa(vendaId, numeroPedido, formaPagamento, total, venda = {}) {
  if (!caixaAtual || !vendaId) return;
  try {
    await dbFirestore.collection('movimentacoes_caixa').doc(vendaId).set({
      caixa_id: caixaAtual.id,
      tipo: 'VENDA',
      forma_pagamento: normalizarFormaPagamentoCaixa(formaPagamento),
      valor: total,
      data_hora: venda.dataIso || new Date().toISOString(),
      usuario_id: venda.userId || venda.clienteUid || 'unknown',
      venda_id: vendaId,
      observacao: `Pedido ${venda.numeroPedido || numeroPedido || ''}`
    }, { merge: true });
  } catch (error) {
    console.error("Erro ao registrar venda no caixa:", error);
  }
}

// Retorna o cadastro mais próximo do filtro (nome igual > prefixo > contém > menor ID)
function clienteMaisProximo(clientes, buscaNome, buscaCodigo) {
  if (clientes.length === 0) return null;
  if (buscaCodigo) return clientes[0];
  if (buscaNome) {
    const igual = clientes.find(c => String(c.nome || '').toLowerCase() === buscaNome);
    if (igual) return igual;
    const prefixo = clientes.find(c => String(c.nome || '').toLowerCase().startsWith(buscaNome));
    if (prefixo) return prefixo;
  }
  return clientes[0];
}

// Renderiza o dropdown de clientes no PDV
// - Auto-seleciona o cadastro mais próximo ao digitar nome/ID no filtro
// - Exibe a lista paginada (LIMITE por página) com Anterior/Próxima
// - Se a seleção atual ainda pertence ao filtro, ela é preservada
function renderizarSelectClientes() {
  const selecionadoEl = document.getElementById('selectCliente');
  if (!selecionadoEl) return;

  const buscaNome = (document.getElementById('venda-busca-cliente-nome').value || '').trim().toLowerCase();
  const buscaCodigo = parseInt(document.getElementById('venda-busca-cliente-codigo').value, 10);
  const filtrando = !!(buscaNome || buscaCodigo);

  const valorAtual = selecionadoEl.value;

  const clientesRelacionados = db.clientes
    .filter(c => !ehClienteBloqueado(c))
    .filter(c => {
      if (buscaNome && !String(c.nome || '').toLowerCase().includes(buscaNome)) return false;
      if (buscaCodigo && obterCodigoCliente(c) !== buscaCodigo) return false;
      return true;
    })
    .sort((a, b) => obterCodigoCliente(a) - obterCodigoCliente(b));

  const baseOptions = (filtrando ? clientesRelacionados : db.clientes.filter(c => !ehClienteBloqueado(c)))
    .sort((a, b) => obterCodigoCliente(a) - obterCodigoCliente(b));

  let novoValor = valorAtual || '';
  if (novoValor && !baseOptions.some(c => c.id === novoValor)) novoValor = '';
  if (filtrando && !novoValor) {
    const melhor = clienteMaisProximo(clientesRelacionados, buscaNome, buscaCodigo);
    if (melhor) novoValor = melhor.id;
  }
  selecionadoEl.value = novoValor || '';
  atualizarLabelClientePDV(novoValor);

  const lista = document.getElementById('listaSelectClientes');
  if (lista) {
    const totalPaginas = Math.max(1, Math.ceil(baseOptions.length / LIMITE_SELECT_CLIENTES));
    if (selectClientesPage > totalPaginas) selectClientesPage = totalPaginas;
    const inicio = (selectClientesPage - 1) * LIMITE_SELECT_CLIENTES;
    const pagina = baseOptions.slice(inicio, inicio + LIMITE_SELECT_CLIENTES);
    renderizarPaginacaoGenerica('select-cliente', baseOptions.length, totalPaginas, selectClientesPage);

    if (pagina.length === 0) {
      lista.innerHTML = '<p class="text-gray-500 italic px-4 py-3">Nenhum cliente encontrado.</p>';
    } else {
      lista.innerHTML = pagina.map(c => {
        const ativo = c.id === selecionadoEl.value;
        return `
          <button type="button" onclick="selecionarClientePDV('${c.id}', event)"
            class="flex items-center gap-2 w-full text-left px-4 py-3 text-sm transition-colors ${ativo ? 'text-amber-400 bg-neutral-700/40' : 'text-gray-200 hover:bg-neutral-700'}">
            <span class="font-bold">#${formatarCodigoCliente(obterCodigoCliente(c)).slice(1)}</span>
            <span class="truncate flex-1">${c.nome} (${c.tel})</span>
            ${ativo ? '<i class="fa fa-check text-amber-400"></i>' : ''}
          </button>`;
      }).join('');
    }
  }
}

// Reflete no botão/label o cliente atualmente selecionado
function atualizarLabelClientePDV(id) {
  const label = document.getElementById('selectClienteLabel');
  if (!label) return;
  const c = id ? db.clientes.find(x => x.id === id) : null;
  label.textContent = c ? `#${formatarCodigoCliente(obterCodigoCliente(c)).slice(1)} · ${c.nome}` : '-- Selecione o Cliente --';
}

// Abre/fecha o dropdown de clientes do PDV
function toggleSelectClientes(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('selectClienteDropdown');
  if (!dropdown) return;
  const isOpen = !dropdown.classList.contains('hidden');
  document.querySelectorAll('.status-dropdown').forEach(el => el.classList.add('hidden'));
  if (!isOpen) {
    selectClientesPage = 1;
    renderizarSelectClientes();
    dropdown.classList.remove('hidden');
  }
}

// Seleciona um cliente no dropdown do PDV (e guarda no input hidden)
function selecionarClientePDV(id) {
  const selecionadoEl = document.getElementById('selectCliente');
  if (selecionadoEl) selecionadoEl.value = id;
  atualizarLabelClientePDV(id);
  const dropdown = document.getElementById('selectClienteDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  renderizarSelectClientes();
}

// Anterior/Próxima da lista de clientes do PDV
function mudarPaginaSelectClientes(delta) {
  selectClientesPage = Math.max(1, selectClientesPage + delta);
  renderizarSelectClientes();
}

// Filtra os clientes do select da Venda Rápida por nome e/ou ID
function filtrarSelectClientes() {
  selectClientesPage = 1;
  renderizarSelectClientes();
}

/* ================= CAIXA ================= */

// Normaliza a forma de pagamento da venda para os rótulos de caixa (DINHEIRO/PIX/CARTAO/OUTROS)
function normalizarFormaPagamentoCaixa(forma) {
  const f = String(forma || '').toLowerCase();
  if (f.includes('pix')) return 'PIX';
  if (f.includes('cart')) return 'CARTAO';
  if (f.includes('dinh')) return 'DINHEIRO';
  return 'OUTROS';
}

// Renderiza a tela de Caixa (estado global caixaAtual / movimentacoesCaixa / caixasLista)
function renderizarCaixa() {
  const badge = document.getElementById('caixa-status-badge');
  const infoEl = document.getElementById('caixa-aberto-info');
  const aberturaCard = document.getElementById('caixa-abertura-card');
  const lancamentosEl = document.getElementById('caixa-movimentacoes-container');
  const fechamentoEl = document.getElementById('caixa-fechamento-container');

  if (!badge || !infoEl) return;

  if (!caixaAtual) {
    badge.textContent = 'SEM CAIXA ABERTO';
    badge.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-neutral-700 text-gray-300';
    infoEl.innerHTML = '<p class="text-gray-500 italic">Nenhum caixa aberto no momento. Abra um caixa para começar o dia.</p>';
    if (aberturaCard) aberturaCard.classList.remove('hidden');
    if (lancamentosEl) lancamentosEl.innerHTML = '<p class="text-gray-500 italic">Abra o caixa para registrar lançamentos.</p>';
    if (fechamentoEl) fechamentoEl.innerHTML = '<p class="text-gray-500 italic">Abra o caixa para fechá-lo.</p>';
  } else {
    const seq = obterSequenciaCaixa(caixaAtual);
    badge.textContent = `CAIXA ABERTO`;
    badge.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-green-600 text-white';
    infoEl.innerHTML = `
      <div class="space-y-2 text-gray-300">
        <p><span class="text-gray-500">Sequência:</span> <span class="text-white font-bold">#${seq}</span></p>
        <p><span class="text-gray-500">Aberto por:</span> <span class="text-white font-medium">${escapeDashboard(caixaAtual.usuario_abertura_nome || 'Desconhecido')}</span></p>
        <p><span class="text-gray-500">Aberto em:</span> <span class="text-white">${new Date(caixaAtual.data_abertura).toLocaleString('pt-BR')}</span></p>
        <p><span class="text-gray-500">Valor de abertura:</span> <span class="text-white font-medium">${formatarMoeda(caixaAtual.valor_abertura || 0)}</span></p>
      </div>
    `;
    if (aberturaCard) aberturaCard.classList.add('hidden');
    renderizarLancamentosCaixa();
    renderizarFechamentoCaixa();
  }

  renderizarHistoricoCaixas();
}

// Calcula o esperado por forma de pagamento de QUALQUER caixa (aberto ou fechado)
function calcularEsperadoCaixa(caixa, movs) {
  const esperado = { DINHEIRO: 0, PIX: 0, CARTAO: 0, OUTROS: 0 };
  if (!caixa) return esperado;
  esperado.DINHEIRO += Number(caixa.valor_abertura || 0);
  (movs || []).forEach(m => {
    const v = Number(m.valor || 0);
    if (esperado[m.forma_pagamento] === undefined) return;
    if (m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO') esperado[m.forma_pagamento] += v;
    else if (m.tipo === 'SANGRIA' || m.tipo === 'ESTORNO' || m.tipo === 'DESPESA') esperado[m.forma_pagamento] -= v;
  });
  return esperado;
}

// Calcula o esperado por forma de pagamento do caixa aberto
function calcularEsperadoPorForma() {
  if (!caixaAtual) return { DINHEIRO: 0, PIX: 0, CARTAO: 0, OUTROS: 0 };
  const movs = movimentacoesCaixa.filter(m => m.caixa_id === caixaAtual.id);
  return calcularEsperadoCaixa(caixaAtual, movs);
}

// Sequência do caixa (1, 2, 3, ...) na ordem cronológica de abertura.
// Usa o campo 'sequencia' gravado se existir; caso contrário deriva pela posição
// na lista ordenada por data_abertura (mantém caixas antigos numerados).
function obterSequenciaCaixa(caixa) {
  if (!caixa) return 0;
  if (Number(caixa.sequencia) > 0) return Number(caixa.sequencia);
  const ordenado = [...caixasLista].sort((a, b) => new Date(a.data_abertura) - new Date(b.data_abertura));
  const idx = ordenado.findIndex(c => c.id === caixa.id);
  return idx >= 0 ? idx + 1 : 0;
}

// Próxima sequência de caixa: maior sequência existente + 1 (começa em 1)
function proximaSequenciaCaixa() {
  return caixasLista
    .map(c => Number(c.sequencia) > 0 ? Number(c.sequencia) : obterSequenciaCaixa(c))
    .reduce((max, s) => Math.max(max, s), 0) + 1;
}

// Renderiza a área de lançamentos (formulário + lista de movimentações do caixa aberto)
function renderizarLancamentosCaixa() {
  const container = document.getElementById('caixa-movimentacoes-container');
  if (!container) return;

  const movs = (movimentacoesCaixa || []).filter(m => m.caixa_id === caixaAtual.id);

  const rows = movs.length === 0
    ? '<p class="text-gray-500 italic text-center py-4">Nenhuma movimentação ainda.</p>'
    : `<table class="w-full text-sm text-left text-gray-300">
         <thead class="text-xs uppercase text-gray-400 border-b border-gray-700">
           <tr>
             <th class="px-2 py-2">Hora</th>
             <th class="px-2 py-2">Tipo</th>
             <th class="px-2 py-2">Forma</th>
             <th class="px-2 py-2">Valor</th>
             <th class="px-2 py-2">Observação</th>
           </tr>
         </thead>
         <tbody>
           ${movs.slice(0, 50).map(m => `
             <tr class="border-b border-gray-800">
               <td class="px-2 py-2 whitespace-nowrap">${new Date(m.data_hora).toLocaleTimeString('pt-BR')}</td>
               <td class="px-2 py-2">
                 ${m.tipo === 'VENDA' ? '<span class="text-green-400 font-medium">Venda</span>'
        : m.tipo === 'SUPRIMENTO' ? '<span class="text-blue-400 font-medium">Suprimento</span>'
          : m.tipo === 'SANGRIA' ? '<span class="text-red-400 font-medium">Sangria</span>'
            : m.tipo === 'DESPESA' ? '<span class="text-purple-400 font-medium">Despesa</span>'
              : '<span class="text-amber-400 font-medium">Estorno</span>'}
               </td>
               <td class="px-2 py-2">${escapeDashboard(m.forma_pagamento || '')}</td>
               <td class="px-2 py-2 font-medium ${(m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO') ? 'text-green-400' : 'text-red-400'}">
                 ${(m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO') ? '+' : '−'}${formatarMoeda(m.valor || 0)}
               </td>
               <td class="px-2 py-2 text-gray-400 max-w-[180px] truncate">${escapeDashboard(m.observacao || m.venda_id || '-')}</td>
             </tr>
           `).join('')}
         </tbody>
       </table>`;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
      <div>
        <label class="text-sm text-gray-400 block mb-1">Tipo:</label>
        <select id="caixa-lancamento-tipo" onchange="atualizarDiferencaCaixa()"
          class="input-field appearance-none bg-neutral-900 border border-neutral-600 focus:border-amber-500">
          <option value="SANGRIA">Sangria (-)</option>
          <option value="SUPRIMENTO">Suprimento (+)</option>
          <option value="ESTORNO">Estorno (-)</option>
        </select>
      </div>
      <div>
        <label class="text-sm text-gray-400 block mb-1">Forma:</label>
        <select id="caixa-lancamento-forma"
          class="input-field appearance-none bg-neutral-900 border border-neutral-600 focus:border-amber-500">
          <option value="DINHEIRO">Dinheiro</option>
          <option value="PIX">PIX</option>
          <option value="CARTAO">Cartão</option>
          <option value="OUTROS">Outros</option>
        </select>
      </div>
      <div>
        <label class="text-sm text-gray-400 block mb-1">Valor (R$):</label>
        <input type="number" id="caixa-lancamento-valor" step="0.01" min="0" placeholder="0,00"
          class="input-field bg-neutral-900 border border-neutral-600 focus:border-amber-500">
      </div>
      <div>
        <label class="text-sm text-gray-400 block mb-1">Observação (opcional):</label>
        <input type="text" id="caixa-lancamento-observacao" placeholder="Ex.: troco, depósito..."
          class="input-field bg-neutral-900 border border-neutral-600 focus:border-amber-500">
      </div>
    </div>
    <button onclick="salvarLancamentoCaixa()"
      class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors mb-4">REGISTRAR
      LANÇAMENTO</button>
    <div class="bg-neutral-900/40 rounded-lg p-3 overflow-x-auto max-h-72 overflow-y-auto">${rows}</div>
  `;
}

// Salva um lançamento manual (sangria/suprimento/estorno) no caixa aberto
async function salvarLancamentoCaixa() {
  if (!caixaAtual) return showToast("Nenhum caixa aberto.", "error");
  const idCaixa = caixaAtual.id;

  const tipo = document.getElementById('caixa-lancamento-tipo').value;
  const forma = document.getElementById('caixa-lancamento-forma').value;
  const valor = parseFloat(document.getElementById('caixa-lancamento-valor').value);
  const observacao = document.getElementById('caixa-lancamento-observacao').value.trim();

  if (!valor || valor <= 0) return showToast("Informe um valor válido.", "error");
  if (tipo === 'SANGRIA') {
    const esperado = calcularEsperadoPorForma();
    if (valor > esperado.DINHEIRO) {
      if (!confirm("O valor da sangria é maior que o esperado em Dinheiro. Deseja continuar?")) return;
    }
  }

  try {
    await dbFirestore.collection('movimentacoes_caixa').add({
      caixa_id: idCaixa,
      tipo: tipo,
      forma_pagamento: forma,
      valor: valor,
      data_hora: new Date().toISOString(),
      usuario_id: auth.currentUser?.uid || 'unknown',
      venda_id: null,
      observacao: observacao
    });
    registrarLog('caixa_lancamento', 'caixa', idCaixa,
      `Lançamento de ${tipo} no caixa: ${formatarMoeda(valor)}${observacao ? ' — ' + observacao : ''}`, { tipo, forma, valor, observacao });
    document.getElementById('caixa-lancamento-valor').value = '';
    document.getElementById('caixa-lancamento-observacao').value = '';
  } catch (error) {
    console.error("Erro ao registrar lançamento:", error);
    showToast("Erro ao registrar lançamento: " + error.message, "error");
  }
}

// Abre um caixa (valida se já existe um aberto)
async function abrirCaixa(event) {
  if (event) event.preventDefault();

  const valor = parseFloat(document.getElementById('caixa-valor-abertura').value);
  if (isNaN(valor) || valor < 0) return showToast("Informe um valor de abertura válido.", "error");

  if (caixaAtual) return showToast("Já existe um caixa aberto. Feche-o antes de abrir um novo.", "error");

  try {
    await dbFirestore.collection('caixas').add({
      sequencia: proximaSequenciaCaixa(),
      usuario_abertura_id: auth.currentUser?.uid || 'unknown',
      usuario_abertura_nome: auth.currentUser?.displayName || auth.currentUser?.email || 'Desconhecido',
      data_abertura: new Date().toISOString(),
      valor_abertura: valor,
      status: 'ABERTO',
      data_fechamento: null,
      usuario_fechamento_id: null,
      valor_informado_fechamento: null,
      valor_esperado_fechamento: null,
      diferenca: null
    });
    registrarLog('caixa_abrir', 'caixa', null, `Caixa aberto com ${formatarMoeda(valor)} de abertura`, { valorAbertura: valor });
    document.getElementById('caixa-valor-abertura').value = '';
  } catch (error) {
    console.error("Erro ao abrir caixa:", error);
    showToast("Erro ao abrir caixa: " + error.message, "error");
  }
}

// Renderiza o card de fechamento (esperado por forma + dinheiro contado + diferença)
function renderizarFechamentoCaixa() {
  const container = document.getElementById('caixa-fechamento-container');
  if (!container) return;

  const esperado = calcularEsperadoPorForma();

  container.innerHTML = `
    <div class="space-y-2 text-gray-300 mb-4">
      <div class="flex justify-between bg-neutral-900 rounded-lg px-3 py-2">
        <span>Esperado Dinheiro:</span><span class="font-bold text-white">${formatarMoeda(esperado.DINHEIRO)}</span>
      </div>
      <div class="flex justify-between bg-neutral-900 rounded-lg px-3 py-2">
        <span>Esperado PIX:</span><span class="font-bold text-white">${formatarMoeda(esperado.PIX)}</span>
      </div>
      <div class="flex justify-between bg-neutral-900 rounded-lg px-3 py-2">
        <span>Esperado Cartão:</span><span class="font-bold text-white">${formatarMoeda(esperado.CARTAO)}</span>
      </div>
      <div class="flex justify-between bg-neutral-900 rounded-lg px-3 py-2">
        <span>Esperado Outros:</span><span class="font-bold text-white">${formatarMoeda(esperado.OUTROS)}</span>
      </div>
    </div>
    <label class="text-sm text-gray-400 block mb-1">Dinheiro contado (R$):</label>
    <input type="number" id="caixa-contado-dinheiro" step="0.01" min="0" placeholder="${esperado.DINHEIRO.toFixed(2)}"
      oninput="atualizarDiferencaCaixa()"
      class="input-field bg-neutral-900 border border-neutral-600 focus:border-amber-500 mb-3">
    <div class="flex justify-between items-center mb-4">
      <span class="text-gray-300">Diferença:</span>
      <span id="caixa-diferenca" class="text-xl font-bold text-white">${formatarMoeda(0)}</span>
    </div>
    <p class="text-xs text-gray-500 mb-3">A diferença é calculada sobre o Dinheiro (contado - esperado). PIX e Cartão são
      informativos.</p>
    <button onclick="fecharCaixa()"
      class="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">FECHAR
      CAIXA</button>
  `;
}

// Atualiza a diferença do caixa ao digitar o valor contado
function atualizarDiferencaCaixa() {
  const el = document.getElementById('caixa-diferenca');
  const input = document.getElementById('caixa-contado-dinheiro');
  if (!el || !input) return;
  const contado = parseFloat(input.value) || 0;
  const esperado = calcularEsperadoPorForma();
  const diferenca = contado - esperado.DINHEIRO;
  el.textContent = formatarMoeda(diferenca);
  el.className = 'text-xl font-bold ' + (diferenca < 0 ? 'text-red-400' : diferenca > 0 ? 'text-green-400' : 'text-white');
}

// Fecha o caixa aberto com o valor de dinheiro contado
async function fecharCaixa() {
  if (!caixaAtual) return showToast("Nenhum caixa aberto.", "error");

  // Captura o id antes do await: o onSnapshot de caixas dispara durante o update
  // e redefine caixaAtual para null (não há mais caixa ABERTO).
  const idCaixa = caixaAtual.id;

  const contado = parseFloat(document.getElementById('caixa-contado-dinheiro').value);
  if (isNaN(contado) || contado < 0) return showToast("Informe o valor de dinheiro contado.", "error");

  const esperado = calcularEsperadoPorForma();
  const diferenca = contado - esperado.DINHEIRO;

  try {
    await dbFirestore.collection('caixas').doc(idCaixa).update({
      status: 'FECHADO',
      data_fechamento: new Date().toISOString(),
      usuario_fechamento_id: auth.currentUser?.uid || 'unknown',
      valor_informado_fechamento: contado,
      valor_esperado_fechamento: esperado.DINHEIRO,
      diferenca: diferenca
    });
    registrarLog('caixa_fechar', 'caixa', idCaixa,
      `Caixa fechado — esperado ${formatarMoeda(esperado.DINHEIRO)}, contado ${formatarMoeda(contado)}, diferença ${formatarMoeda(diferenca)}`,
      { contado, esperado: esperado.DINHEIRO, diferenca });
    showToast(`Caixa fechado`, "success");
  } catch (error) {
    console.error("Erro ao fechar caixa:", error);
    showToast("Erro ao fechar caixa: " + error.message, "error");
  }
}

// Renderiza o histórico de caixas fechados
function renderizarHistoricoCaixas() {
  const tbody = document.getElementById('caixa-historico-tbody');
  if (!tbody) return;

  const fechados = caixasLista.filter(c => c.status === 'FECHADO');

  if (fechados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500 italic">Nenhum caixa fechado ainda.</td></tr>';
    renderizarPaginacaoGenerica('caixa-historico', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(fechados.length / REGISTROS_POR_PAGINA));
  if (historicoCaixasPage > totalPaginas) historicoCaixasPage = totalPaginas;
  const inicio = (historicoCaixasPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = fechados.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  renderizarPaginacaoGenerica('caixa-historico', fechados.length, totalPaginas, historicoCaixasPage);

  tbody.innerHTML = pagina.map(c => {
    const dif = Number(c.diferenca || 0);
    return `
      <tr class="border-b border-gray-800">
        <td class="px-4 py-2 font-bold text-amber-400">#${obterSequenciaCaixa(c)}</td>
        <td class="px-4 py-2">${new Date(c.data_abertura).toLocaleDateString('pt-BR')} ${new Date(c.data_abertura).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
        <td class="px-4 py-2"><span class="text-gray-400">Fechado</span></td>
        <td class="px-4 py-2">${formatarMoeda(c.valor_abertura || 0)}</td>
        <td class="px-4 py-2">${formatarMoeda(c.valor_esperado_fechamento || 0)}</td>
        <td class="px-4 py-2">${formatarMoeda(c.valor_informado_fechamento || 0)}</td>
        <td class="px-4 py-2 font-medium ${dif < 0 ? 'text-red-400' : dif > 0 ? 'text-green-400' : 'text-gray-300'}">${formatarMoeda(dif)}</td>
      </tr>
    `;
  }).join('');
}

// Concilia as vendas ainda não lançadas no caixa aberto.
// Garante que venda sem lançamento entre no caixa aberto — mas somente vendas da
// janela "sem caixa": criadas APÓS o fechamento do caixa anterior (ex.: pedidos
// feitos com caixa fechado, como o #000025). Vendas históricas de períodos com
// caixa aberto/registrado NÃO são puxadas retroativamente para o novo caixa.
// Idempotente: o doc usa venda_id como id e só cria lançamento para vendas
// sem movimentação existente (dedup pela lista completa movimentacoesCaixa).
let conciliandoVendas = false;

// Início da janela de conciliação: data_fechamento do caixa FECHADO mais recente.
// Se não houver nenhum caixa fechado ainda, usa a abertura do caixa atual (não
// resgata vendas antigas de períodos anteriores ao primeiro caixa).
function obterInicioJanelaConciliacao() {
  const fechados = caixasLista
    .filter(c => c.status === 'FECHADO' && c.data_fechamento)
    .sort((a, b) => new Date(b.data_fechamento) - new Date(a.data_fechamento));
  if (fechados.length) return new Date(fechados[0].data_fechamento).getTime();
  return caixaAtual ? new Date(caixaAtual.data_abertura).getTime() : 0;
}

async function conciliarVendasNoCaixa() {
  if (!caixaAtual || !movCaixaCarregado || conciliandoVendas) return;
  conciliandoVendas = true;
  try {
    const inicioJanela = obterInicioJanelaConciliacao();
    const vendasJaLancadas = new Set(
      movimentacoesCaixa.filter(m => m.venda_id || m.id).map(m => m.venda_id || m.id)
    );
    for (const venda of db.vendas) {
      if (!venda.id || vendasJaLancadas.has(venda.id)) continue;
      if (!venda.total) continue;
      // Só concilia vendas do período sem caixa (após o último fechamento)
      const vendaMs = new Date(venda.dataIso || 0).getTime();
      if (isNaN(vendaMs) || vendaMs < inicioJanela) continue;
      await registrarMovimentacaoVendaCaixa(venda.id, venda.numeroPedido, venda.formaPagamento, venda.total, venda);
      vendasJaLancadas.add(venda.id);
    }
  } catch (error) {
    console.error("Erro ao conciliar vendas no caixa:", error);
  } finally {
    conciliandoVendas = false;
  }
}

/* ================= HISTÓRICO DE VENDAS ================= */

// Renderiza o histórico de vendas (aba 'Pedidos')
function renderHistoricoVendas() {
  const tbody = document.getElementById('tabelaHistoricoVendas');
  if (!tbody) return;

  if (db.vendas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500 italic">Nenhuma venda registrada ainda.</td></tr>`;
    renderizarPaginacaoGenerica('historico', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(db.vendas.length / REGISTROS_POR_PAGINA));
  if (historicoVendasPage > totalPaginas) historicoVendasPage = totalPaginas;
  const inicio = (historicoVendasPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = db.vendas.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  tbody.innerHTML = pagina.map(venda => {
    let statusClass;
    let iconClass;
    switch (venda.status) {
      case 'Em Preparação':
        statusClass = 'bg-yellow-900/50 text-yellow-400 border-yellow-400';
        iconClass = 'fa-hourglass-half';
        break;
      case 'Saiu para Entrega':
        statusClass = 'bg-indigo-900/50 text-indigo-400 border-indigo-400';
        iconClass = 'fa-motorcycle';
        break;
      case 'Entregue':
        statusClass = 'bg-green-900/50 text-green-400 border-green-400';
        iconClass = 'fa-check-circle';
        break;
      case 'Cancelado':
        statusClass = 'bg-red-900/50 text-red-400 border-red-400';
        iconClass = 'fa-times-circle';
        break;
      default:
        statusClass = 'bg-gray-700/50 text-gray-400 border-gray-400';
        iconClass = 'fa-question-circle';
    }

    const resumoItens = venda.itens.map(i => `${i.qtdCarrinho}x ${i.nome}`).join(', ');

    return `
      <tr class="border-b border-gray-700 hover:bg-neutral-700/50 cursor-pointer" onclick="if(!event.target.closest('button')) abrirModalDetalhes('${venda.id}')">
        <td class="p-3 text-sm font-semibold text-amber-500 hover:underline" title="Clique para ver detalhes">#${numeroExibicao(venda)}</td>
        <td class="p-3 text-sm">${venda.data}</td>
        <td class="p-3 text-sm text-gray-400">${resumoItens}</td>
        <td class="p-3 font-bold text-amber-400">${formatarMoeda(venda.total)}</td>
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-2">
            <span class="text-xs font-bold px-3 py-1 rounded-full border ${statusClass} flex items-center gap-1">
              <i class="fa ${iconClass}"></i> ${venda.status}
            </span>
            <div class="relative">
              <button onclick="toggleDropdown(event, '${venda.id}')" class="text-gray-400 hover:text-white p-1 transition-colors">
                <i class="fa fa-chevron-down"></i>
              </button>
              <div id="dropdown-${venda.id}" class="status-dropdown absolute right-0 mt-2 w-52 bg-neutral-800 rounded-xl shadow-2xl z-20 hidden border border-gray-600 overflow-hidden">
                <button onclick="updateOrderStatus('${venda.id}', 'Em Preparação')" class="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-yellow-400 hover:bg-neutral-700 transition-colors">
                  <i class="fa fa-hourglass-half w-4"></i> Em Preparação
                </button>
                <button onclick="updateOrderStatus('${venda.id}', 'Saiu para Entrega')" class="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-indigo-400 hover:bg-neutral-700 transition-colors">
                  <i class="fa fa-motorcycle w-4"></i> Saiu para Entrega
                </button>
                <button onclick="updateOrderStatus('${venda.id}', 'Entregue')" class="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-green-400 hover:bg-neutral-700 transition-colors">
                  <i class="fa fa-check-circle w-4"></i> Entregue
                </button>
                <div class="border-t border-gray-600"></div>
                <button onclick="updateOrderStatus('${venda.id}', 'Cancelado')" class="flex items-center gap-3 w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-neutral-700 transition-colors">
                  <i class="fa fa-times-circle w-4"></i> Cancelar
                </button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderizarPaginacaoGenerica('historico', db.vendas.length, totalPaginas, historicoVendasPage);
}

// Atualiza o status do pedido
async function updateOrderStatus(id, newStatus) {
  try {
    await dbFirestore.collection('vendas').doc(id).update({
      status: newStatus
    });
    const vendaAtual = db.vendas.find(v => v.id === id);
    if (vendaAtual) {
      vendaAtual.status = newStatus;
    }
    renderHistoricoVendas();
    renderDashboard();

    registrarLog('status', 'venda', id,
      `Status do pedido #${numeroExibicao(vendaAtual)} alterado para "${newStatus}"`, { status: newStatus });
    showToast(`Status do pedido #${numeroExibicao(vendaAtual)} atualizado`, "success");
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    showToast("Erro ao atualizar status: " + error.message, "error");
  }
}


/* ================= DASHBOARD E GRÁFICOS ================= */
let vendasChartInstance = null;
let produtosChartInstance = null;
let dashboardSalesChartInstance = null;
let boardFilter = 'todos';
let boardPage = 1;
const PEDIDOS_POR_PAGINA = 8;

/* ===== PAGINAÇÃO (Histórico de Vendas e Relatórios) ===== */
const REGISTROS_POR_PAGINA = 10;
const REGISTROS_POR_PAGINA_VENDA = 9;
const LIMITE_SELECT_CLIENTES = 20;
let historicoVendasPage = 1;
let relVendasPage = 1;
let relEstoquePage = 1;
let relEntradasPage = 1;
let relClientesPage = 1;
let relFornecedoresPage = 1;
let relCaixaPage = 1;
let relCaixaLancPage = 1;
let estoquePage = 1;
let vendaProdutosPage = 1;
let selectClientesPage = 1;
let selectProdutosEntradaPage = 1;
let historicoCaixasPage = 1;

function renderizarPaginacaoGenerica(prefixo, total, totalPaginas, pagina) {
  const pag = document.getElementById(`${prefixo}-pagination`);
  if (!pag) return;
  pag.style.display = totalPaginas > 1 ? 'flex' : 'none';
  const info = document.getElementById(`${prefixo}-page-info`);
  if (info) info.textContent = `Página ${pagina} de ${totalPaginas} · ${total} registro(s)`;
  const ant = document.getElementById(`${prefixo}-pagina-anterior`);
  const prox = document.getElementById(`${prefixo}-pagina-proxima`);
  if (ant) ant.disabled = pagina <= 1;
  if (prox) prox.disabled = pagina >= totalPaginas;
}

function mudarPaginaHistorico(delta) {
  historicoVendasPage = Math.max(1, historicoVendasPage + delta);
  renderHistoricoVendas();
}

function mudarPaginaHistoricoCaixas(delta) {
  historicoCaixasPage = Math.max(1, historicoCaixasPage + delta);
  renderizarHistoricoCaixas();
}

function mudarPaginaRelVendas(delta) {
  relVendasPage = Math.max(1, relVendasPage + delta);
  renderVendasRelPagina();
}

function mudarPaginaRelEstoque(delta) {
  relEstoquePage = Math.max(1, relEstoquePage + delta);
  renderRelEstoquePagina();
}

function mudarPaginaRelCaixa(delta) {
  relCaixaPage = Math.max(1, relCaixaPage + delta);
  renderCaixaRelPagina();
}

function mudarPaginaRelCaixaLanc(delta) {
  relCaixaLancPage = Math.max(1, relCaixaLancPage + delta);
  renderLancamentosRelCaixa();
}

function renderDashboard() {
  // Chamada de funções de renderização que atualizam dados do dashboard

  // 1. Atualizar cards de resumo
  const totalVendas = db.vendas.reduce((acc, venda) => acc + (venda.total || 0), 0);
  const elVendasTotal = document.getElementById('dash-vendas-total');
  if (elVendasTotal) elVendasTotal.textContent = formatarMoeda(totalVendas);

  // 2. Relatórios e board
  renderRelatorios();
  renderOrderBoard();
  renderNotificacoes();
  renderDashboardSummary();
  renderDashboardSalesChart();
  renderPaymentSummary();
}

function initChart() {
  const ctx = document.getElementById('vendasChart')?.getContext('2d');
  if (!ctx) return;

  const dataMap = {};
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toLocaleDateString('pt-BR');
    dataMap[dateStr] = 0;
  }

  db.vendas.forEach(venda => {
    const dataVenda = dataDaVenda(venda).toLocaleDateString('pt-BR');
    if (dataMap.hasOwnProperty(dataVenda)) {
      dataMap[dataVenda] += venda.total;
    }
  });

  const labels = Object.keys(dataMap);
  const data = Object.values(dataMap);

  vendasChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Vendas Diárias (R$)',
        data: data,
        backgroundColor: 'rgba(22, 119, 255, 0.16)',
        borderColor: '#1677ff',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // CORREÇÃO APLICADA
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'white',
            callback: function (value) {
              return 'R$ ' + value.toFixed(2);
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: 'white'
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: 'white'
          }
        }
      }
    }
  });
}

function initProdutosChart() {
  const ctx = document.getElementById('produtosChart')?.getContext('2d');
  if (!ctx) return;

  const produtoVendas = {};
  db.vendas.forEach(venda => {
    venda.itens.forEach(item => {
      produtoVendas[item.nome] = (produtoVendas[item.nome] || 0) + item.qtdCarrinho;
    });
  });

  const sortedProdutos = Object.entries(produtoVendas)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5); // Top 5

  const labels = sortedProdutos.map(([nome]) => nome);
  const data = sortedProdutos.map(([, qtd]) => qtd);

  produtosChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Unidades Vendidas',
        data: data,
        backgroundColor: [
          '#1677ff',
          '#4595ff',
          '#76b2ff',
          '#2b6fc7',
          '#9ac8ff'
        ],
        borderColor: 'white',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // CORREÇÃO APLICADA
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'white',
            precision: 0
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: 'white'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}



// Funcionalidade de IA desativada/removida temporariamente.



/* ================= MODAL DE DETALHES E IMPRESSÃO ================= */
let pedidoAtualIdModal = null;

function abrirModalDetalhes(id) {
  const venda = db.vendas.find(v => v.id === id);
  if (!venda) return;

  pedidoAtualIdModal = id;

  const modal = document.getElementById('modalDetalhesPedido');
  if (!modal) return;

  // Preencher dados
  document.getElementById('modal-pedido-id').textContent = '#' + numeroExibicao(venda);
  document.getElementById('modal-pedido-data').textContent = venda.data;
  document.getElementById('modal-pedido-status').textContent = venda.status;

  // Cores do status
  const elStatus = document.getElementById('modal-pedido-status');
  if (venda.status === 'Cancelado') elStatus.className = 'font-bold text-lg text-red-500';
  else if (venda.status === 'Entregue') elStatus.className = 'font-bold text-lg text-green-500';
  else elStatus.className = 'font-bold text-lg text-amber-500';

  // Dados do Cliente
  document.getElementById('modal-cliente-nome').textContent = venda.clienteNome || 'Cliente Balcão';

  // Tentar buscar endereço completo se tiver clienteId, senão tenta pegar do objeto venda se foi salvo (versões futuras)
  // Por enquanto, mostra genérico se não tiver cliente vinculado
  let enderecoCompleto = 'Retirada / Balcão';
  if (venda.clienteId) {
    const cliente = db.clientes.find(c => c.id === venda.clienteId);
    if (cliente) {
      enderecoCompleto = `${cliente.endereco || ''}, ${cliente.numero || ''} - ${cliente.cep || ''}`;
    }
  }
  document.getElementById('modal-cliente-endereco').textContent = enderecoCompleto;

  // Itens
  const tbody = document.getElementById('modal-itens-lista');
  tbody.innerHTML = venda.itens.map(item => `
    <tr>
       <td class="p-3 font-bold text-white">${item.qtdCarrinho}x</td>
       <td class="p-3">${item.nome}</td>
       <td class="p-3 text-right text-gray-300 font-mono">${formatarMoeda(item.preco * item.qtdCarrinho)}</td>
    </tr>
  `).join('');

  document.getElementById('modal-pedido-total').textContent = formatarMoeda(venda.total);

  // Mostrar modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function fecharModalDetalhes() {
  const modal = document.getElementById('modalDetalhesPedido');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  pedidoAtualIdModal = null;
}

function imprimirComandaAtual() {
  if (!pedidoAtualIdModal) return;
  const venda = db.vendas.find(v => v.id === pedidoAtualIdModal);
  if (!venda) return;

  const width = 300;
  const height = 600;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const janelaImpressao = window.open('', 'Imprimir Comanda', `width=${width},height=${height},top=${top},left=${left}`);
  if (!janelaImpressao) {
    return showToast('Por favor, permita popups no navegador para imprimir.', 'warning');
  }

  const itensHtml = venda.itens.map(item => `
    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
      <span>${item.qtdCarrinho}x ${item.nome}</span>
      <span>${formatarMoeda(item.preco * item.qtdCarrinho)}</span>
    </div>
  `).join('');

  const conteudo = `
    <html>
      <head>
        <title>Comanda - Pedido #${numeroExibicao(venda)}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; width: 100%; box-sizing: border-box; }
          .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
          .header h2 { margin: 0; font-size: 16px; font-weight: bold; }
          .info { margin-bottom: 10px; }
          .itens { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
          .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 10px; }
          .footer { text-align: center; margin-top: 20px; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${escapeDashboard(nomeLoja)}</h2>
          <p>Pedido #${numeroExibicao(venda)}<br>${venda.data}</p>
        </div>
        
        <div class="info">
          <strong>Cliente:</strong> ${venda.clienteNome}<br>
          <strong>Status:</strong> ${venda.status}
        </div>

        <div class="itens">
          ${itensHtml}
        </div>

        <div class="total">
          TOTAL: ${formatarMoeda(venda.total)}
        </div>
        
        <script>
           window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `;

  janelaImpressao.document.write(conteudo);
  janelaImpressao.document.close();
}

function imprimirComprovanteAtual() {
  if (!pedidoAtualIdModal) return;
  const venda = db.vendas.find(v => v.id === pedidoAtualIdModal);
  if (!venda) return;

  const width = 300;
  const height = 600;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const janelaImpressao = window.open('', 'Imprimir Comprovante', `width=${width},height=${height},top=${top},left=${left}`);
  if (!janelaImpressao) {
    return showToast('Por favor, permita popups no navegador para imprimir.', 'warning');
  }

  const itensHtml = venda.itens.map(item => `
    <tr>
      <td>${item.qtdCarrinho}x ${item.nome}</td>
      <td style="text-align:right">${formatarMoeda(item.preco * item.qtdCarrinho)}</td>
    </tr>
  `).join('');

  const clienteObj = venda.clienteId ? db.clientes.find(c => c.id === venda.clienteId) : null;
  const enderecoFinal = venda.clienteEndereco || (clienteObj ? `${clienteObj.endereco || ''}, ${clienteObj.numero || ''}` : (Array.isArray(venda.itens) && venda.itens[0]?._clienteEndereco ? venda.itens[0]._clienteEndereco : ''));
  const telFinal = venda.clienteTel || (clienteObj ? (clienteObj.tel || clienteObj.telefone || '') : (Array.isArray(venda.itens) && venda.itens[0]?._clienteTel ? venda.itens[0]._clienteTel : ''));

  const conteudo = `
    <html>
      <head>
        <title>Comprovante - Pedido #${numeroExibicao(venda)}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; max-width: 300px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .logo { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
          .info { font-size: 12px; margin-bottom: 5px; }
          table { width: 100%; font-size: 12px; margin-bottom: 10px; }
          .total { font-size: 16px; font-weight: bold; text-align: right; margin-top: 10px; border-top: 1px dashed #000; padding-top: 10px; }
          .footer { text-align: center; font-size: 10px; margin-top: 20px; border-top: 1px dashed #000; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">${escapeDashboard(nomeLoja)}</div>
          <div class="info">Pedido #${numeroExibicao(venda)}</div>
          <div class="info">${venda.data}</div>
          <div class="info">Status: ${venda.status || 'Pendente'}</div>
        </div>
        
        <div class="info">
          <strong>Cliente:</strong> ${venda.clienteNome}<br>
          <strong>Tel:</strong> ${telFinal}<br>
          <strong>Endereço:</strong> ${enderecoFinal}<br>
          <strong>Forma de Pagamento:</strong> ${venda.formaPagamento || 'Não informada'}
        </div>

        <br>
        
        <table>
          ${itensHtml}
        </table>

        <div class="total">
          TOTAL: ${formatarMoeda(venda.total)}
        </div>

        <div class="footer">
          Obrigado pela preferência!
        </div>
        
        <script>
           window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `;

  janelaImpressao.document.write(conteudo);
  janelaImpressao.document.close();
}

/* ================= DROPDOWN DE STATUS (MODERNO) ================= */
function toggleDropdown(event, vendaId) {
  event.stopPropagation();
  const dropdown = document.getElementById(`dropdown-${vendaId}`);
  const isOpen = !dropdown.classList.contains('hidden');

  document.querySelectorAll('.status-dropdown').forEach(el => el.classList.add('hidden'));

  if (!isOpen) {
    dropdown.classList.remove('hidden');
  }
}

document.addEventListener('click', () => {
  document.querySelectorAll('.status-dropdown').forEach(el => el.classList.add('hidden'));
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.add('hidden');
});

function atualizarAvatarAdmin(user) {
  renderAvatarAtual(user);
}

/* ================= PERFIL / CONTA ================= */
function renderAvatarAtual(user, srcOverride = '') {
  const uid = user && user.uid;
  const reg = uid ? (db.usuarios || []).find(u => u.id === uid) : null;
  const nome = (reg && reg.nome) || (user && user.displayName) || '';
  const email = (user && user.email) || '';
  const fotoDoc = (reg && reg.photoURL) || '';
  const src = srcOverride || fotoDoc || (user && user.photoURL) || '';
  const els = [document.getElementById('admin-avatar'), document.getElementById('config-avatar')];
  els.forEach(el => {
    if (!el) return;
    el.innerHTML = src
      ? `<img src="${src}" alt="${nome || 'Perfil'}" class="w-full h-full object-cover rounded-full">`
      : '<i class="fas fa-user"></i>';
  });
  const nomeEl = document.getElementById('admin-avatar-nome');
  if (nomeEl) {
    if (nome || email) {
      nomeEl.textContent = nome || email;
      nomeEl.title = nome ? `${nome}${email ? ' (' + email + ')' : ''}` : email;
      nomeEl.classList.remove('hidden');
    } else {
      nomeEl.classList.add('hidden');
    }
  }
}

function previewFotoPerfil() {
  const url = (document.getElementById('config-perfil-foto-url') || {}).value;
  renderAvatarAtual(auth.currentUser, url ? url.trim() : '');
}

function carregarPerfilNoConfig() {
  const user = auth.currentUser;
  const reg = user ? (db.usuarios || []).find(u => u.id === user.uid) : null;
  const nome = document.getElementById('config-perfil-nome');
  const email = document.getElementById('config-perfil-email');
  const foto = document.getElementById('config-perfil-foto-url');
  if (nome) nome.value = (reg && reg.nome) || (user && user.displayName) || '';
  if (email) email.value = (user && user.email) || '';
  if (foto) foto.value = (reg && reg.photoURL) || (user && user.photoURL) || '';
  renderAvatarAtual(user);
  atualizarVisibilidadeCardsPerfil();
  renderListaFuncionarios();
  renderizarControleAcesso();
  aplicarRestricoesNav();
}

function aplicarRestricoesNav() {
  const user = auth.currentUser;
  if (!user) return;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const id = btn.id.replace('btn-', '');
    if (id && !podeAcessarModulo(id)) {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
  });
}

async function uploadFotoPerfil(event) {
  const file = event.target.files[0];
  const user = auth.currentUser;
  if (!file || !user) return;
  if (typeof firebase.storage === 'undefined') {
    return showToast('Upload de foto não disponível. Cole a URL da imagem no campo abaixo.', "error");
  }
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const ref = firebase.storage().ref(`perfis/${user.uid}/avatar.${ext}`);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    document.getElementById('config-perfil-foto-url').value = url;
    previewFotoPerfil();
  } catch (error) {
    console.error("Erro no upload:", error);
    showToast("Não foi possível enviar a foto: " + error.message, "error");
  }
}

async function salvarPerfil() {
  const user = auth.currentUser;
  if (!user) return showToast("Nenhum usuário logado.", "error");
  const nome = document.getElementById('config-perfil-nome').value.trim();
  const email = document.getElementById('config-perfil-email').value.trim();
  const fotoUrl = document.getElementById('config-perfil-foto-url').value.trim();
  const statusEl = document.getElementById('config-perfil-status');
  try {
    if (email && email !== user.email) {
      await user.verifyBeforeUpdateEmail(email);
      showToast(`E-mail de confirmação enviado para ${email}. Após confirmar, o login passa a usar o novo e-mail.`, "success");
    }
    await user.updateProfile({ displayName: nome || null, photoURL: fotoUrl || null });
    await dbFirestore.collection('usuarios').doc(user.uid).set({
      email: email || user.email || '',
      nome: nome || '',
      photoURL: fotoUrl || ''
    }, { merge: true });
    registrarLog('editar', 'perfil', user.uid, `Perfil "${nome || email}" atualizado`, { nome, email });
    renderAvatarAtual(user, fotoUrl); // reflete imediatamente; o snapshot mantém depois
    statusEl.textContent = 'Perfil atualizado!';
    statusEl.classList.remove('hidden');
    setTimeout(() => statusEl.classList.add('hidden'), 3000);
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    showToast("Erro ao salvar perfil: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

// Envia e-mail de redefinição de senha para a PRÓPRIA conta logada.
async function enviarResetSenhaProprio() {
  const user = auth.currentUser;
  if (!user) return showToast("Nenhum usuário logado.", "error");
  const email = user.email;
  if (!email) return showToast("Conta sem e-mail para envio do reset.", "error");
  try {
    await auth.sendPasswordResetEmail(email);
    showToast(`E-mail de redefinição de senha enviado para ${email}.nVerifique também a caixa de spam/lixeira.`, "success");
  } catch (error) {
    console.error("Erro ao enviar reset de senha:", error);
    showToast("Erro ao enviar reset: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

/* ====== FUNCIONÁRIOS (somente administrador) ====== */
// Hash SHA-256 da senha master usada para se tornar administrador.
// Armazenamos apenas o hash (nunca o texto) para não expor a senha em claro.
const SENHA_MASTER_HASH = '88ca1ef5963796f7c61f1b26f9f5e6113222f23e0f62d3d0e6fc779967d102ea';

function ehAdministrador() {
  const user = auth.currentUser;
  if (!user) return false;
  const registro = (db.usuarios || []).find(u => u.id === user.uid);
  return !!(registro && registro.role === 'admin');
}

async function hashSenha(texto) {
  const data = new TextEncoder().encode(texto);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mostra/oculta os cartões de perfil: Funcionários (admin) e Senha Master (não-admin).
function atualizarVisibilidadeCardsPerfil() {
  const isAdmin = ehAdministrador();
  const cardFuncionarios = document.getElementById('config-funcionarios-card');
  const cardMaster = document.getElementById('config-master-card');
  if (cardFuncionarios) cardFuncionarios.classList.toggle('hidden', !isAdmin);
  if (cardMaster) cardMaster.classList.toggle('hidden', isAdmin);
}

async function promoverParaAdmin() {
  const user = auth.currentUser;
  if (!user) return showToast("Nenhum usuário logado.", "error");
  const senha = document.getElementById('perfil-senha-master').value;
  if (!senha) return showToast("Digite a senha master.", "error");
  let hash;
  try {
    hash = await hashSenha(senha);
  } catch (error) {
    return showToast("Gerenciador de hash indisponível neste contexto.", "error");
  }
  if (hash !== SENHA_MASTER_HASH) {
    return showToast("Senha master incorreta.", "error");
  }
  try {
    await dbFirestore.collection('usuarios').doc(user.uid).set({ role: 'admin' }, { merge: true });
    registrarLog('promover', 'perfil', user.uid, `Perfil "${user.email || user.uid}" promovido a administrador`, { role: 'admin' });
    document.getElementById('perfil-senha-master').value = '';
    const status = document.getElementById('config-master-status');
    if (status) {
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 3000);
    }
    showToast("Você agora é administrador!", "success");
    atualizarVisibilidadeCardsPerfil();
    renderListaFuncionarios();
  } catch (error) {
    console.error("Erro ao promover a admin:", error);
    showToast("Erro ao tornar-se admin: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

function pedidosDoFuncionario(uid) {
  return db.vendas.filter(v => v.userId === uid).length;
}

function renderListaFuncionarios() {
  const lista = document.getElementById('lista-funcionarios');
  if (!lista) return;
  atualizarVisibilidadeCardsPerfil();
  if (!ehAdministrador()) {
    lista.innerHTML = '';
    return;
  }
  lista.innerHTML = db.usuarios.map(u => {
    const nome = escapeDashboard(u.nome || '');
    const email = escapeDashboard(u.email || '');
    const foto = escapeDashboard(u.photoURL || '');
    const ehProprio = u.id === auth.currentUser.uid;
    const ehAdmin = u.role === 'admin';
    const bloqueado = u.bloqueado === true;
    const pedidos = pedidosDoFuncionario(u.id);
    const possoGestao = !ehProprio && !ehAdmin; // só funcionários que não são eu
    return `
      <div class="border ${bloqueado ? 'border-red-500/60' : 'border-gray-700'} rounded-lg p-3 space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-neutral-600 flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
            ${foto ? `<img src="${foto}" class="w-full h-full object-cover rounded-full" alt="${nome}">` : '<i class="fas fa-user"></i>'}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold ${bloqueado ? 'text-red-400' : 'text-white'} truncate">
              ${nome}${ehProprio ? ' <span class="text-xs text-amber-400">(você)</span>' : ''}${bloqueado ? ' <span class="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-semibold">BLOQUEADO</span>' : ''}
            </p>
            <p class="text-xs text-gray-400 truncate">${email}</p>
            <p class="text-xs ${pedidos > 0 ? 'text-gray-400' : 'text-gray-500'}">${pedidos} pedido(s) no sistema</p>
          </div>
          <select id="func-role-${u.id}" ${ehProprio ? 'disabled' : ''} class="text-xs bg-neutral-700 text-gray-200 rounded-lg px-2 py-1 border border-gray-600">
            <option value="funcionario" ${u.role === 'funcionario' ? 'selected' : ''}>Funcionário</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input id="func-nome-${u.id}" class="input-field" value="${nome}" placeholder="Nome">
          <input id="func-foto-${u.id}" class="input-field" value="${foto}" placeholder="URL da foto">
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="salvarFuncionario('${u.id}')"
            class="bg-amber-500 hover:bg-amber-400 text-neutral-900 font-bold px-4 py-2 rounded-lg transition-colors text-sm">
            SALVAR
          </button>
          <button onclick="enviarResetSenhaFuncionario('${email}')"
            class="bg-neutral-700 hover:bg-neutral-600 text-gray-200 font-bold px-4 py-2 rounded-lg transition-colors text-sm">
            <i class="fa fa-key"></i> Reset senha (e-mail)
          </button>
          ${possoGestao ? `
            <button onclick="bloquearFuncionario('${u.id}', ${bloqueado ? 'false' : 'true'})"
              class="${bloqueado ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-neutral-700 hover:bg-neutral-600'} text-white font-bold px-4 py-2 rounded-lg transition-colors text-sm">
              <i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i> ${bloqueado ? 'LIBERAR' : 'BLOQUEAR'}
            </button>
            ${pedidos > 0
          ? `<span class="text-xs text-gray-500 self-center"><i class="fa fa-shield-alt"></i> Com pedidos, só pode ser bloqueado.</span>`
          : `<button onclick="excluirFuncionario('${u.id}')"
                   class="bg-red-600/80 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg transition-colors text-sm">
                   <i class="fa fa-trash"></i> EXCLUIR
                 </button>`}
          ` : ''}
        </div>
      </div>`;
  }).join('');
}

async function salvarFuncionario(uid) {
  if (!ehAdministrador()) return;
  const nome = document.getElementById(`func-nome-${uid}`).value.trim();
  const foto = document.getElementById(`func-foto-${uid}`).value.trim();
  const role = document.getElementById(`func-role-${uid}`).value;
  const atual = db.usuarios.find(u => u.id === uid);
  const adminCount = db.usuarios.filter(u => u.role === 'admin').length;
  if (atual && atual.role === 'admin' && role !== 'admin' && adminCount <= 1) {
    return showToast('Não é possível rebaixar o último administrador do sistema.', "error");
  }
  try {
    await dbFirestore.collection('usuarios').doc(uid).update({
      nome, photoURL: foto, role,
      ...(role === 'admin' ? { bloqueado: false } : {}) // admins não podem ser bloqueados
    });
    registrarLog('editar', 'usuario', uid, `Funcionário "${nome}" atualizado (papel: ${role})`, { nome, role });
    const status = document.getElementById('config-funcionarios-status');
    if (status) {
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 3000);
    }
  } catch (error) {
    console.error("Erro ao salvar funcionário:", error);
    showToast("Erro ao salvar funcionário: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

// Envia e-mail de redefinição de senha para o FUNCIONÁRIO (somente ADMIN).
async function enviarResetSenhaFuncionario(email) {
  if (!ehAdministrador()) return;
  if (!email) return showToast("Funcionário sem e-mail cadastrado.", "error");
  try {
    await auth.sendPasswordResetEmail(email);
    showToast(`E-mail de redefinição de senha enviado para ${email}.nVerifique também a caixa de spam/lixeira.`, "success");
  } catch (error) {
    console.error("Erro ao enviar reset de senha:", error);
    showToast("Erro ao enviar reset: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

// Bloqueia ou libera o acesso de um funcionário (somente ADMIN).
async function bloquearFuncionario(uid, bloquear) {
  if (!ehAdministrador()) return;
  const u = db.usuarios.find(x => x.id === uid);
  if (!u) return;
  if (u.id === auth.currentUser.uid) return showToast("Você não pode bloquear a sua própria conta.", "error");
  if (u.role !== 'funcionario') return showToast("Apenas perfis de funcionário podem ser bloqueados.", "error");
  const nome = u.nome || u.email || 'Funcionário';
  try {
    await dbFirestore.collection('usuarios').doc(uid).update({ bloqueado: !!bloquear });
    registrarLog(bloquear ? 'bloquear' : 'desbloquear', 'usuario', uid,
      `Acesso do funcionário "${nome}" ${bloquear ? 'bloqueado' : 'liberado'}`);
    showToast(bloquear ? `${nome} bloqueado. O acesso dele ao painel foi revogado.` : `Acesso do ${nome} liberado novamente.`, "success");
  } catch (error) {
    console.error("Erro ao alterar bloqueio:", error);
    showToast("Erro ao alterar bloqueio: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

// Exclui a conta de um funcionário (somente ADMIN) — permitido apenas para perfis
// SEM movimentação (nenhum pedido registrado com o seu userId). Com pedidos, só bloqueio.
async function excluirFuncionario(uid) {
  if (!ehAdministrador()) return;
  const u = db.usuarios.find(x => x.id === uid);
  if (!u) return;
  if (u.id === auth.currentUser.uid) return showToast("Você não pode excluir a sua própria conta.", "error");
  if (u.role !== 'funcionario') return showToast("Apenas perfis de funcionário podem ser excluídos.", "error");
  const pedidos = pedidosDoFuncionario(uid);
  if (pedidos > 0) {
    return showToast(`Este funcionário possui ${pedidos} pedido(s) no sistema e não pode ser exclu�`, "success");
  }
  const nome = u.nome || u.email || 'Funcionário';
  if (!confirm(`Excluir definitivamente o perfil de ${nome} (${u.email})? Essa ação não pode ser desfeita e ele perderá o acesso ao painel.`)) return;
  try {
    await dbFirestore.collection('usuarios').doc(uid).delete();
    registrarLog('excluir', 'usuario', uid, `Perfil do funcionário "${nome}" excluído`, { email: u.email || '' });
    showToast(`Perfil de ${nome} exclu�`, "success");
  } catch (error) {
    console.error("Erro ao excluir funcionário:", error);
    showToast("Erro ao excluir: " + error.message.replace("Firebase: Error ", ""), "error");
  }
}

/* ================= CONTROLE DE ACESSO POR MÓDULO ================= */
const MODULOS_SISTEMA = [
  { id: 'dashboard', nome: 'Dashboard', icon: 'fa-home' },
  { id: 'venda', nome: 'Venda Rápida', icon: 'fa-cash-register' },
  { id: 'vendas', nome: 'Pedidos', icon: 'fa-list-alt' },
  { id: 'cadastros', nome: 'Cadastros', icon: 'fa-address-card' },
  { id: 'entradas', nome: 'Entradas', icon: 'fa-truck-ramp-box' },
  { id: 'contas', nome: 'Contas a Pagar', icon: 'fa-money-bill-wave' },
  { id: 'caixa', nome: 'Caixa', icon: 'fa-wallet' },
  { id: 'relatorios', nome: 'Relatórios', icon: 'fa-chart-bar' },
  { id: 'config', nome: 'Configurações', icon: 'fa-cog' }
];

function modulosPermitidos(usuario) {
  if (!usuario || usuario.role === 'admin') return MODULOS_SISTEMA.map(m => m.id);
  return Array.isArray(usuario.modulos) && usuario.modulos.length > 0
    ? usuario.modulos
    : MODULOS_SISTEMA.map(m => m.id);
}

function podeAcessarModulo(moduloId) {
  const user = auth.currentUser;
  if (!user) return false;
  const registro = (db.usuarios || []).find(u => u.id === user.uid);
  if (!registro || registro.role === 'admin') return true;
  if (registro.bloqueado) return false;
  return modulosPermitidos(registro).includes(moduloId);
}

function renderizarControleAcesso() {
  atualizarVisibilidadeAcessos();
  if (!ehAdministrador()) return;
  const select = document.getElementById('select-acesso-funcionario');
  if (!select) return;
  const valorAtual = select.value;
  const funcionarios = (db.usuarios || []).filter(u => u.role === 'funcionario');
  select.innerHTML = '<option value="">Selecione um funcionário...</option>' +
    funcionarios.map(u => `<option value="${u.id}">${escapeDashboard(u.nome || u.email || 'Funcionário')}</option>`).join('');
  if (valorAtual) select.value = valorAtual;
}

function carregarAcessosFuncionario() {
  const select = document.getElementById('select-acesso-funcionario');
  const container = document.getElementById('acessos-modulos-container');
  const togglesDiv = document.getElementById('acessos-toggles');
  if (!select || !container || !togglesDiv) return;
  const uid = select.value;
  if (!uid) { container.classList.add('hidden'); return; }
  const u = (db.usuarios || []).find(x => x.id === uid);
  if (!u) { container.classList.add('hidden'); return; }
  const modulos = modulosPermitidos(u);
  togglesDiv.innerHTML = MODULOS_SISTEMA.map(m => {
    const checked = modulos.includes(m.id) ? 'checked' : '';
    return `<label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
      <input type="checkbox" value="${m.id}" ${checked}
        class="acesso-toggle w-4 h-4 rounded border-gray-600 text-amber-500 focus:ring-amber-500 bg-neutral-700 cursor-pointer">
      <i class="fa ${m.icon} text-amber-500 w-5 text-center"></i> ${m.nome}
    </label>`;
  }).join('');
  container.classList.remove('hidden');
}

async function salvarAcessosModulo() {
  if (!ehAdministrador()) return;
  const select = document.getElementById('select-acesso-funcionario');
  const uid = select ? select.value : '';
  if (!uid) return showToast('Selecione um funcionário.', "error");
  const toggles = document.querySelectorAll('#acessos-toggles .acesso-toggle');
  const modulos = [];
  toggles.forEach(t => { if (t.checked) modulos.push(t.value); });
  const u = (db.usuarios || []).find(x => x.id === uid);
  const nome = u ? (u.nome || u.email || 'Funcionário') : uid;
  try {
    await dbFirestore.collection('usuarios').doc(uid).update({ modulos });
    if (u) u.modulos = modulos;
    registrarLog('editar', 'usuario', uid, `Acessos de módulos atualizados para "${nome}"`, { modulos });
    const status = document.getElementById('config-acessos-status');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
    aplicarRestricoesNav();
  } catch (err) {
    console.error('Erro ao salvar acessos:', err);
    showToast('Erro ao salvar acessos: ' + err.message, "error");
  }
}

function atualizarVisibilidadeAcessos() {
  const card = document.getElementById('config-acessos-card');
  if (card) card.classList.toggle('hidden', !ehAdministrador());
}

function normalizarStatus(status = '') {
  const value = status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (value.includes('cancel')) return 'cancelados';
  if (value.includes('saiu')) return 'saiu';
  if (value.includes('entreg') || value.includes('conclu')) return 'entregues';
  if (value.includes('preparo') || value.includes('preparacao')) return 'preparo';
  return 'novos';
}

function statusVisual(status) {
  const type = normalizarStatus(status);
  if (type === 'preparo') return { label: 'Em preparo', className: 'status-preparing' };
  if (type === 'saiu') return { label: 'Saiu para Entrega', className: 'status-ready' };
  if (type === 'entregues') return { label: 'Entregue', className: 'status-delivered' };
  if (type === 'cancelados') return { label: 'Cancelado', className: 'status-cancelled' };
  return { label: 'Novo', className: 'status-new' };
}

function dataDaVenda(venda) {
  const parsed = new Date(venda.dataIso || venda.data || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function escapeDashboard(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function imagemDoItem(item) {
  if (item.imagem) return item.imagem;
  const produto = db.estoque.find(prod => prod.id === item.id || prod.nome === item.nome);
  return produto?.imagem || '';
}

function filtrarPedidosBoard(filtro) {
  if (filtro) boardFilter = filtro;
  boardPage = 1;
  document.querySelectorAll('.board-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filtro === boardFilter));
  renderOrderBoard();
}

function renderOrderBoard() {
  const list = document.getElementById('board-list');
  if (!list) return;
  const search = (document.getElementById('busca-pedido')?.value || '').trim().toLowerCase();
  const counts = { novos: 0, preparo: 0, saiu: 0, entregues: 0 };
  db.vendas.forEach(venda => {
    const type = normalizarStatus(venda.status);
    if (counts[type] !== undefined) counts[type] += 1;
  });
  Object.entries(counts).forEach(([key, count]) => {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = count;
  });
  const vendas = [...db.vendas]
    .sort((a, b) => dataDaVenda(b) - dataDaVenda(a))
    .filter(venda => boardFilter === 'todos' || normalizarStatus(venda.status) === boardFilter)
    .filter(venda => !search ||
      `${venda.id} ${numeroExibicao(venda)} #${numeroExibicao(venda)} ${venda.clienteNome || ''} ${(venda.itens || []).map(i => i.nome).join(' ')}`.toLowerCase().includes(search));

  const totalPaginas = Math.max(1, Math.ceil(vendas.length / PEDIDOS_POR_PAGINA));
  if (boardPage > totalPaginas) boardPage = totalPaginas;

  if (!vendas.length) {
    list.innerHTML = '<div class="empty-board"><i class="far fa-clipboard"></i><p>Nenhum pedido encontrado.</p></div>';
    renderizarPaginacao(0, 1);
    return;
  }
  const inicio = (boardPage - 1) * PEDIDOS_POR_PAGINA;
  list.innerHTML = vendas.slice(inicio, inicio + PEDIDOS_POR_PAGINA).map(venda => {
    const status = statusVisual(venda.status);
    const date = dataDaVenda(venda);
    const time = date.getTime() ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const ehHoje = date.toDateString() === new Date().toDateString();
    const quando = ehHoje ? `Hoje, ${time}` : `${date.toLocaleDateString('pt-BR')}, ${time}`;
    const temEndereco = Boolean(venda.clienteEndereco || venda.endereco || (Array.isArray(venda.itens) && venda.itens[0]?._clienteEndereco) || (venda.clienteId && db.clientes.find(c => c.id === venda.clienteId)?.endereco));
    const delivery = temEndereco ? 'Delivery' : 'Retirada';
    const itens = venda.itens || [];
    const thumbs = itens.slice(0, 3).map(item => {
      const image = imagemDoItem(item);
      return `<div class="order-thumb" title="${escapeDashboard(item.nome)}">${image ? `<img src="${escapeDashboard(image)}" alt="${escapeDashboard(item.nome)}">` : '<i class="fas fa-utensils"></i>'}</div>`;
    }).join('');
    const more = itens.length > 3 ? `<div class="order-more">+${itens.length - 3}</div>` : '';
    return `<article class="order-card" onclick="abrirModalDetalhes('${venda.id}')">
      <div class="order-card-main">
        <h3 class="order-number">#${escapeDashboard(numeroExibicao(venda))}</h3>
        <p class="order-customer">${escapeDashboard(venda.clienteNome || 'Cliente balcão')}</p>
        <div class="order-meta-wrap">
          <div class="order-meta">
            <span><i class="fas ${delivery === 'Delivery' ? 'fa-truck-fast' : 'fa-store'}"></i>${delivery}</span>
            <span><i class="far fa-clock"></i>${quando}</span>
          </div>
          <div class="order-product-images">${thumbs}${more}</div>
        </div>
      </div>
      <div class="order-right">
        <span class="status-pill ${status.className}">${status.label}</span>
        <strong class="order-total">${formatarMoeda(venda.total || 0)}</strong>
      </div>
    </article>`;
  }).join('');
  renderizarPaginacao(vendas.length, totalPaginas);
}

function renderizarPaginacao(total, totalPaginas) {
  const pag = document.getElementById('board-pagination');
  if (!pag) return;
  if (totalPaginas <= 1) {
    pag.style.display = 'none';
    return;
  }
  pag.style.display = 'flex';
  const info = document.getElementById('board-page-info');
  const prev = document.getElementById('pagina-anterior');
  const next = document.getElementById('pagina-proxima');
  if (info) info.textContent = `Página ${boardPage} de ${totalPaginas} · ${total} pedido(s)`;
  if (prev) prev.disabled = boardPage <= 1;
  if (next) next.disabled = boardPage >= totalPaginas;
}

function mudarPagina(delta) {
  boardPage = Math.max(1, boardPage + delta);
  renderOrderBoard();
}

/* ===== NOTIFICAÇÕES (sino) ===== */
function ehPedidoNovo(venda) {
  return normalizarStatus(venda.status) === 'novos';
}

function renderNotificacoes() {
  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');
  const novos = [...db.vendas].filter(ehPedidoNovo).sort((a, b) => dataDaVenda(b) - dataDaVenda(a));
  if (badge) {
    badge.textContent = novos.length;
    badge.classList.toggle('hidden', novos.length === 0);
  }
  if (!list) return;
  list.innerHTML = novos.length
    ? novos.slice(0, 10).map(v => {
      const date = dataDaVenda(v);
      const time = date.getTime() ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      return `<div class="notif-item" onclick="abrirModalDetalhes('${v.id}'); fecharNotificacoes()">
          <span class="notif-number">#${escapeDashboard(numeroExibicao(v))}</span>
          <span class="notif-name">${escapeDashboard(v.clienteNome || 'Cliente balcão')}</span>
          <span class="notif-time">${time}</span>
        </div>`;
    }).join('')
    : '<div class="notif-empty">Nenhum pedido novo.</div>';
}

function toggleSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('sidebar-open');
  if (overlay) overlay.classList.toggle('active', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function toggleNotificacoes(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  renderNotificacoes();
  panel.classList.toggle('hidden');
}

function fecharNotificacoes() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.add('hidden');
}

function ehVendaCancelada(venda) {
  return normalizarStatus(venda.status) === 'cancelados';
}

function vendasDeHoje() {
  const today = new Date().toDateString();
  return db.vendas.filter(venda => {
    if (ehVendaCancelada(venda)) return false; // pedidos cancelados não entram nos resumos
    return dataDaVenda(venda).toDateString() === today;
  });
}

function dataCadastroDoCliente(c) {
  if (!c) return null;
  const raw = c.dataCadastro || c.data_cadastro || c.since;
  if (!raw) return null;
  if (typeof raw.toDate === 'function') return raw.toDate(); // Timestamp do Firestore
  if (raw instanceof Date) return raw;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function renderDashboardSummary() {
  const today = new Date().toDateString();
  const vendas = vendasDeHoje();
  const faturamento = vendas.reduce((sum, venda) => sum + Number(venda.total || 0), 0);
  // Novos clientes = cadastros realizados hoje (clientes com data de cadastro no dia atual)
  const novosClientes = db.clientes.filter(c => {
    const d = dataCadastroDoCliente(c);
    return d && d.toDateString() === today;
  }).length;
  const values = {
    'sum-pedidos': vendas.length,
    'sum-faturamento': formatarMoeda(faturamento),
    'sum-ticket': formatarMoeda(vendas.length ? faturamento / vendas.length : 0),
    'sum-clientes': novosClientes
  };
  Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
}

function renderDashboardSalesChart() {
  const canvas = document.getElementById('graficoVendasHoje');
  if (!canvas) return;
  if (dashboardSalesChartInstance) dashboardSalesChartInstance.destroy();
  const hourly = Array(25).fill(0);
  vendasDeHoje().forEach(venda => { hourly[dataDaVenda(venda).getHours()] += Number(venda.total || 0); });
  dashboardSalesChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, '0')}h`), datasets: [{ data: hourly, borderColor: '#197cff', backgroundColor: 'rgba(25,124,255,.18)', borderWidth: 2, tension: .35, fill: true, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(123,145,180,.08)' }, ticks: { color: '#7d899e', maxTicksLimit: 5 } }, y: { beginAtZero: true, grid: { color: 'rgba(123,145,180,.10)' }, ticks: { color: '#7d899e', maxTicksLimit: 4 } } } }
  });
}

function renderPaymentSummary() {
  const list = document.getElementById('lista-pagamento');
  if (!list) return;
  const groups = { Pix: 0, 'Cartão': 0, Dinheiro: 0, Outros: 0 };
  vendasDeHoje().forEach(venda => {
    const raw = String(venda.formaPagamento || venda.pagamento || '').toLowerCase();
    const key = raw.includes('pix') ? 'Pix' : raw.includes('cart') ? 'Cartão' : raw.includes('dinheiro') ? 'Dinheiro' : 'Outros';
    groups[key] += Number(venda.total || 0);
  });
  const total = Object.values(groups).reduce((sum, value) => sum + value, 0);
  list.innerHTML = Object.entries(groups).map(([label, value]) => {
    const percent = total ? Math.round((value / total) * 100) : 0;
    return `<div class="payment-row"><span>${label}</span><div class="payment-track"><div class="payment-fill" style="width:${percent}%"></div></div><span class="payment-value">${percent}%</span></div>`;
  }).join('');
}

/* ================= RELATÓRIOS ================= */
let estoqueRelFiltro = 'todos';
// Status dos produtos no relatório de estoque: 'todos' | 'liberados' | 'bloqueados'
let estoqueRelStatus = 'todos';
// Status dos clientes no relatório: 'todos' | 'liberados' | 'bloqueados'
let clientesRelStatus = 'todos';
// Status dos fornecedores no relatório: 'todos' | 'liberados' | 'bloqueados'
let fornecedoresRelStatus = 'todos';

function mostrarAbaRelatorio(aba) {
  document.getElementById('rel-vendas').classList.toggle('hidden', aba !== 'vendas');
  document.getElementById('rel-estoque').classList.toggle('hidden', aba !== 'estoque');
  document.getElementById('rel-entradas').classList.toggle('hidden', aba !== 'entradas');
  document.getElementById('rel-clientes').classList.toggle('hidden', aba !== 'clientes');
  document.getElementById('rel-fornecedores').classList.toggle('hidden', aba !== 'fornecedores');
  document.getElementById('rel-caixa').classList.toggle('hidden', aba !== 'caixa');
  document.getElementById('rel-contas').classList.toggle('hidden', aba !== 'contas');
  document.getElementById('aba-rel-estoque').classList.toggle('active', aba === 'estoque');
  document.getElementById('aba-rel-entradas').classList.toggle('active', aba === 'entradas');
  document.getElementById('aba-rel-clientes').classList.toggle('active', aba === 'clientes');
  document.getElementById('aba-rel-fornecedores').classList.toggle('active', aba === 'fornecedores');
  document.getElementById('aba-rel-caixa').classList.toggle('active', aba === 'caixa');
  document.getElementById('aba-rel-contas').classList.toggle('active', aba === 'contas');
}

function mostrarAbaConfig(aba) {
  document.getElementById('config-aba-estabelecimento').classList.toggle('hidden', aba !== 'estabelecimento');
  document.getElementById('config-aba-catalogo').classList.toggle('hidden', aba !== 'catalogo');
  document.getElementById('config-aba-aparencia').classList.toggle('hidden', aba !== 'aparencia');
  document.getElementById('config-aba-conta').classList.toggle('hidden', aba !== 'conta');
  document.getElementById('config-aba-log').classList.toggle('hidden', aba !== 'log');
  document.getElementById('aba-config-estabelecimento').classList.toggle('active', aba === 'estabelecimento');
  document.getElementById('aba-config-catalogo').classList.toggle('active', aba === 'catalogo');
  document.getElementById('aba-config-aparencia').classList.toggle('active', aba === 'aparencia');
  document.getElementById('aba-config-conta').classList.toggle('active', aba === 'conta');
  document.getElementById('aba-config-log').classList.toggle('active', aba === 'log');
  if (aba === 'log') {
    carregarUsuariosFiltroLog();
    renderizarLogOperacoes();
  }
}

/* ================= LOG DE OPERAÇÕES (TELA CONFIGURAÇÕES) ================= */
const LOG_POR_PAGINA = 10;
let logPage = 1;

// Mapa de rótulos e cores para as ações registradas.
function rotuloAcaoLog(acao) {
  const mapa = {
    incluir: { label: 'INCLUSÃO', cls: 'bg-emerald-500/20 text-emerald-400' },
    editar: { label: 'EDIÇÃO', cls: 'bg-blue-500/20 text-blue-400' },
    excluir: { label: 'EXCLUSÃO', cls: 'bg-red-500/20 text-red-400' },
    bloquear: { label: 'BLOQUEIO', cls: 'bg-orange-500/20 text-orange-400' },
    desbloquear: { label: 'DESBLOQUEIO', cls: 'bg-teal-500/20 text-teal-400' },
    venda: { label: 'VENDA', cls: 'bg-amber-500/20 text-amber-400' },
    status: { label: 'STATUS', cls: 'bg-purple-500/20 text-purple-400' },
    promover: { label: 'PROMOÇÃO', cls: 'bg-pink-500/20 text-pink-400' },
    login: { label: 'LOGIN', cls: 'bg-indigo-500/20 text-indigo-400' },
    caixa_abrir: { label: 'ABERTURA', cls: 'bg-cyan-500/20 text-cyan-400' },
    caixa_fechar: { label: 'FECHAMENTO', cls: 'bg-cyan-500/20 text-cyan-400' },
    caixa_lancamento: { label: 'LANÇAMENTO', cls: 'bg-cyan-500/20 text-cyan-400' }
  };
  return mapa[acao] || { label: acao || '—', cls: 'bg-neutral-500/20 text-gray-300' };
}

function rotuloEntidadeLog(entidade) {
  const mapa = {
    produto: 'Produto', cliente: 'Cliente', venda: 'Venda', config: 'Configurações',
    perfil: 'Perfil', usuario: 'Usuário', caixa: 'Caixa'
  };
  return mapa[entidade] || entidade || '—';
}

// Popula o filtro de usuário com base nos operadores que registraram ações.
function carregarUsuariosFiltroLog() {
  const select = document.getElementById('log-filtro-usuario');
  if (!select) return;
  const atual = select.value;
  const usuarios = new Set();
  db.logs.forEach(l => {
    if (l.usuarioNome) usuarios.add(l.usuarioNome);
  });
  db.usuarios.forEach(u => {
    if (u.nome) usuarios.add(u.nome);
    if (u.email) usuarios.add(u.email);
  });
  select.innerHTML = '<option value="">Todos</option>' +
    [...usuarios].sort().map(n => `<option value="${escapeDashboard(n)}">${escapeDashboard(n)}</option>`).join('');
  if (atual && usuarios.has(atual)) select.value = atual;
}

function filtrarLogOperacoes() {
  logPage = 1;
  renderizarLogOperacoes();
}

function limparFiltrosLogOperacoes() {
  ['log-filtro-acao', 'log-filtro-entidade', 'log-filtro-usuario', 'log-filtro-de', 'log-filtro-ate', 'log-busca']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  logPage = 1;
  renderizarLogOperacoes();
}

function mudarPaginaLogOperacoes(delta) {
  logPage = Math.max(1, logPage + delta);
  renderizarLogOperacoes();
}

function recarregarLogOperacoes() {
  carregarUsuariosFiltroLog();
  renderizarLogOperacoes();
}

// Renderiza a tabela do log aplicando os filtros e a paginação.
function renderizarLogOperacoes() {
  const corpo = document.getElementById('log-corpo');
  if (!corpo) return;

  const filtroAcao = (document.getElementById('log-filtro-acao').value || '').trim();
  const filtroEntidade = (document.getElementById('log-filtro-entidade').value || '').trim();
  const filtroUsuario = (document.getElementById('log-filtro-usuario').value || '').trim();
  const de = document.getElementById('log-filtro-de').value;
  const ate = document.getElementById('log-filtro-ate').value;
  const busca = (document.getElementById('log-busca').value || '').trim().toLowerCase();

  const deMs = de ? new Date(de + 'T00:00:00').getTime() : null;
  const ateMs = ate ? new Date(ate + 'T23:59:59.999').getTime() : null;

  const info = document.getElementById('log-info');

  // Sem filtro aplicado, a tabela permanece vazia até o operador filtrar.
  const semFiltro = !filtroAcao && !filtroEntidade && !filtroUsuario && !de && !ate && !busca;
  if (semFiltro) {
    if (info) info.textContent = 'Aplique um filtro acima para exibir os registros.';
    corpo.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-500 italic">Aplique um filtro para exibir os registros de operação.</td></tr>';
    renderizarPaginacaoGenerica('log', 0, 1, 1);
    return;
  }

  let logs = db.logs.filter(l => {
    if (filtroAcao && l.acao !== filtroAcao) return false;
    if (filtroEntidade && l.entidade !== filtroEntidade) return false;
    if (filtroUsuario) {
      const nome = String(l.usuarioNome || '');
      const email = String(l.usuarioEmail || '');
      if (nome !== filtroUsuario && email !== filtroUsuario) return false;
    }
    if (busca) {
      const texto = (String(l.descricao || '') + ' ' + String(l.registroId || '') + ' ' + String(l.entidade || '')).toLowerCase();
      if (!texto.includes(busca)) return false;
    }
    const ms = l.timestamp ? (l.timestamp.seconds ? l.timestamp.seconds * 1000 : new Date(l.timestamp).getTime()) : 0;
    if (deMs && ms < deMs) return false;
    if (ateMs && ms > ateMs) return false;
    return true;
  });

  logs.sort((a, b) => {
    const ta = a.timestamp ? (a.timestamp.seconds ? a.timestamp.seconds : new Date(a.timestamp).getTime() / 1000) : 0;
    const tb = b.timestamp ? (b.timestamp.seconds ? b.timestamp.seconds : new Date(b.timestamp).getTime() / 1000) : 0;
    return tb - ta;
  });

  if (info) info.textContent = `${logs.length} registro(s) de operação.`;

  if (logs.length === 0) {
    corpo.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-500 italic">Nenhum registro encontrado.</td></tr>';
    renderizarPaginacaoGenerica('log', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(logs.length / LOG_POR_PAGINA));
  if (logPage > totalPaginas) logPage = totalPaginas;
  const inicio = (logPage - 1) * LOG_POR_PAGINA;
  const pagina = logs.slice(inicio, inicio + LOG_POR_PAGINA);

  corpo.innerHTML = pagina.map(l => {
    const acaoV = rotuloAcaoLog(l.acao);
    const ms = l.timestamp ? (l.timestamp.seconds ? l.timestamp.seconds * 1000 : new Date(l.timestamp).getTime()) : 0;
    const dataHora = ms ? new Date(ms).toLocaleString('pt-BR') : '—';
    return `
      <tr class="border-b border-gray-700 hover:bg-neutral-700/40">
        <td class="py-2 pr-4 text-gray-400 whitespace-nowrap">${escapeDashboard(dataHora)}</td>
        <td class="py-2 pr-4">
          <span class="text-white font-medium">${escapeDashboard(l.usuarioNome || '—')}</span>
          ${l.usuarioEmail ? `<span class="block text-xs text-gray-500">${escapeDashboard(l.usuarioEmail)}</span>` : ''}
        </td>
        <td class="py-2 pr-4"><span class="text-xs font-bold px-2 py-1 rounded ${acaoV.cls}">${escapeDashboard(acaoV.label)}</span></td>
        <td class="py-2 pr-4 text-gray-300">${escapeDashboard(rotuloEntidadeLog(l.entidade))}</td>
        <td class="py-2 text-gray-200">${escapeDashboard(l.descricao || '—')}</td>
      </tr>`;
  }).join('');

  renderizarPaginacaoGenerica('log', logs.length, totalPaginas, logPage);
}

function renderRelatorios() {
  // Apenas mantém os seletores atualizados. Os relatórios são
  // exibidos somente quando o usuário clica em GERAR (vendas) ou num filtro (estoque).
  carregarSelectProdutosRelatorio();
  carregarSelectsClassificacaoRelatorio();
  preencherFiltroFornecedorRelatorioEntradas();
  preencherFiltroFornecedorRelatorioContas();
}

function parseDateRange(val) {
  if (!val) return null;
  const [y, m, d] = val.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function carregarSelectProdutosRelatorio() {
  const nomes = new Set();
  db.estoque.forEach(p => { if (p.nome && !ehRegistroBanner(p)) nomes.add(p.nome); });
  db.vendas.forEach(v => (v.itens || []).forEach(i => { if (i.nome) nomes.add(i.nome); }));
  entradasLista.forEach(e => (e.itens || []).forEach(i => { if (i.nome) nomes.add(i.nome); }));
  const lista = [...nomes].sort();
  preencherSelectProduto('estoque-rel-produto', lista);
}

function preencherSelectProduto(id, nomes) {
  const select = document.getElementById(id);
  if (!select) return;
  const atual = select.value;
  select.innerHTML = '<option value="">Todos os produtos</option>' +
    nomes.map(n => `<option value="${escapeDashboard(n)}">${escapeDashboard(n)}</option>`).join('');
  if (atual && nomes.includes(atual)) select.value = atual;
}

// Preenche os filtros de Marca/Grupo/Subgrupo dos relatórios. A base é a lista
// cadastrada nas Configurações; é feita a união com valores já usados nos
// produtos (compatibilidade com dados antigos). Não altera a exibição do cliente.
function carregarSelectsClassificacaoRelatorio() {
  const marcas = new Set(marcasCadastradas);
  const grupos = new Set(gruposCadastrados);
  const subgrupos = new Set(subgruposCadastrados);
  produtosVendiveis().forEach(p => {
    if (p.marca) marcas.add(p.marca);
    if (p.grupo) grupos.add(p.grupo);
    if (p.subgrupo) subgrupos.add(p.subgrupo);
  });
  preencherSelectClassificacao('estoque-rel-marca', [...marcas].sort(), 'Todas as marcas');
  preencherSelectClassificacao('estoque-rel-grupo', [...grupos].sort(), 'Todos os grupos');
  preencherSelectClassificacao('estoque-rel-subgrupo', [...subgrupos].sort(), 'Todos os subgrupos');
}

function preencherSelectClassificacao(id, valores, textoVazio) {
  const select = document.getElementById(id);
  if (!select) return;
  const atual = select.value;
  select.innerHTML = `<option value="">${escapeDashboard(textoVazio)}</option>` +
    valores.map(v => `<option value="${escapeDashboard(v)}">${escapeDashboard(v)}</option>`).join('');
  if (atual && valores.includes(atual)) select.value = atual;
}

// Resolve os dados internos (marca/grupo/subgrupo) de um item de venda a
// partir do cadastro em estoque (os itens de venda só guardam id/nome/preco/qtd).
function classificacaoDoItem(item) {
  const produto = db.estoque.find(p => p.id === item.id) ||
    db.estoque.find(p => p.nome === item.nome);
  return {
    marca: produto?.marca || '',
    grupo: produto?.grupo || '',
    subgrupo: produto?.subgrupo || ''
  };
}

// Sequência numérica da venda (1, 2, 3, ...). Usa o campo numeroPedido;
// caso contrário deriva pela data (mantém vendas antigas sequenciadas).
function obterSequenciaVenda(v) {
  if (!v) return 0;
  if (Number(v.numeroPedido) > 0) return Number(v.numeroPedido);
  const ordenado = [...db.vendas].sort((a, b) => dataDaVenda(a) - dataDaVenda(b));
  const idx = ordenado.findIndex(x => x.id === v.id);
  return idx >= 0 ? idx + 1 : 0;
}

function coletarRelatorioVendas() {
  const pedidoSel = parseInt(document.getElementById('vendas-rel-pedido').value, 10);
  const clienteSel = (document.getElementById('vendas-rel-cliente').value || '').trim().toLowerCase();
  const statusSel = document.getElementById('vendas-rel-status').value || '';
  const formaSel = document.getElementById('vendas-rel-forma').value || '';
  const dataInicio = parseDateRange(document.getElementById('vendas-rel-inicio').value);
  const dataFim = parseDateRange(document.getElementById('vendas-rel-fim').value);

  let vendas = db.vendas.slice();
  if (dataInicio) vendas = vendas.filter(v => dataDaVenda(v) >= dataInicio);
  if (dataFim) {
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);
    vendas = vendas.filter(v => dataDaVenda(v) <= fim);
  }
  if (pedidoSel) vendas = vendas.filter(v => obterSequenciaVenda(v) === pedidoSel);
  if (clienteSel) vendas = vendas.filter(v => String(v.clienteNome || 'Cliente Balcão').toLowerCase().includes(clienteSel));
  if (statusSel) vendas = vendas.filter(v => (v.status || '') === statusSel);
  if (formaSel) vendas = vendas.filter(v => (v.formaPagamento || v.pagamento || '') === formaSel);

  vendas = vendas.sort((a, b) => obterSequenciaVenda(a) - obterSequenciaVenda(b));

  return {
    linhas: vendas,
    total: vendas.reduce((s, v) => s + (Number(v.total) || 0), 0),
    inicio: dataInicio, fim: dataFim,
    pedidoSel, clienteSel, statusSel, formaSel
  };
}

let relVendasDados = null;
let relVendasSelecionada = null;
let relVendasItens = [];
let relVendasItensPage = 1;

// Gera o relatório de vendas (coleta dados e volta à página 1)
function gerarRelatorioVendas() {
  relVendasDados = coletarRelatorioVendas();
  relVendasPage = 1;
  renderVendasRelPagina();
}

// Renderiza a página atual do relatório de vendas (10 por página)
function renderVendasRelPagina() {
  const rel = relVendasDados || coletarRelatorioVendas();
  relVendasDados = rel;
  const tbody = document.getElementById('vendas-rel-corpo');
  const info = document.getElementById('vendas-rel-info');
  if (!tbody) return;

  const periodo = `${rel.inicio ? rel.inicio.toLocaleDateString('pt-BR') : 'início'} a ${rel.fim ? rel.fim.toLocaleDateString('pt-BR') : 'hoje'}`;

  if (rel.linhas.length === 0) {
    relVendasPage = 1;
    tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-gray-500 italic">Nenhuma venda no período.</td></tr>';
    if (info) info.textContent = `Período: ${periodo} · 0 venda(s)` + (rel.pedidoSel ? ` · Nº do pedido: ${rel.pedidoSel}` : '');
    document.getElementById('vendas-rel-rodape').innerHTML = '';
    document.getElementById('vendas-rel-pagination').style.display = 'none';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(rel.linhas.length / REGISTROS_POR_PAGINA));
  if (relVendasPage > totalPaginas) relVendasPage = totalPaginas;
  const inicio = (relVendasPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = rel.linhas.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  const statusBadge = (status) => {
    if (status === 'Entregue') return '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">ENTREGUE</span>';
    if (status === 'Cancelado') return '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">CANCELADO</span>';
    if (status === 'Em Preparação') return '<span class="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-1 rounded">EM PREPARAÇÃO</span>';
    if (status === 'Saiu para Entrega') return '<span class="bg-indigo-500/20 text-indigo-400 text-xs font-bold px-2 py-1 rounded">SAIU PARA ENTREGA</span>';
    return '<span class="bg-gray-500/20 text-gray-300 text-xs font-bold px-2 py-1 rounded">' + escapeDashboard(status || '—') + '</span>';
  };

  tbody.innerHTML = pagina.map(v => {
    const seq = obterSequenciaVenda(v);
    const forma = v.formaPagamento || v.pagamento || '';
    return `
      <tr class="border-b border-gray-800 hover:bg-neutral-700/30">
        <td class="py-2 pr-4 font-bold text-amber-400">#${String(seq).padStart(3, '0')}</td>
        <td class="py-2 pr-4">${dataDaVenda(v).toLocaleString('pt-BR')}</td>
        <td class="py-2 pr-4">${escapeDashboard(v.clienteNome || 'Cliente Balcão')}</td>
        <td class="py-2 pr-4 text-center">${(v.itens || []).length}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(v.total)}</td>
        <td class="py-2 pr-4">${statusBadge(v.status)}</td>
        <td class="py-2 pr-4">${escapeDashboard(forma || '—')}</td>
        <td class="py-2">
          <button onclick="verProdutosRelVenda('${v.id}')"
            class="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors">
            <i class="fa fa-list mr-1"></i> Ver produtos
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (info) {
    info.textContent = `Período: ${periodo} · ${rel.linhas.length} venda(s) · Total: ${formatarMoeda(rel.total)}` + (rel.pedidoSel ? ` · Nº do pedido: ${rel.pedidoSel}` : '') + (rel.clienteSel ? ` · Cliente: ${rel.clienteSel}` : '') + (rel.statusSel ? ` · Status: ${rel.statusSel}` : '') + (rel.formaSel ? ` · Forma: ${rel.formaSel}` : '');
  }

  document.getElementById('vendas-rel-rodape').innerHTML = rel.linhas.length
    ? `<tr class="text-white font-bold"><td class="py-2 pr-4" colspan="4">Total geral</td><td class="py-2 pr-4 text-right">${formatarMoeda(rel.total)}</td><td colspan="3"></td></tr>`
    : '';

  renderizarPaginacaoGenerica('vendas-rel', rel.linhas.length, totalPaginas, relVendasPage);
}

function mudarPaginaRelVendas(delta) {
  relVendasPage = Math.max(1, relVendasPage + delta);
  renderVendasRelPagina();
}

// Exibe o detalhe (resumo + produtos) de uma venda
function verProdutosRelVenda(vendaId) {
  relVendasSelecionada = db.vendas.find(v => v.id === vendaId) || null;
  const detalhe = document.getElementById('vendas-rel-detalhe');
  if (!detalhe || !relVendasSelecionada) return;

  detalhe.classList.remove('hidden');
  detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const v = relVendasSelecionada;
  const itens = v.itens || [];
  const seq = obterSequenciaVenda(v);
  const forma = v.formaPagamento || v.pagamento || '';

  const titulo = document.getElementById('vendas-rel-detalhe-titulo');
  if (titulo) {
    titulo.innerHTML = `<i class="fa fa-list text-amber-500"></i> Produtos da Venda #${String(seq).padStart(3, '0')} — ${escapeDashboard(v.clienteNome || 'Cliente Balcão')}`;
  }

  const resumo = document.getElementById('vendas-rel-resumo');
  if (resumo) {
    resumo.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-300 mb-4">
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Cliente:</span><span class="text-white font-medium">${escapeDashboard(v.clienteNome || 'Cliente Balcão')}</span>
        </div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Data:</span><span class="text-white font-medium">${dataDaVenda(v).toLocaleString('pt-BR')}</span>
        </div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Status:</span><span class="text-white font-medium">${escapeDashboard(v.status || '—')}</span>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-gray-300 mb-4">
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Forma:</span><span class="font-bold text-white">${escapeDashboard(forma || '—')}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Vendedor:</span><span class="font-bold text-white">${escapeDashboard(v.vendedorNome || '—')}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Itens:</span><span class="font-bold text-white">${itens.length}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Total:</span><span class="font-bold text-white">${formatarMoeda(v.total || 0)}</span></div>
      </div>
    `;
  }

  relVendasItens = itens;
  relVendasItensPage = 1;

  if (itens.length === 0) {
    document.getElementById('vendas-rel-itens').innerHTML = '<tr><td colspan="8" class="py-6 text-center text-gray-500 italic">Nenhum produto nesta venda.</td></tr>';
    document.getElementById('vendas-rel-itens-pagination').style.display = 'none';
    return;
  }
  renderItensRelVenda();
}

// Renderiza os produtos da venda selecionada (10 por página)
function renderItensRelVenda() {
  const corpo = document.getElementById('vendas-rel-itens');
  if (!corpo) return;

  const totalPaginas = Math.max(1, Math.ceil(relVendasItens.length / REGISTROS_POR_PAGINA));
  if (relVendasItensPage > totalPaginas) relVendasItensPage = totalPaginas;
  const inicio = (relVendasItensPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = relVendasItens.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  corpo.innerHTML = pagina.map((item, i) => {
    const cls = classificacaoDoItem(item);
    const totalItem = Number(item.preco) * Number(item.qtdCarrinho);
    return `
      <tr class="border-b border-gray-800">
        <td class="py-2 pr-4 text-gray-400">${inicio + i + 1}</td>
        <td class="py-2 pr-4">${escapeDashboard(item.nome)}</td>
        <td class="py-2 pr-4">${escapeDashboard(cls.marca || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(cls.grupo || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(cls.subgrupo || '-')}</td>
        <td class="py-2 pr-4 text-right">${Number(item.qtdCarrinho) || 0}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(item.preco)}</td>
        <td class="py-2 text-right font-medium">${formatarMoeda(totalItem)}</td>
      </tr>
    `;
  }).join('');

  renderizarPaginacaoGenerica('vendas-rel-itens', relVendasItens.length, totalPaginas, relVendasItensPage);
}

function mudarPaginaRelVendasItens(delta) {
  relVendasItensPage = Math.max(1, relVendasItensPage + delta);
  renderItensRelVenda();
}

// Exporta o PDF da venda selecionada (resumo + todos os produtos)
function exportarRelatorioVendasPDF() {
  let venda = relVendasSelecionada;
  // Se nada foi selecionado, tenta usar a primeira venda do período atual
  if (!venda) {
    const rel = relVendasDados || coletarRelatorioVendas();
    if (rel.linhas.length) venda = rel.linhas[0];
  }
  if (!venda) return showToast('Selecione uma venda para exportar o PDF.', "error");

  const itens = venda.itens || [];
  const seq = obterSequenciaVenda(venda);
  const total = itens.reduce((s, i) => s + (Number(i.preco) * Number(i.qtdCarrinho) || 0), 0);
  const forma = venda.formaPagamento || venda.pagamento || '';

  const thead = '<thead><tr><th>#</th><th>Produto</th><th>Marca</th><th>Grupo</th><th>Subgrupo</th><th class="r">Qtd</th><th class="r">Preço unit.</th><th class="r">Total</th></tr></thead>';
  const corpo = itens.map((item, i) => {
    const cls = classificacaoDoItem(item);
    const totalItem = Number(item.preco) * Number(item.qtdCarrinho);
    return `<tr><td>${i + 1}</td><td>${escapeDashboard(item.nome)}</td><td>${escapeDashboard(cls.marca || '-')}</td><td>${escapeDashboard(cls.grupo || '-')}</td><td>${escapeDashboard(cls.subgrupo || '-')}</td><td class="r">${Number(item.qtdCarrinho) || 0}</td><td class="r">${formatarMoeda(item.preco)}</td><td class="r">${formatarMoeda(totalItem)}</td></tr>`;
  }).join('');

  const resumo = `<table><tbody>
    <tr><td>Pedido</td><td>#${String(seq).padStart(3, '0')}</td></tr>
    <tr><td>Data</td><td>${dataDaVenda(venda).toLocaleString('pt-BR')}</td></tr>
    <tr><td>Cliente</td><td>${escapeDashboard(venda.clienteNome || 'Cliente Balcão')}</td></tr>
    <tr><td>Vendedor</td><td>${escapeDashboard(venda.vendedorNome || '—')}</td></tr>
    <tr><td>Forma de pagamento</td><td>${escapeDashboard(forma || '—')}</td></tr>
    <tr><td>Status</td><td>${escapeDashboard(venda.status || '—')}</td></tr>
    <tr><td>Itens</td><td>${itens.length}</td></tr>
    <tr><td><b>Total</b></td><td><b>${formatarMoeda(total)}</b></td></tr>
  </tbody></table>`;

  const subtitulo = `Relatório de Vendas · ${itens.length} item(ns) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Vendas', subtitulo, resumo + '<br>' + '<table>' + thead + '<tbody>' + corpo + '</tbody></table>');
}

function situacaoEstoque(qtd) {
  if (qtd <= 0) return { label: 'Sem estoque', cor: 'text-red-500' };
  if (qtd < 5) return { label: 'Estoque baixo', cor: 'text-amber-500' };
  return { label: 'Em estoque', cor: 'text-emerald-500' };
}

function filtrarRelatorioEstoque(filtro) {
  if (filtro) estoqueRelFiltro = filtro;
  ['todos', 'baixo', 'sem'].forEach(f =>
    document.getElementById('estq-filtro-' + f).classList.toggle('active', estoqueRelFiltro === f));
}

// Filtro de status do relatório de estoque (todos / liberados / bloqueados)
function filtrarRelatorioEstoqueStatus(filtro) {
  estoqueRelStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('estq-rel-status-' + f);
    if (el) el.classList.toggle('active', estoqueRelStatus === f);
  });
}

function produtosEstoqueFiltrados() {
  const produtoSel = (document.getElementById('estoque-rel-produto').value || '');
  const codigoSel = parseInt(document.getElementById('estoque-rel-codigo').value, 10);
  const marcaSel = (document.getElementById('estoque-rel-marca').value || '');
  const grupoSel = (document.getElementById('estoque-rel-grupo').value || '');
  const subgrupoSel = (document.getElementById('estoque-rel-subgrupo').value || '');
  return produtosVendiveis().filter(p => {
    if (estoqueRelFiltro === 'baixo') return p.qtd > 0 && p.qtd < 5;
    if (estoqueRelFiltro === 'sem') return p.qtd <= 0;
    return true;
  }).filter(p => {
    if (estoqueRelStatus === 'liberados') return !ehProdutoBloqueado(p);
    if (estoqueRelStatus === 'bloqueados') return ehProdutoBloqueado(p);
    return true;
  }).filter(p => !produtoSel || p.nome === produtoSel)
    .filter(p => !codigoSel || obterCodigoProduto(p) === codigoSel)
    .filter(p => !marcaSel || (p.marca || '') === marcaSel)
    .filter(p => !grupoSel || (p.grupo || '') === grupoSel)
    .filter(p => !subgrupoSel || (p.subgrupo || '') === subgrupoSel)
    .sort((a, b) => obterCodigoProduto(a) - obterCodigoProduto(b));
}

function gerarRelatorioEstoque() {
  filtrarRelatorioEstoque();
  relEstoquePage = 1;
  renderRelEstoquePagina();
}

function renderRelEstoquePagina() {
  const produtos = produtosEstoqueFiltrados();
  const info = document.getElementById('estoque-rel-info');
  const labels = { todos: 'Todos os produtos', baixo: 'Estoque baixo', sem: 'Sem estoque' };
  if (info) info.textContent = `${labels[estoqueRelFiltro]} · ${produtos.length} produto(s)`;

  const totalPaginas = Math.max(1, Math.ceil(produtos.length / REGISTROS_POR_PAGINA));
  if (relEstoquePage > totalPaginas) relEstoquePage = totalPaginas;
  const inicio = (relEstoquePage - 1) * REGISTROS_POR_PAGINA;
  const pagina = produtos.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  document.getElementById('estoque-rel-corpo').innerHTML = pagina.length
    ? pagina.map(p => {
      const sit = situacaoEstoque(p.qtd);
      return `
      <tr class="border-b border-gray-800">
        <td class="py-2 pr-4 text-gray-400">${formatarCodigoProduto(obterCodigoProduto(p))}</td>
        <td class="py-2 pr-4">${escapeDashboard(p.nome)}</td>
        <td class="py-2 pr-4">${escapeDashboard(p.marca || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(p.grupo || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(p.subgrupo || '-')}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(p.preco)}</td>
        <td class="py-2 pr-4 text-right">${p.qtd}</td>
        <td class="py-2"><span class="font-medium ${sit.cor}">${sit.label}</span></td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="8" class="py-6 text-center text-gray-500">Nenhum produto encontrado.</td></tr>';

  renderizarPaginacaoGenerica('estoque-rel', produtos.length, totalPaginas, relEstoquePage);
}

/* ----- Exportação PDF (aba de impressão do navegador) ----- */
function abrirImpressaoRelatorio(titulo, subtitulo, tabelaHtml) {
  const w = window.open('', '_blank', 'width=960,height=680');
  if (!w) return showToast('Permita pop-ups para exportar o PDF.', "error");
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + titulo + '</title>' +
    '<style>' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:24px;}' +
    'h1{font-size:20px;margin:0 0 4px;}' +
    '.sub{font-size:12px;color:#666;margin-bottom:16px;}' +
    'table{width:100%;border-collapse:collapse;font-size:12px;}' +
    'th,td{border:1px solid #999;padding:6px 8px;text-align:left;}' +
    'th{background:#eee;}' +
    '.r{text-align:right;}' +
    'tfoot td{font-weight:bold;}' +
    '</style></head><body>' +
    '<h1>' + titulo + '</h1><div class="sub">' + subtitulo + '</div>' +
    tabelaHtml +
    '<script>window.onload=function(){setTimeout(function(){window.print();},150);};<' + '/script>' +
    '</body></html>';
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* ================= RELATÓRIO DE ENTRADAS ================= */

// Data da entrada para comparação de período. Aceita string "aaaa-mm-dd"
// (input date) e também datas em outros formatos.
function dataDaEntrada(e) {
  const v = e.dataEntrada || e.dataEmissao || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    const d = parseDateRange(String(v));
    return d ? d : new Date(0);
  }
  const parsed = new Date(v || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

// Sequência numérica da entrada (1, 2, 3, ...). Usa o campo 'numero' gravado;
// caso contrário deriva pela data de entrada (mantém entradas antigas sequenciadas).
function obterSequenciaEntrada(e) {
  if (!e) return 0;
  if (Number(e.numero) > 0) return Number(e.numero);
  const ordenado = [...entradasLista].sort((a, b) => dataDaEntrada(a) - dataDaEntrada(b));
  const idx = ordenado.findIndex(x => x.id === e.id);
  return idx >= 0 ? idx + 1 : 0;
}

function coletarRelatorioEntradas() {
  const fornecedorSel = document.getElementById('entradas-rel-fornecedor').value || '';
  const statusSel = document.getElementById('entradas-rel-status').value || '';
  const seqFilter = parseInt(document.getElementById('entradas-rel-seq').value, 10);
  const dataInicio = parseDateRange(document.getElementById('entradas-rel-inicio').value);
  const dataFim = parseDateRange(document.getElementById('entradas-rel-fim').value);

  let entradas = entradasLista.slice();
  if (dataInicio) entradas = entradas.filter(e => dataDaEntrada(e) >= dataInicio);
  if (dataFim) {
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);
    entradas = entradas.filter(e => dataDaEntrada(e) <= fim);
  }
  if (fornecedorSel) entradas = entradas.filter(e => e.fornecedorId === fornecedorSel);
  if (statusSel) entradas = entradas.filter(e => e.status === statusSel);
  if (seqFilter) entradas = entradas.filter(e => obterSequenciaEntrada(e) === seqFilter);

  entradas = entradas.sort((a, b) => obterSequenciaEntrada(a) - obterSequenciaEntrada(b));

  return {
    linhas: entradas,
    total: entradas.reduce((s, e) => s + (Number(e.total) || 0), 0),
    inicio: dataInicio, fim: dataFim, seqFilter,
    fornecedorSel, fornecedorNome: fornecedorSel ? nomeFornecedor(fornecedorSel) : '',
    statusSel
  };
}

let relEntradasDados = null;
let relEntradasSelecionada = null;
let relEntradasItens = [];
let relEntradasItensPage = 1;

// Gera o relatório de entradas (coleta dados e volta à página 1)
function gerarRelatorioEntradas() {
  relEntradasDados = coletarRelatorioEntradas();
  relEntradasPage = 1;
  renderRelEntradasPagina();
}

// Renderiza a página atual do relatório de entradas (10 por página)
function renderRelEntradasPagina() {
  const rel = relEntradasDados || coletarRelatorioEntradas();
  relEntradasDados = rel;
  const tbody = document.getElementById('entradas-rel-corpo');
  const info = document.getElementById('entradas-rel-info');
  if (!tbody) return;

  const periodo = `${rel.inicio ? rel.inicio.toLocaleDateString('pt-BR') : 'início'} a ${rel.fim ? rel.fim.toLocaleDateString('pt-BR') : 'hoje'}`;

  if (rel.linhas.length === 0) {
    relEntradasPage = 1;
    tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-gray-500 italic">Nenhuma entrada no período.</td></tr>';
    if (info) info.textContent = `Período: ${periodo} · 0 entrada(s)` + (rel.seqFilter ? ` · Sequência: ${rel.seqFilter}` : '');
    document.getElementById('entradas-rel-rodape').innerHTML = '';
    document.getElementById('entradas-rel-pagination').style.display = 'none';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(rel.linhas.length / REGISTROS_POR_PAGINA));
  if (relEntradasPage > totalPaginas) relEntradasPage = totalPaginas;
  const inicio = (relEntradasPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = rel.linhas.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  const badge = (status) => {
    if (status === 'CONFIRMADA') return '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">CONFIRMADA</span>';
    if (status === 'ESTORNADA') return '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">ESTORNADA</span>';
    return '<span class="bg-gray-500/20 text-gray-300 text-xs font-bold px-2 py-1 rounded">RASCUNHO</span>';
  };

  tbody.innerHTML = pagina.map(e => {
    const seq = obterSequenciaEntrada(e);
    return `
      <tr class="border-b border-gray-800 hover:bg-neutral-700/30">
        <td class="py-2 pr-4 font-bold text-amber-400">#${String(seq).padStart(3, '0')}</td>
        <td class="py-2 pr-4">${formatarDataEntrada(e.dataEntrada)}</td>
        <td class="py-2 pr-4">${escapeDashboard(e.fornecedorNome || nomeFornecedor(e.fornecedorId))}</td>
        <td class="py-2 pr-4">${escapeDashboard(e.nota || '—')}</td>
        <td class="py-2 pr-4 text-center">${(e.itens || []).length}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(e.total)}</td>
        <td class="py-2 pr-4">${badge(e.status)}</td>
        <td class="py-2">
          <button onclick="verProdutosRelEntrada('${e.id}')"
            class="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors">
            <i class="fa fa-list mr-1"></i> Ver produtos
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (info) {
    info.textContent = `Período: ${periodo} · ${rel.linhas.length} entrada(s) · Total: ${formatarMoeda(rel.total)}` + (rel.seqFilter ? ` · Sequência: ${rel.seqFilter}` : '') + (rel.fornecedorNome ? ` · Fornecedor: ${rel.fornecedorNome}` : '') + (rel.statusSel ? ` · Status: ${rel.statusSel}` : '');
  }

  document.getElementById('entradas-rel-rodape').innerHTML = rel.linhas.length
    ? `<tr class="text-white font-bold"><td class="py-2 pr-4" colspan="5">Total geral</td><td class="py-2 pr-4 text-right">${formatarMoeda(rel.total)}</td><td colspan="2"></td></tr>`
    : '';

  renderizarPaginacaoGenerica('entradas-rel', rel.linhas.length, totalPaginas, relEntradasPage);
}

function mudarPaginaRelEntradas(delta) {
  relEntradasPage = Math.max(1, relEntradasPage + delta);
  renderRelEntradasPagina();
}

// Exibe o detalhe (resumo + produtos) de uma entrada
function verProdutosRelEntrada(entradaId) {
  relEntradasSelecionada = entradasLista.find(e => e.id === entradaId) || null;
  const detalhe = document.getElementById('entradas-rel-detalhe');
  if (!detalhe || !relEntradasSelecionada) return;

  detalhe.classList.remove('hidden');
  detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const e = relEntradasSelecionada;
  const itens = e.itens || [];
  const seq = obterSequenciaEntrada(e);
  const status = e.status || '';

  const titulo = document.getElementById('entradas-rel-detalhe-titulo');
  if (titulo) {
    titulo.innerHTML = `<i class="fa fa-list text-amber-500"></i> Produtos da Entrada #${String(seq).padStart(3, '0')} — ${escapeDashboard(e.fornecedorNome || nomeFornecedor(e.fornecedorId))}`;
  }

  const resumo = document.getElementById('entradas-rel-resumo');
  if (resumo) {
    resumo.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-300 mb-4">
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Fornecedor:</span><span class="text-white font-medium">${escapeDashboard(e.fornecedorNome || nomeFornecedor(e.fornecedorId))}</span>
        </div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Data:</span><span class="text-white font-medium">${formatarDataEntrada(e.dataEntrada)}</span>
        </div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Status:</span><span class="text-white font-medium">${badgeEntrada(status)}</span>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-gray-300 mb-4">
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Nota:</span><span class="font-bold text-white">${escapeDashboard(e.nota || '—')}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Série:</span><span class="font-bold text-white">${escapeDashboard(e.serie || '—')}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Emissão:</span><span class="font-bold text-white">${formatarDataEntrada(e.dataEmissao)}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Total:</span><span class="font-bold text-white">${formatarMoeda(e.total || 0)}</span></div>
      </div>
    `;
  }

  relEntradasItens = itens;
  relEntradasItensPage = 1;

  if (itens.length === 0) {
    document.getElementById('entradas-rel-itens').innerHTML = '<tr><td colspan="8" class="py-6 text-center text-gray-500 italic">Nenhum produto nesta entrada.</td></tr>';
    document.getElementById('entradas-rel-itens-pagination').style.display = 'none';
    return;
  }
  renderItensRelEntrada();
}

function badgeEntrada(status) {
  if (status === 'CONFIRMADA') return '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">CONFIRMADA</span>';
  if (status === 'ESTORNADA') return '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">ESTORNADA</span>';
  return '<span class="bg-gray-500/20 text-gray-300 text-xs font-bold px-2 py-1 rounded">RASCUNHO</span>';
}

// Renderiza os produtos da entrada selecionada (10 por página)
function renderItensRelEntrada() {
  const corpo = document.getElementById('entradas-rel-itens');
  if (!corpo) return;

  const totalPaginas = Math.max(1, Math.ceil(relEntradasItens.length / REGISTROS_POR_PAGINA));
  if (relEntradasItensPage > totalPaginas) relEntradasItensPage = totalPaginas;
  const inicio = (relEntradasItensPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = relEntradasItens.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  corpo.innerHTML = pagina.map((item, i) => {
    const cls = classificacaoDoItem({ id: item.produtoId, nome: item.nome });
    return `
      <tr class="border-b border-gray-800">
        <td class="py-2 pr-4 text-gray-400">${inicio + i + 1}</td>
        <td class="py-2 pr-4">${escapeDashboard(item.nome)}</td>
        <td class="py-2 pr-4">${escapeDashboard(cls.marca || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(cls.grupo || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(cls.subgrupo || '-')}</td>
        <td class="py-2 pr-4 text-right">${Number(item.qtd) || 0}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(item.custoUnitario)}</td>
        <td class="py-2 text-right font-medium">${formatarMoeda(item.custoTotal)}</td>
      </tr>
    `;
  }).join('');

  renderizarPaginacaoGenerica('entradas-rel-itens', relEntradasItens.length, totalPaginas, relEntradasItensPage);
}

function mudarPaginaRelEntradasItens(delta) {
  relEntradasItensPage = Math.max(1, relEntradasItensPage + delta);
  renderItensRelEntrada();
}

// Exporta o PDF da entrada selecionada (resumo + todos os produtos)
function exportarRelatorioEntradasPDF() {
  let entrada = relEntradasSelecionada;
  // Se nada foi selecionado, tenta usar a primeira entrada do período atual
  if (!entrada) {
    const rel = relEntradasDados || coletarRelatorioEntradas();
    if (rel.linhas.length) entrada = rel.linhas[0];
  }
  if (!entrada) return showToast('Selecione uma entrada para exportar o PDF.', "error");

  const itens = entrada.itens || [];
  const seq = obterSequenciaEntrada(entrada);
  const total = itens.reduce((s, i) => s + (Number(i.custoTotal) || 0), 0);

  const thead = '<thead><tr><th>#</th><th>Produto</th><th>Marca</th><th>Grupo</th><th>Subgrupo</th><th class="r">Qtd</th><th class="r">Custo unit.</th><th class="r">Total</th></tr></thead>';
  const corpo = itens.map((item, i) => {
    const cls = classificacaoDoItem({ id: item.produtoId, nome: item.nome });
    return `<tr><td>${i + 1}</td><td>${escapeDashboard(item.nome)}</td><td>${escapeDashboard(cls.marca || '-')}</td><td>${escapeDashboard(cls.grupo || '-')}</td><td>${escapeDashboard(cls.subgrupo || '-')}</td><td class="r">${Number(item.qtd) || 0}</td><td class="r">${formatarMoeda(item.custoUnitario)}</td><td class="r">${formatarMoeda(item.custoTotal)}</td></tr>`;
  }).join('');

  const resumo = `<table><tbody>
    <tr><td>Sequência</td><td>#${String(seq).padStart(3, '0')}</td></tr>
    <tr><td>Data da entrada</td><td>${formatarDataEntrada(entrada.dataEntrada)}</td></tr>
    <tr><td>Data de emissão</td><td>${formatarDataEntrada(entrada.dataEmissao)}</td></tr>
    <tr><td>Fornecedor</td><td>${escapeDashboard(entrada.fornecedorNome || nomeFornecedor(entrada.fornecedorId))}</td></tr>
    <tr><td>Nota</td><td>${escapeDashboard(entrada.nota || '—')}${entrada.serie ? ' · Série ' + escapeDashboard(entrada.serie) : ''}</td></tr>
    <tr><td>Chave NF-e</td><td>${escapeDashboard(entrada.chave ? entrada.chave.replace(/(.{4})(?=.)/g, '$1 ') : '—')}</td></tr>
    <tr><td>Status</td><td>${escapeDashboard(entrada.status || '—')}</td></tr>
    <tr><td>Itens</td><td>${itens.length}</td></tr>
    <tr><td><b>Total</b></td><td><b>${formatarMoeda(total)}</b></td></tr>
  </tbody></table>`;

  const subtitulo = `Relatório de Entradas · ${itens.length} item(ns) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Entradas', subtitulo, resumo + '<br>' + '<table>' + thead + '<tbody>' + corpo + '</tbody></table>');
}

function exportarRelatorioEstoquePDF() {
  const labels = { todos: 'Todos os produtos', baixo: 'Estoque baixo', sem: 'Sem estoque' };
  const labelsStatus = { todos: '', liberados: '· Liberados', bloqueados: '· Bloqueados' };
  const produtoSel = (document.getElementById('estoque-rel-produto').value || '');
  const codigoSel = parseInt(document.getElementById('estoque-rel-codigo').value, 10);
  const marcaSel = (document.getElementById('estoque-rel-marca').value || '');
  const grupoSel = (document.getElementById('estoque-rel-grupo').value || '');
  const subgrupoSel = (document.getElementById('estoque-rel-subgrupo').value || '');
  const produtos = produtosEstoqueFiltrados();
  const thead = '<thead><tr><th>ID</th><th>Produto</th><th>Marca</th><th>Grupo</th><th>Subgrupo</th><th class="r">Preço</th><th class="r">Qtd</th><th>Situação</th></tr></thead>';
  const corpo = produtos.map(p => `<tr><td>${formatarCodigoProduto(obterCodigoProduto(p))}</td><td>${escapeDashboard(p.nome)}</td><td>${escapeDashboard(p.marca || '-')}</td><td>${escapeDashboard(p.grupo || '-')}</td><td>${escapeDashboard(p.subgrupo || '-')}</td><td class="r">${formatarMoeda(p.preco)}</td><td class="r">${p.qtd}</td><td>${situacaoEstoque(p.qtd).label}</td></tr>`).join('');
  const subtitulo = `${labels[estoqueRelFiltro]}${labelsStatus[estoqueRelStatus]}${produtoSel ? ' · Produto: ' + produtoSel : ''}${codigoSel ? ' · ID: ' + formatarCodigoProduto(codigoSel) : ''}${marcaSel ? ' · Marca: ' + marcaSel : ''}${grupoSel ? ' · Grupo: ' + grupoSel : ''}${subgrupoSel ? ' · Subgrupo: ' + subgrupoSel : ''} · ${produtos.length} produto(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Estoque', subtitulo, '<table>' + thead + '<tbody>' + corpo + '</tbody></table>');
}

/* ================= RELATÓRIO LISTAGEM DE CLIENTES ================= */

// Filtra os clientes da listagem por status, nome e ID (ordenados por ID).
function clientesRelFiltrados() {
  const nomeSel = (document.getElementById('clientes-rel-nome').value || '').trim().toLowerCase();
  const codigoSel = parseInt(document.getElementById('clientes-rel-codigo').value, 10);
  return db.clientes.filter(c => {
    if (clientesRelStatus === 'liberados') return !ehClienteBloqueado(c);
    if (clientesRelStatus === 'bloqueados') return ehClienteBloqueado(c);
    return true;
  }).filter(c => {
    if (nomeSel && !String(c.nome || '').toLowerCase().includes(nomeSel)) return false;
    if (codigoSel && obterCodigoCliente(c) !== codigoSel) return false;
    return true;
  }).sort((a, b) => obterCodigoCliente(a) - obterCodigoCliente(b));
}

// Filtro de status do relatório de Clientes (todos / liberados / bloqueados)
function filtrarRelatorioClientesStatus(filtro) {
  clientesRelStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('cli-rel-status-' + f);
    if (el) el.classList.toggle('active', clientesRelStatus === f);
  });
}

function gerarRelatorioClientes() {
  relClientesPage = 1;
  renderRelClientesPagina();
}

function renderRelClientesPagina() {
  const clientes = clientesRelFiltrados();
  const info = document.getElementById('clientes-rel-info');
  const labels = { todos: 'Todos os clientes', liberados: 'Clientes liberados', bloqueados: 'Clientes bloqueados' };
  if (info) info.textContent = `${labels[clientesRelStatus]} · ${clientes.length} cliente(s)`;

  const totalPaginas = Math.max(1, Math.ceil(clientes.length / REGISTROS_POR_PAGINA));
  if (relClientesPage > totalPaginas) relClientesPage = totalPaginas;
  const inicio = (relClientesPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = clientes.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  document.getElementById('clientes-rel-corpo').innerHTML = pagina.length
    ? pagina.map(c => {
      const bloqueado = ehClienteBloqueado(c);
      const pedidos = db.vendas.filter(v => v.clienteId && v.clienteId === c.id).length;
      return `
      <tr class="border-b border-gray-800">
        <td class="py-2 pr-4 text-gray-400">${formatarCodigoCliente(obterCodigoCliente(c))}</td>
        <td class="py-2 pr-4">${escapeDashboard(c.nome)}</td>
        <td class="py-2 pr-4">${escapeDashboard(c.tel)}</td>
        <td class="py-2 pr-4">${escapeDashboard(c.email || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(c.endereco || '-')} ${c.numero ? `, Nº ${escapeDashboard(c.numero)}` : ''}</td>
        <td class="py-2 pr-4 text-center">${pedidos}</td>
        <td class="py-2">${bloqueado
          ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
          : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="7" class="py-6 text-center text-gray-500">Nenhum cliente encontrado.</td></tr>';

  renderizarPaginacaoGenerica('clientes-rel', clientes.length, totalPaginas, relClientesPage);
}

function mudarPaginaRelClientes(delta) {
  relClientesPage = Math.max(1, relClientesPage + delta);
  renderRelClientesPagina();
}

function exportarRelatorioClientesPDF() {
  const labels = { todos: 'Todos os clientes', liberados: 'Liberados', bloqueados: 'Bloqueados' };
  const nomeSel = (document.getElementById('clientes-rel-nome').value || '').trim();
  const codigoSel = parseInt(document.getElementById('clientes-rel-codigo').value, 10);
  const clientes = clientesRelFiltrados();
  const thead = '<thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Endereço</th><th>Pedidos</th><th>Status</th></tr></thead>';
  const corpo = clientes.map(c => {
    const bloqueado = ehClienteBloqueado(c);
    const pedidos = db.vendas.filter(v => v.clienteId && v.clienteId === c.id).length;
    return `<tr><td>${formatarCodigoCliente(obterCodigoCliente(c))}</td><td>${escapeDashboard(c.nome)}</td><td>${escapeDashboard(c.tel)}</td><td>${escapeDashboard(c.email || '-')}</td><td>${escapeDashboard(c.endereco || '-')}${c.numero ? ', Nº ' + escapeDashboard(c.numero) : ''}</td><td>${pedidos}</td><td>${bloqueado ? 'BLOQUEADO' : 'LIBERADO'}</td></tr>`;
  }).join('');
  const subtitulo = `Status: ${labels[clientesRelStatus]}${nomeSel ? ' · Nome: ' + nomeSel : ''}${codigoSel ? ' · ID: ' + formatarCodigoCliente(codigoSel) : ''} · ${clientes.length} cliente(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Clientes', subtitulo, '<table>' + thead + '<tbody>' + corpo + '</tbody></table>');
}

/* ================= RELATÓRIO DE FORNECEDORES ================= */

function fornecedoresRelFiltrados() {
  const nomeSel = (document.getElementById('fornecedores-rel-nome').value || '').trim().toLowerCase();
  const codigoSel = parseInt(document.getElementById('fornecedores-rel-codigo').value, 10);
  return fornecedoresLista.filter(f => {
    if (fornecedoresRelStatus === 'liberados') return !ehFornecedorBloqueado(f);
    if (fornecedoresRelStatus === 'bloqueados') return ehFornecedorBloqueado(f);
    return true;
  }).filter(f => {
    if (nomeSel && !String(f.nome || '').toLowerCase().includes(nomeSel)) return false;
    if (codigoSel && obterCodigoFornecedor(f) !== codigoSel) return false;
    return true;
  }).sort((a, b) => obterCodigoFornecedor(a) - obterCodigoFornecedor(b));
}

// Filtro de status do relatório de Fornecedores (todos / liberados / bloqueados)
function filtrarRelatorioFornecedoresStatus(filtro) {
  fornecedoresRelStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('forn-rel-status-' + f);
    if (el) el.classList.toggle('active', fornecedoresRelStatus === f);
  });
}

function gerarRelatorioFornecedores() {
  relFornecedoresPage = 1;
  renderRelFornecedoresPagina();
}

function renderRelFornecedoresPagina() {
  const fornecedores = fornecedoresRelFiltrados();
  const info = document.getElementById('fornecedores-rel-info');
  const labels = { todos: 'Todos os fornecedores', liberados: 'Fornecedores liberados', bloqueados: 'Fornecedores bloqueados' };
  if (info) info.textContent = `${labels[fornecedoresRelStatus]} · ${fornecedores.length} fornecedor(es)`;

  const totalPaginas = Math.max(1, Math.ceil(fornecedores.length / REGISTROS_POR_PAGINA));
  if (relFornecedoresPage > totalPaginas) relFornecedoresPage = totalPaginas;
  const inicio = (relFornecedoresPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = fornecedores.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  document.getElementById('fornecedores-rel-corpo').innerHTML = pagina.length
    ? pagina.map(f => {
      const bloqueado = ehFornecedorBloqueado(f);
      const entradas = entradasLista.filter(e => e.fornecedorId === f.id).length;
      return `
      <tr class="border-b border-gray-800">
        <td class="py-2 pr-4 text-gray-400">${formatarCodigoFornecedor(obterCodigoFornecedor(f))}</td>
        <td class="py-2 pr-4">${escapeDashboard(f.nome)}</td>
        <td class="py-2 pr-4">${escapeDashboard(f.documento || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(f.contato || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(f.email || '-')}</td>
        <td class="py-2 pr-4">${escapeDashboard(f.endereco || '-')} ${f.numero ? `, Nº ${escapeDashboard(f.numero)}` : ''}</td>
        <td class="py-2 pr-4 text-center">${entradas}</td>
        <td class="py-2">${bloqueado
          ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
          : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="8" class="py-6 text-center text-gray-500">Nenhum fornecedor encontrado.</td></tr>';

  renderizarPaginacaoGenerica('fornecedores-rel', fornecedores.length, totalPaginas, relFornecedoresPage);
}

function mudarPaginaRelFornecedores(delta) {
  relFornecedoresPage = Math.max(1, relFornecedoresPage + delta);
  renderRelFornecedoresPagina();
}

function exportarRelatorioFornecedoresPDF() {
  const labels = { todos: 'Todos os fornecedores', liberados: 'Liberados', bloqueados: 'Bloqueados' };
  const nomeSel = (document.getElementById('fornecedores-rel-nome').value || '').trim();
  const codigoSel = parseInt(document.getElementById('fornecedores-rel-codigo').value, 10);
  const fornecedores = fornecedoresRelFiltrados();
  const thead = '<thead><tr><th>ID</th><th>Nome</th><th>CNPJ / CPF</th><th>Contato</th><th>E-mail</th><th>Endereço</th><th>Entradas</th><th>Status</th></tr></thead>';
  const corpo = fornecedores.map(f => {
    const bloqueado = ehFornecedorBloqueado(f);
    const entradas = entradasLista.filter(e => e.fornecedorId === f.id).length;
    return `<tr><td>${formatarCodigoFornecedor(obterCodigoFornecedor(f))}</td><td>${escapeDashboard(f.nome)}</td><td>${escapeDashboard(f.documento || '-')}</td><td>${escapeDashboard(f.contato || '-')}</td><td>${escapeDashboard(f.email || '-')}</td><td>${escapeDashboard(f.endereco || '-')}${f.numero ? ', Nº ' + escapeDashboard(f.numero) : ''}</td><td>${entradas}</td><td>${bloqueado ? 'BLOQUEADO' : 'LIBERADO'}</td></tr>`;
  }).join('');
  const subtitulo = `Status: ${labels[fornecedoresRelStatus]}${nomeSel ? ' · Nome: ' + nomeSel : ''}${codigoSel ? ' · ID: ' + formatarCodigoFornecedor(codigoSel) : ''} · ${fornecedores.length} fornecedor(es) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Fornecedores', subtitulo, '<table>' + thead + '<tbody>' + corpo + '</tbody></table>');
}

/* ================= RELATÓRIO DE CONTAS A PAGAR ================= */

let relContasPage = 1;
let relContasDados = null;

// Preenche o filtro de fornecedor do relatório de contas a pagar.
function preencherFiltroFornecedorRelatorioContas() {
  const sel = document.getElementById('contas-rel-fornecedor');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos os fornecedores</option>' +
    fornecedoresLista.map(f => `<option value="${f.id}">${escapeDashboard(f.nome)}</option>`).join('');
  if (atual && fornecedoresLista.some(f => f.id === atual)) sel.value = atual;
}

// Coleta e filtra as contas a pagar conforme os filtros da tela.
function coletarRelatorioContas() {
  const statusSel = document.getElementById('contas-rel-status').value || '';
  const fornecedorSel = document.getElementById('contas-rel-fornecedor').value || '';
  const dataInicio = parseDateRange(document.getElementById('contas-rel-inicio').value);
  const dataFim = parseDateRange(document.getElementById('contas-rel-fim').value);

  let contas = contasPagarLista.slice();
  if (statusSel === 'PENDENTE') contas = contas.filter(c => c.status === 'PENDENTE');
  else if (statusSel === 'PAGA') contas = contas.filter(c => c.status === 'PAGA');
  else contas = contas.filter(c => c.status === 'PENDENTE' || c.status === 'PAGA');
  if (fornecedorSel) contas = contas.filter(c => c.fornecedorId === fornecedorSel);
  if (dataInicio) contas = contas.filter(c => String(c.dataVencimento || '') >= dataInicioIso(dataInicio));
  if (dataFim) contas = contas.filter(c => String(c.dataVencimento || '') <= dataFimIso(dataFim));

  contas = contas.sort((a, b) => {
    const na = Number(a.numero) || 0;
    const nb = Number(b.numero) || 0;
    if (na && nb) return na - nb;
    return String(a.dataVencimento || '').localeCompare(String(b.dataVencimento || ''));
  });

  const totalValor = contas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const totalPago = contas.reduce((s, c) => s + (Number(c.valorPago) || 0), 0);

  return {
    linhas: contas,
    totalValor,
    totalPago,
    saldo: totalValor - totalPago,
    inicio: dataInicio, fim: dataFim, statusSel,
    fornecedorSel, fornecedorNome: fornecedorSel ? nomeFornecedor(fornecedorSel) : ''
  };
}

function dataInicioIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dataFimIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Gera o relatório de contas a pagar (coleta dados e volta à página 1)
function gerarRelatorioContas() {
  relContasDados = coletarRelatorioContas();
  relContasPage = 1;
  renderRelContasPagina();
}

// Renderiza a página atual do relatório de contas a pagar (10 por página)
function renderRelContasPagina() {
  const rel = relContasDados || coletarRelatorioContas();
  relContasDados = rel;
  const tbody = document.getElementById('contas-rel-corpo');
  const info = document.getElementById('contas-rel-info');
  if (!tbody) return;

  const labels = { '': 'Em aberto e pagas', 'PENDENTE': 'Em aberto', 'PAGA': 'Pagas' };

  if (rel.linhas.length === 0) {
    relContasPage = 1;
    tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-gray-500 italic">Nenhuma conta encontrada com os filtros selecionados.</td></tr>';
    if (info) info.textContent = `Situação: ${labels[rel.statusSel]} · 0 conta(s)`;
    document.getElementById('contas-rel-rodape').innerHTML = '';
    document.getElementById('contas-rel-pagination').style.display = 'none';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(rel.linhas.length / REGISTROS_POR_PAGINA));
  if (relContasPage > totalPaginas) relContasPage = totalPaginas;
  const inicio = (relContasPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = rel.linhas.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  tbody.innerHTML = pagina.map(c => {
    const valorPago = Number(c.valorPago || 0);
    const saldo = Number(c.valor || 0) - valorPago;
    const status = c.status || '';
    const badge = status === 'PAGA'
      ? '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">PAGA</span>'
      : '<span class="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-1 rounded">EM ABERTO</span>';
    return `
      <tr class="border-b border-gray-800 hover:bg-neutral-700/30">
        <td class="py-2 pr-4 font-bold text-amber-400">${c.numero ? '#' + escapeDashboard(c.numero) : '—'}</td>
        <td class="py-2 pr-4">${formatarDataEntrada(c.dataVencimento)}</td>
        <td class="py-2 pr-4">${escapeDashboard(c.fornecedorNome || nomeFornecedor(c.fornecedorId))}</td>
        <td class="py-2 pr-4">${escapeDashboard(c.descricao || '—')}</td>
        <td class="py-2 pr-4">${labelFormaPagamento(c.formaPagamento)}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(c.valor)}</td>
        <td class="py-2 pr-4 text-right text-emerald-400">${formatarMoeda(valorPago)}</td>
        <td class="py-2 pr-4 text-right ${saldo <= 0 ? 'text-emerald-400' : ''}">${formatarMoeda(saldo)}</td>
        <td class="py-2">${badge}</td>
      </tr>`;
  }).join('');

  if (info) {
    info.textContent = `Situação: ${labels[rel.statusSel]} · ${rel.linhas.length} conta(s) · Valor: ${formatarMoeda(rel.totalValor)} · Pago: ${formatarMoeda(rel.totalPago)} · Saldo: ${formatarMoeda(rel.saldo)}` + (rel.fornecedorNome ? ` · Fornecedor: ${rel.fornecedorNome}` : '');
  }

  document.getElementById('contas-rel-rodape').innerHTML = rel.linhas.length
    ? `<tr class="text-white font-bold"><td class="py-2 pr-4" colspan="5">Total geral</td><td class="py-2 pr-4 text-right">${formatarMoeda(rel.totalValor)}</td><td class="py-2 pr-4 text-right">${formatarMoeda(rel.totalPago)}</td><td class="py-2 pr-4 text-right">${formatarMoeda(rel.saldo)}</td><td></td></tr>`
    : '';

  renderizarPaginacaoGenerica('contas-rel', rel.linhas.length, totalPaginas, relContasPage);
}

function mudarPaginaRelContas(delta) {
  relContasPage = Math.max(1, relContasPage + delta);
  renderRelContasPagina();
}

// Exporta o relatório de contas a pagar como PDF (janela de impressão).
function exportarRelatorioContasPDF() {
  const rel = relContasDados || coletarRelatorioContas();
  const labels = { '': 'Em aberto e pagas', 'PENDENTE': 'Em aberto', 'PAGA': 'Pagas' };
  const thead = '<thead><tr><th>Nº</th><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Forma</th><th class="r">Valor</th><th class="r">Pago</th><th class="r">Saldo</th><th>Situação</th></tr></thead>';
  const corpo = rel.linhas.map(c => {
    const valorPago = Number(c.valorPago || 0);
    const saldo = Number(c.valor || 0) - valorPago;
    return `<tr><td>${c.numero ? '#' + escapeDashboard(c.numero) : '—'}</td><td>${formatarDataEntrada(c.dataVencimento)}</td><td>${escapeDashboard(c.fornecedorNome || nomeFornecedor(c.fornecedorId))}</td><td>${escapeDashboard(c.descricao || '—')}</td><td>${labelFormaPagamento(c.formaPagamento)}</td><td class="r">${formatarMoeda(c.valor)}</td><td class="r">${formatarMoeda(valorPago)}</td><td class="r">${formatarMoeda(saldo)}</td><td>${(c.status === 'PAGA' ? 'PAGA' : 'EM ABERTO')}</td></tr>`;
  }).join('');
  const rodape = `<tfoot><tr><td colspan="5" class="r">Total geral</td><td class="r">${formatarMoeda(rel.totalValor)}</td><td class="r">${formatarMoeda(rel.totalPago)}</td><td class="r">${formatarMoeda(rel.saldo)}</td><td></td></tr></tfoot>`;
  const subtitulo = `Situação: ${labels[rel.statusSel]}${rel.fornecedorNome ? ' · Fornecedor: ' + rel.fornecedorNome : ''} · ${rel.linhas.length} conta(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Contas a Pagar', subtitulo, '<table>' + thead + '<tbody>' + corpo + '</tbody>' + rodape + '</table>');
}

/* ================= RELATÓRIO DE FECHAMENTO DE CAIXA ================= */

// Caixa selecionado no relatório (para exibir os lançamentos detalhados)
let caixaRelSelecionado = null;
let caixaRelDados = null;
let caixaRelMovs = [];

// Filtra os fechamentos de caixa por período (usa data_fechamento) e,
// opcionalmente, pela sequência do caixa.
// Em ordem cronológica (mais recentes primeiro).
function coletarRelatorioCaixa() {
  const inicio = parseDateRange(document.getElementById('caixa-rel-inicio').value);
  const fim = parseDateRange(document.getElementById('caixa-rel-fim').value);
  const seqFilter = parseInt(document.getElementById('caixa-rel-seq').value, 10);
  if (fim) fim.setHours(23, 59, 59, 999); // inclui todo o último dia

  const fechados = caixasLista
    .filter(c => c.status === 'FECHADO')
    .map(c => {
      const d = new Date(c.data_fechamento || c.data_abertura);
      let movs = movimentacoesCaixa.filter(m => m.caixa_id === c.id);
      const esperado = calcularEsperadoCaixa(c, movs);
      const seq = obterSequenciaCaixa(c);
      return { caixa: c, data: d, movs, esperado, seq };
    })
    .filter(({ data }) => {
      if (isNaN(data.getTime())) return true;
      if (inicio && data < inicio) return false;
      if (fim && data > fim) return false;
      return true;
    })
    .filter(({ seq }) => {
      if (!seqFilter) return true;
      return seq === seqFilter;
    })
    .sort((a, b) => b.data - a.data);

  return {
    linhas: fechados,
    totalDinh: fechados.reduce((s, r) => s + Number(r.caixa.valor_esperado_fechamento || r.esperado.DINHEIRO || 0), 0),
    totalCont: fechados.reduce((s, r) => s + Number(r.caixa.valor_informado_fechamento || 0), 0),
    totalDif: fechados.reduce((s, r) => s + Number(r.caixa.diferenca || 0), 0),
    inicio, fim, seqFilter
  };
}

// Gera o relatório de fechamento de caixa (coleta dados e volta à página 1)
function gerarRelatorioCaixa() {
  caixaRelDados = coletarRelatorioCaixa();
  relCaixaPage = 1;
  renderCaixaRelPagina();
}

// Renderiza a página atual do relatório de fechamentos (10 por página)
function renderCaixaRelPagina() {
  const rel = caixaRelDados || coletarRelatorioCaixa();
  caixaRelDados = rel;
  const tbody = document.getElementById('caixa-rel-corpo');
  const info = document.getElementById('caixa-rel-info');
  if (!tbody) return;

  const periodo = `${rel.inicio ? rel.inicio.toLocaleDateString('pt-BR') : 'início'} a ${rel.fim ? rel.fim.toLocaleDateString('pt-BR') : 'hoje'}`;

  if (rel.linhas.length === 0) {
    relCaixaPage = 1;
    tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-gray-500 italic">Nenhum fechamento de caixa no período.</td></tr>';
    if (info) info.textContent = `Período: ${periodo} · 0 fechamento(s)` + (rel.seqFilter ? ` · Sequência: ${rel.seqFilter}` : '');
    document.getElementById('caixa-rel-pagination').style.display = 'none';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(rel.linhas.length / REGISTROS_POR_PAGINA));
  if (relCaixaPage > totalPaginas) relCaixaPage = totalPaginas;
  const inicio = (relCaixaPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = rel.linhas.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  tbody.innerHTML = pagina.map(({ caixa, esperado, seq }) => {
    const dif = Number(caixa.diferenca || 0);
    const difCls = dif < 0 ? 'text-red-400' : dif > 0 ? 'text-green-400' : 'text-gray-300';
    return `
      <tr class="border-b border-gray-800 hover:bg-neutral-700/30">
        <td class="py-2 pr-4 font-bold text-amber-400">#${seq}</td>
        <td class="py-2 pr-4">${new Date(caixa.data_abertura).toLocaleString('pt-BR')}</td>
        <td class="py-2 pr-4">${new Date(caixa.data_fechamento || caixa.data_abertura).toLocaleString('pt-BR')}</td>
        <td class="py-2 pr-4">${escapeDashboard(caixa.usuario_abertura_nome || 'Desconhecido')}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(caixa.valor_abertura || 0)}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(caixa.valor_esperado_fechamento || esperado.DINHEIRO || 0)}</td>
        <td class="py-2 pr-4 text-right">${formatarMoeda(caixa.valor_informado_fechamento || 0)}</td>
        <td class="py-2 pr-4 text-right font-medium ${difCls}">${formatarMoeda(dif)}</td>
        <td class="py-2">
          <button onclick="verLancamentosRelCaixa('${caixa.id}')"
            class="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors">
            <i class="fa fa-list mr-1"></i> Ver lançamentos
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (info) {
    info.textContent = `Período: ${periodo} · ${rel.linhas.length} fechamento(s) · Sumário: Esperado ${formatarMoeda(rel.totalDinh)} | Contado ${formatarMoeda(rel.totalCont)} | Diferença ${formatarMoeda(rel.totalDif)}` + (rel.seqFilter ? ` · Sequência: ${rel.seqFilter}` : '');
  }

  renderizarPaginacaoGenerica('caixa-rel', rel.linhas.length, totalPaginas, relCaixaPage);
}

// Exibe o detalhe (resumo + lançamentos) de um caixa fechado
function verLancamentosRelCaixa(caixaId) {
  caixaRelSelecionado = caixasLista.find(c => c.id === caixaId) || null;
  const detalhe = document.getElementById('caixa-rel-detalhe');
  if (!detalhe || !caixaRelSelecionado) return;

  detalhe.classList.remove('hidden');
  const titulo = document.getElementById('caixa-rel-detalhe-titulo');
  const resumo = document.getElementById('caixa-rel-resumo');
  const corpo = document.getElementById('caixa-rel-lancamentos');

  const caixa = caixaRelSelecionado;
  const movs = movimentacoesCaixa.filter(m => m.caixa_id === caixa.id);
  const esperado = calcularEsperadoCaixa(caixa, movs);
  const dif = Number(caixa.diferenca || 0);
  const difCls = dif < 0 ? 'text-red-400' : dif > 0 ? 'text-green-400' : 'text-gray-300';

  if (titulo) {
    titulo.innerHTML = `<i class="fa fa-list text-amber-500"></i> Lançamentos do Caixa #${obterSequenciaCaixa(caixa)} — ${new Date(caixa.data_abertura).toLocaleString('pt-BR')}`;
  }

  if (resumo) {
    resumo.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-300 mb-4">
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Aberto por:</span><span class="text-white font-medium">${escapeDashboard(caixa.usuario_abertura_nome || 'Desconhecido')}</span>
        </div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Valor de abertura:</span><span class="text-white font-medium">${formatarMoeda(caixa.valor_abertura || 0)}</span>
        </div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between">
          <span>Diferença:</span><span class="text-white font-medium ${difCls}">${formatarMoeda(dif)}</span>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-gray-300 mb-4">
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Esperado Dinheiro:</span><span class="font-bold text-white">${formatarMoeda(esperado.DINHEIRO)}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Esperado PIX:</span><span class="font-bold text-white">${formatarMoeda(esperado.PIX)}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Esperado Cartão:</span><span class="font-bold text-white">${formatarMoeda(esperado.CARTAO)}</span></div>
        <div class="bg-neutral-900 rounded-lg px-3 py-2 flex justify-between"><span>Esperado Outros:</span><span class="font-bold text-white">${formatarMoeda(esperado.OUTROS)}</span></div>
      </div>
    `;
  }

  if (movs.length === 0) {
    caixaRelMovs = [];
    relCaixaLancPage = 1;
    corpo.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500 italic">Nenhum lançamento registrado neste caixa.</td></tr>';
    document.getElementById('caixa-rel-lanc-pagination').style.display = 'none';
    return;
  }

  caixaRelMovs = movs;
  relCaixaLancPage = 1;
  renderLancamentosRelCaixa();
}

// Renderiza os lançamentos do caixa selecionado (10 por página)
function renderLancamentosRelCaixa() {
  const corpos = document.getElementById('caixa-rel-lancamentos');
  if (!corpos) return;

  const totalPaginas = Math.max(1, Math.ceil(caixaRelMovs.length / REGISTROS_POR_PAGINA));
  if (relCaixaLancPage > totalPaginas) relCaixaLancPage = totalPaginas;
  const inicio = (relCaixaLancPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = caixaRelMovs.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  corpos.innerHTML = pagina.map(m => {
    const sinal = (m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO') ? '+' : '-';
    const sinalCls = (m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO') ? 'text-green-400' : 'text-red-400';
    return `
      <tr class="border-b border-gray-800">
        <td class="py-2 pr-4">${new Date(m.data_hora).toLocaleTimeString('pt-BR')}</td>
        <td class="py-2 pr-4">
          ${m.tipo === 'VENDA' ? '<span class="text-green-400 font-medium">Venda</span>'
        : m.tipo === 'SUPRIMENTO' ? '<span class="text-blue-400 font-medium">Suprimento</span>'
          : m.tipo === 'SANGRIA' ? '<span class="text-red-400 font-medium">Sangria</span>'
            : m.tipo === 'DESPESA' ? '<span class="text-purple-400 font-medium">Despesa</span>'
              : '<span class="text-amber-400 font-medium">Estorno</span>'}
        </td>
        <td class="py-2 pr-4">${escapeDashboard(m.forma_pagamento || '')}</td>
        <td class="py-2 pr-4 text-right font-medium ${sinalCls}">${sinal}${formatarMoeda(m.valor || 0)}</td>
        <td class="py-2 text-gray-400">${escapeDashboard(m.observacao || '-')}</td>
      </tr>
    `;
  }).join('');

  renderizarPaginacaoGenerica('caixa-rel-lanc', caixaRelMovs.length, totalPaginas, relCaixaLancPage);
}

// Exporta o PDF do caixa selecionado (resumo + lançamentos)
function exportarRelatorioCaixaPDF() {
  let caixa = caixaRelSelecionado;
  // Se nada foi selecionado, tenta usar o último fechamento do período atual
  if (!caixa) {
    const rel = caixaRelDados || coletarRelatorioCaixa();
    if (rel.linhas.length) caixa = rel.linhas[0].caixa;
  }
  if (!caixa) return showToast('Selecione um fechamento de caixa para exportar o PDF.', "error");

  const movs = movimentacoesCaixa.filter(m => m.caixa_id === caixa.id);
  const esperado = calcularEsperadoCaixa(caixa, movs);
  const dif = Number(caixa.diferenca || 0);

  const thead = '<thead><tr><th>Hora</th><th>Tipo</th><th>Forma</th><th class="r">Valor</th><th>Observação</th></tr></thead>';
  const corpo = (movs.length ? movs : [])
    .map(m => {
      const sinal = (m.tipo === 'VENDA' || m.tipo === 'SUPRIMENTO') ? '+' : '−';
      const rotulo = m.tipo === 'VENDA' ? 'Venda'
        : m.tipo === 'SUPRIMENTO' ? 'Suprimento'
          : m.tipo === 'SANGRIA' ? 'Sangria'
            : m.tipo === 'DESPESA' ? 'Despesa'
              : 'Estorno';
      return `<tr><td>${new Date(m.data_hora).toLocaleTimeString('pt-BR')}</td><td>${rotulo}</td><td>${escapeDashboard(m.forma_pagamento || '')}</td><td class="r">${sinal}${formatarMoeda(m.valor || 0)}</td><td>${escapeDashboard(m.observacao || '-')}</td></tr>`;
    })
    .join('');
  const resumo = `<table><tbody>
    <tr><td>Sequência</td><td>#${obterSequenciaCaixa(caixa)}</td></tr>
    <tr><td>Aberto em</td><td>${new Date(caixa.data_abertura).toLocaleString('pt-BR')}</td></tr>
    <tr><td>Fechado em</td><td>${new Date(caixa.data_fechamento || caixa.data_abertura).toLocaleString('pt-BR')}</td></tr>
    <tr><td>Aberto por</td><td>${escapeDashboard(caixa.usuario_abertura_nome || 'Desconhecido')}</td></tr>
    <tr><td>Valor de abertura</td><td>${formatarMoeda(caixa.valor_abertura || 0)}</td></tr>
    <tr><td>Esperado Dinheiro</td><td>${formatarMoeda(esperado.DINHEIRO)}</td></tr>
    <tr><td>Esperado PIX</td><td>${formatarMoeda(esperado.PIX)}</td></tr>
    <tr><td>Esperado Cartão</td><td>${formatarMoeda(esperado.CARTAO)}</td></tr>
    <tr><td>Esperado Outros</td><td>${formatarMoeda(esperado.OUTROS)}</td></tr>
    <tr><td>Dinheiro contado</td><td>${formatarMoeda(caixa.valor_informado_fechamento || 0)}</td></tr>
    <tr><td><b>Diferença</b></td><td><b>${formatarMoeda(dif)}</b></td></tr>
  </tbody></table>`;
  const subtitulo = `Fechamento de caixa · ${movs.length} lançamento(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`;
  abrirImpressaoRelatorio('Relatório de Fechamento de Caixa', subtitulo, resumo + '<br>' + '<table>' + thead + '<tbody>' + corpo + '</tbody></table>');
}

/* ================= TELA ENTRADAS DE MERCADORIA ================= */

// Formata uma data ISO/string para dd/mm/aaaa (uso interno desta tela).
function formatarDataEntrada(valor) {
  if (!valor) return '—';
  // Datas puras (aaaa-mm-dd) não devem sofrer deslocamento de fuso horário.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    const [a, m, d] = String(valor).split('-');
    return `${d}/${m}/${a}`;
  }
  const d = new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString('pt-BR');
}

// Rótulo amigável para a forma de pagamento de uma conta.
function labelFormaPagamento(forma) {
  const f = String(forma || '').toUpperCase();
  if (f === 'PIX') return 'PIX';
  if (f === 'CARTAO') return 'Cartão';
  if (f === 'DINHEIRO') return 'Dinheiro';
  if (f === 'OUTROS') return 'Outros';
  return '—';
}

// Sanitiza o campo de chave NF-e em tempo real: só dígitos, máx. 44, e feedback
// visual quando preenchido com quantidade diferente de 44 (a chave é opcional).
function validarChaveNFEInput(input) {
  const limpa = (input.value || '').replace(/\D/g, '').slice(0, 44);
  input.value = limpa;
  const contador = document.getElementById('entrada-chave-contador');
  if (contador) {
    contador.textContent = `${limpa.length}/44`;
    if (limpa.length === 44) {
      contador.className = 'text-xs text-emerald-400 font-mono font-semibold';
    } else if (limpa.length > 0) {
      contador.className = 'text-xs text-amber-400 font-mono font-semibold';
    } else {
      contador.className = 'text-xs text-gray-500 font-mono';
    }
  }
  const invalida = limpa.length > 0 && limpa.length !== 44;
  input.classList.toggle('border-red-500', invalida);
  input.classList.toggle('border-amber-500/20', !invalida);
  input.title = invalida
    ? `A chave NF-e deve ter 44 dígitos (atualmente: ${limpa.length}).`
    : '';
}

// Alterna entre as abas da tela Entradas (entradas / fornecedores).
function mostrarAbaEntradas(aba) {
  const entradaTab = 'entradas';
  const fornecedorTab = 'fornecedores';
  document.getElementById('aba-entradas-' + entradaTab).classList.toggle('active', aba === entradaTab);
  document.getElementById('aba-entradas-' + fornecedorTab).classList.toggle('active', aba === fornecedorTab);
  document.getElementById('entradas-aba-' + entradaTab).classList.toggle('hidden', aba !== entradaTab);
  document.getElementById('entradas-aba-' + fornecedorTab).classList.toggle('hidden', aba !== fornecedorTab);
  if (aba === 'entradas') renderizarEntradas();
  if (aba === 'fornecedores') renderizarFornecedores();
}

/* ------------- FORNECEDORES ------------- */

// Fornecedor bloqueado (não pode receber novas entradas até ser liberado)
function ehFornecedorBloqueado(fornecedor) {
  return fornecedor && fornecedor.bloqueado === true;
}

// Verifica se o fornecedor já possui entrada vinculada.
function fornecedorTemEntrada(fornecedorId) {
  return entradasLista.some(e => e.fornecedorId === fornecedorId);
}

// Busca por nome e/ou ID na tabela de Fornecedores
function filtrarFornecedoresBusca() {
  fornecedoresPage = 1;
  renderizarFornecedores();
}

// Filtro de status da tabela de Fornecedores (todos / liberados / bloqueados)
function filtrarFornecedoresStatus(filtro) {
  fornecedoresFiltroStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('forn-status-' + f);
    if (el) el.classList.toggle('active', fornecedoresFiltroStatus === f);
  });
  fornecedoresPage = 1;
  renderizarFornecedores();
}

// Alterna o bloqueio de um fornecedor (bloquear/liberar)
async function bloquearFornecedor(id, bloquear) {
  const fornecedor = fornecedoresLista.find(x => x.id === id);
  if (!fornecedor) return;
  const acao = bloquear ? 'Bloquear' : 'Liberar';
  const acaoLower = bloquear ? 'bloquear' : 'liberar';
  abrirModalConfirmacao({
    titulo: `${acao} fornecedor?`,
    mensagem: `Você está prestes a ${acaoLower} o fornecedor`,
    detalhe: `"${fornecedor.nome}"`,
    textoBtn: `${acao} fornecedor`,
    corBtn: bloquear ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icone: bloquear ? 'fa-ban' : 'fa-unlock',
    iconeCor: bloquear ? 'bg-orange-500/20' : 'bg-emerald-500/20',
    onConfirm: async () => {
      try {
        await dbFirestore.collection('fornecedores').doc(id).update({
          bloqueado: !!bloquear
        });
        registrarLog(bloquear ? 'bloquear' : 'desbloquear', 'fornecedor', id,
          `Fornecedor "${fornecedor.nome}" ${bloquear ? 'bloqueado' : 'liberado'}`);
        showToast(`Fornecedor "${fornecedor.nome}" ${bloquear ? 'bloqueado' : 'liberado'} com sucesso!`, "success");
      } catch (error) {
        console.error("Erro ao bloquear fornecedor:", error);
        showToast(`Não foi possível ${acaoLower} o fornecedor.`, "error");
      }
    }
  });
}

// Preenche o form de fornecedor com os dados de um fornecedor (edição).
function editarFornecedor(id) {
  const f = fornecedoresLista.find(x => x.id === id);
  if (!f) return;
  document.getElementById('fornecedor-nome').value = f.nome || '';
  document.getElementById('fornecedor-documento').value = f.documento || '';
  document.getElementById('fornecedor-contato').value = f.contato || '';
  document.getElementById('fornecedor-email').value = f.email || '';
  document.getElementById('fornecedor-endereco').value = f.endereco || '';
  document.getElementById('fornecedor-numero').value = f.numero || '';
  document.getElementById('fornecedor-observacao').value = f.observacao || '';
  const hidden = document.getElementById('fornecedor-editando-id') ||
    (() => {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.id = 'fornecedor-editando-id';
      document.getElementById('form-fornecedores').appendChild(h);
      return h;
    })();
  hidden.value = id;
  const btn = document.getElementById('form-fornecedores').querySelector('button[type="submit"]');
  if (btn) btn.textContent = 'ATUALIZAR FORNECEDOR';
}

// Salva (cria ou atualiza) um fornecedor.
async function salvarFornecedor() {
  const hidden = document.getElementById('fornecedor-editando-id');
  const id = hidden ? hidden.value : '';
  const nome = document.getElementById('fornecedor-nome').value.trim();
  const documento = document.getElementById('fornecedor-documento').value.trim();
  const contato = document.getElementById('fornecedor-contato').value.trim();
  const email = document.getElementById('fornecedor-email').value.trim();
  const endereco = document.getElementById('fornecedor-endereco').value.trim();
  const numero = document.getElementById('fornecedor-numero').value.trim();
  const observacao = document.getElementById('fornecedor-observacao').value.trim();

  if (!nome) return showToast('Informe o nome do fornecedor.', "error");

  try {
    if (id) {
      await dbFirestore.collection('fornecedores').doc(id).set({
        nome, documento, contato, email, endereco, numero, observacao,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      registrarLog('editar', 'fornecedor', id, `Fornecedor "${nome}" atualizado`, { nome, documento, contato, email });
      showToast('Fornecedor atualizado com sucesso!', "success");
    } else {
      const ref = await dbFirestore.collection('fornecedores').add({
        nome, documento, contato, email, endereco, numero, observacao,
        codigo: proximoCodigoFornecedor(),
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      registrarLog('incluir', 'fornecedor', ref.id, `Fornecedor "${nome}" cadastrado`, { nome, documento, contato, email });
      showToast('Fornecedor cadastrado com sucesso!', "success");
    }
    // Limpa o formulário e os selects são atualizados via onSnapshot.
    document.getElementById('form-fornecedores').reset();
    if (hidden) hidden.value = '';
    const btn = document.getElementById('form-fornecedores').querySelector('button[type="submit"]');
    if (btn) btn.textContent = 'SALVAR FORNECEDOR';
  } catch (error) {
    console.error("Erro ao salvar fornecedor:", error);
    showToast('Erro ao salvar fornecedor: ' + error.message, "error");
  }
}

// Exclui um fornecedor (apenas se não houver entrada vinculada a ele).
async function excluirFornecedor(id) {
  const f = fornecedoresLista.find(x => x.id === id);
  if (!f) return;
  const temEntrada = entradasLista.some(e => e.fornecedorId === id);
  if (temEntrada) {
    return showToast('Este fornecedor possui entradas vinculadas e não pode ser excluído.', "error");
  }
  abrirModalConfirmacao({
    titulo: 'Excluir fornecedor?',
    mensagem: 'Você está prestes a excluir o fornecedor',
    detalhe: `"${f.nome}"`,
    textoBtn: 'Excluir fornecedor',
    corBtn: 'bg-red-600 hover:bg-red-500 text-white',
    icone: 'fa-trash',
    iconeCor: 'bg-red-500/20',
    onConfirm: async () => {
      try {
        await dbFirestore.collection('fornecedores').doc(id).delete();
        registrarLog('excluir', 'fornecedor', id, `Fornecedor "${f.nome}" excluído`);
        showToast(`Fornecedor "${f.nome}" excluído com sucesso!`, "success");
      } catch (error) {
        console.error("Erro ao excluir fornecedor:", error);
        showToast('Não foi possível excluir o fornecedor.', "error");
      }
    }
  });
}

// Nome amigável de um fornecedor a partir do id.
function nomeFornecedor(id) {
  const f = fornecedoresLista.find(x => x.id === id);
  return f ? f.nome : (id ? 'Fornecedor removido' : '—');
}

// ID único do fornecedor (1, 2, 3, ...). Usa o campo 'codigo' gravado se existir;
// caso contrário deriva pela posição na lista ordenada por criação
// (mantém os fornecedores antigos numerados a partir de 1).
function obterCodigoFornecedor(fornecedor) {
  if (!fornecedor) return 0;
  if (Number(fornecedor.codigo) > 0) return Number(fornecedor.codigo);
  const ordenado = [...fornecedoresLista].sort((a, b) => {
    const ta = a.criadoEm && a.criadoEm.seconds ? a.criadoEm.seconds : (a.atualizadoEm && a.atualizadoEm.seconds ? a.atualizadoEm.seconds : (a.criadoEm || 0));
    const tb = b.criadoEm && b.criadoEm.seconds ? b.criadoEm.seconds : (b.atualizadoEm && b.atualizadoEm.seconds ? b.atualizadoEm.seconds : (b.criadoEm || 0));
    return (ta - tb) || String(a.nome || '').localeCompare(String(b.nome || ''));
  });
  const idx = ordenado.findIndex(f => f.id === fornecedor.id);
  return idx >= 0 ? idx + 1 : 0;
}

// Próximo ID de fornecedor: maior código existente + 1 (começa em 1)
function proximoCodigoFornecedor() {
  return fornecedoresLista
    .map(f => obterCodigoFornecedor(f))
    .reduce((max, c) => Math.max(max, Number(c) || 0), 0) + 1;
}

// Formata o ID do fornecedor com zero à esquerda: 1 -> "001" (exibição)
function formatarCodigoFornecedor(codigo) {
  return '#' + String(codigo).padStart(3, '0');
}

// Renderiza a tabela de fornecedores.
function renderizarFornecedores() {
  const tbody = document.getElementById('tabelaFornecedores');
  if (!tbody) return;

  const buscaNome = (document.getElementById('forn-busca-nome').value || '').trim().toLowerCase();
  const buscaCodigo = parseInt(document.getElementById('forn-busca-codigo').value, 10);

  const fornecedores = fornecedoresLista.filter(f => {
    if (fornecedoresFiltroStatus === 'liberados') return !ehFornecedorBloqueado(f);
    if (fornecedoresFiltroStatus === 'bloqueados') return ehFornecedorBloqueado(f);
    return true;
  }).filter(f => {
    if (buscaNome && !String(f.nome || '').toLowerCase().includes(buscaNome)) return false;
    if (buscaCodigo && obterCodigoFornecedor(f) !== buscaCodigo) return false;
    return true;
  }).sort((a, b) => obterCodigoFornecedor(a) - obterCodigoFornecedor(b));

  if (fornecedores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-500 italic">Nenhum fornecedor cadastrado.</td></tr>`;
    renderizarPaginacaoGenerica('fornecedores', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(fornecedores.length / REGISTROS_POR_PAGINA));
  if (fornecedoresPage > totalPaginas) fornecedoresPage = totalPaginas;
  const inicio = (fornecedoresPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = fornecedores.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  tbody.innerHTML = pagina.map(f => {
    const bloqueado = ehFornecedorBloqueado(f);
    const temEntrada = fornecedorTemEntrada(f.id);
    return `
    <tr class="border-b border-gray-700 hover:bg-neutral-700/50 ${bloqueado ? 'opacity-60' : ''}">
      <td class="p-3 text-gray-400">${formatarCodigoFornecedor(obterCodigoFornecedor(f))}</td>
      <td class="p-3 font-medium">${escapeDashboard(f.nome)}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(f.documento || '-')}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(f.contato || '-')}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(f.email || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(f.endereco || '-')} ${f.numero ? `, Nº ${escapeDashboard(f.numero)}` : ''}</td>
      <td class="p-3 text-center">
        ${bloqueado
        ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
        : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}
      </td>
      <td class="p-3 text-center">
        <div class="flex items-center justify-center gap-2">
          <button onclick="editarFornecedor('${f.id}')" class="text-amber-400 hover:text-amber-300 p-1" title="Editar">
            <i class="fa fa-pen"></i>
          </button>
          <button onclick="bloquearFornecedor('${f.id}', ${bloqueado ? 'false' : 'true'})"
            class="${bloqueado ? 'text-emerald-500 hover:text-emerald-400' : 'text-orange-500 hover:text-orange-400'} p-1"
            title="${bloqueado ? 'Liberar fornecedor' : 'Bloquear fornecedor'}">
            <i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i>
          </button>
          ${temEntrada || bloqueado
        ? `<button disabled class="text-neutral-600 p-1 cursor-not-allowed"
                 title="${bloqueado ? 'Fornecedor bloqueado: primeiro libere para depois poder excluir.' : 'Fornecedor com entradas: só pode ser bloqueado, não excluído.'}">
                 <i class="fa fa-trash"></i>
               </button>`
        : `<button onclick="excluirFornecedor('${f.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir fornecedor">
                 <i class="fa fa-trash"></i>
               </button>`}
        </div>
      </td>
    </tr>`;
  }).join('');

  renderizarPaginacaoGenerica('fornecedores', fornecedores.length, totalPaginas, fornecedoresPage);
}

function mudarPaginaFornecedores(delta) {
  fornecedoresPage = Math.max(1, fornecedoresPage + delta);
  renderizarFornecedores();
}

// Preenche o select de fornecedores do form de entrada (modal).
// Fornecedores bloqueados não recebem novas entradas (não aparecem no select).
function preencherSelectFornecedores() {
  const sel = document.getElementById('entrada-fornecedor');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione o fornecedor...</option>' +
    fornecedoresLista.filter(f => !ehFornecedorBloqueado(f)).map(f => `<option value="${f.id}">${escapeDashboard(f.nome)}</option>`).join('');
  if (atual && fornecedoresLista.some(f => f.id === atual)) sel.value = atual;
}

// Preenche o filtro de fornecedor da lista de entradas.
function preencherFiltroFornecedoresEntradas() {
  const sel = document.getElementById('entradas-filtro-fornecedor');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' +
    fornecedoresLista.map(f => `<option value="${f.id}">${escapeDashboard(f.nome)}</option>`).join('');
  if (atual && fornecedoresLista.some(f => f.id === atual)) sel.value = atual;
}

// Preenche o filtro de fornecedor do relatório de entradas.
function preencherFiltroFornecedorRelatorioEntradas() {
  const sel = document.getElementById('entradas-rel-fornecedor');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos os fornecedores</option>' +
    fornecedoresLista.map(f => `<option value="${f.id}">${escapeDashboard(f.nome)}</option>`).join('');
  if (atual && fornecedoresLista.some(f => f.id === atual)) sel.value = atual;
}

/* ================= CONTAS A PAGAR ================= */
// Contas a pagar podem ser geradas a partir de uma entrada confirmada (pré-preenchidas)
// ou lançadas avulsas. A baixa registra um débito (DESPESA) no fluxo de caixa,
// seguindo o mesmo princípio da VENDA (recebimento), porém como saída.

// Próximo número sequencial da conta (contador atômico em config/contador_conta_pagar)
async function proximoNumeroContaPagar() {
  const ref = dbFirestore.collection('config').doc('contador_conta_pagar');
  const resultado = await dbFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? Number(snap.data().numero || 0) : 0;
    const proximo = atual + 1;
    tx.set(ref, { numero: proximo }, { merge: true });
    return proximo;
  });
  return String(resultado).padStart(3, '0');
}

function abrirModalContaPagar() {
  const modal = document.getElementById('modalContaPagar');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function fecharModalContaPagar() {
  const modal = document.getElementById('modalContaPagar');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  contaPagarEditandoId = null;
  contaPagarEntradaId = null;
}

// Bloqueia os campos derivados da entrada (fornecedor/descrição/valor) quando a
// conta está vinculada a uma entrada. Esses dados só podem ser corrigidos
// alterando a entrada original e regenerando a conta.
function configurarCamposContaPagar(bloquear) {
  ['conta-pagar-fornecedor', 'conta-pagar-descricao', 'conta-pagar-valor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = bloquear;
  });
}

// Preenche o select de fornecedor do modal de conta a pagar.
function preencherSelectFornecedoresContas(valorSelecionado) {
  const sel = document.getElementById('conta-pagar-fornecedor');
  if (!sel) return;
  const alvo = (valorSelecionado !== undefined) ? valorSelecionado : sel.value;
  sel.innerHTML = '<option value="">Selecione o fornecedor...</option>' +
    fornecedoresLista.filter(f => !ehFornecedorBloqueado(f)).map(f => `<option value="${f.id}">${escapeDashboard(f.nome)}</option>`).join('');
  if (alvo && fornecedoresLista.some(f => f.id === alvo)) sel.value = alvo;
}

// Preenche o filtro de fornecedor da lista de contas a pagar.
function preencherFiltroFornecedoresContas() {
  const sel = document.getElementById('contas-filtro-fornecedor');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' +
    fornecedoresLista.map(f => `<option value="${f.id}">${escapeDashboard(f.nome)}</option>`).join('');
  if (atual && fornecedoresLista.some(f => f.id === atual)) sel.value = atual;
}

// Alterna entre as abas Em Aberto / Pagas.
function mostrarAbaContas(aba) {
  contasAba = aba;
  document.getElementById('aba-contas-emAberto').classList.toggle('active', aba === 'emAberto');
  document.getElementById('aba-contas-pagas').classList.toggle('active', aba === 'pagas');
  document.getElementById('contas-aba-emAberto').classList.toggle('hidden', aba !== 'emAberto');
  document.getElementById('contas-aba-pagas').classList.toggle('hidden', aba !== 'pagas');
  renderizarContasPagar();
}

// Abre o modal para lançar uma conta a pagar avulsa (sem entrada vinculada).
function novaContaAvulsa() {
  contaPagarEditandoId = null;
  contaPagarEntradaId = null;
  document.getElementById('conta-pagar-modal-titulo').textContent = 'Nova Conta a Pagar';
  document.getElementById('conta-pagar-origem-info').classList.add('hidden');
  document.getElementById('conta-pagar-origem-info').innerHTML = '';
  document.getElementById('conta-pagar-fornecedor').value = '';
  document.getElementById('conta-pagar-descricao').value = '';
  document.getElementById('conta-pagar-valor').value = '';
  document.getElementById('conta-pagar-vencimento').value = new Date().toISOString().slice(0, 10);
  document.getElementById('conta-pagar-forma').value = '';
  document.getElementById('conta-pagar-observacao').value = '';
  configurarCamposContaPagar(false);
  preencherSelectFornecedoresContas('');
  abrirModalContaPagar();
}

// Abre o modal pré-preenchido com os dados de uma entrada confirmada.
// Se já existir conta vinculada à entrada, bloqueia (evita duplicidade).
function gerarContasPagarEntrada(entradaId) {
  const e = entradasLista.find(x => x.id === entradaId);
  if (!e) return showToast('Entrada não encontrada.', "error");
  const jaGerada = contasPagarLista.some(c => c.entradaId === entradaId && c.status !== 'CANCELADA');
  if (jaGerada) return showToast('Esta entrada já possui conta a pagar gerada.', "error");
  contaPagarEditandoId = null;
  contaPagarEntradaId = entradaId;
  document.getElementById('conta-pagar-modal-titulo').textContent = 'Conta a Pagar da Entrada';
  const info = document.getElementById('conta-pagar-origem-info');
  info.innerHTML = `<i class="fa fa-truck-ramp-box mr-2 text-amber-400"></i>Entrada <strong>#${escapeDashboard(e.numero || entradaId)}</strong> — ${escapeDashboard(e.fornecedorNome || nomeFornecedor(e.fornecedorId))} · Nota ${escapeDashboard(e.nota || '—')} · Total ${formatarMoeda(e.total)}`;
  info.classList.remove('hidden');
  document.getElementById('conta-pagar-fornecedor').value = e.fornecedorId || '';
  document.getElementById('conta-pagar-descricao').value = `Nota fiscal ${e.nota || '—'} — Entrada #${e.numero || ''}`;
  document.getElementById('conta-pagar-valor').value = e.total || '';
  document.getElementById('conta-pagar-vencimento').value = e.dataEntrada || new Date().toISOString().slice(0, 10);
  document.getElementById('conta-pagar-forma').value = '';
  document.getElementById('conta-pagar-observacao').value = e.observacao || '';
  configurarCamposContaPagar(false);
  preencherSelectFornecedoresContas(e.fornecedorId || '');
  abrirModalContaPagar();
}

// Salva a conta a pagar (nova ou edição). Não movimenta estoque nem caixa.
async function salvarContaPagar() {
  const fornecedorId = document.getElementById('conta-pagar-fornecedor').value;
  const descricao = document.getElementById('conta-pagar-descricao').value.trim();
  const valor = parseFloat(document.getElementById('conta-pagar-valor').value);
  const vencimento = document.getElementById('conta-pagar-vencimento').value;
  const formaPagamento = document.getElementById('conta-pagar-forma').value;
  const observacao = document.getElementById('conta-pagar-observacao').value.trim();

  if (!fornecedorId) return showToast('Selecione o fornecedor.', "error");
  const fornecedor = fornecedoresLista.find(f => f.id === fornecedorId);
  if (fornecedor && ehFornecedorBloqueado(fornecedor)) {
    return showToast('Este fornecedor está bloqueado e não pode receber novas contas.', "error");
  }
  if (!descricao) return showToast('Informe a descrição da conta.', "error");
  if (!valor || valor <= 0) return showToast('Informe um valor válido.', "error");
  if (!vencimento) return showToast('Informe a data de vencimento.', "error");

  // Ao criar a partir de uma entrada, bloqueia duplicidade. Na edição, o vínculo
  // já existe e a própria conta não pode ser tratada como duplicada.
  if (contaPagarEntradaId && !contaPagarEditandoId) {
    const jaGerada = contasPagarLista.some(c => c.entradaId === contaPagarEntradaId && c.status !== 'CANCELADA');
    if (jaGerada) return showToast('Esta entrada já possui conta a pagar gerada.', "error");
  }

  try {
    // Conta vinculada à entrada: fornecedor/descrição/valor são imutáveis
    // (derivados do registro da entrada) e não podem ser alterados na edição.
    const original = contaPagarEditandoId ? contasPagarLista.find(x => x.id === contaPagarEditandoId) : null;
    const ehVinculada = !!contaPagarEntradaId;
    const camposComuns = {
      origem: contaPagarEntradaId ? 'entrada' : 'avulsa',
      entradaId: contaPagarEntradaId || null,
      fornecedorId: ehVinculada && original ? original.fornecedorId : fornecedorId,
      fornecedorNome: ehVinculada && original ? original.fornecedorNome : nomeFornecedor(fornecedorId),
      descricao: ehVinculada && original ? original.descricao : descricao,
      valor: ehVinculada && original ? Number(original.valor) : Number(valor),
      dataVencimento: vencimento,
      formaPagamento: formaPagamento || null,
      observacao,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (contaPagarEditandoId) {
      await dbFirestore.collection('contas_pagar').doc(contaPagarEditandoId).update(camposComuns);
      registrarLog('editar', 'conta_pagar', contaPagarEditandoId, `Conta a pagar atualizada — ${formatarMoeda(valor)}`);
    } else {
      const numero = await proximoNumeroContaPagar();
      const ref = await dbFirestore.collection('contas_pagar').add({
        ...camposComuns,
        numero,
        valorPago: 0,
        status: 'PENDENTE',
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        dataIso: new Date().toISOString(),
        usuarioId: auth.currentUser ? auth.currentUser.uid : null,
        usuarioNome: usuarioLogadoLabel()
      });
      registrarLog('criar', 'conta_pagar', ref.id,
        `Conta a pagar #${numero} criada — ${formatarMoeda(valor)}${contaPagarEntradaId ? ' (via entrada)' : ' (avulsa)'}`);
    }
    showToast('Conta a pagar salva!', "success");
    fecharModalContaPagar();
  } catch (error) {
    console.error('Erro ao salvar conta a pagar:', error);
    showToast('Erro ao salvar conta a pagar: ' + error.message, "error");
  }
}

// Filtra e re-renderiza as contas (resetando para a página 1).
function filtrarContasPagar() {
  contasFiltroFornecedor = document.getElementById('contas-filtro-fornecedor').value;
  contasFiltroBusca = document.getElementById('contas-filtro-busca').value.trim().toLowerCase();
  contasPageEmAberto = 1;
  contasPagePagas = 1;
  renderizarContasPagar();
}

// Retorna a lista de contas filtrada pelos filtros da tela.
function contasPagarFiltradas() {
  return contasPagarLista.filter(c => {
    if (contasFiltroFornecedor && c.fornecedorId !== contasFiltroFornecedor) return false;
    if (contasFiltroBusca) {
      const alvo = `${c.numero || ''} ${c.descricao || ''} ${c.fornecedorNome || ''}`.toLowerCase();
      if (!alvo.includes(contasFiltroBusca)) return false;
    }
    return true;
  });
}

// Renderiza as duas abas da tela Contas a Pagar.
function renderizarContasPagar() {
  renderContasEmAberto();
  renderContasPagas();
  preencherFiltroFornecedoresContas();
}

function renderContasEmAberto() {
  const tbody = document.getElementById('contas-em-aberto-tbody');
  if (!tbody) return;
  const contas = contasPagarFiltradas().filter(c => c.status === 'PENDENTE');

  if (!contas.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500 italic">Nenhuma conta em aberto.</td></tr>';
    renderizarPaginacaoGenerica('contas-em-aberto', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(contas.length / REGISTROS_POR_PAGINA));
  if (contasPageEmAberto > totalPaginas) contasPageEmAberto = totalPaginas;
  const inicio = (contasPageEmAberto - 1) * REGISTROS_POR_PAGINA;
  const pagina = contas.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  renderizarPaginacaoGenerica('contas-em-aberto', contas.length, totalPaginas, contasPageEmAberto);

  tbody.innerHTML = pagina.map(c => {
    const valorPago = Number(c.valorPago || 0);
    const saldo = (Number(c.valor || 0) - valorPago);
    // Comparação de datas puras (YYYY-MM-DD): evita o deslocamento de fuso do
    // new Date(), que faz uma conta com vencimento HOJE parecer vencida.
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const vencido = String(c.dataVencimento || '') < hojeStr;
    return `
      <tr class="border-b border-gray-700 hover:bg-neutral-700/50">
        <td class="p-3 text-gray-400">${c.numero ? '#' + escapeDashboard(c.numero) : '—'}</td>
        <td class="p-3 font-medium">${escapeDashboard(c.fornecedorNome || nomeFornecedor(c.fornecedorId))}</td>
        <td class="p-3 text-sm text-gray-300">${escapeDashboard(c.descricao || '—')}${c.origem === 'entrada' ? ' <i class="fa fa-truck-ramp-box text-amber-400" title="Vinculada à entrada"></i>' : ''}</td>
        <td class="p-3 text-sm ${vencido ? 'text-red-400 font-medium' : ''}">${formatarDataEntrada(c.dataVencimento)}${vencido ? ' <span class="text-xs text-red-400">(vencida)</span>' : ''}</td>
        <td class="p-3 text-sm">${labelFormaPagamento(c.formaPagamento)}</td>
        <td class="p-3 font-medium">${formatarMoeda(c.valor)}</td>
        <td class="p-3 text-emerald-400">${formatarMoeda(valorPago)}</td>
        <td class="p-3 font-bold ${saldo <= 0 ? 'text-emerald-400' : 'text-amber-400'}">${formatarMoeda(saldo)}</td>
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="darBaixaConta('${c.id}')" class="text-emerald-400 hover:text-emerald-300 p-1" title="Dar baixa (registra débito no caixa)">
              <i class="fa fa-check"></i>
            </button>
            <button onclick="editarContaPagar('${c.id}')" class="text-amber-400 hover:text-amber-300 p-1" title="Editar conta">
              <i class="fa fa-pen"></i>
            </button>
            <button onclick="cancelarContaPagar('${c.id}')" class="text-red-500 hover:text-red-400 p-1" title="Cancelar conta">
              <i class="fa fa-times"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderContasPagas() {
  const tbody = document.getElementById('contas-pagas-tbody');
  if (!tbody) return;
  const contas = contasPagarFiltradas().filter(c => c.status === 'PAGA');

  if (!contas.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500 italic">Nenhuma conta paga.</td></tr>';
    renderizarPaginacaoGenerica('contas-pagas', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(contas.length / REGISTROS_POR_PAGINA));
  if (contasPagePagas > totalPaginas) contasPagePagas = totalPaginas;
  const inicio = (contasPagePagas - 1) * REGISTROS_POR_PAGINA;
  const pagina = contas.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  renderizarPaginacaoGenerica('contas-pagas', contas.length, totalPaginas, contasPagePagas);

  tbody.innerHTML = pagina.map(c => {
    const baixas = Array.isArray(c.baixas) ? c.baixas : [];
    const ultima = baixas.length ? baixas[baixas.length - 1] : null;
    const dataPag = ultima ? ultima.dataPagamento : (c.dataPagamento || '');
    return `
      <tr class="border-b border-gray-700 hover:bg-neutral-700/50">
        <td class="p-3 text-gray-400">${c.numero ? '#' + escapeDashboard(c.numero) : '—'}</td>
        <td class="p-3 font-medium">${escapeDashboard(c.fornecedorNome || nomeFornecedor(c.fornecedorId))}</td>
        <td class="p-3 text-sm text-gray-300">${escapeDashboard(c.descricao || '—')}</td>
        <td class="p-3 text-sm">${formatarDataEntrada(c.dataVencimento)}</td>
        <td class="p-3 text-sm">${labelFormaPagamento(c.formaPagamento)}</td>
        <td class="p-3 font-medium">${formatarMoeda(c.valor)}</td>
        <td class="p-3 text-emerald-400">${formatarMoeda(Number(c.valorPago || 0))}</td>
        <td class="p-3 text-sm">${formatarDataEntrada(dataPag)}</td>
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="verBaixasConta('${c.id}')" class="text-sky-400 hover:text-sky-300 p-1" title="Ver baixas da conta">
              <i class="fa fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function mudarPaginaContasEmAberto(delta) {
  contasPageEmAberto = Math.max(1, contasPageEmAberto + delta);
  renderContasEmAberto();
}

function mudarPaginaContasPagas(delta) {
  contasPagePagas = Math.max(1, contasPagePagas + delta);
  renderContasPagas();
}

// Abre o modal de edição de uma conta pendente.
function editarContaPagar(id) {
  const c = contasPagarLista.find(x => x.id === id);
  if (!c) return;
  if (c.status !== 'PENDENTE') return showToast('Somente contas em aberto podem ser editadas.', "error");
  contaPagarEditandoId = id;
  contaPagarEntradaId = c.origem === 'entrada' ? c.entradaId : null;
  const ehVinculada = !!contaPagarEntradaId;
  document.getElementById('conta-pagar-modal-titulo').textContent = 'Editar Conta a Pagar';
  const info = document.getElementById('conta-pagar-origem-info');
  if (ehVinculada) {
    info.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa fa-truck-ramp-box text-amber-400"></i>
        <span>Entrada <strong>#${escapeDashboard(c.numero)}</strong> vinculada</span>
      </div>
      <div class="text-xs text-gray-400 mt-1">Fornecedor, descrição e valor são fixos por vínculo com a entrada. Para corrigi-los, cancele esta conta, ajuste a entrada e gere novamente.</div>`;
    info.classList.remove('hidden');
  } else {
    info.classList.add('hidden');
    info.innerHTML = '';
  }
  configurarCamposContaPagar(ehVinculada);
  document.getElementById('conta-pagar-fornecedor').value = c.fornecedorId || '';
  document.getElementById('conta-pagar-descricao').value = c.descricao || '';
  document.getElementById('conta-pagar-valor').value = c.valor || '';
  document.getElementById('conta-pagar-vencimento').value = c.dataVencimento || '';
  document.getElementById('conta-pagar-forma').value = c.formaPagamento || '';
  document.getElementById('conta-pagar-observacao').value = c.observacao || '';
  preencherSelectFornecedoresContas(c.fornecedorId || '');
  abrirModalContaPagar();
}

// Cancela uma conta pendente (não gera movimento no caixa).
async function cancelarContaPagar(id) {
  const c = contasPagarLista.find(x => x.id === id);
  if (!c) return;
  if (c.status !== 'PENDENTE') return showToast('Somente contas em aberto podem ser canceladas.', "error");
  const confirmado = await abrirModalConfirmacao({
    titulo: 'Cancelar Conta a Pagar',
    mensagem: `Cancelar a conta #${c.numero || id} — ${formatarMoeda(c.valor)}?`,
    detalhe: 'A conta será marcada como cancelada e não gerará lançamento de débito no caixa.',
    textoBtn: 'Cancelar Conta',
    corBtn: 'bg-red-600 hover:bg-red-500 text-white',
    icone: 'fa-ban',
    iconeCor: 'bg-red-500/20 text-red-400'
  });
  if (!confirmado) return;
  try {
    await dbFirestore.collection('contas_pagar').doc(id).update({
      status: 'CANCELADA',
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    registrarLog('cancelar', 'conta_pagar', id, `Conta a pagar #${c.numero || id} cancelada`);
  } catch (error) {
    console.error('Erro ao cancelar conta:', error);
    showToast('Erro ao cancelar conta: ' + error.message, "error");
  }
}

/* ------------- BAIXA DE CONTA A PAGAR ------------- */

function abrirModalBaixaConta() {
  const modal = document.getElementById('modalBaixaConta');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function fecharModalBaixaConta() {
  const modal = document.getElementById('modalBaixaConta');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  contaPagarBaixaId = null;
}

// Abre o modal de baixa pré-preenchido com o saldo da conta.
function darBaixaConta(id) {
  const c = contasPagarLista.find(x => x.id === id);
  if (!c) return;
  if (c.status !== 'PENDENTE') return showToast('Esta conta não está em aberto.', "error");
  const saldo = Number(c.valor || 0) - Number(c.valorPago || 0);
  if (saldo <= 0) return showToast('Esta conta já está totalmente paga.', "error");
  contaPagarBaixaId = id;
  const info = document.getElementById('baixa-conta-info');
  info.innerHTML = `
    <div class="flex justify-between"><span>Conta:</span><strong>#${escapeDashboard(c.numero || id)}</strong></div>
    <div class="flex justify-between"><span>Fornecedor:</span><strong>${escapeDashboard(c.fornecedorNome || nomeFornecedor(c.fornecedorId))}</strong></div>
    <div class="flex justify-between"><span>Valor total:</span><strong>${formatarMoeda(c.valor)}</strong></div>
    <div class="flex justify-between"><span>Já pago:</span><strong class="text-emerald-400">${formatarMoeda(Number(c.valorPago || 0))}</strong></div>
    <div class="flex justify-between"><span>Saldo:</span><strong class="text-amber-400">${formatarMoeda(saldo)}</strong></div>`;
  document.getElementById('baixa-conta-valor').value = saldo.toFixed(2);
  document.getElementById('baixa-conta-forma').value = c.formaPagamento || 'DINHEIRO';
  document.getElementById('baixa-conta-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('baixa-conta-observacao').value = '';
  abrirModalBaixaConta();
}

// Confirma a baixa: registra débito (DESPESA) no caixa aberto e atualiza a conta.
// Permite baixa parcial — a conta segue PENDENTE até o saldo zerar.
async function confirmarBaixaConta() {
  const c = contasPagarLista.find(x => x.id === contaPagarBaixaId);
  if (!c) return showToast('Conta não encontrada.', "error");

  const valorBaixa = parseFloat(document.getElementById('baixa-conta-valor').value);
  const forma = document.getElementById('baixa-conta-forma').value;
  const dataPag = document.getElementById('baixa-conta-data').value;
  const obs = document.getElementById('baixa-conta-observacao').value.trim();

  if (!valorBaixa || valorBaixa <= 0) return showToast('Informe um valor de baixa válido.', "error");
  if (!forma) return showToast('Selecione a forma de pagamento.', "error");
  if (!dataPag) return showToast('Informe a data do pagamento.', "error");

  const saldo = Number(c.valor || 0) - Number(c.valorPago || 0);
  if (valorBaixa > saldo) return showToast(`O valor da baixa (${formatarMoeda(valorBaixa)}) é maior que o saldo (${formatarMoeda(saldo)}).`, "error");

  // Débito no caixa: exige caixa aberto (mesmo princípio da venda, porém como saída).
  if (!caixaAtual) return showToast('Não há caixa aberto. Abra o caixa antes de dar baixa em contas a pagar.', "error");

  const user = auth.currentUser;
  try {
    const batch = dbFirestore.batch();
    const movRef = dbFirestore.collection('movimentacoes_caixa').doc();
    batch.set(movRef, {
      caixa_id: caixaAtual.id,
      tipo: 'DESPESA',
      forma_pagamento: forma,
      valor: valorBaixa,
      data_hora: new Date(dataPag + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
      usuario_id: user ? user.uid : null,
      venda_id: null,
      conta_pagar_id: c.id,
      observacao: `Conta a pagar #${c.numero || c.id} — ${c.fornecedorNome || ''}${obs ? ' — ' + obs : ''}`
    });

    const novoPago = Number(c.valorPago || 0) + valorBaixa;
    const baixas = Array.isArray(c.baixas) ? c.baixas : [];
    const novoStatus = (novoPago >= (Number(c.valor || 0)) - 0.001) ? 'PAGA' : 'PENDENTE';
    batch.update(dbFirestore.collection('contas_pagar').doc(c.id), {
      valorPago: novoPago,
      dataPagamento: dataPag,
      formaPagamento: forma,
      status: novoStatus,
      baixas: [...baixas, {
        valor: valorBaixa,
        formaPagamento: forma,
        dataPagamento: dataPag,
        movimentacaoId: movRef.id,
        usuarioId: user ? user.uid : null,
        usuarioNome: usuarioLogadoLabel()
      }],
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    registrarLog('baixa', 'conta_pagar', c.id,
      `Baixa de ${formatarMoeda(valorBaixa)} na conta #${c.numero || c.id} (${forma})${novoStatus === 'PAGA' ? ' — conta quitada' : ''}`);
    showToast(novoStatus === 'PAGA' ? 'Conta quitada! Débito registrado no caixa.' : 'Baixa parcial registrada! Débito lançado no caixa.', "success");
    fecharModalBaixaConta();
  } catch (error) {
    console.error('Erro ao dar baixa na conta:', error);
    showToast('Erro ao dar baixa: ' + error.message, "error");
  }
}

// Exibe as baixas (histórico de pagamentos) de uma conta paga.
function fecharModalVerBaixas() {
  const modal = document.getElementById('modalVerBaixas');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Exibe as baixas (histórico de pagamentos) de uma conta paga.
function verBaixasConta(id) {
  const c = contasPagarLista.find(x => x.id === id);
  if (!c) return;
  const baixas = Array.isArray(c.baixas) ? c.baixas : [];
  document.getElementById('ver-baixas-titulo').textContent = `Baixas da Conta #${c.numero || id}`;
  document.getElementById('ver-baixas-info').innerHTML = `
    <div class="flex justify-between"><span>Fornecedor:</span><strong>${escapeDashboard(c.fornecedorNome || nomeFornecedor(c.fornecedorId))}</strong></div>
    <div class="flex justify-between"><span>Descrição:</span><strong>${escapeDashboard(c.descricao || '—')}</strong></div>
    <div class="flex justify-between"><span>Valor total:</span><strong>${formatarMoeda(c.valor)}</strong></div>
    <div class="flex justify-between"><span>Pago:</span><strong class="text-emerald-400">${formatarMoeda(Number(c.valorPago || 0))}</strong></div>`;
  const tbody = document.getElementById('ver-baixas-tbody');
  tbody.innerHTML = baixas.length ? baixas.map(b => `
    <tr class="border-b border-gray-700 hover:bg-neutral-700/50">
      <td class="p-3">${formatarDataEntrada(b.dataPagamento)}</td>
      <td class="p-3">${labelFormaPagamento(b.formaPagamento)}</td>
      <td class="p-3 font-medium">${formatarMoeda(b.valor)}</td>
      <td class="p-3 text-sm text-gray-400">${escapeDashboard(b.usuarioNome || '—')}</td>
    </tr>`).join('')
    : '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Nenhuma baixa registrada.</td></tr>';
  const modal = document.getElementById('modalVerBaixas');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

/* ------------- MODAL DE ENTRADA (formulário) ------------- */

// Abre o modal para criar uma nova entrada.
function novaEntrada() {
  entradaModoConsulta = false;
  entradaEditandoId = null;
  entradaItens = [];
  document.getElementById('entrada-modal-titulo').textContent = 'Nova Entrada';
  document.getElementById('entrada-fornecedor').value = '';
  document.getElementById('entrada-nota').value = '';
  document.getElementById('entrada-serie').value = '';
  document.getElementById('entrada-chave').value = '';
  const hoje = new Date().toISOString().slice(0, 10);
  document.getElementById('entrada-data-emissao').value = hoje;
  document.getElementById('entrada-data-entrada').value = hoje;
  document.getElementById('entrada-observacao').value = '';
  document.getElementById('entrada-fornecedor').disabled = false;
  document.getElementById('entrada-data-emissao').disabled = false;
  document.getElementById('entrada-data-entrada').disabled = false;
  document.getElementById('entrada-observacao').disabled = false;
  document.getElementById('entrada-nota').disabled = false;
  document.getElementById('entrada-serie').disabled = false;
  document.getElementById('entrada-chave').disabled = false;
  validarChaveNFEInput(document.getElementById('entrada-chave'));
  habilitarFormularioEntrada();
  preencherSelectFornecedores();
  preencherSelectProdutosEntrada();
  renderItensEntrada();
  abrirModalEntrada();
}

// Abre o modal em modo de edição. REGRA: entrada RASCUNHO ou ESTORNADA podem ser
// editadas (a estornada permite corrigir os dados e, depois, confirmar novamente);
// entrada CONFIRMADA é bloqueada — dados fiscais/comerciais não podem ser alterados.
function editarEntrada(id) {
  const e = entradasLista.find(x => x.id === id);
  if (!e) return;
  if (e.status !== 'RASCUNHO' && e.status !== 'ESTORNADA') {
    return showToast('Uma entrada CONFIRMADA não pode ter seus dados alterados. Estorne-a se precisar corrigir.', "error");
  }
  entradaModoConsulta = false;
  entradaEditandoId = id;
  entradaItens = (e.itens || []).map(i => ({ ...i }));
  document.getElementById('entrada-modal-titulo').textContent = `Editar Entrada ${e.numero || ''}`.trim();
  document.getElementById('entrada-fornecedor').value = e.fornecedorId || '';
  document.getElementById('entrada-nota').value = e.nota || '';
  document.getElementById('entrada-serie').value = e.serie || '';
  document.getElementById('entrada-chave').value = e.chave || '';
  document.getElementById('entrada-data-emissao').value = (e.dataEmissao || '').slice(0, 10);
  document.getElementById('entrada-data-entrada').value = (e.dataEntrada || '').slice(0, 10);
  document.getElementById('entrada-observacao').value = e.observacao || '';
  const ehEstornada = e.status === 'ESTORNADA';
  // Entrada estornada: libera todos os campos (correção de nota/série/chave).
  // Rascunho: mantém a identificação fiscal bloqueada (evita "re-nota").
  habilitarFormularioEntrada();
  document.getElementById('entrada-nota').disabled = !ehEstornada;
  document.getElementById('entrada-serie').disabled = !ehEstornada;
  document.getElementById('entrada-chave').disabled = !ehEstornada;
  validarChaveNFEInput(document.getElementById('entrada-chave'));
  preencherSelectFornecedores();
  preencherSelectProdutosEntrada();
  renderItensEntrada();
  abrirModalEntrada();
}

// Consulta os dados de uma entrada já CONFIRMADA: abre o modal em modo
// somente leitura (nenhum campo editável, sem salvar/confirmar).
function consultarEntrada(id) {
  const e = entradasLista.find(x => x.id === id);
  if (!e) return;
  entradaModoConsulta = true;
  entradaEditandoId = null;
  entradaItens = (e.itens || []).map(i => ({ ...i }));
  document.getElementById('entrada-modal-titulo').textContent = `Consulta de Entrada ${e.numero ? '#' + e.numero : ''}`.trim();
  document.getElementById('entrada-fornecedor').value = e.fornecedorId || '';
  document.getElementById('entrada-nota').value = e.nota || '';
  document.getElementById('entrada-serie').value = e.serie || '';
  document.getElementById('entrada-chave').value = e.chave || '';
  document.getElementById('entrada-data-emissao').value = (e.dataEmissao || '').slice(0, 10);
  document.getElementById('entrada-data-entrada').value = (e.dataEntrada || '').slice(0, 10);
  document.getElementById('entrada-observacao').value = e.observacao || '';
  validarChaveNFEInput(document.getElementById('entrada-chave'));
  habilitarFormularioEntrada();
  // Desabilita todos os campos (somente leitura)
  desabilitarFormularioEntrada();
  preencherSelectFornecedores();
  preencherSelectProdutosEntrada();
  renderItensEntrada();
  abrirModalEntrada();
}

// Reabilita campos e controles de edição do modal de entrada (modo normal).
function habilitarFormularioEntrada() {
  const ids = ['entrada-fornecedor', 'entrada-nota', 'entrada-serie', 'entrada-chave', 'entrada-data-emissao', 'entrada-data-entrada', 'entrada-observacao'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
  const adicionar = document.getElementById('entrada-adicionar-item');
  if (adicionar) adicionar.classList.remove('hidden');
  const rapido = document.getElementById('entrada-cadastro-rapido-link');
  if (rapido) rapido.classList.remove('hidden');
  const salvar = document.getElementById('entrada-btn-salvar-rascunho');
  if (salvar) salvar.classList.remove('hidden');
  const confirmar = document.getElementById('entrada-btn-confirmar');
  if (confirmar) confirmar.classList.remove('hidden');
}

// Desabilita todos os campos e oculta controles de edição (modo consulta).
function desabilitarFormularioEntrada() {
  const ids = ['entrada-fornecedor', 'entrada-nota', 'entrada-serie', 'entrada-chave', 'entrada-data-emissao', 'entrada-data-entrada', 'entrada-observacao'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
  const adicionar = document.getElementById('entrada-adicionar-item');
  if (adicionar) adicionar.classList.add('hidden');
  const rapido = document.getElementById('entrada-cadastro-rapido-link');
  if (rapido) rapido.classList.add('hidden');
  const salvar = document.getElementById('entrada-btn-salvar-rascunho');
  if (salvar) salvar.classList.add('hidden');
  const confirmar = document.getElementById('entrada-btn-confirmar');
  if (confirmar) confirmar.classList.add('hidden');
}

function abrirModalEntrada() {
  const modal = document.getElementById('modalEntrada');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function fecharModalEntrada() {
  const modal = document.getElementById('modalEntrada');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Preenche/limpa o select de produtos (Cardápio) para adicionar itens.
// Usa produtosVendiveis() para excluir o banner_config (não é produto).
function preencherSelectProdutosEntrada() {
  const sel = document.getElementById('entrada-item-produto');
  if (!sel) return;
  sel.value = '';
  const label = document.getElementById('entradaProdutoLabel');
  if (label) label.textContent = 'Selecione o produto...';
  const buscaNome = document.getElementById('entrada-busca-produto-nome');
  if (buscaNome) buscaNome.value = '';
  const buscaCodigo = document.getElementById('entrada-busca-produto-codigo');
  if (buscaCodigo) buscaCodigo.value = '';
  selectProdutosEntradaPage = 1;
  renderizarSelectProdutosEntrada(false);
}

// Filtra os produtos do select da Entrada por descrição (nome) e/ou ID do produto
function filtrarSelectProdutosEntrada() {
  selectProdutosEntradaPage = 1;
  renderizarSelectProdutosEntrada();
}

// Retorna o produto mais próximo do filtro (nome igual > prefixo > contém > menor ID)
function produtoMaisProximo(produtos, buscaNome, buscaCodigo) {
  if (produtos.length === 0) return null;
  if (buscaCodigo) return produtos[0];
  if (buscaNome) {
    const igual = produtos.find(p => String(p.nome || '').toLowerCase() === buscaNome);
    if (igual) return igual;
    const prefixo = produtos.find(p => String(p.nome || '').toLowerCase().startsWith(buscaNome));
    if (prefixo) return prefixo;
  }
  return produtos[0];
}

// Renderiza o dropdown de produtos no modal de Entrada, paginado (20 por página),
// mesmo padrão do select de clientes do PDV:
// - Auto-seleciona o cadastro mais próximo ao digitar nome/ID no filtro
// - Exibe a lista paginada (LIMITE por página) com Anterior/Próxima
// - Se a seleção atual ainda pertence ao filtro, ela é preservada
function renderizarSelectProdutosEntrada(aberto) {
  const sel = document.getElementById('entrada-item-produto');
  if (!sel) return;

  const buscarNomeEl = document.getElementById('entrada-busca-produto-nome');
  const buscarCodigoEl = document.getElementById('entrada-busca-produto-codigo');
  const buscaNome = (buscarNomeEl && buscarNomeEl.value || '').trim().toLowerCase();
  const buscaCodigo = parseInt(buscarCodigoEl && buscarCodigoEl.value, 10) || 0;
  const filtrando = !!(buscaNome || buscaCodigo);
  const valorAtual = sel.value;

  const produtosRelacionados = produtosVendiveis()
    .filter(p => {
      if (buscaNome && !String(p.nome || '').toLowerCase().includes(buscaNome)) return false;
      if (buscaCodigo && obterCodigoProduto(p) !== buscaCodigo) return false;
      return true;
    })
    .sort((a, b) => obterCodigoProduto(a) - obterCodigoProduto(b));

  const baseOptions = (filtrando ? produtosRelacionados : produtosVendiveis())
    .sort((a, b) => obterCodigoProduto(a) - obterCodigoProduto(b));

  let novoValor = valorAtual || '';
  if (novoValor && !baseOptions.some(p => p.id === novoValor)) novoValor = '';
  if (filtrando && !novoValor) {
    const melhor = produtoMaisProximo(produtosRelacionados, buscaNome, buscaCodigo);
    if (melhor) novoValor = melhor.id;
  }
  sel.value = novoValor || '';
  if (aberto !== false) atualizarLabelProdutoEntrada(novoValor);

  const lista = document.getElementById('listaSelectProdutosEntrada');
  if (!lista) return;

  const totalPaginas = Math.max(1, Math.ceil(baseOptions.length / LIMITE_SELECT_CLIENTES));
  if (selectProdutosEntradaPage > totalPaginas) selectProdutosEntradaPage = totalPaginas;
  const inicio = (selectProdutosEntradaPage - 1) * LIMITE_SELECT_CLIENTES;
  const pagina = baseOptions.slice(inicio, inicio + LIMITE_SELECT_CLIENTES);
  renderizarPaginacaoGenerica('select-produto-entrada', baseOptions.length, totalPaginas, selectProdutosEntradaPage);

  if (pagina.length === 0) {
    lista.innerHTML = '<p class="text-gray-500 italic px-4 py-3">Nenhum produto encontrado.</p>';
  } else {
    lista.innerHTML = pagina.map(p => {
      const ativo = p.id === (sel.value || novoValor);
      return `
        <button type="button" onclick="selecionarProdutoEntrada('${escapeDashboard(p.id)}')"
          class="flex items-center gap-2 w-full text-left px-4 py-3 text-sm transition-colors ${ativo ? 'text-amber-400 bg-neutral-700/40' : 'text-gray-200 hover:bg-neutral-700'}">
          <span class="text-gray-500 text-xs w-12 shrink-0">${formatarCodigoProduto(obterCodigoProduto(p))}</span>
          <span class="truncate flex-1">${escapeDashboard(p.nome)}</span>
          ${ativo ? '<i class="fa fa-check text-amber-400"></i>' : ''}
        </button>`;
    }).join('');
  }
}

// Reflete no botão/label o produto atualmente selecionado
function atualizarLabelProdutoEntrada(id) {
  const label = document.getElementById('entradaProdutoLabel');
  if (!label) return;
  const p = id ? (db.estoque.find(x => x.id === id)) : null;
  label.textContent = p ? `${formatarCodigoProduto(obterCodigoProduto(p))} · ${p.nome}` : 'Selecione o produto...';
}

// Abre/fecha o dropdown de produtos da Entrada
function toggleSelectProdutosEntrada(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('entradaProdutoDropdown');
  if (!dropdown) return;
  const isOpen = !dropdown.classList.contains('hidden');
  document.querySelectorAll('.status-dropdown').forEach(el => el.classList.add('hidden'));
  if (!isOpen) {
    selectProdutosEntradaPage = 1;
    renderizarSelectProdutosEntrada();
    dropdown.classList.remove('hidden');
  }
}

// Seleciona um produto no dropdown (guarda no input hidden e fecha)
function selecionarProdutoEntrada(id) {
  const sel = document.getElementById('entrada-item-produto');
  if (sel) sel.value = id;
  atualizarLabelProdutoEntrada(id);
  const dropdown = document.getElementById('entradaProdutoDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  renderizarSelectProdutosEntrada();
}

// Anterior/Próxima do dropdown de produtos da Entrada
function mudarPaginaSelectProdutosEntrada(delta) {
  selectProdutosEntradaPage = Math.max(1, selectProdutosEntradaPage + delta);
  renderizarSelectProdutosEntrada();
}

// Adiciona um item na lista temporária de itens da entrada.
function adicionarItemEntrada() {
  const sel = document.getElementById('entrada-item-produto');
  const produtoId = sel.value;
  if (!produtoId) return showToast('Selecione um produto para o item.', "error");
  const produto = db.estoque.find(p => p.id === produtoId);
  const qtd = parseFloat(document.getElementById('entrada-item-qtd').value);
  const custo = parseFloat(document.getElementById('entrada-item-custo').value);
  if (!(qtd > 0)) return showToast('Informe uma quantidade válida (maior que zero).', "error");
  if (!(custo >= 0) || isNaN(custo)) return showToast('Informe o custo unitário.', "error");

  // Se o produto já está na lista, soma a quantidade (evita duplicar linha).
  const existente = entradaItens.find(i => i.produtoId === produtoId);
  if (existente) {
    const novaQtd = (Number(existente.qtd) || 0) + qtd;
    existente.qtd = novaQtd;
    existente.custoUnitario = custo;
    existente.custoTotal = novaQtd * custo;
  } else {
    entradaItens.push({
      produtoId,
      nome: produto ? produto.nome : 'Produto',
      qtd,
      custoUnitario: custo,
      custoTotal: qtd * custo
    });
  }
  document.getElementById('entrada-item-custo').value = '';
  document.getElementById('entrada-item-qtd').value = '1';
  sel.value = '';
  atualizarLabelProdutoEntrada('');
  const dropdown = document.getElementById('entradaProdutoDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  renderItensEntrada();
}

// Remove um item da lista temporária da entrada.
function removerItemEntrada(index) {
  entradaItens.splice(index, 1);
  renderItensEntrada();
}

// Renderiza a lista de itens + total no modal de entrada.
function renderItensEntrada() {
  const tbody = document.getElementById('entrada-itens-lista');
  const totalEl = document.getElementById('entrada-total');
  if (!tbody) return;
  let total = 0;
  if (!entradaItens.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-500 italic">Nenhum item adicionado.</td></tr>`;
  } else {
    tbody.innerHTML = entradaItens.map((item, i) => {
      total += Number(item.custoTotal) || 0;
      return `
        <tr class="border-b border-gray-700">
          <td class="p-2">${escapeDashboard(item.nome)}</td>
          <td class="p-2 text-center">${Number(item.qtd).toLocaleString('pt-BR')}</td>
          <td class="p-2">${formatarMoeda(item.custoUnitario)}</td>
          <td class="p-2 font-medium">${formatarMoeda(item.custoTotal)}</td>
          <td class="p-2 text-center">${entradaModoConsulta
          ? '<span class="text-gray-600">—</span>'
          : `<button onclick="removerItemEntrada(${i})" class="text-red-500 hover:text-red-400 p-1" title="Remover">
                <i class="fa fa-trash"></i>
              </button>`}
          </td>
        </tr>`;
    }).join('');
  }
  if (totalEl) totalEl.textContent = formatarMoeda(total);
}

/* ------------- CRUD DE ENTRADAS (Firestore) ------------- */

// Próximo número sequencial de entrada (contador atômico em config/contador_entrada).
async function proximoNumeroEntrada() {
  const ref = dbFirestore.collection('config').doc('contador_entrada');
  const resultado = await dbFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? Number(snap.data().numero || 0) : 0;
    const proximo = atual + 1;
    tx.set(ref, { numero: proximo }, { merge: true });
    return proximo;
  });
  return String(resultado).padStart(3, '0');
}

// Lê os dados do cabeçalho do formulário de entrada (valida o essencial).
function lerCabecalhoEntrada() {
  const fornecedorId = document.getElementById('entrada-fornecedor').value;
  if (!fornecedorId) return { erro: 'Selecione o fornecedor.' };
  const fornecedor = fornecedoresLista.find(f => f.id === fornecedorId);
  if (fornecedor && ehFornecedorBloqueado(fornecedor)) {
    return { erro: 'Este fornecedor está bloqueado e não pode receber novas entradas.' };
  }
  if (!entradaItens.length) return { erro: 'Adicione pelo menos um item à entrada.' };
  return {
    fornecedorId,
    fornecedorNome: nomeFornecedor(fornecedorId),
    nota: document.getElementById('entrada-nota').value.trim(),
    serie: document.getElementById('entrada-serie').value.trim(),
    chave: document.getElementById('entrada-chave').value.trim().replace(/\D/g, ''),
    dataEmissao: document.getElementById('entrada-data-emissao').value,
    dataEntrada: document.getElementById('entrada-data-entrada').value,
    observacao: document.getElementById('entrada-observacao').value.trim()
  };
}

// Verifica se já existe outra entrada com o MESMO número de nota (considerando a
// série, quando informada). ignorarId = entrada em edição (não conta como duplicata).
// A validação impede lançar a mesma nota duas vezes (ex.: evitar re-entrada acidental).
function entradaNotaDuplicada(nota, serie, ignorarId) {
  const n = String(nota || '').trim().toLowerCase();
  const s = String(serie || '').trim().toLowerCase();
  if (!n) return false; // sem número de nota, não há como comparar
  return entradasLista.some(e => {
    if (ignorarId && e.id === ignorarId) return false;
    if (String(e.nota || '').trim().toLowerCase() !== n) return false;
    if (s && String(e.serie || '').trim().toLowerCase() !== s) return false;
    return true;
  });
}

// Valida o cabeçalho (campos obrigatórios + nota duplicada + chave NF-e).
// Retorna erro amigável ou null.
function validarCabecalhoEntrada(cab, ignorarId) {
  if (cab.erro) return cab.erro;
  if (entradaNotaDuplicada(cab.nota, cab.serie, ignorarId)) {
    return `Já existe uma entrada com o número de nota ${cab.nota || ''}${cab.serie ? ' · Série ' + cab.serie : ''}. Não é permitido lançar a mesma nota duas vezes.`;
  }
  // Chave NF-e: opcional (pode gravar sem informar), mas se informada deve ter
  // exatamente 44 dígitos (padrão da NF-e — chave de acesso do documento fiscal).
  if (cab.chave) {
    if (cab.chave.length !== 44) {
      return `A chave NF-e deve conter obrigatoriamente 44 dígitos. Você informou ${cab.chave.length}.`;
    }
    if (!/^\d{44}$/.test(cab.chave)) {
      return 'A chave NF-e deve conter apenas números (44 dígitos).';
    }
  }
  return null;
}

let salvandoEntradaEmAndamento = false;

// Salva uma entrada (sem movimentar estoque). Se já existe (entradaEditandoId), atualiza.
// REGRA: uma entrada ESTORNADA continua ESTORNADA ao salvar (dados corrigidos ficam
// prontos para uma nova confirmação); uma RASCUNHO permanece RASCUNHO. Uma entrada
// CONFIRMADA jamais chega aqui via edição (bloqueada em editarEntrada).
async function salvarEntrada(status) {
  if (salvandoEntradaEmAndamento) return;

  const cab = lerCabecalhoEntrada();
  if (cab.erro) return showToast(cab.erro || "Erro na validação.", "error");
  const erroNota = validarCabecalhoEntrada(cab, entradaEditandoId);
  if (erroNota) return showToast(erroNota || "Erro na nota.", "error");

  const btnRascunho = document.getElementById('entrada-btn-salvar-rascunho');
  const btnConfirmar = document.getElementById('entrada-btn-confirmar');
  const originalRascunhoHtml = btnRascunho ? btnRascunho.innerHTML : '';
  const originalConfirmarHtml = btnConfirmar ? btnConfirmar.innerHTML : '';

  salvandoEntradaEmAndamento = true;
  if (btnRascunho) {
    btnRascunho.disabled = true;
    btnRascunho.classList.add('opacity-50', 'cursor-not-allowed');
    btnRascunho.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Salvando...';
  }
  if (btnConfirmar) {
    btnConfirmar.disabled = true;
    btnConfirmar.classList.add('opacity-50', 'cursor-not-allowed');
  }

  // Preserva o status atual ao editar (estornada continua estornada para poder ser
  // confirmada novamente depois). Novas entradas nascem como RASCUNHO.
  let statusGravado = 'RASCUNHO';
  let numeroAtual = '';
  if (entradaEditandoId) {
    const atual = entradasLista.find(x => x.id === entradaEditandoId);
    if (atual) {
      numeroAtual = atual.numero || '';
      if (atual.status === 'ESTORNADA' || atual.status === 'RASCUNHO') {
        statusGravado = atual.status;
      }
    }
  }

  const total = entradaItens.reduce((s, i) => s + (Number(i.custoTotal) || 0), 0);
  const base = {
    ...cab,
    itens: entradaItens,
    total,
    status: statusGravado,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (entradaEditandoId) {
      await dbFirestore.collection('entradas').doc(entradaEditandoId).update(base);
      registrarLog('editar', 'entrada', entradaEditandoId,
        statusGravado === 'ESTORNADA'
          ? `Entrada estornada ${numeroAtual ? '#' + numeroAtual : ''} atualizada — pronta para nova confirmação (${entradaItens.length} item(ns), ${formatarMoeda(total)})`
          : `Rascunho de entrada atualizado (${entradaItens.length} item(ns), ${formatarMoeda(total)})`);
      showToast(statusGravado === 'ESTORNADA' ? 'Entrada estornada atualizada com sucesso! Agora você pode confirmá-la novamente.'
        : 'Rascunho atualizado com sucesso!');
    } else {
      const numero = await proximoNumeroEntrada();
      const ref = await dbFirestore.collection('entradas').add({
        ...base,
        numero,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        dataIso: new Date().toISOString(),
        usuarioId: auth.currentUser ? auth.currentUser.uid : null,
        usuarioNome: usuarioLogadoLabel()
      });
      entradaEditandoId = ref.id; // Vincula imediatamente para evitar novas criações caso o modal permaneça aberto
      registrarLog('incluir', 'entrada', ref.id, `Rascunho de entrada #${numero} criado (${entradaItens.length} item(ns), ${formatarMoeda(total)})`);
      showToast('Rascunho salvo com sucesso!', "success");
    }
    fecharModalEntrada();
  } catch (error) {
    console.error("Erro ao salvar entrada:", error);
    showToast('Erro ao salvar entrada: ' + error.message, "error");
  } finally {
    salvandoEntradaEmAndamento = false;
    if (btnRascunho) {
      btnRascunho.disabled = false;
      btnRascunho.classList.remove('opacity-50', 'cursor-not-allowed');
      btnRascunho.innerHTML = originalRascunhoHtml;
    }
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.classList.remove('opacity-50', 'cursor-not-allowed');
      btnConfirmar.innerHTML = originalConfirmarHtml;
    }
  }
}

// Confirma a entrada: grava com status CONFIRMADA e, em batch, soma o estoque
// dos itens e registra a movimentação (auditoria). Regra: estoque.qtd >= 0.
async function confirmarEntrada() {
  if (salvandoEntradaEmAndamento) return;

  // Defensivo: nunca confirmar uma entrada já CONFIRMADA (edição bloqueada, mas garante).
  if (entradaEditandoId) {
    const registro = entradasLista.find(x => x.id === entradaEditandoId);
    if (registro && registro.status === 'CONFIRMADA') {
      return showToast('Esta entrada já está CONFIRMADA e não pode ser confirmada novamente.', "error");
    }
  }
  const cab = lerCabecalhoEntrada();
  if (cab.erro) return showToast(cab.erro || "Erro na validação.", "error");
  const erroNota = validarCabecalhoEntrada(cab, entradaEditandoId);
  if (erroNota) return showToast(erroNota || "Erro na nota.", "error");
  const reconfirmandoEstornada = entradaEditandoId &&
    entradasLista.some(x => x.id === entradaEditandoId && x.status === 'ESTORNADA');

  const confirmado = await abrirModalConfirmacao({
    titulo: reconfirmandoEstornada ? 'Reconfirmar Entrada' : 'Confirmar Entrada',
    mensagem: reconfirmandoEstornada
      ? 'Confirmar novamente esta entrada estornada?'
      : 'Confirmar a entrada de mercadorias?',
    detalhe: 'O estoque dos produtos será atualizado e não poderá ser desfeito diretamente.',
    textoBtn: 'Confirmar Entrada',
    corBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icone: 'fa-box-check',
    iconeCor: 'bg-emerald-500/20 text-emerald-400'
  });
  if (!confirmado) return;

  const btnRascunho = document.getElementById('entrada-btn-salvar-rascunho');
  const btnConfirmar = document.getElementById('entrada-btn-confirmar');
  const originalRascunhoHtml = btnRascunho ? btnRascunho.innerHTML : '';
  const originalConfirmarHtml = btnConfirmar ? btnConfirmar.innerHTML : '';

  salvandoEntradaEmAndamento = true;
  if (btnConfirmar) {
    btnConfirmar.disabled = true;
    btnConfirmar.classList.add('opacity-50', 'cursor-not-allowed');
    btnConfirmar.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Confirmando...';
  }
  if (btnRascunho) {
    btnRascunho.disabled = true;
    btnRascunho.classList.add('opacity-50', 'cursor-not-allowed');
  }

  const total = entradaItens.reduce((s, i) => s + (Number(i.custoTotal) || 0), 0);
  const user = auth.currentUser;
  try {
    const batch = dbFirestore.batch();

    // Garante estoque suficiente antes de confirmar (evita saldo negativo na regra).
    for (const item of entradaItens) {
      const produto = db.estoque.find(p => p.id === item.produtoId);
      const saldoAtual = Number(produto?.qtd) || 0;
      const novoSaldo = saldoAtual + (Number(item.qtd) || 0);
      if (novoSaldo < 0) {
        return showToast(`Estoque insuficiente para o produto "${item.nome}". Saldo atual: ${saldoAtual}.`, "error");
      }
    }

    let entradaRef;
    if (entradaEditandoId) {
      entradaRef = dbFirestore.collection('entradas').doc(entradaEditandoId);
      batch.update(entradaRef, {
        ...cab,
        itens: entradaItens,
        total,
        status: 'CONFIRMADA',
        confirmadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const numero = await proximoNumeroEntrada();
      entradaRef = dbFirestore.collection('entradas').doc();
      batch.set(entradaRef, {
        ...cab,
        itens: entradaItens,
        total,
        numero,
        status: 'CONFIRMADA',
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        confirmadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        dataIso: new Date().toISOString(),
        usuarioId: user ? user.uid : null,
        usuarioNome: usuarioLogadoLabel()
      });
    }

    // Atualiza o saldo de cada item + cria movimentação de auditoria.
    for (const item of entradaItens) {
      batch.update(dbFirestore.collection('estoque').doc(item.produtoId), {
        qtd: firebase.firestore.FieldValue.increment(Number(item.qtd) || 0),
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(dbFirestore.collection('movimentacoes_estoque').doc(), {
        produtoId: item.produtoId,
        produtoNome: item.nome,
        tipo: 'ENTRADA',
        quantidade: Number(item.qtd) || 0,
        valorUnitario: Number(item.custoUnitario) || 0,
        origem: 'entrada',
        origemId: entradaRef.id,
        numero: null,
        dataIso: new Date().toISOString(),
        usuarioId: user ? user.uid : null,
        usuarioNome: usuarioLogadoLabel()
      });
    }

    await batch.commit();
    registrarLog('confirmar', 'entrada', entradaRef.id, `Entrada confirmada — ${entradaItens.length} item(ns), ${formatarMoeda(total)}`);
    showToast('Entrada confirmada! Estoque atualizado.', "info");
    fecharModalEntrada();
    // Pergunta se o usuário deseja gerar contas a pagar a partir desta entrada.
    const querGerarConta = await abrirModalConfirmacao({
      titulo: 'Contas a Pagar',
      mensagem: 'Deseja gerar a conta a pagar desta entrada?',
      detalhe: `Valor total da entrada: ${formatarMoeda(total)}. Uma nova conta a pagar será aberta para preenchimento.`,
      textoBtn: 'Gerar Conta',
      corBtn: 'bg-amber-500 hover:bg-amber-400 text-neutral-900',
      icone: 'fa-file-invoice-dollar',
      iconeCor: 'bg-amber-500/20 text-amber-400'
    });
    if (querGerarConta) {
      gerarContasPagarEntrada(entradaRef.id);
    }
  } catch (error) {
    console.error("Erro ao confirmar entrada:", error);
    showToast('Erro ao confirmar entrada: ' + error.message, "error");
  } finally {
    salvandoEntradaEmAndamento = false;
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.classList.remove('opacity-50', 'cursor-not-allowed');
      btnConfirmar.innerHTML = originalConfirmarHtml;
    }
    if (btnRascunho) {
      btnRascunho.disabled = false;
      btnRascunho.classList.remove('opacity-50', 'cursor-not-allowed');
      btnRascunho.innerHTML = originalRascunhoHtml;
    }
  }
}

// Estorna uma entrada CONFIRMADA: gera movimentação inversa e restaura o saldo.
async function estornarEntrada(id) {
  const e = entradasLista.find(x => x.id === id);
  if (!e) return;
  if (e.status !== 'CONFIRMADA') return showToast('Somente entradas confirmadas podem ser estornadas.', "error");
  const contaVinculada = contasPagarLista.find(c => c.entradaId === id && c.status === 'PENDENTE');
  const detalheAviso = contaVinculada
    ? 'Atenção: há uma conta a pagar pendente vinculada a esta entrada que será CANCELADA automaticamente.'
    : 'O estoque dos itens será reduzido através de movimentação inversa.';

  const confirmado = await abrirModalConfirmacao({
    titulo: 'Estornar Entrada',
    mensagem: `Deseja realmente estornar a entrada #${e.numero || id}?`,
    detalhe: detalheAviso,
    textoBtn: 'Estornar Entrada',
    corBtn: 'bg-red-600 hover:bg-red-500 text-white',
    icone: 'fa-rotate-left',
    iconeCor: 'bg-red-500/20 text-red-400'
  });
  if (!confirmado) return;

  const itens = e.itens || [];
  if (!itens.length) return showToast('Entrada sem itens para estornar.', "error");

  try {
    // Garante que há saldo suficiente para devolver antes do estorno.
    for (const item of itens) {
      const produto = db.estoque.find(p => p.id === item.produtoId);
      const saldoAtual = Number(produto?.qtd) || 0;
      if (saldoAtual < (Number(item.qtd) || 0)) {
        return showToast(`Saldo insuficiente para estornar "${item.nome}". Saldo atual: ${saldoAtual}.`, "error");
      }
    }

    const user = auth.currentUser;
    const batch = dbFirestore.batch();
    batch.update(dbFirestore.collection('entradas').doc(id), {
      status: 'ESTORNADA',
      estornadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Cancela a conta a pagar pendente vinculada à entrada (mantém a integridade).
    if (contaVinculada) {
      batch.update(dbFirestore.collection('contas_pagar').doc(contaVinculada.id), {
        status: 'CANCELADA',
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    for (const item of itens) {
      batch.update(dbFirestore.collection('estoque').doc(item.produtoId), {
        qtd: firebase.firestore.FieldValue.increment(-(Number(item.qtd) || 0)),
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(dbFirestore.collection('movimentacoes_estoque').doc(), {
        produtoId: item.produtoId,
        produtoNome: item.nome,
        tipo: 'ESTORNO',
        quantidade: -(Number(item.qtd) || 0),
        valorUnitario: Number(item.custoUnitario) || 0,
        origem: 'entrada',
        origemId: id,
        numero: e.numero || null,
        dataIso: new Date().toISOString(),
        usuarioId: user ? user.uid : null,
        usuarioNome: usuarioLogadoLabel()
      });
    }

    await batch.commit();
    registrarLog('estornar', 'entrada', id, `Entrada #${e.numero || id} estornada — ${itens.length} item(ns)${contaVinculada ? '; conta a pagar vinculada cancelada' : ''}`);
    showToast(contaVinculada ? 'Entrada estornada! A conta a pagar vinculada foi cancelada.' : 'Entrada estornada com sucesso!', "success");
  } catch (error) {
    console.error("Erro ao estornar entrada:", error);
    showToast('Erro ao estornar entrada: ' + error.message, "error");
  }
}

// Exclui uma entrada. Via de regra, não se exclui entrada CONFIRMADA: primeiro é
// preciso estorná-la, para então excluí-la. Rascunhos podem ser excluídos livremente.
async function excluirEntrada(id) {
  const e = entradasLista.find(x => x.id === id);
  if (!e) return;
  if (e.status === 'CONFIRMADA') {
    return showToast('Uma entrada CONFIRMADA não pode ser excluída diretamente. Estorne a entrada primeiro e, depois, exclua-a.', "error");
  }
  if (e.status !== 'RASCUNHO' && e.status !== 'ESTORNADA') return showToast('Somente rascunhos ou entradas estornadas podem ser excluídos.', "error");
  const rotulo = e.status === 'ESTORNADA' ? 'entrada estornada' : 'rascunho de entrada';
  const confirmado = await abrirModalConfirmacao({
    titulo: 'Excluir Entrada',
    mensagem: `Excluir ${rotulo} ${e.numero ? '#' + e.numero : ''}?`,
    detalhe: 'Esta ação removerá o registro do sistema e não poderá ser desfeita.',
    textoBtn: 'Excluir',
    corBtn: 'bg-red-600 hover:bg-red-500 text-white',
    icone: 'fa-trash-alt',
    iconeCor: 'bg-red-500/20 text-red-400'
  });
  if (!confirmado) return;
  try {
    await dbFirestore.collection('entradas').doc(id).delete();
    registrarLog('excluir', 'entrada', id, `${rotulo[0].toUpperCase() + rotulo.slice(1)} ${e.numero ? '#' + e.numero : ''} excluído`);
  } catch (error) {
    console.error("Erro ao excluir entrada:", error);
    showToast('Erro ao excluir entrada: ' + error.message, "error");
  }
}

/* ------------- LISTA DE ENTRADAS ------------- */

// Filtros da lista de entradas (status, fornecedor e busca).
function filtrarEntradas() {
  entradasFiltroStatus = document.getElementById('entradas-filtro-status').value || '';
  entradasFiltroFornecedor = document.getElementById('entradas-filtro-fornecedor').value || '';
  entradasPage = 1;
  renderizarEntradas();
}

function mudarPaginaEntradas(delta) {
  entradasPage = Math.max(1, entradasPage + delta);
  renderizarEntradas();
}

// Renderiza a tabela de entradas com filtros e paginação.
function renderizarEntradas() {
  const tbody = document.getElementById('tabelaEntradas');
  if (!tbody) return;

  const busca = (document.getElementById('entradas-filtro-busca')?.value || '').trim().toLowerCase();

  const entradas = entradasLista.filter(e => {
    if (entradasFiltroStatus && e.status !== entradasFiltroStatus) return false;
    if (entradasFiltroFornecedor && e.fornecedorId !== entradasFiltroFornecedor) return false;
    if (busca) {
      const alvo = `${e.numero || ''} ${e.nota || ''} ${nomeFornecedor(e.fornecedorId)} ${e.fornecedorNome || ''}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  if (!entradas.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-500 italic">Nenhuma entrada encontrada.</td></tr>`;
    renderizarPaginacaoGenerica('entradas', 0, 1, 1);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(entradas.length / REGISTROS_POR_PAGINA));
  if (entradasPage > totalPaginas) entradasPage = totalPaginas;
  const inicio = (entradasPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = entradas.slice(inicio, inicio + REGISTROS_POR_PAGINA);

  const badge = (status) => {
    if (status === 'CONFIRMADA') return '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">CONFIRMADA</span>';
    if (status === 'ESTORNADA') return '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">ESTORNADA</span>';
    return '<span class="bg-gray-500/20 text-gray-300 text-xs font-bold px-2 py-1 rounded">RASCUNHO</span>';
  };

  const acoes = (e) => {
    if (e.status === 'RASCUNHO') {
      return `
        <div class="flex items-center justify-center gap-2">
          <button onclick="editarEntrada('${e.id}')" class="text-amber-400 hover:text-amber-300 p-1" title="Editar rascunho">
            <i class="fa fa-pen"></i>
          </button>
          <button onclick="confirmarEntradaExistente('${e.id}')" class="text-emerald-400 hover:text-emerald-300 p-1" title="Confirmar entrada (movimenta estoque)">
            <i class="fa fa-check"></i>
          </button>
          <button onclick="excluirEntrada('${e.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir rascunho">
            <i class="fa fa-trash"></i>
          </button>
        </div>`;
    }
    if (e.status === 'CONFIRMADA') {
      const contaGerada = contasPagarLista.some(c => c.entradaId === e.id && c.status !== 'CANCELADA');
      return `
        <div class="flex items-center justify-center gap-2">
          <button onclick="consultarEntrada('${e.id}')" class="text-sky-400 hover:text-sky-300 p-1" title="Consultar dados da entrada">
            <i class="fa fa-eye"></i>
          </button>
          ${contaGerada
          ? `<button disabled class="text-emerald-600 p-1 cursor-not-allowed" title="Conta a pagar já gerada para esta entrada">
                 <i class="fa fa-money-bill-wave"></i>
               </button>`
          : `<button onclick="gerarContasPagarEntrada('${e.id}')" class="text-emerald-400 hover:text-emerald-300 p-1" title="Gerar conta a pagar desta entrada">
                 <i class="fa fa-money-bill-wave"></i>
               </button>`}
          <button onclick="estornarEntrada('${e.id}')" class="text-orange-400 hover:text-orange-300 p-1" title="Estornar entrada">
            <i class="fa fa-rotate-left"></i>
          </button>
          <button disabled class="text-neutral-600 p-1 cursor-not-allowed"
            title="Estorne a entrada antes de poder excluí-la.">
            <i class="fa fa-trash"></i>
          </button>
        </div>`;
    }
    // ESTORNADA: permite editar os dados (para corrigir), confirmar novamente
    // (atualiza estoque) e excluir.
    return `
      <div class="flex items-center justify-center gap-2">
        <button onclick="editarEntrada('${e.id}')" class="text-amber-400 hover:text-amber-300 p-1" title="Editar dados (corrigir antes de confirmar novamente)">
          <i class="fa fa-pen"></i>
        </button>
        <button onclick="confirmarEntradaExistente('${e.id}')" class="text-emerald-400 hover:text-emerald-300 p-1" title="Confirmar novamente (atualiza estoque)">
          <i class="fa fa-check"></i>
        </button>
        <button onclick="excluirEntrada('${e.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir entrada estornada">
          <i class="fa fa-trash"></i>
        </button>
      </div>`;
  };

  tbody.innerHTML = pagina.map(e => `
    <tr class="border-b border-gray-700 hover:bg-neutral-700/50">
      <td class="p-3 text-gray-400">${e.numero ? '#' + escapeDashboard(e.numero) : '—'}</td>
      <td class="p-3 font-medium">${escapeDashboard(e.fornecedorNome || nomeFornecedor(e.fornecedorId))}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(e.nota || '—')}${e.serie ? ' · Série ' + escapeDashboard(e.serie) : ''}</td>
      <td class="p-3 text-sm">${formatarDataEntrada(e.dataEntrada)}</td>
      <td class="p-3 text-center">${(e.itens || []).length}</td>
      <td class="p-3 font-medium">${formatarMoeda(e.total)}</td>
      <td class="p-3 text-center">${badge(e.status)}</td>
      <td class="p-3 text-center">${acoes(e)}</td>
    </tr>`).join('');

  renderizarPaginacaoGenerica('entradas', entradas.length, totalPaginas, entradasPage);
}

// Confirma diretamente uma entrada já salva (sem abrir o modal): atualiza o estoque
// e registra a movimentação. Permite confirmar RASCUNHOS e também entradas que já
// foram estornadas (novo lançamento de entrada, atualizando o saldo novamente).
async function confirmarEntradaExistente(id) {
  const e = entradasLista.find(x => x.id === id);
  if (!e) return;
  const reconfirmando = e.status === 'ESTORNADA';
  if (e.status !== 'RASCUNHO' && e.status !== 'ESTORNADA') return showToast('Somente rascunhos ou entradas estornadas podem ser confirmadas.', "error");
  const confirmado = await abrirModalConfirmacao({
    titulo: reconfirmando ? 'Reconfirmar Entrada' : 'Confirmar Entrada',
    mensagem: reconfirmando
      ? `Confirmar novamente a entrada #${e.numero || id}?`
      : `Confirmar a entrada #${e.numero || id}?`,
    detalhe: 'O estoque dos produtos vinculados a esta entrada será atualizado no sistema.',
    textoBtn: 'Confirmar Entrada',
    corBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icone: 'fa-box-check',
    iconeCor: 'bg-emerald-500/20 text-emerald-400'
  });
  if (!confirmado) return;

  const itens = e.itens || [];
  if (!itens.length) return showToast('Entrada sem itens para confirmar.', "error");

  try {
    for (const item of itens) {
      const produto = db.estoque.find(p => p.id === item.produtoId);
      const saldoAtual = Number(produto?.qtd) || 0;
      if ((saldoAtual + (Number(item.qtd) || 0)) < 0) {
        return showToast(`Estoque insuficiente para o produto "${item.nome}". Saldo atual: ${saldoAtual}.`, "error");
      }
    }

    const user = auth.currentUser;
    const batch = dbFirestore.batch();
    batch.update(dbFirestore.collection('entradas').doc(id), {
      status: 'CONFIRMADA',
      confirmadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    for (const item of itens) {
      batch.update(dbFirestore.collection('estoque').doc(item.produtoId), {
        qtd: firebase.firestore.FieldValue.increment(Number(item.qtd) || 0),
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(dbFirestore.collection('movimentacoes_estoque').doc(), {
        produtoId: item.produtoId,
        produtoNome: item.nome,
        tipo: 'ENTRADA',
        quantidade: Number(item.qtd) || 0,
        valorUnitario: Number(item.custoUnitario) || 0,
        origem: 'entrada',
        origemId: id,
        numero: e.numero || null,
        dataIso: new Date().toISOString(),
        usuarioId: user ? user.uid : null,
        usuarioNome: usuarioLogadoLabel()
      });
    }
    await batch.commit();
    registrarLog('confirmar', 'entrada', id,
      `Entrada #${e.numero || id} ${reconfirmando ? 'confirmada novamente (após estorno)' : 'confirmada'} — ${itens.length} item(ns), ${formatarMoeda(e.total)}`);
    showToast(reconfirmando ? 'Entrada confirmada novamente! Estoque atualizado.' : 'Entrada confirmada! Estoque atualizado.', "success");
    // Pergunta se o usuário deseja gerar contas a pagar a partir desta entrada.
    if (confirm('Deseja gerar a conta a pagar desta entrada?')) {
      gerarContasPagarEntrada(id);
    }
  } catch (error) {
    console.error("Erro ao confirmar entrada:", error);
    showToast('Erro ao confirmar entrada: ' + error.message, "error");
  }
}

/* ------------- CADASTRO DE PRODUTO (formulário completo, padrão do Cardápio) ------------- */

// Preenche os selects de classificação do modal de cadastro de produto
// (mesma lógica de preencherSelectsClassificacaoProduto, mas com os IDs do modal).
function preencherSelectsClassificacaoModal() {
  ['marca', 'grupo', 'subgrupo'].forEach(tipo => {
    const select = document.getElementById(`rapido-${tipo}`);
    if (!select) return;
    const valores = obterListaClassificacao(tipo);
    select.innerHTML = `<option value="">Selecione...</option>` +
      valores.map(v => `<option value="${escapeDashboard(v)}">${escapeDashboard(v)}</option>`).join('');
  });
}

function abrirModalProdutoRapido() {
  document.getElementById('rapido-nome').value = '';
  document.getElementById('rapido-imagem').value = '';
  preencherSelectsClassificacaoModal();
  document.getElementById('rapido-marca').value = '';
  document.getElementById('rapido-grupo').value = '';
  document.getElementById('rapido-subgrupo').value = '';
  document.getElementById('rapido-codigo-barras').value = '';
  document.getElementById('rapido-preco').value = '';
  document.getElementById('rapido-qtd').value = '0';
  const modal = document.getElementById('modalProdutoRapido');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('rapido-nome').focus(), 50);
}

function fecharModalProdutoRapido() {
  const modal = document.getElementById('modalProdutoRapido');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Cria um produto no Cardápio (formulário completo, mesmo padrão da tela de estoque)
// e seleciona no form da entrada.
async function salvarProdutoRapido() {
  const nome = document.getElementById('rapido-nome').value.trim();
  const imagem = document.getElementById('rapido-imagem').value.trim();
  const marca = document.getElementById('rapido-marca').value.trim();
  const grupo = document.getElementById('rapido-grupo').value.trim();
  const subgrupo = document.getElementById('rapido-subgrupo').value.trim();
  const codigoBarras = document.getElementById('rapido-codigo-barras').value.trim().replace(/\D/g, '');
  const preco = parseFloat(document.getElementById('rapido-preco').value);
  const qtd = parseInt(document.getElementById('rapido-qtd').value);

  if (!nome) return showToast('Informe o nome do produto.', "error");
  if (isNaN(preco) || preco < 0) return showToast('Informe o preço de venda.', "error");
  if (isNaN(qtd) || qtd < 0) return showToast('Informe a quantidade em estoque.', "error");

  // Validação do código de barras EAN-13: opcional; se preenchido, deve ter 13 dígitos com dígito verificador válido.
  if (codigoBarras) {
    if (!/^\d{13}$/.test(codigoBarras)) {
      return showToast("Código de barras inválido. O EAN-13 deve ter exatamente 13 dígitos.", "error");
    }
    if (calcularDigitoVerificadorEAN13(codigoBarras.slice(0, 12)) !== parseInt(codigoBarras[12], 10)) {
      return showToast("Código de barras inválido. O dígito verificador (13º) não confere.", "error");
    }
  }

  // Validação da classificação: só aceita valores cadastrados nas Configurações.
  const classificacaoInvalida =
    (marca && !marcasCadastradas.some(v => v.toLowerCase() === marca.toLowerCase()) ? 'Marca "' + marca + '"' : '') ||
    (grupo && !gruposCadastrados.some(v => v.toLowerCase() === grupo.toLowerCase()) ? 'Grupo "' + grupo + '"' : '') ||
    (subgrupo && !subgruposCadastrados.some(v => v.toLowerCase() === subgrupo.toLowerCase()) ? 'Subgrupo "' + subgrupo + '"' : '');
  if (classificacaoInvalida) {
    return showToast(`Não é possível vincular: ${classificacaoInvalida} não está cadastrada nas Configurações. Cadastre a opção e tente novamente.`, "error");
  }

  try {
    const ref = await dbFirestore.collection('estoque').add({
      nome,
      imagem,
      marca,
      grupo,
      subgrupo,
      codigoBarras,
      preco,
      qtd,
      bloqueado: false,
      codigo: proximoCodigoProduto(),
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    });
    registrarLog('incluir', 'produto', ref.id, `Produto "${nome}" cadastrado (tela Entradas)`, { nome, marca, grupo, subgrupo, codigoBarras, preco, qtd });
    fecharModalProdutoRapido();
    preencherSelectProdutosEntrada();
    const sel = document.getElementById('entrada-item-produto');
    if (sel) {
      sel.value = ref.id;
      atualizarLabelProdutoEntrada(ref.id);
      renderizarSelectProdutosEntrada();
    }
    showToast(`Produto "${nome}" cadastrado`, "success");
  } catch (error) {
    console.error("Erro ao cadastrar produto:", error);
    showToast('Erro ao cadastrar produto: ' + error.message, "error");
  }
}

// Expor funções para o escopo global para uso em onclick
window.mostrarPagina = mostrarPagina;
window.addCliente = addCliente;
window.deleteCliente = deleteCliente;
window.filtrarClientesBusca = filtrarClientesBusca;
window.filtrarClientesStatus = filtrarClientesStatus;
window.bloquearCliente = bloquearCliente;
window.mudarPaginaClientes = mudarPaginaClientes;
window.addProduto = addProduto;
window.editProduto = editProduto;
window.cancelEdit = cancelEdit;
window.calcularDigitoVerificadorEAN13 = calcularDigitoVerificadorEAN13;
window.tratarInputCodigoBarras = tratarInputCodigoBarras;
window.deleteProduto = deleteProduto;
window.bloquearProduto = bloquearProduto;
window.mudarPaginaEstoque = mudarPaginaEstoque;
window.filtrarEstoqueStatus = filtrarEstoqueStatus;
window.filtrarEstoqueBusca = filtrarEstoqueBusca;
window.addToCart = addToCart;
window.updateCartItemQtd = updateCartItemQtd;
window.finalizarVenda = finalizarVenda;
window.updateOrderStatus = updateOrderStatus;
window.toggleDropdown = toggleDropdown;
window.renderizarSelectClientes = renderizarSelectClientes;
window.filtrarProdutosVenda = filtrarProdutosVenda;
window.filtrarSelectClientes = filtrarSelectClientes;
window.mudarPaginaProdutosVenda = mudarPaginaProdutosVenda;
window.toggleSelectClientes = toggleSelectClientes;
window.selecionarClientePDV = selecionarClientePDV;
window.mudarPaginaSelectClientes = mudarPaginaSelectClientes;
window.mostrarAbaRelatorio = mostrarAbaRelatorio;
window.mostrarAbaConfig = mostrarAbaConfig;
window.salvarHorarioFuncionamento = salvarHorarioFuncionamento;
window.filtrarLogOperacoes = filtrarLogOperacoes;
window.limparFiltrosLogOperacoes = limparFiltrosLogOperacoes;
window.mudarPaginaLogOperacoes = mudarPaginaLogOperacoes;
window.recarregarLogOperacoes = recarregarLogOperacoes;
window.gerarRelatorioVendas = gerarRelatorioVendas;
window.exportarRelatorioVendasPDF = exportarRelatorioVendasPDF;
window.verProdutosRelVenda = verProdutosRelVenda;
window.mudarPaginaRelVendasItens = mudarPaginaRelVendasItens;
window.gerarRelatorioEntradas = gerarRelatorioEntradas;
window.exportarRelatorioEntradasPDF = exportarRelatorioEntradasPDF;
window.mudarPaginaRelEntradas = mudarPaginaRelEntradas;
window.verProdutosRelEntrada = verProdutosRelEntrada;
window.mudarPaginaRelEntradasItens = mudarPaginaRelEntradasItens;
window.filtrarRelatorioEstoque = filtrarRelatorioEstoque;
window.filtrarRelatorioEstoqueStatus = filtrarRelatorioEstoqueStatus;
window.gerarRelatorioEstoque = gerarRelatorioEstoque;
window.exportarRelatorioEstoquePDF = exportarRelatorioEstoquePDF;
window.filtrarRelatorioClientesStatus = filtrarRelatorioClientesStatus;
window.gerarRelatorioClientes = gerarRelatorioClientes;
window.exportarRelatorioClientesPDF = exportarRelatorioClientesPDF;
window.mudarPaginaRelClientes = mudarPaginaRelClientes;
window.gerarRelatorioCaixa = gerarRelatorioCaixa;
window.verLancamentosRelCaixa = verLancamentosRelCaixa;
window.exportarRelatorioCaixaPDF = exportarRelatorioCaixaPDF;
window.abrirModalDetalhes = abrirModalDetalhes;
window.fecharModalDetalhes = fecharModalDetalhes;
window.imprimirComandaAtual = imprimirComandaAtual;
window.imprimirComprovanteAtual = imprimirComprovanteAtual;
window.filtrarPedidosBoard = filtrarPedidosBoard;
window.mudarPagina = mudarPagina;
window.mudarPaginaHistorico = mudarPaginaHistorico;
window.mudarPaginaHistoricoCaixas = mudarPaginaHistoricoCaixas;
window.mudarPaginaRelVendas = mudarPaginaRelVendas;
window.mudarPaginaRelEstoque = mudarPaginaRelEstoque;
window.mudarPaginaRelCaixa = mudarPaginaRelCaixa;
window.mudarPaginaRelCaixaLanc = mudarPaginaRelCaixaLanc;
window.toggleSidebar = toggleSidebar;
window.toggleNotificacoes = toggleNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.salvarPerfil = salvarPerfil;
window.enviarResetSenhaProprio = enviarResetSenhaProprio;
window.uploadFotoPerfil = uploadFotoPerfil;
window.previewFotoPerfil = previewFotoPerfil;
window.salvarFuncionario = salvarFuncionario;
window.enviarResetSenhaFuncionario = enviarResetSenhaFuncionario;
window.promoverParaAdmin = promoverParaAdmin;
window.adicionarClassificacao = adicionarClassificacao;
window.removerClassificacao = removerClassificacao;
window.previewLogoApp = previewLogoApp;
window.aplicarLogoApp = aplicarLogoApp;
window.syncColorPicker = syncColorPicker;
window.aplicarPreset = aplicarPreset;
window.salvarPersonalizacao = salvarPersonalizacao;
window.abrirCaixa = abrirCaixa;
window.salvarLancamentoCaixa = salvarLancamentoCaixa;
window.fecharCaixa = fecharCaixa;
window.atualizarDiferencaCaixa = atualizarDiferencaCaixa;
window.login = login;
window.logout = logout;
window.abrirModalCadastro = abrirModalCadastro;
window.fecharModalCadastro = fecharModalCadastro;
window.cadastrarNovoFuncionario = cadastrarNovoFuncionario;
window.salvarConfigLoja = salvarConfigLoja;
window.salvarBannerConfig = salvarBannerConfig;
window.adicionarMetodoPagamento = adicionarMetodoPagamento;
// Tela Entradas de Mercadoria
window.mostrarAbaEntradas = mostrarAbaEntradas;
window.editarFornecedor = editarFornecedor;
window.salvarFornecedor = salvarFornecedor;
window.excluirFornecedor = excluirFornecedor;
window.filtrarFornecedoresBusca = filtrarFornecedoresBusca;
window.filtrarFornecedoresStatus = filtrarFornecedoresStatus;
window.mudarPaginaFornecedores = mudarPaginaFornecedores;
window.bloquearFornecedor = bloquearFornecedor;
window.filtrarRelatorioFornecedoresStatus = filtrarRelatorioFornecedoresStatus;
window.gerarRelatorioFornecedores = gerarRelatorioFornecedores;
window.mudarPaginaRelFornecedores = mudarPaginaRelFornecedores;
window.exportarRelatorioFornecedoresPDF = exportarRelatorioFornecedoresPDF;
window.novaEntrada = novaEntrada;
window.editarEntrada = editarEntrada;
window.consultarEntrada = consultarEntrada;
window.fecharModalEntrada = fecharModalEntrada;
window.preencherSelectProdutosEntrada = preencherSelectProdutosEntrada;
window.filtrarSelectProdutosEntrada = filtrarSelectProdutosEntrada;
window.renderizarSelectProdutosEntrada = renderizarSelectProdutosEntrada;
window.toggleSelectProdutosEntrada = toggleSelectProdutosEntrada;
window.selecionarProdutoEntrada = selecionarProdutoEntrada;
window.mudarPaginaSelectProdutosEntrada = mudarPaginaSelectProdutosEntrada;
window.adicionarItemEntrada = adicionarItemEntrada;
window.removerItemEntrada = removerItemEntrada;
window.renderItensEntrada = renderItensEntrada;
window.salvarEntrada = salvarEntrada;
window.confirmarEntrada = confirmarEntrada;
window.confirmarEntradaExistente = confirmarEntradaExistente;
window.estornarEntrada = estornarEntrada;
window.excluirEntrada = excluirEntrada;
window.filtrarEntradas = filtrarEntradas;
window.mudarPaginaEntradas = mudarPaginaEntradas;
window.abrirModalProdutoRapido = abrirModalProdutoRapido;
window.fecharModalProdutoRapido = fecharModalProdutoRapido;
window.validarChaveNFEInput = validarChaveNFEInput;
window.salvarProdutoRapido = salvarProdutoRapido;
// Tela Contas a Pagar
window.mostrarAbaContas = mostrarAbaContas;
window.novaContaAvulsa = novaContaAvulsa;
window.gerarContasPagarEntrada = gerarContasPagarEntrada;
window.fecharModalContaPagar = fecharModalContaPagar;
window.salvarContaPagar = salvarContaPagar;
window.filtrarContasPagar = filtrarContasPagar;
window.mudarPaginaContasEmAberto = mudarPaginaContasEmAberto;
window.mudarPaginaContasPagas = mudarPaginaContasPagas;
window.editarContaPagar = editarContaPagar;
window.cancelarContaPagar = cancelarContaPagar;
window.darBaixaConta = darBaixaConta;
window.fecharModalBaixaConta = fecharModalBaixaConta;
window.confirmarBaixaConta = confirmarBaixaConta;
window.verBaixasConta = verBaixasConta;
window.fecharModalVerBaixas = fecharModalVerBaixas;
// Relatório de Contas a Pagar
window.gerarRelatorioContas = gerarRelatorioContas;
window.mudarPaginaRelContas = mudarPaginaRelContas;
window.exportarRelatorioContasPDF = exportarRelatorioContasPDF;

/* ========== MÓDULO CADASTROS ========== */

// Abas do módulo Cadastros
function mostrarAbaCadastros(aba) {
  ['produtos', 'clientes', 'fornecedores'].forEach(t => {
    const tabBtn = document.getElementById('aba-cadastros-' + t);
    const tabContent = document.getElementById('cadastros-aba-' + t);
    if (tabBtn) tabBtn.classList.toggle('active', aba === t);
    if (tabContent) tabContent.classList.toggle('hidden', aba !== t);
  });
  if (aba === 'produtos') renderizarCadastroEstoque();
  if (aba === 'clientes') renderizarCadastroClientes();
  if (aba === 'fornecedores') renderizarCadastroFornecedores();
}

// Estado de paginação/filtro dos cadastros
let cadEstoquePage = 1, cadEstoqueFiltroStatus = 'todos';
let cadClientesPage = 1, cadClientesFiltroStatus = 'todos';
let cadFornecedoresPage = 1, cadFornecedoresFiltroStatus = 'todos';

/* --- CADASTRO DE PRODUTOS --- */
function filtrarCadastroEstoqueStatus(filtro) {
  cadEstoqueFiltroStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('cad-estq-status-' + f);
    if (el) el.classList.toggle('active', cadEstoqueFiltroStatus === f);
  });
  cadEstoquePage = 1;
  renderizarCadastroEstoque();
}
function filtrarCadastroEstoqueBusca() { cadEstoquePage = 1; renderizarCadastroEstoque(); }
function mudarPaginaCadastroEstoque(delta) { cadEstoquePage += delta; renderizarCadastroEstoque(); }

function renderizarCadastroEstoque() {
  const tbody = document.getElementById('cad-tabelaEstoque');
  if (!tbody) return;
  preencherSelectsClassificacaoCadastro();
  const buscaNome = ((document.getElementById('cad-estq-busca-nome') || {}).value || '').trim().toLowerCase();
  const buscaCodigo = parseInt((document.getElementById('cad-estq-busca-codigo') || {}).value, 10);
  const produtos = produtosVendiveis().filter(p => {
    if (cadEstoqueFiltroStatus === 'liberados') return !ehProdutoBloqueado(p);
    if (cadEstoqueFiltroStatus === 'bloqueados') return ehProdutoBloqueado(p);
    return true;
  }).filter(p => {
    if (buscaNome && !String(p.nome || '').toLowerCase().includes(buscaNome)) return false;
    if (buscaCodigo && obterCodigoProduto(p) !== buscaCodigo) return false;
    return true;
  }).sort((a, b) => obterCodigoProduto(a) - obterCodigoProduto(b));
  if (produtos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-gray-500 italic">Nenhum produto cadastrado.</td></tr>';
    renderizarPaginacaoGenerica('cad-estoque', 0, 1, 1);
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(produtos.length / REGISTROS_POR_PAGINA));
  if (cadEstoquePage > totalPaginas) cadEstoquePage = totalPaginas;
  const inicio = (cadEstoquePage - 1) * REGISTROS_POR_PAGINA;
  const pagina = produtos.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  tbody.innerHTML = pagina.map(produto => {
    const bloqueado = ehProdutoBloqueado(produto);
    const temMov = produtoTemMovimentacao(produto.id);
    return `<tr class="border-b border-gray-700 hover:bg-neutral-700/50 ${bloqueado ? 'opacity-60' : ''}">
      <td class="p-3 text-gray-400">${formatarCodigoProduto(obterCodigoProduto(produto))}</td>
      <td class="p-3 font-medium">${escapeDashboard(produto.nome)}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(produto.codigoBarras || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(produto.marca || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(produto.grupo || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(produto.subgrupo || '-')}</td>
      <td class="p-3">R$ ${Number(produto.preco || 0).toFixed(2)}</td>
      <td class="p-3 text-center">${Number(produto.qtd || 0)}</td>
      <td class="p-3 text-center">${bloqueado
        ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
        : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}</td>
      <td class="p-3 text-center"><div class="flex items-center justify-center gap-2">
        <button onclick="editarProdutoCadastro('${produto.id}')" class="text-amber-500 hover:text-amber-400 p-1" title="Editar"><i class="fa fa-edit"></i></button>
        <button onclick="bloquearProduto('${produto.id}', ${bloqueado ? 'false' : 'true'})" class="${bloqueado ? 'text-emerald-500 hover:text-emerald-400' : 'text-orange-500 hover:text-orange-400'} p-1" title="${bloqueado ? 'Liberar' : 'Bloquear'}"><i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i></button>
        ${temMov || bloqueado
        ? `<button disabled class="text-neutral-600 p-1 cursor-not-allowed" title="${bloqueado ? 'Bloqueado' : 'Com movimentação'}"><i class="fa fa-trash"></i></button>`
        : `<button onclick="deleteProduto('${produto.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir"><i class="fa fa-trash"></i></button>`}
      </div></td>
    </tr>`;
  }).join('');
  renderizarPaginacaoGenerica('cad-estoque', produtos.length, totalPaginas, cadEstoquePage);
}

function editarProdutoCadastro(id) {
  const p = db.estoque.find(x => x.id === id);
  if (!p) return;
  document.getElementById('cad-produto-id').value = p.id;
  document.getElementById('cad-produto-nome').value = p.nome || '';
  document.getElementById('cad-produto-descricao').value = p.descricao || '';
  document.getElementById('cad-produto-imagem').value = p.imagem || '';
  document.getElementById('cad-produto-codigo-barras').value = p.codigoBarras || '';
  document.getElementById('cad-produto-preco').value = p.preco || '';
  document.getElementById('cad-produto-qtd').value = p.qtd || '';
  document.getElementById('cad-produto-title').textContent = 'Editar Produto';
  document.getElementById('cad-btn-cancel-edit').classList.remove('hidden');
  // Seleciona marca/grupo/subgrupo nos selects dinâmicos
  function setSelectValue(id, val) {
    const sel = document.getElementById(id);
    if (!sel || !val) return;
    for (const opt of sel.options) { if (opt.value === val) { sel.value = val; return; } }
    const o = document.createElement('option'); o.value = val; o.textContent = val;
    sel.appendChild(o); sel.value = val;
  }
  setSelectValue('cad-produto-marca', p.marca);
  setSelectValue('cad-produto-grupo', p.grupo);
  setSelectValue('cad-produto-subgrupo', p.subgrupo);
}
function cancelEditCadastro() {
  document.getElementById('cad-form-estoque').reset();
  document.getElementById('cad-produto-id').value = '';
  document.getElementById('cad-produto-title').textContent = 'Adicionar Novo Produto';
  document.getElementById('cad-btn-cancel-edit').classList.add('hidden');
}

async function addProdutoCadastro() {
  const id = document.getElementById('cad-produto-id').value;
  const nome = document.getElementById('cad-produto-nome').value.trim();
  const descricao = document.getElementById('cad-produto-descricao').value.trim();
  const imagem = document.getElementById('cad-produto-imagem').value.trim();
  const marca = document.getElementById('cad-produto-marca').value.trim();
  const grupo = document.getElementById('cad-produto-grupo').value.trim();
  const subgrupo = document.getElementById('cad-produto-subgrupo').value.trim();
  const codigoBarras = document.getElementById('cad-produto-codigo-barras').value.trim().replace(/\D/g, '');
  const preco = parseFloat(document.getElementById('cad-produto-preco').value);
  const qtd = parseInt(document.getElementById('cad-produto-qtd').value);
  if (!nome || isNaN(preco) || isNaN(qtd)) return showToast("Preencha todos os campos corretamente: Nome, Preço e Quantidade.", "error");
  if (codigoBarras) {
    if (!/^\d{13}$/.test(codigoBarras)) return showToast("Código de barras inválido. O EAN-13 deve ter exatamente 13 dígitos.", "error");
    if (calcularDigitoVerificadorEAN13(codigoBarras.slice(0, 12)) !== parseInt(codigoBarras[12], 10)) return showToast("Código de barras inválido. O dígito verificador (13º) não confere.", "error");
  }
  const classificacaoInvalida =
    (marca && !marcasCadastradas.some(v => v.toLowerCase() === marca.toLowerCase()) ? 'Marca "' + marca + '"' : '') ||
    (grupo && !gruposCadastrados.some(v => v.toLowerCase() === grupo.toLowerCase()) ? 'Grupo "' + grupo + '"' : '') ||
    (subgrupo && !subgruposCadastrados.some(v => v.toLowerCase() === subgrupo.toLowerCase()) ? 'Subgrupo "' + subgrupo + '"' : '');
  if (classificacaoInvalida) return showToast(`Não é possível vincular: ${classificacaoInvalida} não está cadastrada nas Configurações.`, "error");
  try {
    if (id) {
      const existente = db.estoque.find(p => p.id === id);
      const codigo = Number(existente && existente.codigo) > 0 ? Number(existente.codigo) : obterCodigoProduto(existente);
      await dbFirestore.collection('estoque').doc(id).update({ nome, descricao, imagem, marca, grupo, subgrupo, codigoBarras, preco, qtd, codigo, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() });
      registrarLog('editar', 'produto', id, `Produto "${nome}" atualizado (Cadastros)`, { nome, preco, qtd });
      showToast(`Produto "${nome}" atualizado`, "success");
    } else {
      const docRef = await dbFirestore.collection('estoque').add({ nome, descricao, imagem, marca, grupo, subgrupo, codigoBarras, preco, qtd, codigo: proximoCodigoProduto(), bloqueado: false, lastUpdate: firebase.firestore.FieldValue.serverTimestamp() });
      registrarLog('incluir', 'produto', docRef.id, `Produto "${nome}" cadastrado (Cadastros)`, { nome, preco, qtd });
      showToast(`Produto "${nome}" cadastrado`, "success");
    }
    cancelEditCadastro();
  } catch (error) {
    console.error("Erro ao salvar produto (cadastros):", error);
    showToast("Erro ao salvar o produto: " + error.message, "error");
  }
}

/* --- CADASTRO DE CLIENTES --- */
function filtrarCadastroClientesStatus(filtro) {
  cadClientesFiltroStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('cad-cli-status-' + f);
    if (el) el.classList.toggle('active', cadClientesFiltroStatus === f);
  });
  cadClientesPage = 1;
  renderizarCadastroClientes();
}
function filtrarCadastroClientesBusca() { cadClientesPage = 1; renderizarCadastroClientes(); }
function mudarPaginaCadastroClientes(delta) { cadClientesPage += delta; renderizarCadastroClientes(); }

function renderizarCadastroClientes() {
  const tbody = document.getElementById('cad-tabelaClientes');
  if (!tbody) return;
  const buscaNome = ((document.getElementById('cad-cli-busca-nome') || {}).value || '').trim().toLowerCase();
  const buscaCodigo = parseInt((document.getElementById('cad-cli-busca-codigo') || {}).value, 10);
  const clientes = db.clientes.filter(c => {
    if (cadClientesFiltroStatus === 'liberados') return !ehClienteBloqueado(c);
    if (cadClientesFiltroStatus === 'bloqueados') return ehClienteBloqueado(c);
    return true;
  }).filter(c => {
    if (buscaNome && !String(c.nome || '').toLowerCase().includes(buscaNome)) return false;
    if (buscaCodigo && obterCodigoCliente(c) !== buscaCodigo) return false;
    return true;
  }).sort((a, b) => obterCodigoCliente(a) - obterCodigoCliente(b));
  if (clientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500 italic">Nenhum cliente cadastrado.</td></tr>';
    renderizarPaginacaoGenerica('cad-clientes', 0, 1, 1);
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(clientes.length / REGISTROS_POR_PAGINA));
  if (cadClientesPage > totalPaginas) cadClientesPage = totalPaginas;
  const inicio = (cadClientesPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = clientes.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  tbody.innerHTML = pagina.map(cliente => {
    const bloqueado = ehClienteBloqueado(cliente);
    const temMov = clienteTemMovimentacao(cliente.id);
    return `<tr class="border-b border-gray-700 hover:bg-neutral-700/50 ${bloqueado ? 'opacity-60' : ''}">
      <td class="p-3 text-gray-400">${formatarCodigoCliente(obterCodigoCliente(cliente))}</td>
      <td class="p-3 font-medium">${escapeDashboard(cliente.nome)}</td>
      <td class="p-3">${escapeDashboard(cliente.tel)}</td>
      <td class="p-3 text-gray-400 text-sm">${escapeDashboard(cliente.email || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(cliente.endereco || '-')} ${cliente.numero ? ', Nº ' + escapeDashboard(cliente.numero) : ''}</td>
      <td class="p-3 text-center">${bloqueado
        ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
        : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}</td>
      <td class="p-3 text-center"><div class="flex items-center justify-center gap-2">
        <button onclick="editarClienteCadastro('${cliente.id}')" class="text-amber-500 hover:text-amber-400 p-1" title="Editar"><i class="fa fa-edit"></i></button>
        <button onclick="bloquearCliente('${cliente.id}', ${bloqueado ? 'false' : 'true'})" class="${bloqueado ? 'text-emerald-500 hover:text-emerald-400' : 'text-orange-500 hover:text-orange-400'} p-1" title="${bloqueado ? 'Liberar' : 'Bloquear'}"><i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i></button>
        ${temMov || bloqueado
        ? `<button disabled class="text-neutral-600 p-1 cursor-not-allowed"><i class="fa fa-trash"></i></button>`
        : `<button onclick="deleteCliente('${cliente.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir"><i class="fa fa-trash"></i></button>`}
      </div></td>
    </tr>`;
  }).join('');
  renderizarPaginacaoGenerica('cad-clientes', clientes.length, totalPaginas, cadClientesPage);
}

function editarClienteCadastro(id) {
  const c = db.clientes.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cad-cliente-id').value = c.id;
  document.getElementById('cad-cliente-nome').value = c.nome || '';
  document.getElementById('cad-cliente-tel').value = c.tel || '';
  document.getElementById('cad-cliente-email').value = c.email || '';
  document.getElementById('cad-cliente-endereco').value = c.endereco || '';
  document.getElementById('cad-cliente-numero').value = c.numero || '';
  document.getElementById('cad-cliente-cep').value = c.cep || '';
  document.getElementById('cad-cliente-title').textContent = 'Editar Cliente';
  document.getElementById('cad-btn-cancel-edit-cliente').classList.remove('hidden');
}
function cancelEditClienteCadastro() {
  document.getElementById('cad-form-clientes').reset();
  document.getElementById('cad-cliente-id').value = '';
  document.getElementById('cad-cliente-title').textContent = 'Adicionar Novo Cliente';
  document.getElementById('cad-btn-cancel-edit-cliente').classList.add('hidden');
}

async function addClienteCadastro() {
  const editId = document.getElementById('cad-cliente-id').value;
  const nome = document.getElementById('cad-cliente-nome').value.trim();
  const tel = document.getElementById('cad-cliente-tel').value.trim();
  const email = document.getElementById('cad-cliente-email').value.trim();
  const endereco = document.getElementById('cad-cliente-endereco').value.trim();
  const numero = document.getElementById('cad-cliente-numero').value.trim();
  const cep = document.getElementById('cad-cliente-cep').value.trim();
  if (!nome || !tel) return showToast("Os campos Nome e Telefone são obrigatórios.", "error");
  try {
    if (editId) {
      await dbFirestore.collection('clientes').doc(editId).set({ nome, tel, email, endereco, numero, cep }, { merge: true });
      registrarLog('editar', 'cliente', editId, `Cliente "${nome}" atualizado (Cadastros)`, { nome, tel, email });
      showToast(`Cliente "${nome}" atualizado`, "success");
    } else {
      const docRef = await dbFirestore.collection('clientes').add({ nome, tel, email, endereco, numero, cep, codigo: proximoCodigoCliente(), bloqueado: false, since: firebase.firestore.FieldValue.serverTimestamp() });
      registrarLog('incluir', 'cliente', docRef.id, `Cliente "${nome}" cadastrado (Cadastros)`, { nome, tel, email });
      showToast(`Cliente "${nome}" cadastrado`, "success");
    }
    cancelEditClienteCadastro();
  } catch (error) {
    console.error("Erro ao salvar cliente (cadastros):", error);
    showToast("Erro ao salvar o cliente: " + error.message, "error");
  }
}

/* --- CADASTRO DE FORNECEDORES --- */
function filtrarCadastroFornecedoresStatus(filtro) {
  cadFornecedoresFiltroStatus = filtro;
  ['todos', 'liberados', 'bloqueados'].forEach(f => {
    const el = document.getElementById('cad-forn-status-' + f);
    if (el) el.classList.toggle('active', cadFornecedoresFiltroStatus === f);
  });
  cadFornecedoresPage = 1;
  renderizarCadastroFornecedores();
}
function filtrarCadastroFornecedoresBusca() { cadFornecedoresPage = 1; renderizarCadastroFornecedores(); }
function mudarPaginaCadastroFornecedores(delta) { cadFornecedoresPage += delta; renderizarCadastroFornecedores(); }

function renderizarCadastroFornecedores() {
  const tbody = document.getElementById('cad-tabelaFornecedores');
  if (!tbody) return;
  const buscaNome = ((document.getElementById('cad-forn-busca-nome') || {}).value || '').trim().toLowerCase();
  const buscaCodigo = parseInt((document.getElementById('cad-forn-busca-codigo') || {}).value, 10);
  const lista = (fornecedoresLista || []).filter(f => {
    if (cadFornecedoresFiltroStatus === 'liberados') return !f.bloqueado;
    if (cadFornecedoresFiltroStatus === 'bloqueados') return f.bloqueado;
    return true;
  }).filter(f => {
    if (buscaNome && !String(f.nome || '').toLowerCase().includes(buscaNome)) return false;
    if (buscaCodigo && obterCodigoFornecedor(f) !== buscaCodigo) return false;
    return true;
  }).sort((a, b) => obterCodigoFornecedor(a) - obterCodigoFornecedor(b));
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-500 italic">Nenhum fornecedor cadastrado.</td></tr>';
    renderizarPaginacaoGenerica('cad-fornecedores', 0, 1, 1);
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(lista.length / REGISTROS_POR_PAGINA));
  if (cadFornecedoresPage > totalPaginas) cadFornecedoresPage = totalPaginas;
  const inicio = (cadFornecedoresPage - 1) * REGISTROS_POR_PAGINA;
  const pagina = lista.slice(inicio, inicio + REGISTROS_POR_PAGINA);
  tbody.innerHTML = pagina.map(f => {
    const bloqueado = f.bloqueado === true;
    return `<tr class="border-b border-gray-700 hover:bg-neutral-700/50 ${bloqueado ? 'opacity-60' : ''}">
      <td class="p-3 text-gray-400">${formatarCodigoFornecedor(obterCodigoFornecedor(f))}</td>
      <td class="p-3 font-medium">${escapeDashboard(f.nome)}</td>
      <td class="p-3 text-sm">${escapeDashboard(f.documento || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(f.contato || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(f.email || '-')}</td>
      <td class="p-3 text-sm">${escapeDashboard(f.endereco || '-')} ${f.numero ? ', Nº ' + escapeDashboard(f.numero) : ''}</td>
      <td class="p-3 text-center">${bloqueado
        ? '<span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">BLOQUEADO</span>'
        : '<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">LIBERADO</span>'}</td>
      <td class="p-3 text-center"><div class="flex items-center justify-center gap-2">
        <button onclick="editarFornecedorCadastro('${f.id}')" class="text-amber-500 hover:text-amber-400 p-1" title="Editar"><i class="fa fa-edit"></i></button>
        <button onclick="bloquearFornecedor('${f.id}', ${bloqueado ? 'false' : 'true'})" class="${bloqueado ? 'text-emerald-500 hover:text-emerald-400' : 'text-orange-500 hover:text-orange-400'} p-1" title="${bloqueado ? 'Liberar' : 'Bloquear'}"><i class="fa ${bloqueado ? 'fa-unlock' : 'fa-ban'}"></i></button>
        ${fornecedorTemEntrada(f.id) || bloqueado
        ? `<button disabled class="text-neutral-600 p-1 cursor-not-allowed"><i class="fa fa-trash"></i></button>`
        : `<button onclick="excluirFornecedor('${f.id}')" class="text-red-500 hover:text-red-400 p-1" title="Excluir"><i class="fa fa-trash"></i></button>`}
      </div></td>
    </tr>`;
  }).join('');
  renderizarPaginacaoGenerica('cad-fornecedores', lista.length, totalPaginas, cadFornecedoresPage);
}

function editarFornecedorCadastro(id) {
  const f = fornecedoresLista.find(x => x.id === id);
  if (!f) return;
  document.getElementById('cad-fornecedor-id').value = f.id;
  document.getElementById('cad-fornecedor-nome').value = f.nome || '';
  document.getElementById('cad-fornecedor-documento').value = f.documento || '';
  document.getElementById('cad-fornecedor-contato').value = f.contato || '';
  document.getElementById('cad-fornecedor-email').value = f.email || '';
  document.getElementById('cad-fornecedor-endereco').value = f.endereco || '';
  document.getElementById('cad-fornecedor-numero').value = f.numero || '';
  document.getElementById('cad-fornecedor-observacao').value = f.observacao || '';
  document.getElementById('cad-fornecedor-title').textContent = 'Editar Fornecedor';
  document.getElementById('cad-btn-cancel-edit-fornecedor').classList.remove('hidden');
}
function cancelEditFornecedorCadastro() {
  document.getElementById('cad-form-fornecedores').reset();
  document.getElementById('cad-fornecedor-id').value = '';
  document.getElementById('cad-fornecedor-title').textContent = 'Cadastrar Fornecedor';
  document.getElementById('cad-btn-cancel-edit-fornecedor').classList.add('hidden');
}

async function salvarFornecedorCadastro() {
  const editId = document.getElementById('cad-fornecedor-id').value;
  const nome = document.getElementById('cad-fornecedor-nome').value.trim();
  const documento = document.getElementById('cad-fornecedor-documento').value.trim();
  const contato = document.getElementById('cad-fornecedor-contato').value.trim();
  const email = document.getElementById('cad-fornecedor-email').value.trim();
  const endereco = document.getElementById('cad-fornecedor-endereco').value.trim();
  const numero = document.getElementById('cad-fornecedor-numero').value.trim();
  const observacao = document.getElementById('cad-fornecedor-observacao').value.trim();
  if (!nome) return showToast('Informe o nome do fornecedor.', "error");
  try {
    if (editId) {
      await dbFirestore.collection('fornecedores').doc(editId).set({ nome, documento, contato, email, endereco, numero, observacao, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      registrarLog('editar', 'fornecedor', editId, `Fornecedor "${nome}" atualizado (Cadastros)`, { nome, documento });
      showToast('Fornecedor atualizado com sucesso!', "success");
    } else {
      const ref = await dbFirestore.collection('fornecedores').add({ nome, documento, contato, email, endereco, numero, observacao, codigo: proximoCodigoFornecedor(), criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      registrarLog('incluir', 'fornecedor', ref.id, `Fornecedor "${nome}" cadastrado (Cadastros)`, { nome, documento });
      showToast('Fornecedor cadastrado com sucesso!', "success");
    }
    cancelEditFornecedorCadastro();
  } catch (error) {
    console.error("Erro ao salvar fornecedor (cadastros):", error);
    showToast('Erro ao salvar fornecedor: ' + error.message, "error");
  }
}

// Expor funções do módulo Cadastros
window.mostrarAbaCadastros = mostrarAbaCadastros;
window.addProdutoCadastro = addProdutoCadastro;
window.editarProdutoCadastro = editarProdutoCadastro;
window.cancelEditCadastro = cancelEditCadastro;
window.filtrarCadastroEstoqueStatus = filtrarCadastroEstoqueStatus;
window.filtrarCadastroEstoqueBusca = filtrarCadastroEstoqueBusca;
window.mudarPaginaCadastroEstoque = mudarPaginaCadastroEstoque;
window.addClienteCadastro = addClienteCadastro;
window.editarClienteCadastro = editarClienteCadastro;
window.cancelEditClienteCadastro = cancelEditClienteCadastro;
window.filtrarCadastroClientesStatus = filtrarCadastroClientesStatus;
window.filtrarCadastroClientesBusca = filtrarCadastroClientesBusca;
window.mudarPaginaCadastroClientes = mudarPaginaCadastroClientes;
window.salvarFornecedorCadastro = salvarFornecedorCadastro;
window.editarFornecedorCadastro = editarFornecedorCadastro;
window.cancelEditFornecedorCadastro = cancelEditFornecedorCadastro;
window.filtrarCadastroFornecedoresStatus = filtrarCadastroFornecedoresStatus;
window.filtrarCadastroFornecedoresBusca = filtrarCadastroFornecedoresBusca;
window.mudarPaginaCadastroFornecedores = mudarPaginaCadastroFornecedores;

/* ================= COMANDA POR MESA ================= */

function renderizarMesas() {
  const container = document.getElementById('mesas-grid');
  if (!container) return;
  if (mesasLista.length === 0) {
    container.innerHTML = '<p class="text-gray-500 italic col-span-full">Nenhuma mesa configurada.</p>';
    return;
  }
  container.innerHTML = mesasLista.map(mesa => {
    const isOcupada = mesa.status === 'ocupada';
    const bgClass = isOcupada ? 'bg-red-900/30 border-red-500/50' : 'bg-gray-800/50 border-gray-700 hover:border-amber-500/50';
    const textClass = isOcupada ? 'text-red-400' : 'text-green-400';
    const statusText = isOcupada ? 'Ocupada' : 'Livre';
    const total = mesa.total || 0;
    const clienteTexto = mesa.clienteNome ? escapeDashboard(mesa.clienteNome) : '';

    return `
      <div onclick="abrirMesa('${mesa.id}')" class="relative group cursor-pointer border rounded-xl p-4 flex flex-col items-center justify-center transition-all hover:scale-105 ${bgClass}">
        <h3 class="text-3xl font-bold text-white mb-1">${mesa.numero}</h3>
        <span class="text-xs font-semibold uppercase tracking-wider ${textClass}">${statusText}</span>
        ${isOcupada && clienteTexto ? `<span class="mt-1 text-xs text-gray-300 font-medium truncate max-w-full px-1" title="${clienteTexto}"><i class="fa fa-user mr-1 text-amber-400"></i>${clienteTexto}</span>` : ''}
        ${isOcupada ? `<span class="mt-1 text-sm font-bold text-amber-500">${formatarMoeda(total)}</span>` : ''}
      </div>
    `;
  }).join('');
}

async function salvarConfigMesas() {
  const qtdInput = document.getElementById('mesas-qtd');
  const statusMsg = document.getElementById('mesas-config-status');
  if (!qtdInput || !statusMsg) return;

  const qtd = parseInt(qtdInput.value, 10);
  if (isNaN(qtd) || qtd < 1 || qtd > 100) return showToast('Quantidade inválida', 'error');

  statusMsg.textContent = 'Salvando...';
  statusMsg.classList.remove('hidden', 'text-green-400');
  statusMsg.classList.add('text-amber-400');

  try {
    const batch = dbFirestore.batch();

    // Atualiza/cria até a quantidade desejada
    for (let i = 1; i <= qtd; i++) {
      const numeroStr = String(i).padStart(2, '0');
      const ref = dbFirestore.collection('mesas').doc(`mesa_${numeroStr}`);
      const existe = mesasLista.find(m => m.id === `mesa_${numeroStr}`);
      if (!existe) {
        batch.set(ref, {
          numero: numeroStr,
          status: 'disponivel',
          itens: [],
          total: 0,
          clienteNome: null,
          numeroPedido: null,
          vendaId: null,
          lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    // Deleta as mesas que excedem a quantidade
    const mesasExcedentes = mesasLista.filter(m => parseInt(m.numero, 10) > qtd);
    for (const m of mesasExcedentes) {
      if (m.status === 'ocupada') {
        throw new Error(`A mesa ${m.numero} está ocupada. Feche-a antes de reduzir a quantidade.`);
      }
      batch.delete(dbFirestore.collection('mesas').doc(m.id));
    }

    await batch.commit();
    statusMsg.textContent = 'Salvo!';
    statusMsg.classList.remove('text-amber-400');
    statusMsg.classList.add('text-green-400');
    setTimeout(() => statusMsg.classList.add('hidden'), 3000);
    showToast('Configuração de mesas atualizada.', 'success');
  } catch (error) {
    console.error(error);
    statusMsg.textContent = 'Erro';
    statusMsg.classList.remove('text-amber-400');
    statusMsg.classList.add('text-red-400');
    showToast(error.message, 'error');
  }
}

let mesaIdParaAbrir = null;

function abrirMesa(mesaId) {
  const mesa = mesasLista.find(m => m.id === mesaId);
  console.log('[abrirMesa] Clicado na mesa:', mesaId, 'Dados da mesa:', mesa);
  if (!mesa) {
    console.warn('[abrirMesa] Mesa não encontrada na lista:', mesaId);
    return;
  }

  // Se a mesa estiver livre (disponível), solicita obrigatoriamente o nome do cliente
  if (mesa.status !== 'ocupada') {
    mesaIdParaAbrir = mesaId;
    const modal = document.getElementById('modal-abrir-mesa-cliente');
    const titulo = document.getElementById('modal-abrir-mesa-titulo');
    const input = document.getElementById('input-abrir-mesa-cliente');
    const erro = document.getElementById('erro-abrir-mesa-cliente');

    if (titulo) titulo.textContent = `Abrir Mesa ${mesa.numero}`;
    if (input) {
      input.value = '';
      input.classList.remove('border-red-500');
    }
    if (erro) erro.classList.add('hidden');

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => { if (input) input.focus(); }, 100);
    }
    return;
  }

  // Se a mesa já está ocupada, abre diretamente a comanda
  carregarComandaPainel(mesaId);
}

function fecharModalAbrirMesaCliente() {
  const modal = document.getElementById('modal-abrir-mesa-cliente');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  mesaIdParaAbrir = null;
}

async function confirmarAberturaMesaComCliente() {
  if (!mesaIdParaAbrir) return;
  const mesa = mesasLista.find(m => m.id === mesaIdParaAbrir);
  if (!mesa) {
    fecharModalAbrirMesaCliente();
    return;
  }

  const input = document.getElementById('input-abrir-mesa-cliente');
  const erro = document.getElementById('erro-abrir-mesa-cliente');
  const nomeCliente = (input?.value || '').trim();

  if (!nomeCliente) {
    if (erro) erro.classList.remove('hidden');
    if (input) {
      input.classList.add('border-red-500');
      input.focus();
    }
    showToast('Informe o nome do cliente para abrir a mesa.', 'warning');
    return;
  }

  const mesaId = mesaIdParaAbrir;
  try {
    await dbFirestore.collection('mesas').doc(mesaId).update({
      status: 'ocupada',
      clienteNome: nomeCliente,
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    });

    registrarLog('mesa', 'mesas', mesaId, `Mesa ${mesa.numero} aberta para o cliente "${nomeCliente}".`, {
      mesaId: mesaId,
      clienteNome: nomeCliente
    });

    showToast(`Mesa ${mesa.numero} aberta para ${nomeCliente}!`, 'success');
    fecharModalAbrirMesaCliente();
    carregarComandaPainel(mesaId);
  } catch (err) {
    console.error('Erro ao abrir mesa:', err);
    showToast('Não foi possível abrir a mesa.', 'error');
  }
}

function carregarComandaPainel(mesaId) {
  try {
    const mesa = mesasLista.find(m => m.id === mesaId);
    console.log('[carregarComandaPainel] Carregando mesa:', mesaId, mesa);
    if (!mesa) {
      console.warn('[carregarComandaPainel] Mesa não encontrada:', mesaId);
      return;
    }

    mesaAtualId = mesaId;
    // Carrega os itens já salvos no banco como comandaItens (com preço garantido caso haja legado)
    comandaItens = (mesa.itens || []).map(i => {
      const estoqueProd = db.estoque ? db.estoque.find(p => p.id === i.id) : null;
      const precoReal = (i.preco !== undefined && i.preco !== null && i.preco > 0)
        ? Number(i.preco)
        : (estoqueProd ? Number(estoqueProd.preco ?? estoqueProd.precoVenda ?? 0) : 0);
      return {
        ...i,
        preco: precoReal
      };
    });
    itensPendentesComanda = []; // Limpa rascunho de itens a adicionar

    const nomeClienteExibir = mesa.clienteNome ? ` — Cliente: ${mesa.clienteNome}` : '';
    const tituloEl = document.getElementById('comanda-titulo');
    const subtituloEl = document.getElementById('comanda-subtitulo');
    const buscaEl = document.getElementById('comanda-busca');
    const panel = document.getElementById('comanda-panel');

    if (tituloEl) tituloEl.textContent = `Mesa ${mesa.numero}${nomeClienteExibir}`;
    if (subtituloEl) subtituloEl.textContent = mesa.status === 'ocupada' ? `Em andamento` : `Livre`;
    if (buscaEl) buscaEl.value = '';

    renderizarProdutosComanda();
    renderizarComandaItens();

    if (panel) {
      panel.classList.remove('hidden');
      panel.classList.add('flex');
    } else {
      console.error('[carregarComandaPainel] Elemento comanda-panel não encontrado no DOM!');
    }
  } catch (e) {
    console.error('[carregarComandaPainel] Erro ao carregar painel da comanda:', e);
    showToast('Erro ao carregar comanda da mesa: ' + e.message, 'error');
  }
}

function fecharComandaPanel() {
  const panel = document.getElementById('comanda-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.classList.remove('flex');
  }
  mesaAtualId = null;
  comandaItens = [];
  itensPendentesComanda = [];
}

function renderizarProdutosComanda() {
  const container = document.getElementById('comanda-lista-produtos');
  const busca = (document.getElementById('comanda-busca').value || '').toLowerCase();
  if (!container) return;

  // Filtra produtos liberados
  let produtos = db.estoque.filter(p => p.status !== 'bloqueado');
  if (busca) {
    produtos = produtos.filter(p => p.nome.toLowerCase().includes(busca) || p.id.toLowerCase().includes(busca));
  }

  // Limita a 50 para não pesar na interface
  produtos = produtos.slice(0, 50);

  if (produtos.length === 0) {
    container.innerHTML = '<p class="text-gray-500 italic text-sm p-2">Nenhum produto encontrado.</p>';
    return;
  }

  container.innerHTML = produtos.map(p => {
    const preco = Number(p.preco !== undefined && p.preco !== null ? p.preco : (p.precoVenda || 0));
    return `
      <div class="flex items-center justify-between p-2 hover:bg-neutral-700/50 rounded-lg cursor-pointer transition-colors" onclick="adicionarItemComanda('${p.id}')">
        <div>
          <p class="text-white text-sm font-medium">${p.nome}</p>
          <p class="text-amber-500 text-xs font-semibold">${formatarMoeda(preco)}</p>
        </div>
        <button class="bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-black w-7 h-7 rounded-full flex items-center justify-center transition-colors">
          <i class="fa fa-plus text-xs"></i>
        </button>
      </div>
    `;
  }).join('');
}

let itensPendentesComanda = [];

function adicionarItemComanda(produtoId) {
  const p = db.estoque.find(prod => prod.id === produtoId);
  if (!p) return;

  const precoReal = Number(p.preco !== undefined && p.preco !== null ? p.preco : (p.precoVenda || 0));
  const existente = itensPendentesComanda.find(i => i.id === p.id);
  if (existente) {
    existente.qtd += 1;
  } else {
    itensPendentesComanda.push({
      id: p.id,
      nome: p.nome,
      preco: precoReal,
      qtd: 1
    });
  }

  renderizarComandaItens();
}

function atualizarQtdPendente(index, delta) {
  if (!itensPendentesComanda[index]) return;
  itensPendentesComanda[index].qtd += delta;
  if (itensPendentesComanda[index].qtd <= 0) {
    itensPendentesComanda.splice(index, 1);
  }
  renderizarComandaItens();
}

function removerItemPendente(index) {
  if (index < 0 || index >= itensPendentesComanda.length) return;
  itensPendentesComanda.splice(index, 1);
  renderizarComandaItens();
}

let itemIndexParaRemoverComanda = null;

function abrirModalRemoverQtdComanda(index) {
  if (!mesaAtualId || index < 0 || index >= comandaItens.length) return;
  const item = comandaItens[index];
  itemIndexParaRemoverComanda = index;

  const modal = document.getElementById('modal-remover-qtd-comanda');
  const nomeEl = document.getElementById('modal-remover-qtd-nome-produto');
  const atualEl = document.getElementById('modal-remover-qtd-atual');
  const inputEl = document.getElementById('input-remover-qtd-comanda');
  const erroEl = document.getElementById('erro-remover-qtd-comanda');

  if (nomeEl) nomeEl.textContent = item.nome;
  if (atualEl) atualEl.textContent = `${item.qtd} un`;
  if (inputEl) {
    inputEl.value = 1;
    inputEl.max = item.qtd;
    inputEl.classList.remove('border-red-500');
  }
  if (erroEl) erroEl.classList.add('hidden');

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 100);
  }
}

function fecharModalRemoverQtdComanda() {
  const modal = document.getElementById('modal-remover-qtd-comanda');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  itemIndexParaRemoverComanda = null;
}

function alterarInputRemoverQtd(delta) {
  if (itemIndexParaRemoverComanda === null || !comandaItens[itemIndexParaRemoverComanda]) return;
  const item = comandaItens[itemIndexParaRemoverComanda];
  const input = document.getElementById('input-remover-qtd-comanda');
  if (!input) return;

  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, Math.min(item.qtd, val + delta));
  input.value = val;
}

function definirRemoverTodasQtd() {
  if (itemIndexParaRemoverComanda === null || !comandaItens[itemIndexParaRemoverComanda]) return;
  const item = comandaItens[itemIndexParaRemoverComanda];
  const input = document.getElementById('input-remover-qtd-comanda');
  if (input) input.value = item.qtd;
}

async function confirmarRemocaoQtdComanda() {
  if (!mesaAtualId || itemIndexParaRemoverComanda === null || itemIndexParaRemoverComanda < 0 || itemIndexParaRemoverComanda >= comandaItens.length) {
    fecharModalRemoverQtdComanda();
    return;
  }

  const item = comandaItens[itemIndexParaRemoverComanda];
  const input = document.getElementById('input-remover-qtd-comanda');
  const erro = document.getElementById('erro-remover-qtd-comanda');
  const qtdRemover = parseInt(input?.value, 10);

  if (isNaN(qtdRemover) || qtdRemover <= 0 || qtdRemover > item.qtd) {
    if (erro) {
      erro.textContent = `Informe uma quantidade entre 1 e ${item.qtd}.`;
      erro.classList.remove('hidden');
    }
    if (input) input.classList.add('border-red-500');
    return;
  }

  const nomeItem = item.nome;
  if (qtdRemover >= item.qtd) {
    comandaItens.splice(itemIndexParaRemoverComanda, 1);
  } else {
    item.qtd -= qtdRemover;
  }

  const mesa = mesasLista.find(m => m.id === mesaAtualId);
  const totalConfirmado = comandaItens.reduce((s, i) => s + (i.preco * i.qtd), 0);

  try {
    await dbFirestore.collection('mesas').doc(mesaAtualId).update({
      itens: comandaItens,
      total: totalConfirmado,
      status: 'ocupada',
      clienteNome: mesa ? (mesa.clienteNome || null) : null,
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    });

    fecharModalRemoverQtdComanda();
    showToast(`${qtdRemover}x "${nomeItem}" removido(s) do pedido da mesa.`, 'info');
    renderizarComandaItens();
  } catch (error) {
    console.error('Erro ao remover item do pedido:', error);
    showToast('Erro ao remover item do pedido.', 'error');
  }
}

async function removerItemComanda(index) {
  abrirModalRemoverQtdComanda(index);
}

async function adicionarAoPedidoMesa() {
  if (!mesaAtualId) return;
  if (itensPendentesComanda.length === 0) {
    return showToast('Selecione produtos na lista acima para adicionar ao pedido.', 'warning');
  }

  const mesa = mesasLista.find(m => m.id === mesaAtualId);
  if (!mesa) return;

  // Mescla os itens pendentes na comanda permanente da mesa
  itensPendentesComanda.forEach(pendente => {
    const idx = comandaItens.findIndex(i => i.id === pendente.id);
    if (idx >= 0) {
      comandaItens[idx].qtd += pendente.qtd;
      // Garante preço atualizado
      comandaItens[idx].preco = pendente.preco;
    } else {
      comandaItens.push({ ...pendente });
    }
  });

  const total = comandaItens.reduce((s, i) => s + (i.preco * i.qtd), 0);
  const status = 'ocupada';

  try {
    await dbFirestore.collection('mesas').doc(mesaAtualId).update({
      itens: comandaItens,
      total: total,
      status: status,
      clienteNome: mesa ? (mesa.clienteNome || null) : null,
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    });

    const qtdAdicionados = itensPendentesComanda.reduce((s, i) => s + i.qtd, 0);
    itensPendentesComanda = []; // Limpa os pendentes já salvos
    renderizarComandaItens();
    showToast(`${qtdAdicionados} item(ns) adicionado(s) ao pedido da Mesa ${mesa.numero}!`, 'success');
  } catch (error) {
    console.error('Erro ao adicionar itens ao pedido:', error);
    showToast('Erro ao adicionar itens ao pedido.', 'error');
  }
}

function renderizarComandaItens() {
  const container = document.getElementById('comanda-itens');
  const totalEl = document.getElementById('comanda-total');
  const btnAdicionarAoPedido = document.getElementById('btn-adicionar-ao-pedido');
  if (!container || !totalEl) return;

  const totalSalvo = comandaItens.reduce((s, i) => s + (i.preco * i.qtd), 0);
  const totalPendente = itensPendentesComanda.reduce((s, i) => s + (i.preco * i.qtd), 0);
  const totalGeral = totalSalvo + totalPendente;

  if (btnAdicionarAoPedido) {
    btnAdicionarAoPedido.disabled = itensPendentesComanda.length === 0;
  }

  if (comandaItens.length === 0 && itensPendentesComanda.length === 0) {
    container.innerHTML = '<p class="text-gray-500 italic text-center py-6">Nenhum item adicionado.</p>';
    totalEl.textContent = 'R$ 0,00';
    return;
  }

  let html = '';

  // Seção 1: Itens pendentes para adicionar
  if (itensPendentesComanda.length > 0) {
    html += `
      <div class="mb-3 p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/20">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <i class="fa fa-clock"></i> Produtos Selecionados
          </span>
          <span class="text-xs font-bold text-emerald-400">${formatarMoeda(totalPendente)}</span>
        </div>
        <div class="space-y-1.5">
    `;
    html += itensPendentesComanda.map((item, index) => {
      const sub = item.preco * item.qtd;
      return `
        <div class="flex items-center justify-between p-2 bg-neutral-900/80 rounded border border-emerald-500/20">
          <div class="flex-grow pr-2 min-w-0">
            <p class="text-white text-sm font-medium truncate">${item.nome}</p>
            <p class="text-gray-400 text-xs">${item.qtd}x ${formatarMoeda(item.preco)} = <span class="text-emerald-400 font-bold">${formatarMoeda(sub)}</span></p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="atualizarQtdPendente(${index}, -1)" class="w-6 h-6 rounded bg-neutral-700 hover:bg-neutral-600 text-gray-300 flex items-center justify-center text-xs">-</button>
            <span class="w-6 text-center text-sm font-bold text-white">${item.qtd}</span>
            <button onclick="atualizarQtdPendente(${index}, 1)" class="w-6 h-6 rounded bg-neutral-700 hover:bg-neutral-600 text-gray-300 flex items-center justify-center text-xs">+</button>
            <button onclick="removerItemPendente(${index})" class="w-6 h-6 rounded bg-red-900/30 hover:bg-red-800 text-red-400 flex items-center justify-center text-xs ml-1"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join('');
    html += `
        </div>
      </div>
    `;
  }

  // Seção 2: Itens já confirmados no pedido da mesa
  if (comandaItens.length > 0) {
    html += `
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <i class="fa fa-check-circle"></i> Itens no Pedido da Mesa
          </span>
          <span class="text-xs font-bold text-amber-400">${formatarMoeda(totalSalvo)}</span>
        </div>
        <div class="space-y-1.5">
    `;
    html += comandaItens.map((item, index) => {
      const sub = item.preco * item.qtd;
      return `
        <div class="flex items-center justify-between p-2 bg-neutral-900/50 rounded-lg border border-gray-700/50">
          <div class="flex-grow pr-2 min-w-0">
            <p class="text-white text-sm font-medium truncate">${item.nome}</p>
            <p class="text-gray-400 text-xs">${item.qtd}x ${formatarMoeda(item.preco)} = <span class="text-amber-500 font-bold">${formatarMoeda(sub)}</span></p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="px-2 py-0.5 text-xs font-bold rounded bg-neutral-700 text-gray-200">${item.qtd} un</span>
            <button onclick="removerItemComanda(${index})" title="Remover item do pedido" class="w-6 h-6 rounded bg-red-900/30 hover:bg-red-800 text-red-400 flex items-center justify-center text-xs ml-1"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join('');
    html += `
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  totalEl.textContent = formatarMoeda(totalGeral);
}

function fecharMesaAtual() {
  if (!mesaAtualId) return;
  const mesa = mesasLista.find(m => m.id === mesaAtualId);
  if (!mesa) return;

  if (itensPendentesComanda.length > 0) {
    showToast('Você possui produtos selecionados que não foram adicionados ao pedido. Clique em "ADICIONAR AO PEDIDO" ou remova-os antes de fechar a mesa.', 'warning');
    return;
  }

  // Se a mesa estiver vazia, apenas libera a mesa
  if (comandaItens.length === 0) {
    abrirModalConfirmacao({
      titulo: `Liberar Mesa ${mesa.numero}?`,
      mensagem: 'Mesa vazia. Deseja apenas liberar a mesa?',
      detalhe: '',
      textoBtn: 'Liberar Mesa',
      corBtn: 'bg-red-600 hover:bg-red-500 text-white',
      icone: 'fa-lock',
      iconeCor: 'bg-red-500/20',
      onConfirm: async () => {
        try {
          await dbFirestore.collection('mesas').doc(mesaAtualId).update({
            status: 'disponivel',
            itens: [],
            total: 0,
            clienteNome: null,
            numeroPedido: null,
            vendaId: null,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
          });
          registrarLog('mesa', 'mesas', mesaAtualId, `Mesa ${mesa.numero} liberada (sem consumo).`, { mesaId: mesaAtualId });
          showToast(`Mesa ${mesa.numero} liberada (sem consumo).`, 'success');
          fecharComandaPanel();
        } catch (err) {
          console.error('Erro ao liberar mesa:', err);
          showToast('Não foi possível liberar a mesa.', 'error');
        }
      }
    });
    return;
  }

  // Se tiver itens, abre o modal obrigatório de seleção de forma de pagamento
  abrirModalFecharMesaPagamento(mesa);
}

function abrirModalFecharMesaPagamento(mesa) {
  const modal = document.getElementById('modal-fechar-mesa-pagamento');
  const titulo = document.getElementById('modal-fechar-mesa-titulo');
  const clienteEl = document.getElementById('modal-fechar-mesa-cliente');
  const totalEl = document.getElementById('modal-fechar-mesa-total');
  const selectPagamento = document.getElementById('select-fechar-mesa-pagamento');
  const erroEl = document.getElementById('erro-fechar-mesa-pagamento');

  if (!modal || !selectPagamento) return;

  const total = comandaItens.reduce((s, i) => s + (i.preco * i.qtd), 0);

  if (titulo) titulo.textContent = `Fechar Mesa ${mesa.numero}`;
  if (clienteEl) {
    clienteEl.textContent = mesa.clienteNome
      ? `Cliente: ${mesa.clienteNome}`
      : 'Cliente: Não informado';
  }
  if (totalEl) totalEl.textContent = formatarMoeda(total);

  // Popula os métodos de pagamento cadastrados no sistema
  const metodos = (Array.isArray(metodosPagamento) && metodosPagamento.length > 0)
    ? metodosPagamento
    : METODOS_PAGAMENTO_PADRAO;

  selectPagamento.innerHTML = '<option value="">-- Selecione a forma de pagamento --</option>' +
    metodos.map(m => `<option value="${escapeDashboard(m)}">${escapeDashboard(m)}</option>`).join('');

  selectPagamento.value = '';
  if (erroEl) erroEl.classList.add('hidden');

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  setTimeout(() => selectPagamento.focus(), 50);
}

function fecharModalFecharMesaPagamento() {
  const modal = document.getElementById('modal-fechar-mesa-pagamento');
  const erroEl = document.getElementById('erro-fechar-mesa-pagamento');
  if (erroEl) erroEl.classList.add('hidden');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function confirmarFechamentoMesa() {
  if (!mesaAtualId) return;
  const mesa = mesasLista.find(m => m.id === mesaAtualId);
  if (!mesa) return;

  const selectPagamento = document.getElementById('select-fechar-mesa-pagamento');
  const erroEl = document.getElementById('erro-fechar-mesa-pagamento');
  const formaPagamento = selectPagamento ? selectPagamento.value.trim() : '';

  if (!formaPagamento) {
    if (erroEl) erroEl.classList.remove('hidden');
    if (selectPagamento) selectPagamento.focus();
    showToast('Informe obrigatoriamente a forma de pagamento.', 'warning');
    return;
  }

  if (erroEl) erroEl.classList.add('hidden');

  const btnConfirmar = document.getElementById('btn-confirmar-fechar-mesa');
  if (btnConfirmar) {
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Finalizando...';
  }

  try {
    const total = comandaItens.reduce((s, i) => s + (i.preco * i.qtd), 0);
    const numeroPedido = await proximoNumeroPedido();
    const nomeClienteFinal = mesa.clienteNome
      ? `Mesa ${mesa.numero} - ${mesa.clienteNome}`
      : `Mesa ${mesa.numero}`;

    const venda = {
      total: total,
      itens: comandaItens.map(i => ({ ...i, qtdCarrinho: i.qtd })),
      numeroPedido: numeroPedido,
      formaPagamento: formaPagamento,
      pagamento: formaPagamento,
      clienteId: null,
      clienteNome: nomeClienteFinal,
      dataIso: new Date().toISOString(),
      data: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'),
      status: 'Entregue',
      userId: auth.currentUser?.uid || 'unknown',
      userName: auth.currentUser?.displayName || auth.currentUser?.email || 'Desconhecido',
      mesaId: mesaAtualId
    };

    const vendaDoc = await dbFirestore.collection('vendas').add(venda);

    const batch = dbFirestore.batch();
    for (const item of comandaItens) {
      const ref = dbFirestore.collection('estoque').doc(item.id);
      const atual = db.estoque.find(p => p.id === item.id);
      if (atual) batch.update(ref, { qtd: Math.max(0, atual.qtd - item.qtd) });
    }
    await batch.commit();

    await registrarMovimentacaoVendaCaixa(vendaDoc.id, numeroPedido, formaPagamento, total, venda);

    await dbFirestore.collection('mesas').doc(mesaAtualId).update({
      status: 'disponivel',
      itens: [],
      total: 0,
      clienteNome: null,
      numeroPedido: null,
      vendaId: vendaDoc.id,
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    });

    registrarLog('venda', 'venda', vendaDoc.id, `Mesa ${mesa.numero} fechada — Pedido #${numeroPedido} (${nomeClienteFinal}) — ${formatarMoeda(total)} (${formaPagamento})`, { numeroPedido, total, formaPagamento, mesaId: mesaAtualId, clienteNome: nomeClienteFinal });
    showToast(`Mesa ${mesa.numero} fechada — Pedido #${numeroPedido} finalizado com ${formaPagamento}!`, 'success');

    fecharModalFecharMesaPagamento();
    fecharComandaPanel();
  } catch (err) {
    console.error('Erro ao fechar mesa:', err);
    showToast('Não foi possível fechar a mesa.', 'error');
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '<i class="fa fa-check"></i> Fechar e Finalizar';
    }
  }
}

function imprimirComandaMesaAtual() {
  if (!mesaAtualId || comandaItens.length === 0) return showToast('Nada para imprimir.', 'warning');
  const mesa = mesasLista.find(m => m.id === mesaAtualId);
  if (!mesa) return;

  let printWindow = window.open('', '_blank');
  if (!printWindow) {
    return showToast('Por favor, permita popups no navegador para imprimir.', 'warning');
  }
  let html = `
    <html>
      <head>
        <title>Comanda Mesa ${mesa.numero}</title>
        <style>
          body { font-family: monospace; padding: 20px; font-size: 14px; }
          h2 { text-align: center; font-size: 18px; margin: 0 0 5px 0; }
          .subinfo { text-align: center; margin: 2px 0; font-size: 12px; }
          .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
          hr { border-top: 1px dashed #000; margin: 10px 0; }
          .total { text-align: right; font-weight: bold; font-size: 16px; margin-top: 10px; }
        </style>
      </head>
      <body>
        <h2>MESA ${mesa.numero}</h2>
        ${mesa.clienteNome ? `<div class="subinfo"><strong>Cliente:</strong> ${escapeDashboard(mesa.clienteNome)}</div>` : ''}
        <p class="subinfo">${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
        <hr>
  `;

  let total = 0;
  comandaItens.forEach(i => {
    let sub = i.preco * i.qtd;
    total += sub;
    html += `<div class="item"><span>${i.qtd}x ${i.nome}</span><span>${formatarMoeda(sub)}</span></div>`;
  });

  html += `
        <hr>
        <div class="total">TOTAL: ${formatarMoeda(total)}</div>
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `;
  printWindow.document.write(html);
  printWindow.document.close();
}

window.renderizarMesas = renderizarMesas;
window.salvarConfigMesas = salvarConfigMesas;
window.abrirMesa = abrirMesa;
window.fecharModalAbrirMesaCliente = fecharModalAbrirMesaCliente;
window.confirmarAberturaMesaComCliente = confirmarAberturaMesaComCliente;
window.carregarComandaPainel = carregarComandaPainel;
window.fecharComandaPanel = fecharComandaPanel;
window.renderizarProdutosComanda = renderizarProdutosComanda;
window.adicionarItemComanda = adicionarItemComanda;
window.atualizarQtdPendente = atualizarQtdPendente;
window.removerItemPendente = removerItemPendente;
window.adicionarAoPedidoMesa = adicionarAoPedidoMesa;
window.removerItemComanda = removerItemComanda;
window.abrirModalRemoverQtdComanda = abrirModalRemoverQtdComanda;
window.fecharModalRemoverQtdComanda = fecharModalRemoverQtdComanda;
window.alterarInputRemoverQtd = alterarInputRemoverQtd;
window.definirRemoverTodasQtd = definirRemoverTodasQtd;
window.confirmarRemocaoQtdComanda = confirmarRemocaoQtdComanda;
window.renderizarComandaItens = renderizarComandaItens;
window.fecharMesaAtual = fecharMesaAtual;
window.abrirModalFecharMesaPagamento = abrirModalFecharMesaPagamento;
window.fecharModalFecharMesaPagamento = fecharModalFecharMesaPagamento;
window.confirmarFechamentoMesa = confirmarFechamentoMesa;
window.imprimirComandaMesaAtual = imprimirComandaMesaAtual;
window.imprimirComandaMesa = imprimirComandaMesaAtual;
