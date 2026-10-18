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

// ------------------------------------------------------- VENDIDO HOY (admin)
//
// Panel de referencia al pie de la pantalla. Muestra cuánto se vendió hoy de
// los productos que están vinculados a la lista de conteo, separado en cocina
// y barra. Es SOLO para mirar: no descuenta stock ni toca el inventario.
//
// De dónde sale cada vínculo:
//
// - COCINA: el vínculo ya existe en la base, en las recetas. El insumo que se
//   llama igual que el renglón de la lista (ej. "Lomito") está cargado como
//   ingrediente de los productos que lo usan, con su cantidad por unidad. Por
//   eso acá no hay nada escrito a mano: si mañana se corrige una receta desde
//   la pantalla de Recetas, este panel la sigue solo. El renglón que no esté
//   en ninguna receta simplemente no aparece.
//
// - BARRA: las botellas no tienen receta, se venden tal cual. Ese vínculo no
//   está en ninguna parte de la base, así que va acá, por id de producto. El
//   nombre se resuelve en la consulta: renombrar el producto no rompe nada y
//   borrarlo solo lo saca del panel.
//
// Quedan afuera a propósito:
// - Las frutas: no son un producto, se venden dentro de "Jugo a Elección" y la
//   fruta va escrita a mano en la nota del mesero.
// - Leche entera y deslactosada: alimentan decenas de bebidas sin receta
//   cargada. Vincularlas a los productos "Leche" y "Leche Deslactosada"
//   contaría solo los extras cobrados aparte, que es un número engañoso.
// - Yogurt, crema pastelera, esencias, colorante y cocoa: no se venden por
//   separado ni tienen receta. Para esos, el conteo diario es el único control.
const VINCULOS_BARRA = {
    'Coca Cola 500ml': [44],
    'Fanta 500ml': [197],
    'Cerveza Huari': [194],
    'Agua sin gas 500ml': [71],
    'Agua con gas 500ml': [156],
    'Coca Cola 2 litros': [76],
    'Submarino': [87],
    'Personales de vidrio': [267],
};

// Lo vendido hoy, en hora de Bolivia (la base guarda en UTC).
const VENDIDO_HOY = `
    SELECT dv.producto_id, SUM(dv.cantidad)::numeric AS vendidos
    FROM detalle_ventas dv
    JOIN ventas v ON v.id = dv.venta_id
    WHERE DATE(v.fecha_venta AT TIME ZONE 'America/La_Paz')
          = (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date
    GROUP BY dv.producto_id`;

router.get('/vendido-hoy', soloAdmin, async (req, res) => {
    try {
        const cocina = await pool.query(`
            WITH hoy AS (${VENDIDO_HOY}),
            -- Un renglón por (producto de la lista, producto vendido). El MAX es
            -- por si un producto tuviera cargada más de una receta: sin él, el
            -- mismo insumo se contaría dos veces.
            por_producto AS (
                SELECT pl.id AS plantilla_id, pl.nombre, pl.orden,
                       p.nombre AS producto, h.vendidos,
                       MAX(ir.cantidad) AS por_unidad,
                       MAX(ir.unidad_medida) AS unidad
                FROM control_diario_plantilla pl
                JOIN insumos i ON LOWER(TRIM(i.nombre)) = LOWER(TRIM(pl.nombre)) AND i.activo
                JOIN ingrediente_recetas ir ON ir.insumo_id = i.id
                JOIN recetas r ON r.id = ir.receta_id
                JOIN productos p ON p.id = r.producto_id
                JOIN hoy h ON h.producto_id = p.id
                WHERE pl.lista = 'COCINA' AND pl.activo
                GROUP BY pl.id, pl.nombre, pl.orden, p.id, p.nombre, h.vendidos
            )
            SELECT nombre,
                   MAX(unidad) AS unidad,
                   SUM(por_unidad * vendidos)::numeric AS cantidad,
                   json_agg(json_build_object(
                       'producto', producto,
                       'vendidos', vendidos,
                       'por_unidad', por_unidad
                   ) ORDER BY vendidos DESC, producto) AS origen
            FROM por_producto
            GROUP BY plantilla_id, nombre, orden
            ORDER BY SUM(por_unidad * vendidos) DESC, nombre`);

        const nombres = [];
        const ids = [];
        for (const [nombre, productos] of Object.entries(VINCULOS_BARRA)) {
            for (const id of productos) { nombres.push(nombre); ids.push(id); }
        }
        const barra = await pool.query(`
            WITH hoy AS (${VENDIDO_HOY})
            SELECT pl.nombre,
                   pl.unidad_sugerida AS unidad,
                   SUM(h.vendidos)::numeric AS cantidad,
                   json_agg(json_build_object(
                       'producto', p.nombre,
                       'vendidos', h.vendidos,
                       'por_unidad', 1
                   ) ORDER BY h.vendidos DESC, p.nombre) AS origen
            FROM control_diario_plantilla pl
            JOIN unnest($1::text[], $2::int[]) AS v(nombre, producto_id)
                 ON LOWER(TRIM(v.nombre)) = LOWER(TRIM(pl.nombre))
            JOIN productos p ON p.id = v.producto_id
            JOIN hoy h ON h.producto_id = p.id
            WHERE pl.lista = 'BARRA' AND pl.activo
            GROUP BY pl.id, pl.nombre, pl.unidad_sugerida
            ORDER BY SUM(h.vendidos) DESC, pl.nombre`,
            [nombres, ids]
        );

        const aNumero = (filas) => filas.map((f) => ({
            ...f,
            cantidad: Number(f.cantidad),
            origen: (f.origen || []).map((o) => ({
                producto: o.producto,
                vendidos: Number(o.vendidos),
                por_unidad: Number(o.por_unidad),
            })),
        }));

        // La fecha la manda el servidor para que el título del panel diga el día
        // de Bolivia, y no el del reloj de la computadora que lo esté mirando.
        const dia = await pool.query(
            `SELECT TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY') AS fecha`
        );

        res.json({
            fecha: dia.rows[0].fecha,
            cocina: aNumero(cocina.rows),
            barra: aNumero(barra.rows),
        });
    } catch (e) {
        console.error('Error al calcular lo vendido hoy:', e.message);
        res.status(500).json({ error: 'No se pudo calcular lo vendido hoy.' });
    }
});

module.exports = router;
