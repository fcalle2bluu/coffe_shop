// backend/routes/reportes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const PDFDocument = require('pdfkit');

const NOMBRES_MES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function mesAnterior(mes, anio) {
    return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}

async function totalesMes(mes, anio) {
    const r = await pool.query(`
        SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
        FROM ventas
        WHERE es_historica = FALSE AND estado = 'COMPLETADA'
          AND EXTRACT(MONTH FROM fecha_venta AT TIME ZONE 'America/La_Paz') = $1
          AND EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz') = $2
    `, [mes, anio]);
    return { total: parseFloat(r.rows[0].total) || 0, cantidad: parseInt(r.rows[0].cantidad) || 0 };
}

async function ventasPorDia(mes, anio) {
    const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const r = await pool.query(`
        WITH days AS (
            SELECT generate_series($1::date, ($1::date + INTERVAL '1 month' - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS fecha
        )
        SELECT EXTRACT(DAY FROM d.fecha)::int AS dia, COALESCE(v.total, 0) AS total
        FROM days d
        LEFT JOIN (
            SELECT (fecha_venta AT TIME ZONE 'America/La_Paz')::date AS fecha_dia, SUM(total) AS total
            FROM ventas
            WHERE es_historica = FALSE AND estado = 'COMPLETADA'
            GROUP BY fecha_dia
        ) v ON d.fecha = v.fecha_dia
        ORDER BY dia
    `, [inicio]);
    return r.rows.map(row => ({ dia: row.dia, total: parseFloat(row.total) || 0 }));
}

async function topProductos(mes, anio, limite = 5) {
    const r = await pool.query(`
        SELECT p.nombre, COALESCE(SUM(dv.cantidad), 0) AS cantidad, COALESCE(SUM(dv.subtotal), 0) AS ingreso
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        JOIN ventas v ON dv.venta_id = v.id
        WHERE v.es_historica = FALSE AND v.estado = 'COMPLETADA'
          AND EXTRACT(MONTH FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $1
          AND EXTRACT(YEAR FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $2
        GROUP BY p.nombre
        ORDER BY ingreso DESC
        LIMIT $3
    `, [mes, anio, limite]);
    return r.rows.map(row => ({ nombre: row.nombre, cantidad: parseInt(row.cantidad) || 0, ingreso: parseFloat(row.ingreso) || 0 }));
}

async function ventasPorMetodoPago(mes, anio) {
    const r = await pool.query(`
        SELECT COALESCE(metodo_pago, 'SIN ESPECIFICAR') AS metodo_pago, COALESCE(SUM(total), 0) AS total
        FROM ventas
        WHERE es_historica = FALSE AND estado = 'COMPLETADA'
          AND EXTRACT(MONTH FROM fecha_venta AT TIME ZONE 'America/La_Paz') = $1
          AND EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz') = $2
        GROUP BY metodo_pago
        ORDER BY total DESC
    `, [mes, anio]);
    return r.rows.map(row => ({ metodo: row.metodo_pago, total: parseFloat(row.total) || 0 }));
}

async function ventasPorCategoria(mes, anio) {
    const r = await pool.query(`
        SELECT c.nombre AS categoria, COALESCE(SUM(dv.subtotal), 0) AS total
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        JOIN categorias c ON p.categoria_id = c.id
        JOIN ventas v ON dv.venta_id = v.id
        WHERE v.es_historica = FALSE AND v.estado = 'COMPLETADA'
          AND EXTRACT(MONTH FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $1
          AND EXTRACT(YEAR FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') = $2
        GROUP BY c.nombre
        ORDER BY total DESC
    `, [mes, anio]);
    return r.rows.map(row => ({ categoria: row.categoria, total: parseFloat(row.total) || 0 }));
}

