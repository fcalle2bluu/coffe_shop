const pool = require('../config/conexion');

// Rutas de la API que deben quedar públicas (sin sesión):
// - login: es como se obtiene la sesión
// - webhook de WhatsApp: lo llama Meta directamente, sin usuario logueado
const RUTAS_PUBLICAS = [
    '/api/auth/login',
    '/api/whatsapp/webhook',
];

async function verificarSesion(req, res, next) {
    if (!req.path.startsWith('/api/')) {
        return next();
    }
    if (RUTAS_PUBLICAS.includes(req.path)) {
        return next();
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Sesión requerida' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.nombre, u.rol, u.activo,
                    u.perm_stock, u.perm_compras, u.perm_proveedores,
                    u.perm_auditoria, u.perm_parametros, u.perm_informe
             FROM sesiones s
             JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.token = $1 AND s.expira_en > now()`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        const usuario = rows[0];
        if (!usuario.activo) {
            return res.status(403).json({ error: 'Usuario desactivado' });
        }

        req.usuario = usuario;

        // Actualizar último uso sin bloquear la respuesta
        pool.query('UPDATE sesiones SET ultimo_uso = now() WHERE token = $1', [token]).catch(() => {});

        next();
    } catch (err) {
        console.error('Error al verificar sesión:', err.message);
        res.status(500).json({ error: 'Error interno al verificar sesión' });
    }
}

module.exports = verificarSesion;
