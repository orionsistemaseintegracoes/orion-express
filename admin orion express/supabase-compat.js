// supabase-compat.js
// Firebase to Supabase Compatibility Layer
// Permite que o código legado do Firestore funcione com o Supabase sem grandes refatorações.

const supabaseUrl = 'https://iphqiqtobvtakgxiakrf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwaHFpcXRvYnZ0YWtneGlha3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTI4MDksImV4cCI6MjEwMzc4ODgwOX0.TVfIU-Mr83v0sOyIk7duXVmzVS8ndxvpCEh0LQsiTDA';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
    global: {
        fetch: (url, options) => {
            return fetch(url, { ...options, cache: 'no-store' });
        }
    }
});

function _normalizeSupabasePayload(collection, data, id) {
    let payload = id ? { id, ...data } : { ...data };

    if (collection === 'clientes') {
        const copy = { ...payload };
        if (copy.dataCadastro && !copy.data_cadastro) {
            copy.data_cadastro = copy.dataCadastro;
        }
        if (!copy.since && (copy.data_cadastro || copy.dataCadastro)) {
            copy.since = copy.data_cadastro || copy.dataCadastro;
        }
        delete copy.dataCadastro;
        delete copy.pagamentoPreferido;
        delete copy.uid;
        return copy;
    }

    if (collection === 'vendas') {
        const copy = { ...payload };
        const clienteIdVal = copy.clienteId || copy.clienteUid || copy.cliente_id || null;
        if (clienteIdVal) {
            copy.clienteId = clienteIdVal;
            copy.cliente_id = clienteIdVal;
        }
        const clienteNomeVal = copy.clienteNome || copy.cliente_nome || null;
        if (clienteNomeVal) {
            copy.clienteNome = clienteNomeVal;
            copy.cliente_nome = clienteNomeVal;
        }
        if (copy.formaPagamento && !copy.pagamento) {
            copy.pagamento = copy.formaPagamento;
        }
        if (copy.numeroPedido !== undefined && copy.numero === undefined) {
            const num = parseInt(copy.numeroPedido, 10);
            if (!Number.isNaN(num)) copy.numero = num;
        }

        if (copy.clienteEndereco || copy.clienteTel) {
            if (Array.isArray(copy.itens) && copy.itens.length > 0) {
                copy.itens = copy.itens.map((item, idx) => {
                    if (idx === 0) {
                        return {
                            ...item,
                            _clienteEndereco: copy.clienteEndereco,
                            _clienteTel: copy.clienteTel
                        };
                    }
                    return item;
                });
            }
        }

        delete copy.clienteUid;
        delete copy.clienteEndereco;
        delete copy.clienteTel;
        delete copy.submittedAt;

        return copy;
    }

    if (collection === 'mesas') {
        const copy = { ...payload };
        // Como a tabela 'mesas' no Supabase não possui a coluna 'clienteNome',
        // armazenamos os metadados do cliente dentro do array jsonb 'itens'
        if (copy.clienteNome !== undefined) {
            const itensArr = Array.isArray(copy.itens) ? [...copy.itens] : [];
            const metaIdx = itensArr.findIndex(i => i && i._metaMesa === true);
            if (copy.clienteNome) {
                if (metaIdx >= 0) {
                    itensArr[metaIdx] = { ...itensArr[metaIdx], clienteNome: copy.clienteNome };
                } else {
                    itensArr.push({ _metaMesa: true, clienteNome: copy.clienteNome });
                }
            } else if (metaIdx >= 0) {
                itensArr.splice(metaIdx, 1);
            }
            copy.itens = itensArr;
            delete copy.clienteNome;
        }
        return copy;
    }

    if (collection === 'caixas') {
        const copy = { ...payload };
        // Mapeia os campos da aplicação para as colunas reais do Supabase
        if (copy.valor_abertura !== undefined && copy.saldo_inicial === undefined) {
            copy.saldo_inicial = copy.valor_abertura;
        }
        if (copy.valor_informado_fechamento !== undefined && copy.saldo_final === undefined) {
            copy.saldo_final = copy.valor_informado_fechamento;
        }
        if (copy.usuario_abertura_id !== undefined && copy.userId === undefined) {
            copy.userId = copy.usuario_abertura_id;
        }
        if (copy.usuario_abertura_nome !== undefined && copy.userName === undefined) {
            copy.userName = copy.usuario_abertura_nome;
        }

        // Remove colunas que não existem na tabela caixas do Supabase
        delete copy.sequencia;
        delete copy.usuario_abertura_id;
        delete copy.usuario_abertura_nome;
        delete copy.usuario_fechamento_id;
        delete copy.valor_abertura;
        delete copy.valor_informado_fechamento;
        delete copy.valor_esperado_fechamento;
        delete copy.diferenca;

        return copy;
    }

    if (collection === 'movimentacoes_caixa') {
        const copy = { ...payload };
        if (copy.forma_pagamento && !copy.pagamento) {
            copy.pagamento = copy.forma_pagamento;
        }
        if (copy.observacao && !copy.descricao) {
            copy.descricao = copy.observacao;
        }
        if (copy.usuario_id && !copy.operadorId) {
            copy.operadorId = copy.usuario_id;
        }
        if (!copy.data && copy.data_hora) {
            copy.data = copy.data_hora;
        }

        delete copy.forma_pagamento;
        delete copy.observacao;
        delete copy.usuario_id;
        delete copy.conta_pagar_id;
        delete copy.contaPagarId;

        return copy;
    }

    if (collection === 'entradas') {
        const copy = { ...payload };

        // O Supabase tem as seguintes colunas em 'entradas':
        // id (uuid), criadoEm, atualizadoEm, fornecedorId, fornecedorNome, itens (jsonb), total, status, numero, dataIso, notaFiscal
        // Colunas ausentes no schema Supabase: chave, serie, nota, dataEmissao, dataEntrada, observacao, usuarioId, usuarioNome, confirmadoEm
        // Salvamos esses metadados no jsonb 'itens' ou como metadata em itens[0]._metaEntrada
        if (copy.nota && !copy.notaFiscal) {
            copy.notaFiscal = copy.nota;
        }

        const metaEntrada = {
            nota: copy.nota || copy.notaFiscal || '',
            serie: copy.serie || '',
            chave: copy.chave || '',
            dataEmissao: copy.dataEmissao || '',
            dataEntrada: copy.dataEntrada || '',
            observacao: copy.observacao || '',
            usuarioId: copy.usuarioId || null,
            usuarioNome: copy.usuarioNome || '',
            confirmadoEm: copy.confirmadoEm || null,
            estornadoEm: copy.estornadoEm || null
        };

        if (Array.isArray(copy.itens)) {
            copy.itens = copy.itens.map((item, idx) => {
                if (idx === 0) {
                    return { ...item, _metaEntrada: metaEntrada };
                }
                return item;
            });
        }

        // Remove colunas que não existem na tabela entradas do Supabase
        delete copy.chave;
        delete copy.serie;
        delete copy.nota;
        delete copy.dataEmissao;
        delete copy.dataEntrada;
        delete copy.observacao;
        delete copy.usuarioId;
        delete copy.usuarioNome;
        delete copy.confirmadoEm;
        delete copy.estornadoEm;

        if (copy.numero !== undefined && copy.numero !== null) {
            const numParsed = parseInt(copy.numero, 10);
            if (!isNaN(numParsed)) copy.numero = numParsed;
        }

        return copy;
    }

    if (collection === 'movimentacoes_estoque') {
        const copy = { ...payload };

        // Colunas físicas de movimentacoes_estoque no Supabase:
        // id (uuid), produtoId, tipo, qtd, dataIso, motivo
        // Mapeia campos do app para as colunas do Supabase:
        if (copy.quantidade !== undefined && copy.qtd === undefined) {
            copy.qtd = Number(copy.quantidade) || 0;
        }

        // Constrói um resumo amigável em 'motivo' se não existir
        if (!copy.motivo) {
            const partes = [];
            if (copy.origem) partes.push(copy.origem.toUpperCase());
            if (copy.numero) partes.push(`NF #${copy.numero}`);
            if (copy.produtoNome) partes.push(copy.produtoNome);
            if (copy.valorUnitario) partes.push(`R$ ${Number(copy.valorUnitario).toFixed(2)}`);
            copy.motivo = partes.length > 0 ? partes.join(' · ') : (copy.tipo || 'Movimentação');
        }

        // Remove colunas que não existem no Supabase
        delete copy.numero;
        delete copy.quantidade;
        delete copy.valorUnitario;
        delete copy.produtoNome;
        delete copy.origem;
        delete copy.origemId;
        delete copy.usuarioId;
        delete copy.usuarioNome;

        return copy;
    }

    if (collection === 'contas_pagar') {
        const copy = { ...payload };

        // Colunas físicas de 'contas_pagar' no Supabase:
        // id, fornecedorId, descricao, valor, status, vencimento, dataPagamento, dataIso, caixaMovimentacaoId
        if (copy.dataVencimento && !copy.vencimento) {
            copy.vencimento = copy.dataVencimento;
        }

        // Limpa a descrição base removendo metadados antigos se houver
        let baseDescricao = String(copy.descricao || '').replace(/\s*<!--meta:[\s\S]*?-->/g, '').trim();

        // Se estamos em um update sem campos completos, mantemos a descrição
        // Se temos novos metadados ou campos específicos, empacotamos:
        const meta = {
            origem: copy.origem || (copy.entradaId ? 'entrada' : undefined),
            entradaId: copy.entradaId || undefined,
            fornecedorNome: copy.fornecedorNome || undefined,
            numero: copy.numero !== undefined ? copy.numero : undefined,
            valorPago: copy.valorPago !== undefined ? Number(copy.valorPago) : undefined,
            formaPagamento: copy.formaPagamento || undefined,
            observacao: copy.observacao || undefined,
            baixas: Array.isArray(copy.baixas) ? copy.baixas : undefined,
            usuarioId: copy.usuarioId || undefined,
            usuarioNome: copy.usuarioNome || undefined
        };

        // Remove chaves undefined do meta
        Object.keys(meta).forEach(k => meta[k] === undefined && delete meta[k]);

        if (Object.keys(meta).length > 0) {
            copy.descricao = `${baseDescricao} <!--meta:${JSON.stringify(meta)}-->`.trim();
        } else {
            copy.descricao = baseDescricao;
        }

        // Remove colunas que não existem no Supabase
        delete copy.dataVencimento;
        delete copy.entradaId;
        delete copy.fornecedorNome;
        delete copy.formaPagamento;
        delete copy.observacao;
        delete copy.numero;
        delete copy.valorPago;
        delete copy.baixas;
        delete copy.origem;
        delete copy.usuarioId;
        delete copy.usuarioNome;
        delete copy.criadoEm;
        delete copy.atualizadoEm;

        return copy;
    }

    return payload;
}

