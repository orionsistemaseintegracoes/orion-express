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

// Inicializa Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
// Inicializa Firebase Auth
const auth = firebase.auth();

/* ================= ESTADO GLOBAL ================= */
let currentUser = null;
let userProfile = null;
let cart = [];
let products = [];
let myOrders = [];
let currentOrderDetails = null;
let metodosPagamento = [];

/* ================= REGISTRO DE BANNER (não é produto) ================= */
function ehRegistroBanner(item) {
    if (!item) return false;
    const nome = String(item.nome || '').toLowerCase().trim();
    const id = String(item.id || '').toLowerCase().trim();
    const tipo = String(item.tipo || '').toLowerCase().trim();
    return nome === 'banner_config' || nome === 'banner' ||
        id === 'banner_config' || id === 'banner' ||
        tipo === 'banner' || item.isBanner === true;
}

/* ================= NÚMERO DE PEDIDO (sequência) ================= */
// Exibe o número do pedido (usa numeroPedido; fallback curto defensivo se ausente)
function numeroExibicao(order) {
    if (!order) return '000';
    if (order.numeroPedido) return order.numeroPedido;
    return String(order.id || '').slice(0, 3);
}

// Garante que o contador esteja no mínimo do maior numeroPedido existente (rodado no init)
async function sincronizarContadorPedido() {
    try {
        const snapshot = await db.collection('vendas').get();
        let max = 0;
        snapshot.docs.forEach(doc => {
            const n = parseInt(doc.data().numeroPedido, 10);
            if (!Number.isNaN(n) && n > max) max = n;
        });
        const ref = db.collection('config').doc('contador');
        const atualSnap = await ref.get();
        const atual = atualSnap.exists ? Number(atualSnap.data().numero || 0) : 0;
        if (max > atual) {
            await ref.set({ numero: max }, { merge: true });
        }
    } catch (error) {
        console.error("Erro ao sincronizar contador de pedidos:", error);
    }
}

// Próximo número de pedido (001, 002, ...) via contador atômico no Firestore
async function proximoNumeroPedido() {
    const ref = db.collection('config').doc('contador');
    const resultado = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const atual = snap.exists ? Number(snap.data().numero || 0) : 0;
        const proximo = atual + 1;
        tx.set(ref, { numero: proximo }, { merge: true });
        return proximo;
    });
    return String(resultado).padStart(3, '0');
}

/* ================= THEME TOGGLE ================= */
function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('theme-icon');

    body.classList.toggle('light-theme');

    if (body.classList.contains('light-theme')) {
        icon.className = 'theme-icon fa fa-sun';
        localStorage.setItem('theme', 'light');
    } else {
        icon.className = 'theme-icon fa fa-moon';
        localStorage.setItem('theme', 'dark');
    }
}

// Load saved theme on page load
window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const icon = document.getElementById('theme-icon');

    if (savedTheme === 'light') {
        body.classList.add('light-theme');
        if (icon) icon.className = 'theme-icon fa fa-sun';
    }

    // Carrega logo/favicon do Firestore (config/personalizacao)
    loadLogoCliente();
});

function aplicarLogoCliente(url) {
    if (!url) return;
    // Atualiza logos na página
    document.querySelectorAll('img[src="orion-logo.png"]').forEach(img => {
        img.src = url;
    });
    // Atualiza favicon do navegador
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = url;
}

const PRESETS_CLIENTE = {
  orion:  { principal: '#1677ff', botoes: '#0d6efd', fundo: '#020715', texto: '#f4f7fd' },
  aura:   { principal: '#f59e0b', botoes: '#f59e0b', fundo: '#171717', texto: '#f4f4f5' },
  verde:  { principal: '#10B981', botoes: '#059669', fundo: '#F5F7FA', texto: '#071426' },
  escuro: { principal: '#6366F1', botoes: '#4F46E5', fundo: '#0f172a', texto: '#e2e8f0' }
};

let mostrarEstoqueCliente = true;
let nomeLojaCliente = 'ORION EXPRESS';

function aplicarTemaCliente(c) {
    const root = document.documentElement;
    root.style.setProperty('--orion-blue', c.principal);
    root.style.setProperty('--orion-blue-hover', c.botoes);
    root.style.setProperty('--bg-primary', c.fundo);
    root.style.setProperty('--text-primary', c.texto);
    root.style.setProperty('--card-bg', c.fundo);
    root.style.setProperty('--bg-secondary', c.fundo);
    root.style.setProperty('--input-bg', c.fundo);
}

function aplicarNomeLojaCliente(nome) {
    if (!nome) return;
    nomeLojaCliente = nome.trim();
    
    // Atualiza nome na barra de navegação lateral (desktop) / bottom nav
    const brandTextEl = document.getElementById('client-nav-brand-text');
    if (brandTextEl) {
        const partes = nomeLojaCliente.split(/\s+/);
        if (partes.length > 1) {
            const primeiro = partes[0].toUpperCase();
            const resto = partes.slice(1).join(' ').toUpperCase();
            brandTextEl.innerHTML = `<strong>${escapeHtmlClient(primeiro)}</strong><span>${escapeHtmlClient(resto)}</span>`;
        } else {
            brandTextEl.innerHTML = `<strong>${escapeHtmlClient(nomeLojaCliente.toUpperCase())}</strong>`;
        }
    }

    // Atualiza título do navegador
    document.title = `${nomeLojaCliente} - Pedidos Online`;

    // Atualiza título no fallback de logo na tela de autenticação
    const fallbackTitle = document.getElementById('logo-fallback-title');
    if (fallbackTitle) {
        fallbackTitle.textContent = `🚀 ${nomeLojaCliente}`;
    }
}

