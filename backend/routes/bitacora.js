// backend/routes/bitacora.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Solo administradores pueden ver la bitácora (registro de auditoría de todo el sistema).
const checkAdminPermission = async (req, res, next) => {
    const usuario_id = req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id;
    if (!usuario_id) {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere ID de usuario.' });
    }
    try {
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado: Usuario no encontrado.' });
        }
        const rol = userRes.rows[0].rol.toUpperCase();
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR') {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos de administrador.' });
        }
        next();
    } catch (err) {
        console.error('Error al validar permisos de admin en bitácora:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

router.use(checkAdminPermission);

// 1. Listado paginado con filtros (usuario, tipo de acción, entidad, rango de fechas, búsqueda libre)
router.get('/', async (req, res) => {
    const {
        page = 1, limit = 50,
        usuario_id, accion, entidad_tipo,
        fecha_inicio, fecha_fin, busqueda
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    const condiciones = [];
    const valores = [];
    let i = 1;

    if (usuario_id) { condiciones.push(`usuario_id = $${i++}`); valores.push(usuario_id); }
    if (accion) { condiciones.push(`accion = $${i++}`); valores.push(accion); }
    if (entidad_tipo) { condiciones.push(`entidad_tipo = $${i++}`); valores.push(entidad_tipo); }
    if (fecha_inicio) { condiciones.push(`fecha AT TIME ZONE 'America/La_Paz' >= $${i++}::date`); valores.push(fecha_inicio); }
    if (fecha_fin) { condiciones.push(`fecha AT TIME ZONE 'America/La_Paz' < ($${i++}::date + INTERVAL '1 day')`); valores.push(fecha_fin); }
    if (busqueda) {
        condiciones.push(`(usuario_nombre ILIKE $${i} OR accion ILIKE $${i} OR detalle ILIKE $${i} OR entidad_tipo ILIKE $${i})`);
        valores.push(`%${busqueda}%`);
        i++;
    }

    const whereSql = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    try {
        const totalRes = await pool.query(`SELECT COUNT(*) FROM bitacora ${whereSql}`, valores);
        const total = parseInt(totalRes.rows[0].count);

        const dataRes = await pool.query(`
            SELECT id, usuario_id, usuario_nombre, accion, entidad_tipo, entidad_id, detalle,
                   TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI:SS') as fecha,
                   TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_dia
            FROM bitacora
            ${whereSql}
            ORDER BY fecha DESC, id DESC
            LIMIT $${i} OFFSET $${i + 1}
        `, [...valores, limitNum, offset]);

        res.json({
            data: dataRes.rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum))
        });
    } catch (error) {
        console.error('Error al listar bitácora:', error);
        res.status(500).json({ error: 'Error al obtener la bitácora' });
    }
});

// 2. Catálogo de valores distintos de "accion" y "entidad_tipo" ya registrados (para poblar filtros)
router.get('/catalogo', async (req, res) => {
    try {
        const [acciones, entidades, usuarios] = await Promise.all([
            pool.query('SELECT DISTINCT accion FROM bitacora ORDER BY accion ASC'),
            pool.query('SELECT DISTINCT entidad_tipo FROM bitacora WHERE entidad_tipo IS NOT NULL ORDER BY entidad_tipo ASC'),
            pool.query(`
                SELECT DISTINCT b.usuario_id, COALESCE(u.nombre, b.usuario_nombre) as nombre
                FROM bitacora b
                LEFT JOIN usuarios u ON u.id = b.usuario_id
                WHERE b.usuario_id IS NOT NULL
                ORDER BY nombre ASC
            `)
        ]);
        res.json({
            acciones: acciones.rows.map(r => r.accion),
            entidades: entidades.rows.map(r => r.entidad_tipo),
            usuarios: usuarios.rows
        });
    } catch (error) {
        console.error('Error al cargar catálogo de bitácora:', error);
        res.status(500).json({ error: 'Error al obtener el catálogo' });
    }
});

// 3. Resumen de actividad (para las tarjetas de KPI arriba de la tabla)
router.get('/resumen', async (req, res) => {
    try {
        const hoyRes = await pool.query(`
            SELECT COUNT(*) as total
            FROM bitacora
            WHERE (fecha AT TIME ZONE 'America/La_Paz')::date = (NOW() AT TIME ZONE 'America/La_Paz')::date
        `);
        const porAccionRes = await pool.query(`
            SELECT accion, COUNT(*) as total
            FROM bitacora
            WHERE (fecha AT TIME ZONE 'America/La_Paz')::date = (NOW() AT TIME ZONE 'America/La_Paz')::date
            GROUP BY accion
            ORDER BY total DESC
        `);
        const usuarioActivoRes = await pool.query(`
            SELECT COALESCE(usuario_nombre, 'Desconocido') as usuario_nombre, COUNT(*) as total
            FROM bitacora
            WHERE fecha >= NOW() - INTERVAL '7 days'
            GROUP BY usuario_nombre
            ORDER BY total DESC
            LIMIT 5
        `);
        res.json({
            totalHoy: parseInt(hoyRes.rows[0].total),
            porAccionHoy: porAccionRes.rows,
            usuariosMasActivos7d: usuarioActivoRes.rows
        });
    } catch (error) {
        console.error('Error al cargar resumen de bitácora:', error);
        res.status(500).json({ error: 'Error al obtener el resumen' });
    }
});

module.exports = router;
