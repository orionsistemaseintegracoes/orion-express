/**
 * Script de seed — popula o Firestore do projeto "orion-express-pdv" com os
 * documentos iniciais necessários para o funcionamento do sistema.
 *
 * USO:
 *   1. Baixe a serviceAccountKey do Firebase Console (orion-express-pdv)
 *   2. Salve como serviceAccountKey.json nesta pasta
 *   3. Execute: node seed-firestore.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seed() {
  console.log('Iniciando seed do Firestore...\n');

  // ============================================================
  // CONFIG — documentos de configuração do sistema
  // ============================================================

  // Pagamentos (métodos padrão)
  await db.doc('config/pagamentos').set({
    metodos: ['PIX', 'Cartao', 'Dinheiro', 'Outros'],
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✓ config/pagamentos');

  // Classificações de produto (estrutura vazia)
  await db.doc('config/classificacoes').set({
    marcas: [],
    grupos: [],
    subgrupos: [],
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✓ config/classificacoes');

  // Personalização (tema padrão)
  await db.doc('config/personalizacao').set({
    logoUrl: '',
    corPrincipal: '#1677ff',
    corBotoes: '#0d6efd',
    corFundo: '#020715',
    corTexto: '#f4f7fd',
    aplicarLogin: false,
    preset: '',
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✓ config/personalizacao');

  // Contadores sequenciais (início em 0 — primeiro registro será #001)
  await db.doc('config/contador').set({ numero: 0 }, { merge: true });
  console.log('✓ config/contador (pedidos)');

  await db.doc('config/contador_entrada').set({ numero: 0 }, { merge: true });
  console.log('✓ config/contador_entrada');

  await db.doc('config/contador_conta_pagar').set({ numero: 0 }, { merge: true });
  console.log('✓ config/contador_conta_pagar');

  // Config da loja (estrutura vazia — preenchida pelo painel)
  await db.doc('config/loja').set({
    nome: '',
    unidade: '',
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✓ config/loja');

  // Banner (estrutura vazia)
  await db.doc('config/banner').set({
    url: '',
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('✓ config/banner');

  // ============================================================
  // Verificação final
  // ============================================================
  console.log('\n--- Verificando coleções ---');
  const collections = [
    'estoque', 'clientes', 'vendas', 'config', 'usuarios',
    'caixas', 'movimentacoes_caixa', 'logs', 'fornecedores',
    'entradas', 'movimentacoes_estoque', 'contas_pagar'
  ];

  for (const col of collections) {
    const snap = await db.collection(col).limit(1).get();
    const status = snap.empty ? 'VAZIA (ok — será populada pelo uso)' : `${snap.size} doc(s) encontrado(s)`;
    console.log(`  ${col}: ${status}`);
  }

  console.log('\nSeed concluído com sucesso!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Erro durante o seed:', err);
  process.exit(1);
});