function escapeHtmlClient(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadLogoCliente() {
    try {
        const doc = await db.collection('config').doc('personalizacao').get();
        if (doc.exists) {
            const d = doc.data();
            if (d.logoUrl) aplicarLogoCliente(d.logoUrl);
            if (d.mostrarEstoque !== undefined) {
                mostrarEstoqueCliente = d.mostrarEstoque;
            }
            if (d.preset && PRESETS_CLIENTE[d.preset]) {
                document.body.classList.toggle('preset-aura', d.preset === 'aura');
                aplicarTemaCliente(PRESETS_CLIENTE[d.preset]);
            } else if (d.corPrincipal || d.corBotoes || d.corFundo || d.corTexto) {
                aplicarTemaCliente({
                    principal: d.corPrincipal || '#1677ff',
                    botoes: d.corBotoes || '#0d6efd',
                    fundo: d.corFundo || '#020715',
                    texto: d.corTexto || '#f4f7fd'
                });
            }
        }
        
        // Listener em tempo real para config/loja (ou leitura inicial)
        db.collection('config').doc('loja').onSnapshot(lojaDoc => {
            if (lojaDoc.exists && lojaDoc.data().nome) {
                aplicarNomeLojaCliente(lojaDoc.data().nome);
            }
        });
    } catch (err) {
        console.error('Erro ao carregar logo do cliente:', err);
    }
}

/* ================= GESTÃO DE AUTENTICAÇÃO REAL ================= */

function checkAuth() {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            console.log("Usuário logado (Auth):", user.email);
            loadProfile(user.uid);
        } else {
            currentUser = null;
            userProfile = null;
            enterGuestMode();
        }
    }, () => {
        // Falha ao verificar auth (ex.: config inválida/offline): mantém modo visitante
        currentUser = null;
        userProfile = null;
        enterGuestMode();
    });
}

// Navegação pública sem login: mostra o cardápio e bloqueia ações que precisam de conta
function enterGuestMode() {
    showScreen('app-screen');
    renderHeaderUser();
    updateGuestNote();
    updateCartUI();
}

function updateGuestNote() {
    const note = document.getElementById('guest-note');
    if (note) note.classList.toggle('hidden', !!currentUser);
}

let pendingCheckoutAuth = false;

function openAuth(fromCheckout = false) {
    pendingCheckoutAuth = !!fromCheckout;
    // Se o carrinho estiver aberto, fecha-o para focar totalmente na tela de login/cadastro
    closeCart();
    const a = document.getElementById('auth-screen');
    if (a) a.classList.remove('hidden');
}

function closeAuth() {
    const a = document.getElementById('auth-screen');
    if (a) a.classList.add('hidden');
    // Se havia fechado o carrinho para tentar checkout, reabre o carrinho ao fechar auth
    if (pendingCheckoutAuth && cart.length > 0) {
        pendingCheckoutAuth = false;
        openCart();
    }
}

function handleUserAction() {
    if (currentUser) logout();
    else openAuth(false);
}

function renderHeaderUser() {
    const nameEl = document.getElementById('header-user-name');
    const iconEl = document.getElementById('user-action-icon');

    if (currentUser && userProfile) {
        if (nameEl) nameEl.innerText = `Olá, ${userProfile.nome.split(' ')[0]}`;
        if (iconEl) {
            iconEl.classList.remove('fa-sign-in-alt');
            iconEl.classList.add('fa-sign-out-alt');
        }
    } else {
        if (nameEl) nameEl.innerText = 'Olá, Visitante';
        if (iconEl) {
            iconEl.classList.remove('fa-sign-out-alt');
            iconEl.classList.add('fa-sign-in-alt');
        }
    }
}

async function loadProfile(uid) {
    try {
        const doc = await db.collection('clientes').doc(uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            if (userProfile && !userProfile.pagamentoPreferido) {
                try {
                    const pref = localStorage.getItem('pdv_client_pref_pagamento_' + uid);
                    if (pref) userProfile.pagamentoPreferido = pref;
                } catch (_) {}
            }
            initApp();
            document.getElementById('auth-screen').classList.add('hidden');
        } else {
            // Conta criada no Auth, mas sem perfil no banco -> Setup
            document.getElementById('auth-screen').classList.add('hidden');
            showScreen('setup-screen');
        }
    } catch (e) {
        console.error("Erro ao carregar perfil:", e);
        showToast("Erro ao carregar seu perfil. Verifique sua conexão.", "error");
    }
}

function showScreen(screenId) {
    // Esconde todas as telas principais
    ['auth-screen', 'setup-screen', 'app-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('flex'); // Garante que flex também sai
        }
    });
    // Mostra a desejada
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove('hidden');
        if (screenId === 'app-screen' || screenId === 'setup-screen') { // Auth screen já tem layout próprio
            if (screenId === 'app-screen') target.classList.add('flex');
            else target.classList.add('flex');
        }
    }
}

// Inicia ao carregar: entra em modo visitante imediatamente (catálogo visível mesmo sem
// resposta do Firebase Auth), depois inicia listeners e verifica login.
window.addEventListener('load', () => {
    enterGuestMode();
    listenToProducts();
    listenToBanner();
    listenToStoreStatus();
    listenToPaymentMethods();
    loadCart();
    checkAuth();
});

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

function mostrarAviso(elementId, msg) {
    const box = document.getElementById(elementId);
    const textEl = document.getElementById(`${elementId}-texto`);
    if (box && textEl) {
        textEl.textContent = msg;
        box.classList.remove('hidden');
    }
}

function ocultarAviso(elementId) {
    const box = document.getElementById(elementId);
    if (box) {
        box.classList.add('hidden');
    }
}

/* ================= FUNÇÕES DE AUTH (LOGIN/REGISTER) ================= */

async function handleLoginReal() {
    ocultarAviso('login-aviso');
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;

    if (!email || !pass) {
        mostrarAviso('login-aviso', "Por favor, preencha e-mail e senha.");
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, pass);
        // O onAuthStateChanged vai lidar com o redirecionamento
    } catch (error) {
        console.error("Erro Login:", error);
        const msg = authErrorMessage(error.code || error.message);
        mostrarAviso('login-aviso', msg);
        showToast(msg, 'error');
    }
}