function generarAnalisis({ nombreMes, anio, actual, anterior, nombreMesAnterior, dias, topProds, metodos }) {
    const analisis = [];
    const ticketProm = actual.cantidad > 0 ? actual.total / actual.cantidad : 0;

    analisis.push(
        `En ${nombreMes} de ${anio} se registraron ${actual.cantidad} ventas por un total de Bs ${actual.total.toFixed(2)}, ` +
        `con un ticket promedio de Bs ${ticketProm.toFixed(2)}.`
    );

    if (anterior.cantidad > 0 || anterior.total > 0) {
        if (anterior.total > 0) {
            const variacion = ((actual.total - anterior.total) / anterior.total) * 100;
            const direccion = variacion >= 0 ? 'subieron' : 'bajaron';
            analisis.push(
                `Las ventas ${direccion} un ${Math.abs(variacion).toFixed(1)}% respecto a ${nombreMesAnterior} ` +
                `(Bs ${anterior.total.toFixed(2)}).`
            );
        }
    } else {
        analisis.push(`No hay datos de ${nombreMesAnterior} para comparar.`);
    }

    const diasConVenta = dias.filter(d => d.total > 0);
    if (diasConVenta.length > 0) {
        const mejorDia = diasConVenta.reduce((a, b) => (b.total > a.total ? b : a));
        analisis.push(`El día de mayor venta fue el ${mejorDia.dia} de ${nombreMes}, con Bs ${mejorDia.total.toFixed(2)}.`);
    }

    if (topProds.length > 0) {
        const top = topProds[0];
        analisis.push(
            `El producto más vendido fue "${top.nombre}" con ${top.cantidad} unidades (Bs ${top.ingreso.toFixed(2)} en ingresos).`
        );
    }

    if (metodos.length > 0 && actual.total > 0) {
        const principal = metodos[0];
        const pct = (principal.total / actual.total) * 100;
        analisis.push(`El método de pago más usado fue ${principal.metodo} (${pct.toFixed(0)}% del total facturado).`);
    }

    return analisis;
}

async function construirReporteMensual(mes, anio) {
    const ant = mesAnterior(mes, anio);
    const [actual, anterior, dias, topProds, metodos, categorias] = await Promise.all([
        totalesMes(mes, anio),
        totalesMes(ant.mes, ant.anio),
        ventasPorDia(mes, anio),
        topProductos(mes, anio),
        ventasPorMetodoPago(mes, anio),
        ventasPorCategoria(mes, anio),
    ]);

    const nombreMes = NOMBRES_MES[mes - 1];
    const nombreMesAnterior = NOMBRES_MES[ant.mes - 1];
    const ticketPromedio = actual.cantidad > 0 ? actual.total / actual.cantidad : 0;
    const variacionPct = anterior.total > 0 ? ((actual.total - anterior.total) / anterior.total) * 100 : null;

    const analisis = generarAnalisis({
        nombreMes, anio, actual, anterior, nombreMesAnterior, dias, topProds, metodos,
    });

    return {
        mes, anio, nombreMes,
        totalVentas: actual.total,
        cantidadVentas: actual.cantidad,
        ticketPromedio,
        mesAnterior: { mes: ant.mes, anio: ant.anio, nombre: nombreMesAnterior, total: anterior.total, cantidad: anterior.cantidad },
        variacionPct,
        ventasPorDia: dias,
        topProductos: topProds,
        ventasPorMetodoPago: metodos,
        ventasPorCategoria: categorias,
        analisis,
    };
}

router.get('/mensual', async (req, res) => {
    const mes = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);
    if (!mes || !anio || mes < 1 || mes > 12) {
        return res.status(400).json({ error: 'Parámetros mes (1-12) y año son requeridos.' });
    }
    try {
        const data = await construirReporteMensual(mes, anio);
        res.json(data);
    } catch (error) {
        console.error('Error al construir reporte mensual:', error);
        res.status(500).json({ error: 'Error interno al generar el reporte mensual.' });
    }
});

