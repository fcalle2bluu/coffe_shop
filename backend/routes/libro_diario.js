// backend/routes/libro_diario.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

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
            SELECT v.id, v.total, v.metodo_pago, v.fecha_venta,
                   TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY HH24:MI') as fecha_diario,
                   TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_iso,
                   EXTRACT(DOW FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') as dia_semana_num,
                   u.nombre as cajero,
                   (
                       SELECT string_agg(p.nombre || ' (x' || dv.cantidad || ')', ', ')
                       FROM detalle_ventas dv
                       JOIN productos p ON dv.producto_id = p.id
                       WHERE dv.venta_id = v.id
                   ) as detalle_items
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            WHERE EXTRACT(MONTH FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $2
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
        const queryGastosCaja = `
            SELECT gc.id, gc.monto, gc.descripcion, gc.fecha,
                   TO_CHAR(gc.fecha AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY HH24:MI') as fecha_diario,
                   TO_CHAR(gc.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD') as fecha_iso,
                   EXTRACT(DOW FROM gc.fecha AT TIME ZONE 'America/La_Paz') as dia_semana_num,
                   u.nombre as usuario_nombre
            FROM gastos_caja gc
            LEFT JOIN usuarios u ON gc.usuario_id = u.id
            WHERE EXTRACT(MONTH FROM gc.fecha AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM gc.fecha AT TIME ZONE 'America/La_Paz') = $2
        `;
        const resGastosCaja = await pool.query(queryGastosCaja, [mes, anio]);

        // 4. Obtener gastos generales contables del mes/año
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

        // Mapear Ventas (Ingresos)
        resVentas.rows.forEach(v => {
            const total = parseFloat(v.total) || 0;
            const metodo = (v.metodo_pago || 'EFECTIVO').toUpperCase();
            
            // Determinamos cuenta del Debe
            let cuentaDebe = 'BANCO BISA';
            if (metodo === 'EFECTIVO') {
                cuentaDebe = 'CAJA CHICA';
            }

            const diaSemana = diasSemana[parseInt(v.dia_semana_num)] || 'S/D';
            const fechaDiario = formatearFechaDiario(v.fecha_diario);
            const itemsDetalle = v.detalle_items ? ` Detalle: ${v.detalle_items}.` : '';

            movimientos.push({
                fecha: fechaDiario,
                fecha_iso: v.fecha_iso,
                dia_semana: diaSemana,
                fecha_raw: new Date(v.fecha_venta),
                tipo: 'venta',
                ref_id: v.id,
                glosa: `Venta #${v.id.toString().padStart(5, '0')} (POS). Cajero: ${v.cajero || 'Desconocido'}. Pago: ${metodo}.${itemsDetalle}`,
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

        await pool.query(query, params);
        res.status(201).json({ success: true, message: 'Gasto general registrado correctamente' });
    } catch (error) {
        console.error('Error al registrar gasto general:', error);
        res.status(500).json({ error: 'Error al registrar el gasto general: ' + error.message });
    }
});

// Obtener lista de gastos generales registrados
router.get('/gastos', async (req, res) => {
    const { mes, anio } = req.query;
    try {
        let query = 'SELECT *, TO_CHAR(fecha, \'YYYY-MM-DD\') as fecha_formateada FROM gastos_generales';
        const params = [];
        if (mes && anio) {
            query += ' WHERE EXTRACT(MONTH FROM fecha) = $1 AND EXTRACT(YEAR FROM fecha) = $2';
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
        await pool.query('DELETE FROM gastos_generales WHERE id = $1', [id]);
        res.json({ success: true, message: 'Gasto general eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar gasto general:', error);
        res.status(500).json({ error: 'Error al eliminar el gasto general: ' + error.message });
    }
});

// Eliminar un gasto de caja
router.delete('/gasto-caja/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM gastos_caja WHERE id = $1', [id]);
        res.json({ success: true, message: 'Gasto de caja eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar gasto de caja:', error);
        res.status(500).json({ error: 'Error al eliminar gasto de caja: ' + error.message });
    }
});

// Eliminar una venta (asiento de venta en libro diario)
router.delete('/venta/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Eliminar detalles primero (FK constraint)
        await pool.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
        await pool.query('DELETE FROM ventas WHERE id = $1', [id]);
        res.json({ success: true, message: 'Venta eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar venta:', error);
        res.status(500).json({ error: 'Error al eliminar la venta: ' + error.message });
    }
});

// Eliminar una compra (asiento de compra en libro diario)
router.delete('/compra/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM detalle_compras WHERE compra_id = $1', [id]);
        await pool.query('DELETE FROM compras WHERE id = $1', [id]);
        res.json({ success: true, message: 'Compra eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar compra:', error);
        res.status(500).json({ error: 'Error al eliminar la compra: ' + error.message });
    }
});

module.exports = router;