function _hydrateRow(collection, row) {
    if (!row) return row;
    if (collection === 'vendas') {
        const h = { ...row };
        h.clienteUid = h.clienteUid || h.clienteId || h.cliente_id;
        h.clienteNome = h.clienteNome || h.cliente_nome;
        h.formaPagamento = h.formaPagamento || h.pagamento || h.metodo_pagamento;
        if (Array.isArray(h.itens) && h.itens.length > 0 && h.itens[0]._clienteEndereco) {
            h.clienteEndereco = h.clienteEndereco || h.itens[0]._clienteEndereco;
            h.clienteTel = h.clienteTel || h.itens[0]._clienteTel;
        }
        return h;
    }
    if (collection === 'mesas') {
        const h = { ...row };
        let clienteNome = null;
        if (Array.isArray(h.itens)) {
            const metaItem = h.itens.find(i => i && i._metaMesa === true);
            if (metaItem && metaItem.clienteNome) {
                clienteNome = metaItem.clienteNome;
            }
            // Filtra os metadados para que itens da mesa contenham apenas produtos
            h.itens = h.itens.filter(i => !i || !i._metaMesa);
        }
        h.clienteNome = clienteNome;
        return h;
    }
    if (collection === 'caixas') {
        const h = { ...row };
        h.valor_abertura = h.valor_abertura !== undefined ? h.valor_abertura : Number(h.saldo_inicial || 0);
        h.valor_informado_fechamento = h.valor_informado_fechamento !== undefined ? h.valor_informado_fechamento : (h.saldo_final !== null && h.saldo_final !== undefined ? Number(h.saldo_final) : null);
        h.usuario_abertura_id = h.usuario_abertura_id || h.userId || h.operadorId;
        h.usuario_abertura_nome = h.usuario_abertura_nome || h.userName || h.operadorNome;
        return h;
    }
    if (collection === 'movimentacoes_caixa') {
        const h = { ...row };
        h.forma_pagamento = h.forma_pagamento || h.pagamento || 'DINHEIRO';
        h.observacao = h.observacao || h.descricao || '';
        h.usuario_id = h.usuario_id || h.operadorId || h.userId;
        h.data_hora = h.data_hora || h.data || new Date().toISOString();
        return h;
    }
    if (collection === 'entradas') {
        const h = { ...row };
        h.nota = h.nota || h.notaFiscal || '';
        h.serie = h.serie || '';
        h.chave = h.chave || '';
        h.dataEmissao = h.dataEmissao || '';
        h.dataEntrada = h.dataEntrada || '';
        h.observacao = h.observacao || '';
        h.usuarioId = h.usuarioId || null;
        h.usuarioNome = h.usuarioNome || '';
        h.confirmadoEm = h.confirmadoEm || null;
        h.estornadoEm = h.estornadoEm || null;

        if (Array.isArray(h.itens) && h.itens.length > 0 && h.itens[0]._metaEntrada) {
            const meta = h.itens[0]._metaEntrada;
            h.nota = meta.nota || h.nota;
            h.serie = meta.serie || h.serie;
            h.chave = meta.chave || h.chave;
            h.dataEmissao = meta.dataEmissao || h.dataEmissao;
            h.dataEntrada = meta.dataEntrada || h.dataEntrada;
            h.observacao = meta.observacao || h.observacao;
            h.usuarioId = meta.usuarioId || h.usuarioId;
            h.usuarioNome = meta.usuarioNome || h.usuarioNome;
            h.confirmadoEm = meta.confirmadoEm || h.confirmadoEm;
            h.estornadoEm = meta.estornadoEm || h.estornadoEm;

            // Limpa o metadado do item exposto para a UI
            h.itens = h.itens.map((item, idx) => {
                if (idx === 0) {
                    const cleanItem = { ...item };
                    delete cleanItem._metaEntrada;
                    return cleanItem;
                }
                return item;
            });
        }
        return h;
    }
    if (collection === 'movimentacoes_estoque') {
        const h = { ...row };
        h.quantidade = h.quantidade !== undefined ? h.quantidade : (h.qtd !== undefined ? h.qtd : 0);
        return h;
    }
    if (collection === 'contas_pagar') {
        const h = { ...row };
        h.dataVencimento = h.dataVencimento || h.vencimento || '';
        h.valorPago = Number(h.valorPago || 0);
        h.baixas = Array.isArray(h.baixas) ? h.baixas : [];

        // Extrai metadados armazenados em h.descricao se existirem
        const desc = String(h.descricao || '');
        const metaMatch = desc.match(/<!--meta:([\s\S]*?)-->/);
        if (metaMatch) {
            try {
                const meta = JSON.parse(metaMatch[1]);
                if (meta.origem) h.origem = meta.origem;
                if (meta.entradaId) h.entradaId = meta.entradaId;
                if (meta.fornecedorNome) h.fornecedorNome = meta.fornecedorNome;
                if (meta.numero !== undefined) h.numero = meta.numero;
                if (meta.valorPago !== undefined) h.valorPago = Number(meta.valorPago);
                if (meta.formaPagamento) h.formaPagamento = meta.formaPagamento;
                if (meta.observacao) h.observacao = meta.observacao;
                if (Array.isArray(meta.baixas)) h.baixas = meta.baixas;
                if (meta.usuarioId) h.usuarioId = meta.usuarioId;
                if (meta.usuarioNome) h.usuarioNome = meta.usuarioNome;
            } catch (e) {
                console.warn('Erro ao decodificar metadata de conta a pagar:', e);
            }
            h.descricao = desc.replace(/\s*<!--meta:[\s\S]*?-->/g, '').trim();
        }
        return h;
    }
    return row;
}

