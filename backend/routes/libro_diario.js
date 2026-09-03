// backend/routes/libro_diario.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { registrarBitacora } = require('../utils/bitacora');

const diasSemana = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const mesesNombres = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

// Traducir formato de fecha de inglés a español (ej. "apr" a "abr")
function formatearFechaDiario(dateStr) {
    if (!dateStr) return '';
    let res = dateStr.toLowerCase();
    res = res.replace('jan', 'ene');
    res = res.replace('apr', 'abr');
    res = res.replace('aug', 'ago');
    res = res.replace('dec', 'dic');
    return res.toUpperCase();
}

// Obtener Libro Diario para un mes y año determinado
router.get('/', async (req, res) => {
    let { mes, anio } = req.query;
    
    // Por defecto el mes y año actual
    const fechaActual = new Date();
    mes = parseInt(mes) || (fechaActual.getMonth() + 1);
    anio = parseInt(anio) || fechaActual.getFullYear();

    try {
        // 1. Obtener ventas del mes/año
        const queryVentas = `
            SELECT v.id, v.total, v.metodo_pago, v.fecha_venta, v.comanda_id,
                   TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY HH24:MI') as fecha_diario,
                   TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_iso,
                   EXTRACT(DOW FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') as dia_semana_num,
                   u.nombre as cajero,
                   cm.mesa as mesa_origen,
                   (
                       SELECT string_agg(p.nombre || ' (x' || dv.cantidad || ')', ', ')
                       FROM detalle_ventas dv
                       JOIN productos p ON dv.producto_id = p.id
                       WHERE dv.venta_id = v.id
                   ) as detalle_items
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            LEFT JOIN comandas cm ON v.comanda_id = cm.id
            WHERE EXTRACT(MONTH FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $2
            ORDER BY v.id ASC
        `;
        const resVentas = await pool.query(queryVentas, [mes, anio]);

        // 2. Obtener compras del mes/año
        const queryCompras = `
            SELECT c.id, c.total, c.fecha,
                   TO_CHAR(c.fecha AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY HH24:MI') as fecha_diario,
                   TO_CHAR(c.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_iso,
                   EXTRACT(DOW FROM c.fecha AT TIME ZONE 'America/La_Paz') as dia_semana_num,
                   p.nombre as proveedor,
                   (
                       SELECT string_agg(i.nombre || ' (x' || dc.cantidad || ')', ', ')
                       FROM detalle_compras dc
                       JOIN insumos i ON dc.insumo_id = i.id
                       WHERE dc.compra_id = c.id
                   ) as detalle_items
            FROM compras c
            LEFT JOIN proveedores p ON c.proveedor_id = p.id
            WHERE EXTRACT(MONTH FROM c.fecha AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM c.fecha AT TIME ZONE 'America/La_Paz') = $2
        `;
        const resCompras = await pool.query(queryCompras, [mes, anio]);

        // 3. Obtener gastos de caja del mes/año
        // gastos_caja.fecha es "timestamp sin zona" pero guarda el valor en UTC
        // (CURRENT_TIMESTAMP bajo sesión UTC), por eso hay que etiquetarlo como UTC
        // antes de convertir a hora local; una sola conversión desplaza la fecha/hora
        // 8 horas de más.
        const queryGastosCaja = `
            SELECT gc.id, gc.monto, gc.descripcion, gc.fecha,
                   gc.categoria,
                   TO_CHAR(gc.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY HH24:MI') as fecha_diario,
                   TO_CHAR(gc.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_iso,
                   EXTRACT(DOW FROM gc.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') as dia_semana_num,
                   u.nombre as usuario_nombre
            FROM gastos_caja gc
            LEFT JOIN usuarios u ON gc.usuario_id = u.id
            WHERE EXTRACT(MONTH FROM gc.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM gc.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') = $2
        `;
        const resGastosCaja = await pool.query(queryGastosCaja, [mes, anio]);

        // 4. Obtener gastos generales contables del mes/año
        // A diferencia de gastos_caja, gastos_generales.fecha SIEMPRE se guarda a
        // medianoche exacta (00:00:00): es una fecha de calendario elegida a mano,
        // no un instante real, así que aquí NO se debe restar horario (correría la
        // fecha al día anterior). Se deja con la conversión simple original.
        const queryGastosGenerales = `
            SELECT gg.id, gg.monto, gg.descripcion, gg.fecha, gg.categoria, gg.metodo_pago,
                   TO_CHAR(gg.fecha AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY HH24:MI') as fecha_diario,
                   TO_CHAR(gg.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_iso,
                   EXTRACT(DOW FROM gg.fecha AT TIME ZONE 'America/La_Paz') as dia_semana_num
            FROM gastos_generales gg
            WHERE EXTRACT(MONTH FROM gg.fecha AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM gg.fecha AT TIME ZONE 'America/La_Paz') = $2
        `;
        const resGastosGenerales = await pool.query(queryGastosGenerales, [mes, anio]);

        // 5. Combinar y estructurar movimientos
        const movimientos = [];

        // Mapear Ventas (Ingresos). El cobro dividido de una comanda deja varias
        // filas en 'ventas' (una por método de pago) con el mismo comanda_id: acá
        // se agrupan en un solo asiento con una línea al Debe por cada método y un
        // único Haber por el total, en vez de mostrarlas como ventas separadas
        // (lo que ocultaba el detalle de productos en la fila que no lo llevaba).
        const gruposPorComanda = new Map();
        resVentas.rows.forEach(v => {
            if (!v.comanda_id) return;
            if (!gruposPorComanda.has(v.comanda_id)) gruposPorComanda.set(v.comanda_id, []);
            gruposPorComanda.get(v.comanda_id).push(v);
        });

        const idsYaProcesados = new Set();

        resVentas.rows.forEach(v => {
            if (idsYaProcesados.has(v.id)) return;

            const grupo = v.comanda_id ? gruposPorComanda.get(v.comanda_id) : null;
            const diaSemana = diasSemana[parseInt(v.dia_semana_num)] || 'S/D';
            const fechaDiario = formatearFechaDiario(v.fecha_diario);
            const origenTexto = v.mesa_origen ? (v.mesa_origen === 'Para Llevar' ? 'Para Llevar' : `Mesa ${v.mesa_origen}`) : 'POS';

            if (grupo && grupo.length > 1) {
                // Cobro dividido: un solo asiento para todo el grupo.
                grupo.forEach(g => idsYaProcesados.add(g.id));

                const totalCombinado = grupo.reduce((acc, g) => acc + (parseFloat(g.total) || 0), 0);
                // La única fila con detalle_items es la "venta principal" (donde quedaron
                // los productos); las demás son solo el resto del pago.
                const principal = grupo.find(g => g.detalle_items) || grupo[0];
                const itemsDetalle = principal.detalle_items ? ` Detalle: ${principal.detalle_items}.` : '';

                // Una línea al Debe por cada método usado, fusionando si se repite la
                // misma cuenta contable (ej. dos pagos en efectivo).
                const debePorCuenta = new Map();
                grupo.forEach(g => {
                    const metodo = (g.metodo_pago || 'EFECTIVO').toUpperCase();
                    const cuenta = metodo === 'EFECTIVO' ? 'CAJA CHICA' : 'BANCO BISA';
                    debePorCuenta.set(cuenta, (debePorCuenta.get(cuenta) || 0) + (parseFloat(g.total) || 0));
                });

                const desglose = grupo
                    .map(g => `${(g.metodo_pago || 'EFECTIVO').toUpperCase()} Bs. ${(parseFloat(g.total) || 0).toFixed(2)}`)
                    .join(' + ');

                movimientos.push({
                    fecha: fechaDiario,
                    fecha_iso: v.fecha_iso,
                    dia_semana: diaSemana,
                    fecha_raw: new Date(v.fecha_venta),
                    tipo: 'venta',
                    ref_id: principal.id,
                    glosa: `Venta #${principal.id.toString().padStart(5, '0')} (${origenTexto}, cobro dividido). Cajero: ${v.cajero || 'Desconocido'}. Pago: ${desglose}.${itemsDetalle}`,
                    cuentas: [
                        ...Array.from(debePorCuenta.entries()).map(([nombre, importe]) => ({ nombre, tipo: 'DEBE', importe })),
                        { nombre: 'VENTA', tipo: 'HABER', importe: totalCombinado }
                    ]
                });
                return;
            }

            // Venta normal: un solo método de pago (POS directo, o comanda pagada con "Cobrar Total").
            const total = parseFloat(v.total) || 0;
            const metodo = (v.metodo_pago || 'EFECTIVO').toUpperCase();
            const cuentaDebe = metodo === 'EFECTIVO' ? 'CAJA CHICA' : 'BANCO BISA';
            const itemsDetalle = v.detalle_items ? ` Detalle: ${v.detalle_items}.` : '';

            movimientos.push({
                fecha: fechaDiario,
                fecha_iso: v.fecha_iso,
                dia_semana: diaSemana,
                fecha_raw: new Date(v.fecha_venta),
                tipo: 'venta',
                ref_id: v.id,
                glosa: `Venta #${v.id.toString().padStart(5, '0')} (${origenTexto}). Cajero: ${v.cajero || 'Desconocido'}. Pago: ${metodo}.${itemsDetalle}`,
                cuentas: [
                    { nombre: cuentaDebe, tipo: 'DEBE', importe: total },
                    { nombre: 'VENTA', tipo: 'HABER', importe: total }
                ]
            });
        });

        // Mapear Compras (Egresos)
        resCompras.rows.forEach(c => {
            const total = parseFloat(c.total) || 0;
            
            // Determinamos cuenta de Haber (ej: BANCO para compras grandes, CAJA para chicas)
            const cuentaHaber = total > 200 ? 'BANCO BISA' : 'CAJA CHICA';

            const diaSemana = diasSemana[parseInt(c.dia_semana_num)] || 'S/D';
            const fechaDiario = formatearFechaDiario(c.fecha_diario);
            const itemsDetalle = c.detalle_items ? ` Insumos: ${c.detalle_items}.` : '';
            const provName = c.proveedor ? ` Proveedor: ${c.proveedor}.` : '';

            movimientos.push({
                fecha: fechaDiario,
                fecha_iso: c.fecha_iso,
                dia_semana: diaSemana,
                fecha_raw: new Date(c.fecha),
                tipo: 'compra',
                ref_id: c.id,
                glosa: `Compra #${c.id.toString().padStart(5, '0')}.${provName}${itemsDetalle}`,
                cuentas: [
                    { nombre: 'INVENTARIOS', tipo: 'DEBE', importe: total },
                    { nombre: cuentaHaber, tipo: 'HABER', importe: total }
                ]
            });
        });

        // Mapear Gastos de Caja (Egresos)
        resGastosCaja.rows.forEach(gc => {
            const total = parseFloat(gc.monto) || 0;
            const diaSemana = diasSemana[parseInt(gc.dia_semana_num)] || 'S/D';
            const fechaDiario = formatearFechaDiario(gc.fecha_diario);
            const cajero = gc.usuario_nombre ? ` Cajero: ${gc.usuario_nombre}.` : '';

            movimientos.push({
                fecha: fechaDiario,
                fecha_iso: gc.fecha_iso,
                dia_semana: diaSemana,
                fecha_raw: new Date(gc.fecha),
                tipo: 'gasto_caja',
                ref_id: gc.id,
                categoria: gc.categoria || 'Gastos Operativos',
                glosa: `Gasto de Caja Chica (Turno #${gc.id}).${cajero} Detalle: ${gc.descripcion}`,
                cuentas: [
                    { nombre: 'GASTOS OPERATIVOS', tipo: 'DEBE', importe: total },
                    { nombre: 'CAJA CHICA', tipo: 'HABER', importe: total }
                ]
            });
        });

        // Mapear Gastos Generales (Egresos)
        resGastosGenerales.rows.forEach(gg => {
            const total = parseFloat(gg.monto) || 0;
            const categoria = (gg.categoria || 'Gastos Operativos').toUpperCase();
            const metodoPago = (gg.metodo_pago || 'BANCO BISA').toUpperCase();

            const diaSemana = diasSemana[parseInt(gg.dia_semana_num)] || 'S/D';
            const fechaDiario = formatearFechaDiario(gg.fecha_diario);

            movimientos.push({
                fecha: fechaDiario,
                fecha_iso: gg.fecha_iso,
                dia_semana: diaSemana,
                fecha_raw: new Date(gg.fecha),
                tipo: 'gasto_general',
                ref_id: gg.id,
                glosa: `Gasto general #${gg.id} - ${categoria} - Pago: ${metodoPago} - Detalle: ${gg.descripcion}`,
                cuentas: [
                    { nombre: categoria, tipo: 'DEBE', importe: total },
                    { nombre: metodoPago, tipo: 'HABER', importe: total }
                ]
            });
        });

        // 6. Ordenar cronológicamente (más recientes primero por defecto)
        const orden = (req.query.orden || 'DESC').toUpperCase();
        if (orden === 'ASC') {
            movimientos.sort((a, b) => a.fecha_raw - b.fecha_raw);
        } else {
            movimientos.sort((a, b) => b.fecha_raw - a.fecha_raw);
        }

        // 7. Asignar números correlativos de asiento (1-based)
        const asientos = movimientos.map((mov, index) => {
            return {
                asiento_nro: index + 1,
                fecha: mov.fecha,
                fecha_iso: mov.fecha_iso,
                dia_semana: mov.dia_semana,
                glosa: mov.glosa,
                tipo: mov.tipo,
                ref_id: mov.ref_id,
                cuentas: mov.cuentas
            };
        });

        res.json({
            mes: mes,
            mes_nombre: mesesNombres[mes - 1],
            anio: anio,
            asientos: asientos
        });

    } catch (error) {
        console.error('Error al generar libro diario:', error);
        res.status(500).json({ error: 'Error al generar libro diario: ' + error.message });
    }
});