async function handleRegisterReal() {
    ocultarAviso('cad-aviso');
    const email = document.getElementById('cad-email').value.trim();
    const pass = document.getElementById('cad-pass').value;
    const passConf = document.getElementById('cad-pass-conf').value;

    if (!email || !pass) {
        mostrarAviso('cad-aviso', "Preencha e-mail e senha para continuar.");
        return;
    }
    if (pass !== passConf) {
        mostrarAviso('cad-aviso', "As senhas não conferem. Digite a mesma senha nos dois campos.");
        return;
    }
    if (pass.length < 6) {
        mostrarAviso('cad-aviso', "A senha deve ter no mínimo 6 caracteres.");
        return;
    }

    try {
        await auth.createUserWithEmailAndPassword(email, pass);
        // O onAuthStateChanged vai lidar com o redirecionamento para o Setup
        document.getElementById('cadastroModal').classList.add('hidden');
        document.getElementById('cadastroModal').classList.remove('flex');
        showToast("Conta criada com sucesso!", "success");
    } catch (error) {
        console.error("Erro Cadastro:", error);
        const msg = authErrorMessage(error.code || error.message);
        mostrarAviso('cad-aviso', msg);
        showToast(msg, 'error');
    }
}

function logout() {
    auth.signOut().then(() => {
        location.reload();
    });
}

function authErrorMessage(code) {
    if (!code) return 'Verifique suas credenciais.';
    const str = String(code).toLowerCase();
    if (str.includes('already-in-use') || str.includes('already registered')) {
        return 'Este e-mail já está cadastrado. Tente fazer login ou use outro.';
    }
    if (str.includes('weak-password') || str.includes('should be at least 6 characters')) {
        return 'A senha é muito fraca ou possui menos de 6 caracteres.';
    }
    if (str.includes('invalid-email') || str.includes('unable to validate email')) {
        return 'E-mail em formato inválido.';
    }
    if (str.includes('user-not-found') || str.includes('invalid login credentials') || str.includes('invalid_grant')) {
        return 'E-mail ou senha incorretos.';
    }
    if (str.includes('wrong-password')) {
        return 'Senha incorreta.';
    }
    if (str.includes('user-disabled')) {
        return 'Este usuário está temporariamente desativado.';
    }
    switch (code) {
        case 'auth/invalid-email': return 'E-mail em formato inválido.';
        case 'auth/user-disabled': return 'Usuário desativado.';
        case 'auth/user-not-found': return 'Usuário não encontrado.';
        case 'auth/wrong-password': return 'Senha incorreta.';
        case 'auth/email-already-in-use': return 'Este e-mail já está cadastrado.';
        case 'auth/weak-password': return 'Senha muito fraca (mínimo 6 caracteres).';
        default: return 'Verifique suas credenciais.';
    }
}

/* ================= FUNÇÕES DE PERFIL (SETUP) ================= */
async function saveProfile() {
    if (!currentUser) return;
    ocultarAviso('setup-aviso');

    const agora = new Date().toISOString();
    const pagamento = document.getElementById('setup-pagamento').value;
    const nome = document.getElementById('setup-nome').value.trim();
    const tel = document.getElementById('setup-tel').value.trim();
    const endereco = document.getElementById('setup-endereco').value.trim();
    const numero = document.getElementById('setup-numero').value.trim();
    const cep = document.getElementById('setup-cep').value.trim();

    if (!nome || !tel || !endereco || !numero || !cep || !pagamento) {
        mostrarAviso('setup-aviso', "Por favor, preencha todos os campos obrigatórios (*).");
        return;
    }

    const btnSubmit = document.getElementById('btn-salvar-setup');
    const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa fa-spinner fa-spin"></i> <span>Salvando dados...</span>`;
    }

    const perfil = {
        nome,
        tel,
        endereco,
        numero,
        cep,
        email: currentUser.email,
        data_cadastro: agora,
        since: agora
    };

    try {
        // Salva na coleção 'clientes' usando o UID como ID do documento
        await db.collection('clientes').doc(currentUser.uid).set(perfil);

        userProfile = {
            ...perfil,
            uid: currentUser.uid,
            pagamentoPreferido: pagamento,
            dataCadastro: agora
        };
        try {
            localStorage.setItem('pdv_client_pref_pagamento_' + currentUser.uid, pagamento);
        } catch (_) {}

        showToast("Cadastro completo! Tudo certo por aqui. Vamos continuar com seu pedido! 😊", "success");
        initApp();
    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        const erroMsg = "Erro ao salvar perfil: " + (error.message || "Tente novamente.");
        mostrarAviso('setup-aviso', erroMsg);
        showToast(erroMsg, "error");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnHtml;
        }
    }
}

/* ================= EDIÇÃO DE DADOS CADASTRAIS (MEUS DADOS) ================= */
function carregarFormularioPerfil() {
    if (!currentUser) return;
    ocultarAviso('perfil-aviso');

    // Popula o select de pagamento se ainda não foi populado
    fillPaymentSelect('perfil-pagamento', 'Selecione a forma de pagamento...');

    // Pega pagamento salvo no cache ou userProfile
    let savedPagamento = (userProfile && userProfile.pagamentoPreferido) || '';
    if (!savedPagamento) {
        try {
            savedPagamento = localStorage.getItem('pdv_client_pref_pagamento_' + currentUser.uid) || '';
        } catch (_) {}
    }

    if (userProfile) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val !== undefined && val !== null ? val : '';
        };

        setVal('perfil-nome', userProfile.nome || '');
        setVal('perfil-tel', userProfile.tel || '');
        setVal('perfil-endereco', userProfile.endereco || '');
        setVal('perfil-numero', userProfile.numero || '');
        setVal('perfil-cep', userProfile.cep || '');

        const selectPag = document.getElementById('perfil-pagamento');
        if (selectPag && savedPagamento) {
            selectPag.value = savedPagamento;
        }
    }
}