class SupabaseDocRef {
    constructor(collection, id) {
        this.collection = collection;
        this.id = id || crypto.randomUUID();
    }
    
    async get() {
        const { data, error } = await supabaseClient.from(this.collection).select('*').eq('id', this.id).maybeSingle();
        if (error || !data) return { exists: false, data: () => null, id: this.id };
        const hydrated = _hydrateRow(this.collection, data);
        return { exists: !!data, data: () => hydrated, id: this.id };
    }
    
    async set(data, options) {
        // Supabase upsert
        const payload = _normalizeSupabasePayload(this.collection, data, this.id);
        const { error } = await supabaseClient.from(this.collection).upsert(payload);
        if (error) throw error;
    }
    
    async update(data) {
        let updateData = data;
        if (this.collection === 'mesas' && data.clienteNome !== undefined && data.itens === undefined) {
            // Se estamos atualizando o clienteNome mas não passamos itens, buscamos os itens atuais para preservar
            const existing = await this.get();
            const existingItens = existing?.exists && existing.data()?.itens ? existing.data().itens : [];
            updateData = { ...data, itens: existingItens };
        }
        if (this.collection === 'contas_pagar') {
            const existing = await this.get();
            if (existing?.exists) {
                const prev = existing.data();
                updateData = {
                    ...prev,
                    ...data
                };
            }
        }
        const payload = _normalizeSupabasePayload(this.collection, updateData);
        const { data: updatedData, error } = await supabaseClient.from(this.collection).update(payload).eq('id', this.id).select();
        if (error) throw error;
        if (!updatedData || updatedData.length === 0) {
            throw new Error(`Update on ${this.collection} for id ${this.id} affected 0 rows!`);
        }
    }
    
