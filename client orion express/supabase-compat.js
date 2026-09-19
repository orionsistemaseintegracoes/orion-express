// supabase-compat.js
// Firebase to Supabase Compatibility Layer (Cliente)

const supabaseUrl = 'https://iphqiqtobvtakgxiakrf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwaHFpcXRvYnZ0YWtneGlha3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTI4MDksImV4cCI6MjEwMzc4ODgwOX0.TVfIU-Mr83v0sOyIk7duXVmzVS8ndxvpCEh0LQsiTDA';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

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

        // Se houver endereço/telefone/contato, garante que estejam preservados no itens (jsonb) para compatibilidade caso a coluna não exista
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

        // Remover colunas que não existem na tabela vendas do Supabase
        delete copy.clienteUid;
        delete copy.clienteEndereco;
        delete copy.clienteTel;
        delete copy.submittedAt;

        return copy;
    }

    if (collection === 'mesas') {
        const copy = { ...payload };
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

    return payload;
}

function _hydrateRow(collection, row) {
    if (!row) return row;
    if (collection === 'vendas') {
        const h = { ...row };
        // Garante compatibilidade com o front legado
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
            h.itens = h.itens.filter(i => !i || !i._metaMesa);
        }
        h.clienteNome = clienteNome;
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
        const payload = _normalizeSupabasePayload(this.collection, data, this.id);
        const { error } = await supabaseClient.from(this.collection).upsert(payload);
        if (error) throw error;
    }
    
    async update(data) {
        let updateData = data;
        if (this.collection === 'mesas' && data.clienteNome !== undefined && data.itens === undefined) {
            const existing = await this.get();
            const existingItens = existing?.exists && existing.data()?.itens ? existing.data().itens : [];
            updateData = { ...data, itens: existingItens };
        }
        const payload = _normalizeSupabasePayload(this.collection, updateData);
        const { error } = await supabaseClient.from(this.collection).update(payload).eq('id', this.id);
        if (error) throw error;
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
        this.get().then(snapshot => callback(snapshot));
        const channel = supabaseClient.channel(`public:${this.name}:${crypto.randomUUID()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: this.name }, payload => {
                setTimeout(() => {
                    this.get().then(snapshot => callback(snapshot));
                }, 800);
            })
            .subscribe();
        return () => supabaseClient.removeChannel(channel);
    }
}

const authMock = {
    currentUser: null,
    signInWithEmailAndPassword: async (email, password) => {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { user: data.user };
    },
    createUserWithEmailAndPassword: async (email, password) => {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) {
            if (error.message === 'User already registered' || error.status === 422) {
                const fbError = new Error('The email address is already in use by another account.');
                fbError.code = 'auth/email-already-in-use';
                throw fbError;
            }
            if (error.message && (error.message.toLowerCase().includes('password') || error.status === 400)) {
                const fbError = new Error(error.message);
                fbError.code = 'auth/weak-password';
                throw fbError;
            }
            throw error;
        }
        if (data && data.user) {
            authMock.currentUser = { uid: data.user.id, email: data.user.email };
        }
        return { user: authMock.currentUser };
    },
    signOut: async () => {
        await supabaseClient.auth.signOut();
        authMock.currentUser = null;
    },
    onAuthStateChanged: (callback) => {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                authMock.currentUser = { uid: session.user.id, email: session.user.email };
                callback(authMock.currentUser);
            } else {
                authMock.currentUser = null;
                callback(null);
            }
        });
        supabaseClient.auth.getSession().then(({data}) => {
            if (data.session) {
                authMock.currentUser = { uid: data.session.user.id, email: data.session.user.email };
                callback(authMock.currentUser);
            }
            else {
                authMock.currentUser = null;
                callback(null);
            }
        });
    }
};

window.firebase = {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: () => {},
    firestore: () => ({
        collection: (name) => new SupabaseCollectionRef(name),
        batch: () => {
            const operations = [];
            return {
                set: (ref, data) => { operations.push(() => ref.set(data)); },
                update: (ref, data) => { operations.push(() => ref.update(data)); },
                delete: (ref) => { operations.push(() => ref.delete()); },
                commit: async () => {
                    for (const op of operations) {
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
    auth: () => authMock,
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
    serverTimestamp: () => new Date().toISOString()
};