// Registrar un Gasto General
router.post('/gastos', async (req, res) => {
    const { descripcion, monto, categoria, metodo_pago, fecha } = req.body;
    if (!descripcion || !monto || !categoria) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (descripción, monto, categoría)' });
    }
    try {
        const query = fecha 
            ? 'INSERT INTO gastos_generales (descripcion, monto, categoria, metodo_pago, fecha) VALUES ($1, $2, $3, $4, $5)'
            : 'INSERT INTO gastos_generales (descripcion, monto, categoria, metodo_pago) VALUES ($1, $2, $3, $4)';
        const params = fecha 
            ? [descripcion, monto, categoria, metodo_pago || 'BANCO BISA', fecha]
            : [descripcion, monto, categoria, metodo_pago || 'BANCO BISA'];

        const insertado = await pool.query(query + ' RETURNING id', params);

        registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'REGISTRAR_GASTO_GENERAL', entidad_tipo: 'gasto_general', entidad_id: insertado.rows[0].id,
            detalle: { descripcion, monto, categoria, metodo_pago }
        });

        res.status(201).json({ success: true, message: 'Gasto general registrado correctamente' });
    } catch (error) {
        console.error('Error al registrar gasto general:', error);
        res.status(500).json({ error: 'Error al registrar el gasto general: ' + error.message });
    }
});

