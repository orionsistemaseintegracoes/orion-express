const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
async function check() {
  const snap = await db.collection('vendas').orderBy('numeroPedido', 'asc').get();
  snap.docs.forEach(doc => {
    console.log(doc.id, doc.data().numeroPedido, doc.data().dataIso);
  });
  const contador = await db.collection('config').doc('contador').get();
  console.log('Contador atual:', contador.data());
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
