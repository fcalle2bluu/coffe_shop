// backend/utils/bitacora.js
// Registro cronológico de acciones del sistema (quién hizo qué y cuándo), para poder
// reconstruir después casos raros (ej. un cobro que no cuadra) sin depender de
// adivinar solo por el estado final de los datos. Nunca debe romper la acción real
// que está registrando: cualquier error acá se traga y solo queda en consola.
const pool = require('../config/conexion');

// client: opcional, un cliente de pg ya dentro de una transacción (para que el
// registro quede atado a la misma transacción que la acción real, ej. al cobrar).
async function registrarBitacora({ usuario_id = null, usuario_nombre = null, accion, entidad_tipo = null, entidad_id = null, detalle = null, client = null }) {
    const ejecutor = client || pool;
    try {
        let nombre = usuario_nombre;
        if (!nombre && usuario_id) {
            const r = await ejecutor.query('SELECT nombre FROM usuarios WHERE id = $1', [usuario_id]);
            nombre = r.rows[0]?.nombre || null;
        }
        const detalleTexto = (detalle && typeof detalle === 'object') ? JSON.stringify(detalle) : detalle;
        await ejecutor.query(
            `INSERT INTO bitacora (usuario_id, usuario_nombre, accion, entidad_tipo, entidad_id, detalle)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [usuario_id, nombre, accion, entidad_tipo, entidad_id, detalleTexto]
        );
    } catch (e) {
        console.error('Error al registrar bitácora:', e.message);
    }
}

module.exports = { registrarBitacora };