async function salvarDadosPerfil() {
    if (!currentUser) {
        openAuth();
        return;
    }
    ocultarAviso('perfil-aviso');

    const nome = document.getElementById('perfil-nome').value.trim();
    const tel = document.getElementById('perfil-tel').value.trim();
    const endereco = document.getElementById('perfil-endereco').value.trim();
    const numero = document.getElementById('perfil-numero').value.trim();
    const cep = document.getElementById('perfil-cep').value.trim();
    const pagamento = document.getElementById('perfil-pagamento').value;

    if (!nome || !tel || !endereco || !numero || !cep || !pagamento) {
        mostrarAviso('perfil-aviso', "Por favor, preencha todos os campos obrigatórios (*).");
        return;
    }

    const btnSubmit = document.getElementById('btn-salvar-perfil');
    const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa fa-spinner fa-spin"></i> <span>Salvando alterações...</span>`;
    }

    const payload = {
        nome,
        tel,
        endereco,
        numero,
        cep
    };

    try {
        // Atualiza a tabela 'clientes' no banco de dados
        await db.collection('clientes').doc(currentUser.uid).update(payload);

        // Atualiza o objeto em memória
        userProfile = {
            ...(userProfile || {}),
            ...payload,
            uid: currentUser.uid,
            pagamentoPreferido: pagamento
        };

        // Salva preferência de pagamento no localStorage
        try {
            localStorage.setItem('pdv_client_pref_pagamento_' + currentUser.uid, pagamento);
        } catch (_) {}

        // Atualiza o select do carrinho com o pagamento preferido se vazio
        const cartPayment = document.getElementById('select-forma-pagamento');
        if (cartPayment && !cartPayment.value) {
            cartPayment.value = pagamento;
        }

        // Atualiza o cabeçalho (Olá, [Nome])
        renderHeaderUser();

        showToast("Dados cadastrais atualizados com sucesso!", "success");
    } catch (error) {
        console.error("Erro ao atualizar dados cadastrais:", error);
        const erroMsg = "Erro ao atualizar cadastro: " + (error.message || "Tente novamente.");
        mostrarAviso('perfil-aviso', erroMsg);
        showToast(erroMsg, "error");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnHtml;
        }
    }
}

/* ================= APP LOGIC (MENU, CART, ORDERS) ================= */
function initApp() {
    showScreen('app-screen');

    renderHeaderUser();
    updateGuestNote();

    // Listeners em tempo real (catálogo/banner já iniciados no load para visitantes)
    listenToMyOrders();
    loadCart(); // Carrega carrinho salvo

    sincronizarContadorPedido(); // Garante a sequência 000001, 000002, ... no compartilhado

    // Se o usuário veio de uma tentativa de finalizar pedido, foca e abre o carrinho com os produtos
    if (pendingCheckoutAuth && cart.length > 0) {
        pendingCheckoutAuth = false;
        setTimeout(() => {
            openCart();
        }, 150);
    }
}

function loadCart() {
    const saved = localStorage.getItem('pdv_client_cart');
    if (saved) {
        try {
            cart = JSON.parse(saved);
            updateCartUI();
        } catch (e) { console.error("Erro ao carregar carrinho", e); }
    }
}

function saveCart() {
    localStorage.setItem('pdv_client_cart', JSON.stringify(cart));
}

