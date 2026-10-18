// CONTROL DIARIO
//
// El encargado de cocina o de barra, al cerrar, registra cuánto deja de cada
// producto y lo envía. El reporte le llega al administrador, que lo revisa y lo
// marca como comprobado.
//
// Antes esta pantalla era otra cosa: una lista suelta de insumos por fecha que
// se clonaba del día anterior (tabla control_diario_cocina, ya en desuso).
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { soloAdmin, usuarioId, esAdmin } = require('../middleware/permisos');
const { registrarBitacora } = require('../utils/bitacora');

const LISTAS = ['COCINA', 'BARRA'];

// Unidades sugeridas para barra. Son solo atajos: el usuario puede escribir la
// suya y se guarda tal cual en el detalle del reporte.
const UNIDADES_BARRA = ['Unidad', 'Litro', 'Botella', 'Kilo', 'Porción'];
const UNIDADES_COCINA = ['Unidad'];

function normalizarLista(valor) {
    const l = (valor || '').toString().trim().toUpperCase();
    return LISTAS.includes(l) ? l : null;
}

// ---------------------------------------------------------------- PLANTILLAS

// Los productos de una lista, en orden, con las unidades que ofrece.
router.get('/plantilla', async (req, res) => {
    const lista = normalizarLista(req.query.lista);
    if (!lista) return res.status(400).json({ error: 'Lista inválida. Usá COCINA o BARRA.' });
    try {
        const r = await pool.query(
            `SELECT id, nombre, unidad_sugerida FROM control_diario_plantilla
             WHERE lista = $1 AND activo ORDER BY orden, nombre`,
            [lista]
        );
        res.json({
            lista,
            unidades: lista === 'BARRA' ? UNIDADES_BARRA : UNIDADES_COCINA,
            items: r.rows,
        });
    } catch (e) {
        console.error('Error al cargar la plantilla del control diario:', e.message);
        res.status(500).json({ error: 'No se pudo cargar la lista.' });
    }
});

// Agregar un producto nuevo a una lista, para que quede para la próxima vez.
router.post('/plantilla', async (req, res) => {
    const lista = normalizarLista(req.body.lista);
    const nombre = (req.body.nombre || '').toString().trim();
    const unidad = (req.body.unidad_sugerida || 'Unidad').toString().trim() || 'Unidad';
    if (!lista) return res.status(400).json({ error: 'Lista inválida. Usá COCINA o BARRA.' });
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre del producto.' });
    try {
        // Si ya existía pero estaba desactivado, se reactiva en vez de duplicar.
        // La lista va como $1 y $4 a propósito, con el mismo valor: usando $1 en
        // los dos lugares Postgres lo deduce de dos formas distintas (el tipo de
        // la columna y el de la comparación) y rechaza la consulta con
        // "inconsistent types deduced for parameter $1".
        const r = await pool.query(
            `INSERT INTO control_diario_plantilla (lista, orden, nombre, unidad_sugerida)
             VALUES ($1, (SELECT COALESCE(MAX(orden), 0) + 1 FROM control_diario_plantilla WHERE lista = $4), $2, $3)
             ON CONFLICT (lista, nombre) DO UPDATE SET activo = true, unidad_sugerida = EXCLUDED.unidad_sugerida
             RETURNING id, nombre, unidad_sugerida`,
            [lista, nombre, unidad, lista]
        );
        res.status(201).json(r.rows[0]);
    } catch (e) {
        console.error('Error al agregar producto a la plantilla:', e.message);
        res.status(500).json({ error: 'No se pudo agregar el producto.' });
    }
});

// Sacar un producto de la lista. No se borra: se desactiva, así los reportes
// viejos que lo nombran siguen leyéndose igual.
router.delete('/plantilla/:id', soloAdmin, async (req, res) => {
    try {
        const r = await pool.query(
            'UPDATE control_diario_plantilla SET activo = false WHERE id = $1 RETURNING nombre',
            [req.params.id]
        );
        if (r.rowCount === 0) return res.status(404).json({ error: 'Ese producto no existe.' });
        res.json({ mensaje: `"${r.rows[0].nombre}" ya no aparece en la lista.` });
    } catch (e) {
        console.error('Error al quitar producto de la plantilla:', e.message);
        res.status(500).json({ error: 'No se pudo quitar el producto.' });
    }
});

// ------------------------------------------------------------------ REPORTES

// Enviar el conteo. Lo puede hacer cualquier usuario con sesión.
router.post('/reportes', async (req, res) => {
    const lista = normalizarLista(req.body.lista);
    const nota = (req.body.nota || '').toString().trim() || null;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!lista) return res.status(400).json({ error: 'Lista inválida. Usá COCINA o BARRA.' });

    // Solo viaja lo que tenga cantidad: no tiene sentido mandar renglones vacíos.
    const limpios = items
        .map((it, i) => ({
            orden: i,
            nombre: (it.nombre || '').toString().trim(),
            cantidad: Number.parseFloat(it.cantidad),
            unidad: (it.unidad || 'Unidad').toString().trim() || 'Unidad',
        }))
        .filter((it) => it.nombre && Number.isFinite(it.cantidad) && it.cantidad > 0);

    if (limpios.length === 0) {
        return res.status(400).json({ error: 'Poné la cantidad de al menos un producto antes de enviar.' });
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const rep = await cliente.query(
            `INSERT INTO control_diario_reportes (lista, usuario_id, usuario_nombre, nota)
             VALUES ($1, $2, (SELECT nombre FROM usuarios WHERE id = $2), $3)
             RETURNING id, fecha, enviado_en`,
            [lista, usuarioId(req), nota]
        );
        const reporteId = rep.rows[0].id;
        for (const it of limpios) {
            await cliente.query(
                `INSERT INTO control_diario_detalle (reporte_id, orden, nombre, cantidad, unidad)
                 VALUES ($1, $2, $3, $4, $5)`,
                [reporteId, it.orden, it.nombre, it.cantidad, it.unidad]
            );
        }
        await cliente.query('COMMIT');

        registrarBitacora({
            usuario_id: usuarioId(req),
            accion: 'CONTROL_DIARIO_ENVIADO',
            entidad_tipo: 'control_diario',
            entidad_id: reporteId,
            detalle: { lista, productos: limpios.length },
        });

        res.status(201).json({
            id: reporteId,
            lista,
            productos: limpios.length,
            mensaje: 'Enviado. El administrador lo va a revisar.',
        });
    } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.error('Error al guardar el control diario:', e.message);
        res.status(500).json({ error: 'No se pudo enviar el control.' });
    } finally {
        cliente.release();
    }
});

