/* ================= CONFIGURAÇÃO DO FIREBASE ================= */
// ⚠️ PROJETO "orion-express" — substitua pelas chaves do novo projeto no Firebase Console
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

/* ================= FILIAL DO CARDÁPIO ================= */
const FILIAL_PADRAO_ID = 'matriz';
const filialUrl = new URLSearchParams(window.location.search).get('filial');
const filialClienteId = filialUrl || localStorage.getItem('orion_filial_cliente') || FILIAL_PADRAO_ID;
localStorage.setItem('orion_filial_cliente', filialClienteId);

function filialDoRegistro(registro) {
    return (registro && registro.filialId) || FILIAL_PADRAO_ID;
}

function idConfigFilial(chave) {
    return filialClienteId === FILIAL_PADRAO_ID ? chave : `${filialClienteId}__${chave}`;
}

function refConfigFilial(chave) {
    return db.collection('config').doc(idConfigFilial(chave));
}

function idClienteFilial(uid) {
    return filialClienteId === FILIAL_PADRAO_ID ? uid : `${filialClienteId}__${uid}`;
}

/* ================= ESTADO GLOBAL ================= */
let currentUser = null;
let userProfile = null;
let cart = [];
let cartCarregado = false;
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
        const snapshot = await db.collection('vendas').where('filialId', '==', filialClienteId).get();
        let max = 0;
        snapshot.docs.forEach(doc => {
            const n = parseInt(doc.data().numeroPedido, 10);
            if (!Number.isNaN(n) && n > max) max = n;
        });
        const ref = refConfigFilial('contador');
        const atualSnap = await ref.get();
        const atual = atualSnap.exists ? Number(atualSnap.data().numero || 0) : 0;
        if (max > atual) {
            await ref.set({ numero: max, filialId: filialClienteId }, { merge: true });
        }
    } catch (error) {
        console.error("Erro ao sincronizar contador de pedidos:", error);
    }
}

// Próximo número de pedido (001, 002, ...) via contador atômico no Firestore
async function proximoNumeroPedido() {
    const ref = refConfigFilial('contador');
    const resultado = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const atual = snap.exists ? Number(snap.data().numero || 0) : 0;
        const proximo = atual + 1;
        tx.set(ref, { numero: proximo, filialId: filialClienteId }, { merge: true });
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
});

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

function openAuth() {
    const a = document.getElementById('auth-screen');
    if (a) a.classList.remove('hidden');
}

function handleUserAction() {
    if (currentUser) logout();
    else openAuth();
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
        const doc = await db.collection('clientes').doc(idClienteFilial(uid)).get();
        if (doc.exists) {
            userProfile = doc.data();
            initApp();
            document.getElementById('auth-screen').classList.add('hidden');
        } else {
            // Conta criada no Auth, mas sem perfil no banco -> Setup
            document.getElementById('auth-screen').classList.add('hidden');
            showScreen('setup-screen');
        }
    } catch (e) {
        console.error("Erro ao carregar perfil:", e);
        alert("Erro ao carregar seu perfil. Verifique sua conexão.");
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
    listenToPaymentMethods();
    loadCart();
    checkAuth();
});

/* ================= FUNÇÕES DE AUTH (LOGIN/REGISTER) ================= */

async function handleLoginReal() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;

    if (!email || !pass) return alert("Preencha e-mail e senha.");

    try {
        await auth.signInWithEmailAndPassword(email, pass);
        // O onAuthStateChanged vai lidar com o redirecionamento
    } catch (error) {
        console.error("Erro Login:", error);
        alert("Erro ao entrar: " + authErrorMessage(error.code));
    }
}

async function handleRegisterReal() {
    const email = document.getElementById('cad-email').value;
    const pass = document.getElementById('cad-pass').value;
    const passConf = document.getElementById('cad-pass-conf').value;

    if (pass !== passConf) return alert("As senhas não conferem.");
    if (pass.length < 6) return alert("A senha deve ter no mínimo 6 caracteres.");

    try {
        await auth.createUserWithEmailAndPassword(email, pass);
        // O onAuthStateChanged vai lidar com o redirecionamento para o Setup
        document.getElementById('cadastroModal').classList.add('hidden');
        document.getElementById('cadastroModal').classList.remove('flex');
    } catch (error) {
        console.error("Erro Cadastro:", error);
        alert("Erro ao cadastrar: " + authErrorMessage(error.code));
    }
}