    async delete() {
        const { error } = await supabaseClient.from(this.collection).delete().eq('id', this.id);
        if (error) throw error;
    }

    onSnapshot(callback) {
        this.get().then(doc => callback(doc));
        const channel = supabaseClient.channel(`public:${this.collection}:${this.id}:${crypto.randomUUID()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: this.collection, filter: `id=eq.${this.id}` }, payload => {
                setTimeout(() => {
                    this.get().then(doc => callback(doc));
                }, 800);
            })
            .subscribe();
        return () => supabaseClient.removeChannel(channel);
    }
}

class SupabaseCollectionRef {
    constructor(name) {
        this.name = name;
        this._orderBy = [];
        this._where = [];
        this._limit = null;
    }

    doc(id) {
        return new SupabaseDocRef(this.name, id);
    }

    async add(data) {
        const id = crypto.randomUUID();
        const payload = _normalizeSupabasePayload(this.name, data, id);
        const { error } = await supabaseClient.from(this.name).insert(payload);
        if (error) throw error;
        return new SupabaseDocRef(this.name, id);
    }

    orderBy(field, direction = 'asc') {
        const clone = this._clone();
        clone._orderBy.push({ field, direction });
        return clone;
    }

    where(field, operator, value) {
        const clone = this._clone();
        let targetField = field;
        if (this.name === 'vendas' && targetField === 'clienteUid') {
            targetField = 'clienteId';
        }
        clone._where.push({ field: targetField, operator, value });
        return clone;
    }

    limit(n) {
        const clone = this._clone();
        clone._limit = n;
        return clone;
    }

    _clone() {
        const clone = new SupabaseCollectionRef(this.name);
        clone._orderBy = [...this._orderBy];
        clone._where = [...this._where];
        clone._limit = this._limit;
        return clone;
    }
    
    _applyModifiers(query) {
        this._where.forEach(w => {
            if (w.operator === '==') query = query.eq(w.field, w.value);
            if (w.operator === '>') query = query.gt(w.field, w.value);
            if (w.operator === '<') query = query.lt(w.field, w.value);
            if (w.operator === '>=') query = query.gte(w.field, w.value);
            if (w.operator === '<=') query = query.lte(w.field, w.value);
        });
        this._orderBy.forEach(o => {
            query = query.order(o.field, { ascending: o.direction === 'asc' });
        });
        if (this._limit) query = query.limit(this._limit);
        return query;
    }

    async get() {
        let query = supabaseClient.from(this.name).select('*');
        query = this._applyModifiers(query);
        const { data, error } = await query;
        if (error) throw error;
        
        return {
            empty: data.length === 0,
            size: data.length,
            docs: data.map(row => {
                const hydrated = _hydrateRow(this.name, row);
                return {
                    id: row.id,
                    data: () => hydrated
                };
            }),
            forEach: function(cb) { this.docs.forEach(cb); }
        };
    }

    onSnapshot(callback) {
        // Initial fetch
        this.get().then(snapshot => {
            callback(snapshot);
        });

        const channel = supabaseClient.channel(`public:${this.name}:${crypto.randomUUID()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: this.name }, payload => {
                setTimeout(() => {
                    this.get().then(snapshot => {
                        callback(snapshot);
                    });
                }, 800); // Aguarda a rplica sincronizar antes de puxar de novo
            })
            .subscribe();
            
        return () => supabaseClient.removeChannel(channel);
    }
}

