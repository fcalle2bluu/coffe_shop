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
                   TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY') as fecha_diario,
                   EXTRACT(DOW FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') as dia_semana_num,
                   (
                       SELECT string_agg(p.nombre || ' (x' || dv.cantidad || ')', ', ')
                       FROM detalle_ventas dv
                       JOIN productos p ON dv.producto_id = p.id
                       WHERE dv.venta_id = v.id
                   ) as detalle_items
            FROM ventas v
            WHERE EXTRACT(MONTH FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $2
        `;
        const resVentas = await pool.query(queryVentas, [mes, anio]);

        // 2. Obtener compras del mes/año
        const queryCompras = `
            SELECT c.id, c.total, c.fecha,
                   TO_CHAR(c.fecha AT TIME ZONE 'America/La_Paz', 'DD-mon-YYYY') as fecha_diario,
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

        // 3. Combinar y estructurar movimientos
        const movimientos = [];

        // Mapear Ventas
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
            const itemsDetalle = v.detalle_items ? ` Venta: ${v.detalle_items}.` : '';

            movimientos.push({
                fecha: fechaDiario,
                dia_semana: diaSemana,
                fecha_raw: new Date(v.fecha_venta),
                glosa: `Ventas registradas en POS. Pagos en ${metodo}. S/F.${itemsDetalle}`,
                cuentas: [
                    { nombre: cuentaDebe, tipo: 'DEBE', importe: total },
                    { nombre: 'VENTA', tipo: 'HABER', importe: total }
                ]
            });
        });

        // Mapear Compras
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
                dia_semana: diaSemana,
                fecha_raw: new Date(c.fecha),
                glosa: `Compra de insumos registrada en sistema.${provName}${itemsDetalle}`,
                cuentas: [
                    { nombre: 'INVENTARIOS', tipo: 'DEBE', importe: total },
                    { nombre: cuentaHaber, tipo: 'HABER', importe: total }
                ]
            });
        });

        // 4. Ordenar cronológicamente (antiguos primero)
        movimientos.sort((a, b) => a.fecha_raw - b.fecha_raw);

        // 5. Asignar números correlativos de asiento (1-based)
        const asientos = movimientos.map((mov, index) => {
            return {
                asiento_nro: index + 1,
                fecha: mov.fecha,
                dia_semana: mov.dia_semana,
                glosa: mov.glosa,
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

module.exports = router;