function logout() {
    auth.signOut().then(() => {
        location.reload();
    });
}

function authErrorMessage(code) {
    switch (code) {
        case 'auth/invalid-email': return 'E-mail inválido.';
        case 'auth/user-disabled': return 'Usuário desativado.';
        case 'auth/user-not-found': return 'Usuário não encontrado.';
        case 'auth/wrong-password': return 'Senha incorreta.';
        case 'auth/email-already-in-use': return 'Este e-mail já está cadastrado.';
        case 'auth/weak-password': return 'Senha muito fraca.';
        default: return 'Verifique suas credenciais.';
    }
}

/* ================= FUNÇÕES DE PERFIL (SETUP) ================= */
async function saveProfile() {
    if (!currentUser) return;

    const perfil = {
        nome: document.getElementById('setup-nome').value,
        tel: document.getElementById('setup-tel').value,
        endereco: document.getElementById('setup-endereco').value,
        numero: document.getElementById('setup-numero').value,
        cep: document.getElementById('setup-cep').value,
        pagamentoPreferido: document.getElementById('setup-pagamento').value,
        email: currentUser.email,
        uid: currentUser.uid, // Vincula ID
        dataCadastro: new Date().toISOString()
    };

    try {
        // Cada filial mantém seu próprio cadastro para o mesmo cliente autenticado.
        await db.collection('clientes').doc(idClienteFilial(currentUser.uid)).set({ ...perfil, filialId: filialClienteId });

        userProfile = perfil;
        alert("Cadastro completo! Vamos escolher seu pod? 💨");
        initApp();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar perfil: " + error.message);
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

    // O contador é mantido atomicamente por filial; a migração inicial é feita pelo painel admin.
}

function loadCart() {
    const saved = localStorage.getItem(`pdv_client_cart_${filialClienteId}`);
    if (saved) {
        try {
            cart = JSON.parse(saved);
            updateCartUI();
        } catch (e) { console.error("Erro ao carregar carrinho", e); }
    }
    cartCarregado = true;
    if (products.length) {
        cart = cart.filter(item => products.some(product => product.id === item.id));
        saveCart();
    }
}

function saveCart() {
    localStorage.setItem(`pdv_client_cart_${filialClienteId}`, JSON.stringify(cart));
}

function switchView(viewName) {
    // Pedidos exige login
    if (viewName === 'orders' && !currentUser) { openAuth(); return; }

    // Esconde todas as views
    ['view-menu', 'view-orders'].forEach(id => document.getElementById(id).classList.add('hidden'));

    // Mostra a selecionada
    document.getElementById(`view-${viewName}`).classList.remove('hidden');

    // Atualiza Nav Bottom
    const btnMenu = document.getElementById('nav-menu');
    const btnOrders = document.getElementById('nav-orders');

    if (viewName === 'menu') {
        btnMenu.classList.add('text-amber-500');
        btnMenu.classList.remove('text-gray-400');
        btnOrders.classList.remove('text-amber-500');
        btnOrders.classList.add('text-gray-400');
    } else {
        btnOrders.classList.add('text-amber-500');
        btnOrders.classList.remove('text-gray-400');
        btnMenu.classList.remove('text-amber-500');
        btnMenu.classList.add('text-gray-400');
    }
}

/* --- PRODUTOS --- */
function listenToProducts() {
    db.collection('estoque').where('filialId', '==', filialClienteId).onSnapshot(snapshot => {
        products = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(product => product.nome && product.nome !== 'banner_config' && Number.isFinite(Number(product.preco)))
            .filter(product => product.bloqueado !== true);

        // Evita reaproveitar itens removidos, bloqueados ou pertencentes a outra filial.
        if (cartCarregado) {
            cart = cart.filter(item => products.some(product => product.id === item.id));
            saveCart();
            updateCartUI();
        }
        renderProducts();
    }, error => {
        console.error("Erro ao carregar produtos:", error);
        const grid = document.getElementById('products-grid');
        if (grid) grid.innerHTML = '<div class="col-span-full text-center text-red-400 py-10">Não foi possível carregar o catálogo. Verifique sua conexão.</div>';
    });
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
                <div class="absolute top-2 right-2 ${inStock ? 'bg-black/60 text-white' : 'bg-red-600/80 text-white'} text-xs px-2 py-1 rounded backdrop-blur-sm z-10">
                    ${inStock ? `${p.qtd} un.` : '<i class="fa fa-times-circle mr-1"></i> Indisponível'}
                </div>
            </div>
            <div class="p-4 flex flex-col flex-grow">
                <h3 class="font-bold text-white text-lg leading-tight mb-1">${p.nome}</h3>
                <p class="text-gray-400 text-xs mb-3 line-clamp-2">Pod descartável premium com sabor selecionado.</p>
                
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
    refConfigFilial('pagamentos').onSnapshot(snapshot => {
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
}

function fillPaymentSelect(selectId, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">' + placeholder + '</option>' +
        metodosPagamento.map(m => `<option value="${m}">${m}</option>`).join('');
}

/* --- BANNER --- */
function listenToBanner() {
    refConfigFilial('banner').onSnapshot(snapshot => {
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

/* --- CARRINHO --- */
function toggleCart() {
    const drawer = document.getElementById('cart-drawer');
    drawer.classList.toggle('hidden');
}

// Expor globalmente para garantir acesso do HTML
// Função de Debug Temporária
window.debugClick = function (id) {
    addToCart(id);
};

window.addToCart = addToCart;

function addToCart(prodId) {
    // Pedido exige login
    if (!currentUser) { openAuth(); return; }

    // alert("Passo 1: Entrou no addToCart com ID: " + prodId);

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

    // Atualiza badge
    const totalItems = cart.reduce((acc, item) => acc + item.qtdCarrinho, 0);
    countEl.innerText = totalItems;
    if (totalItems > 0) countEl.classList.remove('hidden');
    else countEl.classList.add('hidden');

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
    btnCheckout.disabled = false;
}

async function checkout() {
    if (cart.length === 0) return;
    if (!currentUser || !userProfile) return openAuth();

    const formaPagamento = document.getElementById('select-forma-pagamento').value;
    if (!formaPagamento) return alert("Selecione a forma de pagamento.");

    const btn = document.getElementById('btn-checkout');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Processando...';

    try {
        const totalVenda = cart.reduce((acc, item) => acc + (item.preco * item.qtdCarrinho), 0);

        // O cliente apenas solicita o pedido. Preço, total e estoque são
        // confirmados pelo operador quando ele aceita o pedido no painel.
        const numeroPedido = await proximoNumeroPedido(); // Sequência 000001, 000002, ...
        const vendaRef = db.collection('vendas').doc();
        await vendaRef.set({
            filialId: filialClienteId,
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
            status: 'Pendente',
            estoqueBaixado: false,
            origem: 'cliente'
        });

        alert("Pedido realizado com sucesso! Acompanhe o status na aba Pedidos.");
        cart = [];
        saveCart(); // Salva vazio
        updateCartUI();
        toggleCart();
        switchView('orders'); // Vai para aba de pedidos

    } catch (error) {
        console.error(error);
        alert("Erro ao finalizar pedido: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'FINALIZAR PEDIDO';
    }
}

/* --- MEUS PEDIDOS --- */
function listenToMyOrders() {
    if (!currentUser) return;

    db.collection('vendas')
        .where('clienteUid', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            myOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            myOrders = myOrders.filter(order => filialDoRegistro(order) === filialClienteId);
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
                        <p class="text-white">${currentOrderDetails.clienteEndereco}</p>
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
                <div class="logo">ORION EXPRESS</div>
                <div class="info">Pedido #${numeroExibicao(pedido)}</div>
                <div class="info">${pedido.data}</div>
                <div class="info">Status: ${pedido.status || 'Pendente'}</div>
            </div>
            
            <div class="info">
                <strong>Cliente:</strong> ${pedido.clienteNome}<br>
                <strong>Tel:</strong> ${pedido.clienteTel}<br>
                <strong>Endereço:</strong> ${pedido.clienteEndereco}
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