function augmentUser(supabaseUser, client) {
    if (!supabaseUser) return null;
    return {
        uid: supabaseUser.id,
        email: supabaseUser.email,
        displayName: supabaseUser.user_metadata?.displayName || supabaseUser.user_metadata?.full_name || null,
        photoURL: supabaseUser.user_metadata?.photoURL || null,
        updateProfile: async (data) => {
            const updates = {};
            if (data.displayName !== undefined) updates.displayName = data.displayName;
            if (data.photoURL !== undefined) updates.photoURL = data.photoURL;
            const { error } = await client.auth.updateUser({ data: updates });
            if (error) throw error;
        }
    };
}

// Global Firebase Mock
const authMock = {
    currentUser: null,
    signInWithEmailAndPassword: async (email, password) => {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        authMock.currentUser = augmentUser(data.user, supabaseClient);
        return { user: authMock.currentUser };
    },
    signOut: async () => {
        await supabaseClient.auth.signOut();
        authMock.currentUser = null;
    },
    onAuthStateChanged: (callback) => {
        let lastUserUid = undefined;
        const notify = (user) => {
            const uid = user ? user.uid : null;
            if (uid === lastUserUid) return;
            lastUserUid = uid;
            callback(user);
        };

        supabaseClient.auth.onAuthStateChange((event, session) => {
            // Ignora TOKEN_REFRESHED e USER_UPDATED para não re-disparar o fluxo de login
            if (event === 'TOKEN_REFRESHED') {
                if (session && session.user) {
                    authMock.currentUser = augmentUser(session.user, supabaseClient);
                }
                return;
            }
            if (session && session.user) {
                authMock.currentUser = augmentUser(session.user, supabaseClient);
                notify(authMock.currentUser);
            } else {
                authMock.currentUser = null;
                notify(null);
            }
        });
        supabaseClient.auth.getSession().then(({data}) => {
            if (data.session) {
                authMock.currentUser = augmentUser(data.session.user, supabaseClient);
                notify(authMock.currentUser);
            }
            else {
                authMock.currentUser = null;
                notify(null);
            }
        });
    }
};