function switchView(viewName) {
    // Pedidos e Perfil exigem login
    if ((viewName === 'orders' || viewName === 'profile') && !currentUser) { openAuth(); return; }

    // Esconde todas as views
    ['view-menu', 'view-orders', 'view-profile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Mostra a selecionada
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.remove('hidden');

    // Se abriu a tela de perfil, carrega os dados no formulário
    if (viewName === 'profile') {
        carregarFormularioPerfil();
    }

    // Atualiza Nav Bottom e Sidebar
    const btnMenu = document.getElementById('nav-menu');
    const btnOrders = document.getElementById('nav-orders');
    const sideBtnMenu = document.getElementById('side-nav-menu');
    const sideBtnOrders = document.getElementById('side-nav-orders');
    const sideBtnProfile = document.getElementById('side-nav-profile');

    // Reset de classes ativas da sidebar
    if (sideBtnMenu) sideBtnMenu.classList.remove('active');
    if (sideBtnOrders) sideBtnOrders.classList.remove('active');
    if (sideBtnProfile) sideBtnProfile.classList.remove('active');

    if (viewName === 'menu') {
        if (btnMenu) {
            btnMenu.classList.add('text-amber-500');
            btnMenu.classList.remove('text-gray-400');
        }
        if (btnOrders) {
            btnOrders.classList.remove('text-amber-500');
            btnOrders.classList.add('text-gray-400');
        }
        if (sideBtnMenu) sideBtnMenu.classList.add('active');
    } else if (viewName === 'orders') {
        if (btnOrders) {
            btnOrders.classList.add('text-amber-500');
            btnOrders.classList.remove('text-gray-400');
        }
        if (btnMenu) {
            btnMenu.classList.remove('text-amber-500');
            btnMenu.classList.add('text-gray-400');
        }
        if (sideBtnOrders) sideBtnOrders.classList.add('active');
    } else if (viewName === 'profile') {
        if (btnOrders) {
            btnOrders.classList.remove('text-amber-500');
            btnOrders.classList.add('text-gray-400');
        }
        if (btnMenu) {
            btnMenu.classList.remove('text-amber-500');
            btnMenu.classList.add('text-gray-400');
        }
        if (sideBtnProfile) sideBtnProfile.classList.add('active');
    }

    // Fecha sidebar no mobile ao navegar
    if (window.innerWidth < 1024) {
        closeSidebar();
    }
}

/* --- PRODUTOS --- */
function listenToProducts() {
    db.collection('estoque').onSnapshot(snapshot => {
products = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(product => product.nome && product.nome !== 'banner_config' && Number.isFinite(Number(product.preco)))
            .filter(product => product.bloqueado !== true);
        renderProducts();
    }, error => {
        console.error("Erro ao carregar produtos:", error);
        const grid = document.getElementById('products-grid');
        if (grid) grid.innerHTML = '<div class="col-span-full text-center text-red-400 py-10">Não foi possível carregar o catálogo. Verifique sua conexão.</div>';
    });
}

function expandirDescricao(el) {
    if (el.classList.contains('line-clamp-2')) {
        el.classList.remove('line-clamp-2');
        el.classList.add('text-wrap');
        el.title = 'Clique para recolher';
    } else {
        el.classList.add('line-clamp-2');
        el.classList.remove('text-wrap');
        el.title = 'Clique para ver completa';
    }
}

function renderProducts() {
    const grid = document.getElementById('products-grid');

    // Exclui o registro de banner (não é produto de venda)
    const catalogProducts = products.filter(p => !ehRegistroBanner(p));

    if (catalogProducts.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">Nenhum produto cadastrado no momento :(</div>';
        return;
    }

    grid.innerHTML = catalogProducts.map(p => {
        const inStock = p.qtd > 0;
        return `
        <div class="product-card bg-neutral-800 rounded-xl overflow-hidden flex flex-col h-full relative group ${!inStock ? 'opacity-70' : ''}">
            <div class="h-32 bg-neutral-700 relative overflow-hidden">
                ${p.imagem
            ? `<img src="${p.imagem}" alt="${p.nome}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">`
            : `<div class="absolute inset-0 flex items-center justify-center text-neutral-600"><i class="fa fa-wind text-4xl"></i></div>`
        }
                ${mostrarEstoqueCliente ? `
                <div class="absolute top-2 right-2 ${inStock ? 'bg-black/60 text-white' : 'bg-red-600/80 text-white'} text-xs px-2 py-1 rounded backdrop-blur-sm z-10">
                    ${inStock ? `${p.qtd} un.` : '<i class="fa fa-times-circle mr-1"></i> Indisponível'}
                </div>` : (inStock ? '' : `
                <div class="absolute top-2 right-2 bg-red-600/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">
                    <i class="fa fa-times-circle mr-1"></i> Indisponível
                </div>`)}
            </div>
            <div class="p-4 flex flex-col flex-grow">
                <h3 class="font-bold text-white text-lg leading-tight mb-1">${p.nome}</h3>
                <p class="text-gray-400 text-xs mb-3 line-clamp-2 cursor-pointer hover:text-amber-400 transition-colors" onclick="expandirDescricao(this)" title="Clique para ver completa">${p.descricao || 'Pod descartável premium com sabor selecionado.'}</p>
                
                <div class="mt-auto flex justify-between items-center">
                    <span class="text-amber-500 font-bold text-lg">R$ ${p.preco.toFixed(2)}</span>
                    ${inStock
            ? `<button type="button" onclick="event.stopPropagation(); debugClick('${p.id}')" class="bg-amber-500 text-black w-8 h-8 rounded-full flex items-center justify-center hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 cursor-pointer z-50 relative pointer-events-auto">
                            <i class="fa fa-plus"></i>
                       </button>`
            : `<span class="text-xs text-red-400 font-semibold">Estoque indisponível no momento</span>`
        }
                </div>
            </div>
        </div>`;
    }).join('');
}

/* --- FORMAS DE PAGAMENTO --- */
function listenToPaymentMethods() {
    db.collection('config').doc('pagamentos').onSnapshot(snapshot => {
        const data = snapshot.data();
        metodosPagamento = (data && Array.isArray(data.metodos) && data.metodos.length)
            ? data.metodos
            : ['PIX', 'Cartão', 'Dinheiro', 'Outros'];
        populatePaymentSelect();
    }, error => {
        console.error("Erro ao carregar formas de pagamento:", error);
    });
}

function populatePaymentSelect() {
    fillPaymentSelect('select-forma-pagamento', 'Selecione a forma de pagamento...');
    fillPaymentSelect('setup-pagamento', 'Selecione');
    fillPaymentSelect('perfil-pagamento', 'Selecione...');
}

function fillPaymentSelect(selectId, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">' + placeholder + '</option>' +
        metodosPagamento.map(m => `<option value="${m}">${m}</option>`).join('');
}

/* --- BANNER --- */
function listenToBanner() {
    db.collection('config').doc('banner').onSnapshot(snapshot => {
        if (snapshot.exists) {
            renderBanner(snapshot.data().url || '');
        } else {
            renderBanner('');
        }
    }, error => {
        console.error("Erro ao carregar banner:", error);
    });
}

function renderBanner(url) {
    const container = document.getElementById('custom-banner');
    if (!container) return;
    if (url) {
        container.innerHTML = `<img src="${url}" alt="Banner" class="w-full h-auto object-cover">`;
        container.classList.remove('hidden');
    } else {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

/* --- STATUS LOJA --- */
let lojaAbertaCliente = true;

function verificarLojaAbertaCliente(horarioAbertura, horarioFechamento) {
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

function listenToStoreStatus() {
    db.collection('config').doc('personalizacao').onSnapshot(doc => {
        if (!doc.exists) {
            lojaAbertaCliente = true;
            atualizarUIStatusLoja(true, '08:00', '18:00', false);
            return;
        }
        const d = doc.data();
        const automatico = d.horarioAutomatico !== false;
        const abertura = d.horarioAbertura || '08:00';
        const fechamento = d.horarioFechamento || '18:00';
        if (!automatico) {
            lojaAbertaCliente = true;
            atualizarUIStatusLoja(true, abertura, fechamento, false);
            return;
        }
        lojaAbertaCliente = verificarLojaAbertaCliente(abertura, fechamento);
        atualizarUIStatusLoja(lojaAbertaCliente, abertura, fechamento, true);
    }, error => {
        console.error("Erro ao carregar status da loja:", error);
    });
}

function atualizarUIStatusLoja(aberto, abertura, fechamento, automatico) {
    const banner = document.getElementById('store-status-banner');
    const dot = document.getElementById('store-status-dot');
    const texto = document.getElementById('store-status-texto');
    const horario = document.getElementById('store-status-horario');
    const lojaFechadaMsg = document.getElementById('loja-fechada-msg');
    const lojaFechadaHorario = document.getElementById('loja-fechada-horario');
    const btnCheckout = document.getElementById('btn-checkout');

    if (!banner || !dot || !texto || !horario) return;

    banner.classList.remove('hidden');
    if (aberto) {
        banner.className = 'mb-4 rounded-xl p-4 flex items-center gap-3 transition-all bg-green-500/10 border border-green-500/30';
        dot.className = 'w-3 h-3 rounded-full flex-shrink-0 bg-green-500';
        texto.className = 'font-bold text-sm text-green-400';
        texto.textContent = 'Loja aberta';
        horario.textContent = automatico ? `Atendimento até às ${fechamento}` : '';
        horario.classList.toggle('hidden', !automatico);
        if (lojaFechadaMsg) lojaFechadaMsg.classList.add('hidden');
        if (btnCheckout) btnCheckout.disabled = false;
    } else {
        banner.className = 'mb-4 rounded-xl p-4 flex items-center gap-3 transition-all bg-red-500/10 border border-red-500/30';
        dot.className = 'w-3 h-3 rounded-full flex-shrink-0 bg-red-500';
        texto.className = 'font-bold text-sm text-red-400';
        texto.textContent = 'Loja fechada';
        horario.textContent = `Atendimento das ${abertura} às ${fechamento}`;
        horario.classList.remove('hidden');
        if (lojaFechadaMsg) {
            lojaFechadaMsg.classList.remove('hidden');
            if (lojaFechadaHorario) lojaFechadaHorario.textContent = `Nosso horário de atendimento é das ${abertura} às ${fechamento}. Você poderá realizar um pedido quando a loja estiver aberta.`;
        }
        if (btnCheckout) {
            btnCheckout.disabled = true;
        }
    }
}

/* --- CARRINHO --- */
function openCart() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.remove('hidden');
    if (window.innerWidth < 1024) {
        closeSidebar();
    }
}

function closeCart() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.add('hidden');
}

function toggleCart() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.toggle('hidden');
    if (window.innerWidth < 1024) {
        closeSidebar();
    }
}

// Expor globalmente para garantir acesso do HTML
// Função de Debug Temporária
window.debugClick = function (id) {
    addToCart(id);
};

window.addToCart = addToCart;

function addToCart(prodId) {
    // Verificando se produtos existem
    if (!products || products.length === 0) {
        alert("Erro Crítico: Lista de produtos vazia (products.length = 0)!");
        return;
    }

    const product = products.find(p => p.id === prodId);

    if (!product) {
        alert("Erro: Produto não encontrado com ID: " + prodId);
        // console.log("IDs disponíveis:", products.map(p => p.id));
        return;
    }

    if (product.bloqueado === true) {
        alert("Este produto está bloqueado e não pode ser vendido no momento.");
        return;
    }

    // alert("Passo 2: Produto encontrado: " + product.nome);

    // Garante que preço é número
    if (typeof product.preco !== 'number') {
        product.preco = parseFloat(product.preco);
    }

    const existing = cart.find(i => i.id === prodId);

    if (existing) {
        // Validação de Estoque (com log para debug)
        // console.log("Estoque:", product.qtd, "No Carrinho:", existing.qtdCarrinho);
        if (product.qtd && existing.qtdCarrinho >= product.qtd) {
            return alert("Limite de estoque atingido para este item!");
        }
        existing.qtdCarrinho++;
        // alert("Quantidade atualizada para: " + existing.qtdCarrinho);
    } else {
        cart.push({
            id: product.id,
            nome: product.nome,
            preco: product.preco, // Salva o preço numérico
            qtdCarrinho: 1
        });
        // alert("Produto novo adicionado ao array cart! Total itens no carrinho: " + cart.length);
    }

    try {
        saveCart();
    } catch (e) { alert("Erro ao salvar localStorage: " + e.message); }

    try {
        updateCartUI();
        // alert("UI Atualizada com sucesso!"); 
    } catch (e) {
        alert("Erro visual updateCartUI: " + e.message);
        console.error(e);
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const countEl = document.getElementById('cart-count');
    const btnCheckout = document.getElementById('btn-checkout');

    // Atualiza badge (tanto no bottom nav quanto na sidebar)
    const totalItems = cart.reduce((acc, item) => acc + item.qtdCarrinho, 0);
    const sideCountEl = document.getElementById('side-cart-count');

    if (countEl) {
        countEl.innerText = totalItems;
        if (totalItems > 0) countEl.classList.remove('hidden');
        else countEl.classList.add('hidden');
    }

    if (sideCountEl) {
        sideCountEl.innerText = totalItems;
        if (totalItems > 0) sideCountEl.classList.remove('hidden');
        else sideCountEl.classList.add('hidden');
    }

    // Renderiza lista
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-10 flex flex-col items-center">
                <i class="fa fa-shopping-basket text-4xl mb-3 opacity-30"></i>
                <p>Seu carrinho está vazio.</p>
                <button onclick="toggleCart()" class="mt-4 text-amber-500 font-bold text-sm hover:underline">Ver Cardápio</button>
            </div>
        `;
        totalEl.innerText = "R$ 0.00";
        btnCheckout.disabled = true;
        return;
    }

    let total = 0;
    container.innerHTML = cart.map((item, idx) => {
        const subtotal = item.preco * item.qtdCarrinho;
        total += subtotal;
        return `
            <div class="flex justify-between items-center bg-neutral-800 p-3 rounded-lg border border-gray-700">
                <div>
                    <div class="font-bold text-white text-sm">${item.nome}</div>
                    <div class="text-xs text-gray-400">${item.qtdCarrinho}x R$ ${item.preco.toFixed(2)}</div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-amber-500 font-bold text-sm">R$ ${subtotal.toFixed(2)}</span>
                    <button onclick="removeFromCart(${idx})" class="text-red-400 hover:text-red-300 text-xs p-1">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    totalEl.innerText = `R$ ${total.toFixed(2)}`;
    btnCheckout.disabled = !lojaAbertaCliente;
}

async function checkout() {
    if (cart.length === 0) return;
    if (!currentUser || !userProfile) return openAuth(true);
    ocultarAviso('cart-aviso');

    if (!lojaAbertaCliente) {
        const msgLoja = "Loja fechada no momento. Nosso horário de atendimento é das 08:00 às 18:00. Você poderá realizar um pedido quando a loja estiver aberta.";
        mostrarAviso('cart-aviso', msgLoja);
        showToast(msgLoja, 'warning');
        return;
    }

    const formaPagamento = document.getElementById('select-forma-pagamento').value;
    if (!formaPagamento) {
        const msgPag = "Por favor, selecione a forma de pagamento.";
        mostrarAviso('cart-aviso', msgPag);
        showToast(msgPag, 'warning');
        return;
    }

    const btn = document.getElementById('btn-checkout');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> <span>Processando pedido...</span>';

    try {
        const batch = db.batch();
        const totalVenda = cart.reduce((acc, item) => acc + (item.preco * item.qtdCarrinho), 0);

        // 1. Atualiza Estoque
        cart.forEach(item => {
            const ref = db.collection('estoque').doc(item.id);
            // Nota: Idealmente usar transação para garantir qtd, mas batch serve para o MVP
            // Precisamos pegar a qtd atual do array 'products' que está atualizado pelo listener
            const currentProd = products.find(p => p.id === item.id);
            if (currentProd) {
                batch.update(ref, { qtd: currentProd.qtd - item.qtdCarrinho });
            }
        });

        // 2. Cria Venda
        const numeroPedido = await proximoNumeroPedido(); // Sequência 000001, 000002, ...
        const vendaRef = db.collection('vendas').doc();
        batch.set(vendaRef, {
            clienteUid: currentUser.uid, // Para filtrar "Meus Pedidos"
            clienteNome: userProfile.nome,
            clienteTel: userProfile.tel, // Útil para contato
            clienteEndereco: `${userProfile.endereco}, ${userProfile.numero}`,
            total: totalVenda,
            itens: cart,
            numeroPedido: numeroPedido,
            formaPagamento: formaPagamento,
            data: new Date().toLocaleString(),
            dataIso: new Date().toISOString(),
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'Pendente' // Novo campo de status
        });

        await batch.commit();

        showToast("Pedido realizado com sucesso! Acompanhe o status na aba Pedidos.", "success");
        cart = [];
        saveCart(); // Salva vazio
        updateCartUI();
        toggleCart();
        switchView('orders'); // Vai para aba de pedidos

    } catch (error) {
        console.error("Erro ao finalizar pedido:", error);
        const erroMsg = "Erro ao finalizar pedido: " + (error.message || "Tente novamente.");
        mostrarAviso('cart-aviso', erroMsg);
        showToast(erroMsg, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>FINALIZAR PEDIDO</span>';
    }
}

/* --- MEUS PEDIDOS --- */
function listenToMyOrders() {
    if (!currentUser) return;

    db.collection('vendas')
        .where('clienteUid', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            myOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Ordenação no cliente para evitar necessidade de índice composto no Firestore
            myOrders.sort((a, b) => {
                const dateA = new Date(a.dataIso || 0);
                const dateB = new Date(b.dataIso || 0);
                return dateB - dateA;
            });
            renderOrders(myOrders);
        }, error => {
            console.error("Erro ao buscar pedidos:", error);
            document.getElementById('orders-list').innerHTML = '<p class="text-red-500 text-center p-4">Erro ao carregar pedidos.</p>';
        });
}

function renderOrders(orders) {
    const list = document.getElementById('orders-list');

    if (orders.length === 0) {
        list.innerHTML = `
            <div class="text-center text-gray-500 py-10">
                <i class="fa fa-receipt text-4xl mb-3 opacity-30"></i>
                <p>Você ainda não fez nenhum pedido.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = orders.map(order => {
        // Define cor do status
        let statusColor = 'text-yellow-500';
        let statusBg = 'bg-yellow-500/10';
        let statusIcon = 'fa-clock';

        if (order.status === 'Em Preparo') {
            statusColor = 'text-blue-400';
            statusBg = 'bg-blue-400/10';
            statusIcon = 'fa-fire-burner';
        } else if (order.status === 'Saiu para Entrega') {
            statusColor = 'text-orange-400';
            statusBg = 'bg-orange-400/10';
            statusIcon = 'fa-motorcycle';
        } else if (order.status === 'Concluído' || order.status === 'Entregue') {
            statusColor = 'text-green-400';
            statusBg = 'bg-green-400/10';
            statusIcon = 'fa-check-circle';
        }

        const resumo = order.itens.map(i => `${i.qtdCarrinho}x ${i.nome}`).join(', ');

        return `
            <div class="bg-neutral-800 rounded-xl p-4 border border-gray-700 shadow-lg cursor-pointer hover:border-amber-500/50 transition-colors" onclick="openOrderDetails('${order.id}')">
                <div class="flex justify-between items-start mb-3 border-b border-gray-700 pb-3">
                    <div>
                        <span class="text-xs text-gray-400 block mb-1">${order.data}</span>
                        <span class="font-bold text-white">Pedido #${numeroExibicao(order)}</span>
                    </div>
                    <div class="${statusBg} ${statusColor} px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                        <i class="fa ${statusIcon}"></i> ${order.status || 'Pendente'}
                    </div>
                </div>
                
                <div class="mb-3">
                    <p class="text-sm text-gray-300 line-clamp-2">${resumo}</p>
                </div>

                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-500">${order.itens.length} itens</span>
                    <div class="flex items-center gap-3">
                        <span class="text-amber-500 font-bold">R$ ${order.total.toFixed(2)}</span>
                        <i class="fa fa-chevron-right text-gray-600"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/* --- DETALHES DO PEDIDO & COMPROVANTE --- */
function openOrderDetails(orderId) {
    currentOrderDetails = myOrders.find(o => o.id === orderId);
    if (!currentOrderDetails) return;

    const modal = document.getElementById('order-details-modal');
    const content = document.getElementById('order-details-content');

    // Status Styling
    let statusColor = 'text-yellow-500';
    if (currentOrderDetails.status === 'Em Preparo') statusColor = 'text-blue-400';
    else if (currentOrderDetails.status === 'Saiu para Entrega') statusColor = 'text-orange-400';
    else if (currentOrderDetails.status === 'Concluído' || currentOrderDetails.status === 'Entregue') statusColor = 'text-green-400';

    const itemsHtml = currentOrderDetails.itens.map(item => `
        <div class="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-0">
            <div>
                <span class="text-white font-bold">${item.qtdCarrinho}x</span>
                <span class="text-gray-300 ml-2">${item.nome}</span>
            </div>
            <span class="text-gray-400">R$ ${(item.preco * item.qtdCarrinho).toFixed(2)}</span>
        </div>
    `).join('');

    // Formatar data
    const dataFormatada = currentOrderDetails.data || 'Data não disponível';

    content.innerHTML = `
        <div class="text-center mb-6">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full ${statusColor.replace('text-', 'bg-')}/20 mb-4">
                <i class="fa fa-receipt text-2xl ${statusColor}"></i>
            </div>
            <h4 class="text-2xl font-bold text-white mb-1">Pedido #${numeroExibicao(currentOrderDetails)}</h4>
            <div class="inline-block px-4 py-1 rounded-full border ${statusColor.replace('text-', 'border-')} ${statusColor} text-sm font-bold uppercase tracking-wider mb-2">
                ${currentOrderDetails.status || 'Pendente'}
            </div>
            <p class="text-sm text-gray-500">${dataFormatada}</p>
        </div>

        <div class="space-y-4">
            <!-- Card Itens -->
            <div class="bg-neutral-800 p-5 rounded-xl border border-gray-700 shadow-lg">
                <h5 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <i class="fa fa-shopping-basket"></i> Itens do Pedido
                </h5>
                <div class="space-y-1 mb-4">
                    ${itemsHtml}
                </div>
                <div class="flex justify-between items-center pt-4 border-t border-gray-700">
                    <span class="text-gray-400">Total do Pedido</span>
                    <span class="font-bold text-amber-500 text-2xl">R$ ${currentOrderDetails.total.toFixed(2)}</span>
                </div>
            </div>

            <!-- Card Entrega -->
            <div class="bg-neutral-800 p-5 rounded-xl border border-gray-700 shadow-lg">
                 <h5 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <i class="fa fa-map-marker-alt"></i> Detalhes da Entrega
                </h5>
                <div class="space-y-2">
                    <div>
                        <p class="text-xs text-gray-500">Cliente</p>
                        <p class="text-white font-semibold">${currentOrderDetails.clienteNome}</p>
                    </div>
                     <div>
                        <p class="text-xs text-gray-500">Endereço</p>
                        <p class="text-white">${currentOrderDetails.clienteEndereco || (userProfile ? `${userProfile.endereco || ''}, ${userProfile.numero || ''}` : 'Não informado')}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

function closeOrderDetails() {
    document.getElementById('order-details-modal').classList.add('hidden');
    currentOrderDetails = null;
}

function generateReceipt() {
    if (!currentOrderDetails) return;

    const pedido = currentOrderDetails;
    const printWindow = window.open('', '', 'width=400,height=600');

    const itemsHtml = pedido.itens.map(item => `
        <tr class="item">
            <td>${item.qtdCarrinho}x ${item.nome}</td>
            <td style="text-align: right;">R$ ${(item.preco * item.qtdCarrinho).toFixed(2)}</td>
        </tr>
    `).join('');

    const htmlContent = `
        <html>
        <head>
            <title>Comprovante - Pedido #${numeroExibicao(pedido)}</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; max-width: 300px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                .logo { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
                .info { font-size: 12px; margin-bottom: 5px; }
                table { width: 100%; font-size: 12px; margin-bottom: 10px; }
                .total { font-size: 16px; font-weight: bold; text-align: right; margin-top: 10px; border-top: 1px dashed #000; pt-2; }
                .footer { text-align: center; font-size: 10px; margin-top: 20px; border-top: 1px dashed #000; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">${nomeLojaCliente}</div>
                <div class="info">Pedido #${numeroExibicao(pedido)}</div>
                <div class="info">${pedido.data}</div>
                <div class="info">Status: ${pedido.status || 'Pendente'}</div>
            </div>
            
            <div class="info">
                <strong>Cliente:</strong> ${pedido.clienteNome}<br>
                <strong>Tel:</strong> ${pedido.clienteTel}<br>
                <strong>Endereço:</strong> ${pedido.clienteEndereco}<br>
                <strong>Forma de Pagamento:</strong> ${pedido.formaPagamento || 'Não informada'}
            </div>

            <br>
            
            <table>
                ${itemsHtml}
            </table>

            <div class="total">
                TOTAL: R$ ${pedido.total.toFixed(2)}
            </div>

            <div class="footer">
                Obrigado pela preferência!<br>
                Acompanhe seu pedido pelo Painel.
            </div>

            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

/* ================= CONTROLE DE SIDEBAR / NAVBAR (MENU HAMBURGER) ================= */
function toggleSidebar() {
    const isDesktop = window.innerWidth >= 1024;
    const appScreen = document.getElementById('app-screen');
    const sidebar = document.getElementById('client-sidebar') || document.querySelector('.client-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (isDesktop) {
        if (!appScreen) return;
        appScreen.classList.toggle('sidebar-collapsed');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        if (!sidebar) return;
        const isOpen = sidebar.classList.toggle('sidebar-open');
        if (overlay) overlay.classList.toggle('active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('client-sidebar') || document.querySelector('.client-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('sidebar-open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.carregarFormularioPerfil = carregarFormularioPerfil;
window.salvarDadosPerfil = salvarDadosPerfil;
window.openAuth = openAuth;
window.closeAuth = closeAuth;
window.openCart = openCart;
window.closeCart = closeCart;