// Sugerencias de gastos parecidos ya registrados, para avisar de posibles
// duplicados mientras se escribe la descripción de un gasto nuevo. Usa
// pg_trgm (con índice GIN) para que la búsqueda por similitud de texto sea
// liviana incluso con muchos registros; se limita a los últimos 6 meses
// porque ahí es donde de verdad importa detectar un duplicado reciente.
router.get('/gastos/sugerencias', async (req, res) => {
    const texto = (req.query.texto || '').trim();
    if (texto.length < 3) {
        return res.json([]);
    }
    // El monto es opcional (puede que aún no lo hayan escrito). Cuando viene,
    // un monto EXACTO igual también cuenta como posible duplicado aunque la
    // descripción sea muy distinta (ej. "chocolates y otros" vs "deuda de
    // Jorge y Eliana" por Bs. 5714 en ambos casos) — la similitud de texto
    // sola no detecta ese caso.
    const montoNum = parseFloat(req.query.monto);
    const monto = isNaN(montoNum) ? null : montoNum;
    try {
        const result = await pool.query(`
            SELECT descripcion, monto, categoria,
                   TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY') as fecha_formateada,
                   similarity(descripcion, $1) as parecido,
                   (monto = $2) as mismo_monto
            FROM gastos_generales
            WHERE fecha >= CURRENT_DATE - INTERVAL '180 days'
              AND (similarity(descripcion, $1) > 0.25 OR monto = $2)
            ORDER BY mismo_monto DESC, parecido DESC
            LIMIT 5
        `, [texto, monto]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al buscar gastos similares:', error);
        res.status(500).json({ error: 'Error al buscar gastos similares' });
    }
});

// Obtener lista de gastos generales registrados
router.get('/gastos', async (req, res) => {
    const { mes, anio } = req.query;
    try {
        // gastos_generales.fecha siempre es una fecha de calendario a medianoche
        // (00:00:00), no un instante real, así que se usa la conversión simple
        // (restar horario correría la fecha al día anterior). Ver nota igual más
        // arriba en este archivo.
        let query = "SELECT *, TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_formateada FROM gastos_generales";
        const params = [];
        if (mes && anio) {
            query += ' WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE \'America/La_Paz\') = $1 AND EXTRACT(YEAR FROM fecha AT TIME ZONE \'America/La_Paz\') = $2';
            params.push(parseInt(mes), parseInt(anio));
        }
        query += ' ORDER BY fecha DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener gastos generales:', error);
        res.status(500).json({ error: 'Error al obtener gastos generales: ' + error.message });
    }
});