// Isolated Supabase Client for registering new users without overriding the current session
const tempSupabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

const tempAuthMock = {
    fetchSignInMethodsForEmail: async (email) => {
        // Supabase REST API doesn't easily expose this to the client.
        // We return empty to force the system to attempt signUp, which will gracefully fail if exists.
        return [];
    },
    createUserWithEmailAndPassword: async (email, password) => {
        const { data, error } = await tempSupabaseClient.auth.signUp({ email, password });
        if (error) {
            if (error.message === 'User already registered' || error.status === 422) {
                const fbError = new Error('The email address is already in use by another account.');
                fbError.code = 'auth/email-already-in-use';
                throw fbError;
            }
            throw error;
        }
        return { user: augmentUser(data.user, tempSupabaseClient) };
    },
    signInWithEmailAndPassword: async (email, password) => {
        const { data, error } = await tempSupabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { user: augmentUser(data.user, tempSupabaseClient) };
    },
    signOut: async () => {
        await tempSupabaseClient.auth.signOut();
    }
};

window.firebase = {
    apps: [{ name: '[DEFAULT]', delete: async () => {} }],
    initializeApp: (config, name) => {
        const app = { name: name || '[DEFAULT]', delete: async () => {} };
        window.firebase.apps.push(app);
        return app;
    },
    app: (name) => {
        const app = window.firebase.apps.find(a => a.name === (name || '[DEFAULT]'));
        if (!app) throw new Error("App not found");
        return app;
    },
    firestore: () => ({
        collection: (name) => new SupabaseCollectionRef(name),
        batch: () => {
            const ops = [];
            return {
                set: (ref, data) => { ops.push(() => ref.set(data)); },
                update: (ref, data) => { ops.push(() => ref.update(data)); },
                delete: (ref) => { ops.push(() => ref.delete()); },
                commit: async () => {
                    for (const op of ops) {
                        await op();
                    }
                }
            };
        },
        runTransaction: async (updateFunction) => {
            const promises = [];
            const tx = {
                get: async (ref) => await ref.get(),
                set: (ref, data) => { promises.push(ref.set(data)); },
                update: (ref, data) => { promises.push(ref.update(data)); },
                delete: (ref) => { promises.push(ref.delete()); }
            };
            const result = await updateFunction(tx);
            await Promise.all(promises);
            return result;
        }
    }),
    auth: (app) => {
        if (app && app.name === 'cadastroTemp') {
            return tempAuthMock;
        }
        return authMock;
    },
    storage: () => ({
        ref: (path) => ({
            put: async (file) => {
                const { error } = await supabaseClient.storage.from('storage').upload(path, file, { upsert: true });
                if (error) throw error;
            },
            getDownloadURL: async () => {
                const { data } = supabaseClient.storage.from('storage').getPublicUrl(path);
                return data.publicUrl;
            }
        })
    })
};
window.firebase.firestore.FieldValue = {
    serverTimestamp: () => new Date().toISOString(),
    increment: (n) => n
};
window.admin = window.firebase; // For compatibility if admin is used globally
