// FACTURAS POR EMITIR
//
// Cuando el cajero cobra con factura, acá queda anotado a nombre de quién hay
// que emitirla. La factura NO se emite en este sistema: el administrador la
// emite en el otro, vuelve a la pantalla de Caja y tilda la que ya emitió.
//
// La lista muestra las del día. Las que quedaron sin tildar se arrastran al día
// siguiente, así ninguna se pierde por cambiar de fecha.
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { soloAdmin, usuarioId } = require('../middleware/permisos');
const { registrarBitacora } = require('../utils/bitacora');

// El día de Bolivia, no el del servidor (que corre en UTC).
const HOY_BOLIVIA = `(CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date`;

// Las facturas de hoy, más las de días anteriores que siguen sin emitir.
router.get('/', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT f.id, f.venta_id, f.comanda_id, f.mesa, f.razon_social, f.nit, f.telefono,
                   f.monto, f.metodo_pago, f.estado, f.fecha,
                   f.emitida_nombre, f.emitida_en,
                   TO_CHAR(f.creada_en AT TIME ZONE 'America/La_Paz', 'DD/MM HH24:MI') AS hora,
                   TO_CHAR(f.emitida_en AT TIME ZONE 'America/La_Paz', 'DD/MM HH24:MI') AS hora_emitida,
                   f.fecha < ${HOY_BOLIVIA} AS atrasada,
                   u.nombre AS cobrada_por
            FROM ventas_factura f
            LEFT JOIN ventas v ON v.id = f.venta_id
            LEFT JOIN usuarios u ON u.id = v.usuario_id
            WHERE f.fecha = ${HOY_BOLIVIA} OR f.estado <> 'EMITIDA'
            ORDER BY (f.estado = 'EMITIDA'), f.fecha DESC, f.id DESC`);

        const filas = r.rows.map((f) => ({ ...f, monto: Number(f.monto) }));
        // El día lo pone Postgres en hora de Bolivia: el servidor corre en UTC y
        // después de las 20:00 ya estaría mostrando el día siguiente.
        const dia = await pool.query(
            `SELECT TO_CHAR(${HOY_BOLIVIA}, 'DD/MM/YYYY') AS fecha`
        );
        res.json({
            fecha: dia.rows[0].fecha,
            pendientes: filas.filter((f) => f.estado !== 'EMITIDA').length,
            emitidas: filas.filter((f) => f.estado === 'EMITIDA').length,
            total_pendiente: filas.filter((f) => f.estado !== 'EMITIDA').reduce((a, f) => a + f.monto, 0),
            items: filas,
        });
    } catch (e) {
        console.error('Error al listar las facturas por emitir:', e.message);
        res.status(500).json({ error: 'No se pudieron cargar las facturas.' });
    }
});

// Cuántas faltan emitir, para el globito de la pestaña.
router.get('/pendientes', async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT COUNT(*)::int AS pendientes FROM ventas_factura WHERE estado <> 'EMITIDA'`
        );
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'No se pudo contar.' });
    }
});

// Tildar (o destildar) una factura. Tildada queda en la lista, marcada como
// emitida: la idea es poder ver de un vistazo cuáles ya se hicieron.
router.put('/:id/emitida', soloAdmin, async (req, res) => {
    const emitida = req.body.emitida !== false;
    try {
        // Cada rama lleva sus propios parámetros: la de destildar no usa el
        // usuario, y mandarle uno de más hace fallar la consulta entera.
        const sql = emitida
            ? `UPDATE ventas_factura
               SET estado = 'EMITIDA', emitida_por = $2,
                   emitida_nombre = (SELECT nombre FROM usuarios WHERE id = $2),
                   emitida_en = NOW()
               WHERE id = $1
               RETURNING id, razon_social, nit, monto, estado`
            : `UPDATE ventas_factura
               SET estado = 'PENDIENTE', emitida_por = NULL,
                   emitida_nombre = NULL, emitida_en = NULL
               WHERE id = $1
               RETURNING id, razon_social, nit, monto, estado`;
        const params = emitida ? [req.params.id, usuarioId(req)] : [req.params.id];
        const r = await pool.query(sql, params);
        if (r.rowCount === 0) return res.status(404).json({ error: 'Esa factura no existe.' });

        registrarBitacora({
            usuario_id: usuarioId(req),
            accion: emitida ? 'FACTURA_MARCADA_EMITIDA' : 'FACTURA_DESMARCADA',
            entidad_tipo: 'ventas_factura',
            entidad_id: r.rows[0].id,
            detalle: { razon_social: r.rows[0].razon_social, nit: r.rows[0].nit, monto: r.rows[0].monto },
        });

        res.json(r.rows[0]);
    } catch (e) {
        console.error('Error al marcar la factura:', e.message);
        res.status(500).json({ error: 'No se pudo marcar la factura.' });
    }
});

module.exports = router;