// Eliminar un gasto general
router.delete('/gastos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const eliminado = await pool.query('DELETE FROM gastos_generales WHERE id = $1 RETURNING descripcion, monto, categoria', [id]);

        registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'ELIMINAR_GASTO_GENERAL', entidad_tipo: 'gasto_general', entidad_id: Number(id),
            detalle: eliminado.rows[0]
        });

        res.json({ success: true, message: 'Gasto general eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar gasto general:', error);
        res.status(500).json({ error: 'Error al eliminar el gasto general: ' + error.message });
    }
});

// Cambiar categoría de un gasto general
router.patch('/gastos/:id/categoria', async (req, res) => {
    const { id } = req.params;
    const { categoria } = req.body;
    const categoriasValidas = ['Gastos Operativos', 'Gastos Fijos', 'Costos de Producción/Insumos'];
    if (!categoriasValidas.includes(categoria)) {
        return res.status(400).json({ error: 'Categoría no válida' });
    }
    try {
        await pool.query('UPDATE gastos_generales SET categoria = $1 WHERE id = $2', [categoria, id]);

        registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'EDITAR_CATEGORIA_GASTO_GENERAL', entidad_tipo: 'gasto_general', entidad_id: Number(id),
            detalle: { categoria }
        });

        res.json({ success: true, message: 'Categoría actualizada correctamente' });
    } catch (error) {
        console.error('Error al actualizar categoría del gasto:', error);
        res.status(500).json({ error: 'Error al actualizar la categoría: ' + error.message });
    }
});


