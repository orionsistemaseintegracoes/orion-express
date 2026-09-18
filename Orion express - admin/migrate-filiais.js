const admin = require('firebase-admin');

const aplicar = process.argv.includes('--apply');
const filialId = 'matriz';
const colecoes = [
  'clientes', 'estoque', 'vendas', 'caixas', 'movimentacoes_caixa',
  'fornecedores', 'entradas', 'contas_pagar', 'movimentacoes_estoque',
  'logs', 'mesas', 'config'
];

// Usa Application Default Credentials. Defina GOOGLE_APPLICATION_CREDENTIALS
// para um arquivo mantido fora do projeto ou autentique-se com a Firebase CLI.
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'orion-express-pdv' });
const db = admin.firestore();

async function atualizarEmLotes(alteracoes) {
  for (let inicio = 0; inicio < alteracoes.length; inicio += 400) {
    const batch = db.batch();
    alteracoes.slice(inicio, inicio + 400).forEach(item => batch.update(item.ref, item.dados));
    await batch.commit();
  }
}

async function executar() {
  const alteracoes = [];
  for (const colecao of colecoes) {
    const snapshot = await db.collection(colecao).get();
    snapshot.docs.forEach(doc => {
      if (!doc.data().filialId) alteracoes.push({ ref: doc.ref, dados: { filialId } });
    });
  }

  const usuarios = await db.collection('usuarios').get();
  usuarios.docs.forEach(doc => {
    const dados = doc.data();
    if (dados.role !== 'admin' && (!Array.isArray(dados.filiais) || !dados.filiais.length)) {
      alteracoes.push({ ref: doc.ref, dados: { filiais: [filialId] } });
    }
  });

  console.log(`${alteracoes.length} documento(s) precisam ser vinculados à filial Matriz.`);
  if (!aplicar) {
    console.log('Simulação concluída. Execute novamente com --apply para gravar as alterações.');
    return;
  }

  await db.collection('filiais').doc(filialId).set({
    codigo: 'MATRIZ',
    nome: 'Filial Matriz',
    ativa: true,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await atualizarEmLotes(alteracoes);
  console.log('Migração multi-filial aplicada com sucesso.');
}

executar().catch(error => {
  console.error('Falha na migração:', error.message);
  process.exitCode = 1;
});
