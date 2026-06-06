const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let fcmEnabled = false;

try {
    const keyPath = path.join(__dirname, 'firebase-key.json');
    if (fs.existsSync(keyPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(keyPath)
        });
        fcmEnabled = true;
        console.log('✅ Firebase Admin SDK inicializado exitosamente.');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        fcmEnabled = true;
        console.log('✅ Firebase Admin SDK inicializado usando variable de entorno.');
    } else {
        console.warn('⚠️ ADVERTENCIA: No se encontró firebase-key.json ni la variable FIREBASE_SERVICE_ACCOUNT. Las notificaciones push estarán desactivadas.');
    }
} catch (e) {
    console.error('❌ Error al inicializar Firebase Admin SDK:', e.message);
}

/**
 * Envía una notificación push a todos los dispositivos registrados de un usuario específico.
 */
async function enviarNotificacionPush(pool, usuarioId, titulo, cuerpo) {
    if (!fcmEnabled) return;
    try {
        const query = 'SELECT token FROM dispositivo_tokens WHERE usuario_id = $1';
        const { rows } = await pool.query(query, [usuarioId]);
        if (rows.length === 0) return;

        const tokens = rows.map(r => r.token);

        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            notification: {
                title: titulo,
                body: cuerpo,
            }
        });
        
        console.log(`Push enviado a usuario ${usuarioId}: éxitos ${response.successCount}, fallos ${response.failureCount}`);
        
        // Limpiar automáticamente tokens obsoletos reportados por Firebase
        if (response.failureCount > 0) {
            response.responses.forEach(async (resp, idx) => {
                if (!resp.success && resp.error) {
                    const code = resp.error.code;
                    if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
                        const badToken = tokens[idx];
                        await pool.query('DELETE FROM dispositivo_tokens WHERE token = $1', [badToken]);
                        console.log('Token FCM obsoleto removido automáticamente de la base de datos.');
                    }
                }
            });
        }
    } catch (e) {
        console.error('Error al enviar notificación push:', e.message);
    }
}

/**
 * Envía una notificación push a todos los administradores activos del sistema.
 */
async function enviarNotificacionPushAAdministradores(pool, titulo, cuerpo) {
    if (!fcmEnabled) return;
    try {
        const query = `
            SELECT dt.token 
            FROM dispositivo_tokens dt
            JOIN usuarios u ON dt.usuario_id = u.id
            WHERE u.rol IN ('ADMIN', 'ADMINISTRADOR') AND u.activo = true
        `;
        const { rows } = await pool.query(query);
        if (rows.length === 0) return;

        const tokens = rows.map(r => r.token);

        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            notification: {
                title: titulo,
                body: cuerpo,
            }
        });
        console.log(`Push enviado a administradores: éxitos ${response.successCount}, fallos ${response.failureCount}`);
    } catch (e) {
        console.error('Error al enviar notificación push a administradores:', e.message);
    }
}

module.exports = {
    enviarNotificacionPush,
    enviarNotificacionPushAAdministradores
};