// Eliminar un gasto de caja
router.delete('/gasto-caja/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const eliminado = await pool.query('DELETE FROM gastos_caja WHERE id = $1 RETURNING caja_id, monto, descripcion', [id]);

        registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'ELIMINAR_GASTO_CAJA', entidad_tipo: 'gasto_caja', entidad_id: Number(id),
            detalle: eliminado.rows[0]
        });

        res.json({ success: true, message: 'Gasto de caja eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar gasto de caja:', error);
        res.status(500).json({ error: 'Error al eliminar gasto de caja: ' + error.message });
    }
});

// Cambiar categoría de un gasto de caja
router.patch('/gasto-caja/:id/categoria', async (req, res) => {
    const { id } = req.params;
    const { categoria } = req.body;
    const categoriasValidas = ['Gastos Operativos', 'Gastos Fijos', 'Costos de Producción/Insumos'];
    if (!categoriasValidas.includes(categoria)) {
        return res.status(400).json({ error: 'Categoría no válida' });
    }
    try {
        await pool.query('UPDATE gastos_caja SET categoria = $1 WHERE id = $2', [categoria, id]);

        registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'EDITAR_CATEGORIA_GASTO_CAJA', entidad_tipo: 'gasto_caja', entidad_id: Number(id),
            detalle: { categoria }
        });

        res.json({ success: true, message: 'Categoría actualizada correctamente' });
    } catch (error) {
        console.error('Error al actualizar categoría del gasto de caja:', error);
        res.status(500).json({ error: 'Error al actualizar la categoría: ' + error.message });
    }
});