// Genera el PDF del informe mensual. Recibe imágenes PNG (base64) de los gráficos
// ya renderizados en el navegador (Chart.js) para incrustarlas tal cual se ven en
// pantalla; los datos numéricos SIEMPRE se recalculan en el servidor (nunca se
// confía en números que mande el cliente).
router.post('/mensual/pdf', async (req, res) => {
    const mes = parseInt(req.body.mes);
    const anio = parseInt(req.body.anio);
    const graficos = req.body.graficos || {};
    if (!mes || !anio || mes < 1 || mes > 12) {
        return res.status(400).json({ error: 'Parámetros mes (1-12) y año son requeridos.' });
    }

    try {
        const data = await construirReporteMensual(mes, anio);
        const paramRes = await pool.query('SELECT nombre_empresa FROM parametros WHERE id = 1');
        const nombreEmpresa = paramRes.rows[0]?.nombre_empresa || 'Café La Paz';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="informe_${data.nombreMes}_${anio}.pdf"`);

        const doc = new PDFDocument({ size: 'letter', margins: { top: 40, bottom: 15, left: 40, right: 40 }, bufferPages: true });
        doc.pipe(res);

        const DORADO = '#B8923D';
        const CAFE_OSCURO = '#2A1B18';
        const TEXTO = '#2A1B18';
        const GRIS = '#6B5C56';

        // Cabecera
        doc.rect(40, 40, doc.page.width - 80, 70).fill(CAFE_OSCURO);
        doc.fillColor('#FDFBF7').font('Helvetica-Bold').fontSize(20)
           .text(nombreEmpresa.toUpperCase(), 55, 58);
        doc.fillColor(DORADO).font('Helvetica').fontSize(12)
           .text(`Informe Mensual de Ventas — ${data.nombreMes} ${anio}`, 55, 84);

        let y = 130;

        // KPIs
        const kpis = [
            { label: 'Ventas totales', valor: `Bs ${data.totalVentas.toFixed(2)}` },
            { label: 'N° de ventas', valor: `${data.cantidadVentas}` },
            { label: 'Ticket promedio', valor: `Bs ${data.ticketPromedio.toFixed(2)}` },
            { label: `Vs. ${data.mesAnterior.nombre}`, valor: data.variacionPct === null ? 'Sin datos' : `${data.variacionPct >= 0 ? '+' : ''}${data.variacionPct.toFixed(1)}%` },
        ];
        const kpiWidth = (doc.page.width - 80 - 3 * 10) / 4;
        kpis.forEach((k, i) => {
            const x = 40 + i * (kpiWidth + 10);
            doc.roundedRect(x, y, kpiWidth, 60, 6).fill('#F5F0E8');
            doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(k.label, x + 10, y + 10, { width: kpiWidth - 20 });
            doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(14).text(k.valor, x + 10, y + 28, { width: kpiWidth - 20 });
        });
        y += 80;

        // Análisis
        doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(13).text('Análisis del mes', 40, y);
        y += 20;
        doc.font('Helvetica').fontSize(10).fillColor(TEXTO);
        data.analisis.forEach(linea => {
            doc.circle(45, y + 4, 1.5).fill(DORADO);
            doc.fillColor(TEXTO).text(linea, 55, y, { width: doc.page.width - 95 });
            y = doc.y + 6;
        });
        y += 10;

        // Helper para insertar una imagen de gráfico (base64 data URL) si existe
        function insertarGrafico(key, titulo, alto = 200) {
            const dataUrl = graficos[key];
            if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return;
            if (y + 25 + alto > doc.page.height - 50) {
                doc.addPage();
                y = 40;
            }
            doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(12).text(titulo, 40, y);
            y += 18;
            try {
                const base64 = dataUrl.split(',')[1];
                const buffer = Buffer.from(base64, 'base64');
                doc.image(buffer, 40, y, { fit: [doc.page.width - 80, alto], align: 'center' });
                y += alto + 15;
            } catch (e) {
                console.error('Error insertando gráfico en PDF:', key, e.message);
            }
        }

        insertarGrafico('ventasPorDia', 'Ventas por día');
        insertarGrafico('topProductos', 'Productos más vendidos');
        insertarGrafico('metodoPago', 'Ventas por método de pago', 180);

        // Tabla de top productos
        if (data.topProductos.length > 0) {
            if (y + 30 + data.topProductos.length * 18 > doc.page.height - 50) {
                doc.addPage();
                y = 40;
            }
            doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(12).text('Detalle: productos más vendidos', 40, y);
            y += 20;
            doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS);
            doc.text('Producto', 45, y, { width: 300 });
            doc.text('Cantidad', 345, y, { width: 80, align: 'right' });
            doc.text('Ingreso (Bs)', 425, y, { width: 100, align: 'right' });
            y += 14;
            doc.moveTo(40, y).lineTo(doc.page.width - 40, y).lineWidth(0.5).stroke(GRIS);
            y += 6;
            doc.font('Helvetica').fontSize(9).fillColor(TEXTO);
            data.topProductos.forEach(p => {
                doc.text(p.nombre, 45, y, { width: 300 });
                doc.text(String(p.cantidad), 345, y, { width: 80, align: 'right' });
                doc.text(p.ingreso.toFixed(2), 425, y, { width: 100, align: 'right' });
                y += 16;
            });
        }

        // Footer con paginación
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            doc.fillColor(GRIS).font('Helvetica').fontSize(8)
               .text(`${nombreEmpresa} — Informe generado automáticamente — Página ${i + 1} de ${range.count}`,
                     40, doc.page.height - 30, { width: doc.page.width - 80, align: 'center', lineBreak: false });
        }

        doc.end();
    } catch (error) {
        console.error('Error al generar PDF de informe mensual:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error interno al generar el PDF del informe.' });
        }
    }
});

module.exports = router;
