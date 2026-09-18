/* ============================================================
 * ORION EXPRESS — Cloud Function para alteração de senhas
 * ------------------------------------------------------------
 * Regra de negócio centralizada no SERVIDOR (Admin SDK):
 *   - QUALQUER operador autenticado pode alterar a PRÓPRIA senha.
 *   - Somente o ADMINISTRADOR pode alterar a senha de OUTRO perfil.
 * Isso não pode ser feito no SDK web (cliente) por segurança.
 *
 * Deploy (após habilitar Cloud Functions API + plano Blaze):
 *   cd orion-express-admin
 *   npm i -g firebase-tools
 *   firebase login
 *   firebase init functions   (responde: arquivo index.js já existe)
 *   cd functions && npm i
 *   firebase deploy --only functions
 * ============================================================ */
const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

exports.resetOperadorPassword = functions.https.onCall(async (data, context) => {
  // 1) Deve estar autenticado
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Faça login para continuar.');
  }
  const callerUid = context.auth.uid;
  const targetUid = data && data.uid;
  const novaSenha = data && data.novaSenha;

  // 2) Validação de entrada
  if (typeof targetUid !== 'string' || !targetUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Informe o perfil de destino.');
  }
  if (typeof novaSenha !== 'string' || novaSenha.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'A nova senha deve ter no mínimo 6 caracteres.');
  }

  // 3) Quem está chamando? Precisa ser um operador do painel.
  const callerSnap = await admin.firestore().collection('usuarios').doc(callerUid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller) {
    throw new functions.https.HttpsError('permission-denied', 'Conta sem perfil de operador.');
  }
  const callerRole = (caller.role === 'admin' || caller.role === 'funcionario') ? caller.role : 'funcionario';

  // 4) Autorização:
  //    - target == caller  → permitido (qualquer operador troca a própria senha)
  //    - target != caller  → SOMENTE admin
  if (targetUid !== callerUid && callerRole !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Somente o administrador pode alterar a senha de outro perfil.'
    );
  }

  // 5) O alvo deve ser um perfil de operador (existe em "usuarios")
  const targetSnap = await admin.firestore().collection('usuarios').doc(targetUid).get();
  if (!targetSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Perfil de destino não encontrado.');
  }

  // 6) Aplica a nova senha no Firebase Auth
  await admin.auth().updateUser(targetUid, { password: novaSenha });

  // 7) Registra a data da alteração (auditoria simples) no perfil
  await targetSnap.ref.update({
    senhaAlteradaEm: admin.firestore.FieldValue.serverTimestamp()
  });

  return { ok: true };
});