// Eliminar una venta (asiento de venta en libro diario)
router.delete('/venta/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const ventaRes = await client.query('SELECT comanda_id FROM ventas WHERE id = $1', [id]);
        if (ventaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Venta no encontrada' });
        }
        const comandaId = ventaRes.rows[0].comanda_id;

        if (comandaId) {
            // Cobro dividido: el asiento representa varias filas en 'ventas' (una por
            // método de pago) ligadas a la misma comanda. Se borran todas juntas para
            // no dejar a medias un pago que se repartió en varios métodos.
            const idsRes = await client.query('SELECT id FROM ventas WHERE comanda_id = $1', [comandaId]);
            const ids = idsRes.rows.map(r => r.id);
            await client.query('DELETE FROM detalle_ventas WHERE venta_id = ANY($1)', [ids]);
            await client.query('DELETE FROM ventas WHERE id = ANY($1)', [ids]);

            // Sin esto, la comanda quedaba marcada PAGADA para siempre sin ninguna
            // venta detrás (una mesa "fantasma": cobrada según el sistema, pero sin
            // plata registrada) porque borrar acá solo tocaba 'ventas', nunca
            // 'comandas'. Al borrar el asiento, la mesa vuelve a quedar pendiente de
            // cobro para que se pueda volver a cobrar bien.
            await client.query(`
                UPDATE comandas SET estado = 'ENTREGADA', caja_id = NULL, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = $1 AND estado = 'PAGADA'
            `, [comandaId]);
        } else {
            // Eliminar detalles primero (FK constraint)
            await client.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
            await client.query('DELETE FROM ventas WHERE id = $1', [id]);
        }

        await registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'ELIMINAR_VENTA_LIBRO_DIARIO', entidad_tipo: 'venta', entidad_id: Number(id),
            detalle: { comanda_id: comandaId || null },
            client
        });

        await client.query('COMMIT');
        res.json({ success: true, message: 'Venta eliminada correctamente' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar venta:', error);
        res.status(500).json({ error: 'Error al eliminar la venta: ' + error.message });
    } finally {
        client.release();
    }
});