// Lo que mandó el propio usuario, para que vea sus envíos del día aunque no sea
// admin (y no vuelva a cargar lo mismo dos veces).
router.get('/reportes/mios', async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT id, lista, fecha, estado, enviado_en,
                    (SELECT COUNT(*)::int FROM control_diario_detalle d WHERE d.reporte_id = r.id) AS productos
             FROM control_diario_reportes r
             WHERE usuario_id = $1
             ORDER BY id DESC LIMIT 20`,
            [usuarioId(req)]
        );
        res.json(r.rows);
    } catch (e) {
        console.error('Error al listar los envíos propios:', e.message);
        res.status(500).json({ error: 'No se pudieron cargar tus envíos.' });
    }
});

// Bandeja del administrador.
router.get('/reportes', soloAdmin, async (req, res) => {
    const { estado, lista, fecha } = req.query;
    const cond = [];
    const params = [];
    if (estado) { params.push(estado.toString().toUpperCase()); cond.push(`r.estado = $${params.length}`); }
    if (lista) { params.push(lista.toString().toUpperCase()); cond.push(`r.lista = $${params.length}`); }
    if (fecha) { params.push(fecha); cond.push(`r.fecha = $${params.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    try {
        const r = await pool.query(
            `SELECT r.id, r.lista, r.fecha, r.usuario_nombre, r.nota, r.estado,
                    r.enviado_en, r.comprobado_nombre, r.comprobado_en,
                    (SELECT COUNT(*)::int FROM control_diario_detalle d WHERE d.reporte_id = r.id) AS productos
             FROM control_diario_reportes r
             ${where}
             ORDER BY r.id DESC LIMIT 100`,
            params
        );
        res.json(r.rows);
    } catch (e) {
        console.error('Error al listar los controles diarios:', e.message);
        res.status(500).json({ error: 'No se pudieron cargar los controles.' });
    }
});

// Cuántos hay sin comprobar, para el globito del menú.
router.get('/reportes/pendientes', soloAdmin, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT COUNT(*)::int AS pendientes FROM control_diario_reportes WHERE estado = 'ENVIADO'`
        );
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'No se pudo contar los pendientes.' });
    }
});

// El detalle de un reporte. El admin ve cualquiera; el resto, solo los suyos.
router.get('/reportes/:id', async (req, res) => {
    try {
        const rep = await pool.query(
            `SELECT id, lista, fecha, usuario_id, usuario_nombre, nota, estado,
                    enviado_en, comprobado_nombre, comprobado_en
             FROM control_diario_reportes WHERE id = $1`,
            [req.params.id]
        );
        if (rep.rows.length === 0) return res.status(404).json({ error: 'Ese control no existe.' });
        if (!esAdmin(req) && rep.rows[0].usuario_id !== usuarioId(req)) {
            return res.status(403).json({ error: 'Solo podés ver los controles que enviaste vos.' });
        }
        const det = await pool.query(
            'SELECT nombre, cantidad, unidad FROM control_diario_detalle WHERE reporte_id = $1 ORDER BY orden, id',
            [req.params.id]
        );
        res.json({ ...rep.rows[0], items: det.rows });
    } catch (e) {
        console.error('Error al abrir el control diario:', e.message);
        res.status(500).json({ error: 'No se pudo abrir el control.' });
    }
});

// El admin lo da por revisado.
router.put('/reportes/:id/comprobar', soloAdmin, async (req, res) => {
    try {
        const r = await pool.query(
            `UPDATE control_diario_reportes
             SET estado = 'COMPROBADO',
                 comprobado_por = $2,
                 comprobado_nombre = (SELECT nombre FROM usuarios WHERE id = $2),
                 comprobado_en = NOW()
             WHERE id = $1 AND estado <> 'COMPROBADO'
             RETURNING id, lista, fecha, comprobado_nombre, comprobado_en`,
            [req.params.id, usuarioId(req)]
        );
        if (r.rowCount === 0) {
            return res.status(409).json({ error: 'Ese control no existe o ya estaba comprobado.' });
        }
        registrarBitacora({
            usuario_id: usuarioId(req),
            accion: 'CONTROL_DIARIO_COMPROBADO',
            entidad_tipo: 'control_diario',
            entidad_id: r.rows[0].id,
            detalle: { lista: r.rows[0].lista, fecha: r.rows[0].fecha },
        });
        res.json(r.rows[0]);
    } catch (e) {
        console.error('Error al comprobar el control diario:', e.message);
        res.status(500).json({ error: 'No se pudo marcar como comprobado.' });
    }
});

module.exports = router;