// Eliminar una compra (asiento de compra en libro diario)
router.delete('/compra/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM detalle_compras WHERE compra_id = $1', [id]);
        await pool.query('DELETE FROM compras WHERE id = $1', [id]);

        registrarBitacora({
            usuario_id: req.headers['x-usuario-id'] || req.query.usuario_id || (req.body || {}).usuario_id,
            accion: 'ELIMINAR_COMPRA', entidad_tipo: 'compra', entidad_id: Number(id)
        });

        res.json({ success: true, message: 'Compra eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar compra:', error);
        res.status(500).json({ error: 'Error al eliminar la compra: ' + error.message });
    }
});

// ─── STATS: Métodos de Pago más usados ────────────────────────────────────────
router.get('/stats/metodos-pago', async (req, res) => {
    const { filtro, fecha } = req.query; // filtro: hoy | mes | anio | todos
    let whereClause = '';
    const params = [];

    if (filtro === 'hoy') {
        whereClause = `WHERE DATE(fecha_venta AT TIME ZONE 'America/La_Paz') = CURRENT_DATE AT TIME ZONE 'America/La_Paz'`;
    } else if (filtro === 'mes') {
        whereClause = `WHERE EXTRACT(MONTH FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/La_Paz')
                         AND EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/La_Paz')`;
    } else if (filtro === 'anio') {
        whereClause = `WHERE EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/La_Paz')`;
    } else if (filtro === 'dia' && fecha) {
        whereClause = `WHERE DATE(fecha_venta AT TIME ZONE 'America/La_Paz') = $1`;
        params.push(fecha);
    }
    // 'todos' o sin filtro → sin WHERE (histórico)

    try {
        const query = `
            SELECT
                metodo_pago                                           AS metodo,
                COUNT(*)::int                                         AS cantidad,
                COALESCE(SUM(total), 0)::numeric(12,2)               AS total_monto,
                json_agg(
                    json_build_object(
                        'id', id,
                        'total', total,
                        'fecha', TO_CHAR(fecha_venta AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI')
                    ) ORDER BY fecha_venta DESC
                )                                                     AS items
            FROM ventas
            ${whereClause}
            GROUP BY metodo_pago
            ORDER BY cantidad DESC
        `;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error stats metodos-pago:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── STATS: Gastos por Categoría ──────────────────────────────────────────────
router.get('/stats/gastos-categorias', async (req, res) => {
    const { filtro, fecha } = req.query;
    let whereClause = '';
    const params = [];

    // gastos_generales.fecha siempre es una fecha de calendario a medianoche
    // (00:00:00), no un instante real, así que se usa la conversión simple (ver
    // misma nota más arriba en este archivo).
    if (filtro === 'hoy') {
        whereClause = `WHERE DATE(fecha AT TIME ZONE 'America/La_Paz') = CURRENT_DATE AT TIME ZONE 'America/La_Paz'`;
    } else if (filtro === 'mes') {
        whereClause = `WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM NOW() AT TIME ZONE 'America/La_Paz')
                         AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/La_Paz')`;
    } else if (filtro === 'anio') {
        whereClause = `WHERE EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/La_Paz')`;
    } else if (filtro === 'dia' && fecha) {
        whereClause = `WHERE DATE(fecha AT TIME ZONE 'America/La_Paz') = $1`;
        params.push(fecha);
    }

    try {
        const query = `
            SELECT
                categoria,
                COUNT(*)::int                                         AS cantidad,
                COALESCE(SUM(monto), 0)::numeric(12,2)               AS total_monto,
                json_agg(
                    json_build_object(
                        'descripcion', descripcion,
                        'monto', monto,
                        'fecha', TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY'),
                        'metodo_pago', metodo_pago
                    ) ORDER BY fecha DESC
                )                                                     AS items
            FROM gastos_generales
            ${whereClause}
            GROUP BY categoria
            ORDER BY total_monto DESC
        `;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error stats gastos-categorias:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

