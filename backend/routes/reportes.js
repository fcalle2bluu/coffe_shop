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

// El módulo de Compras (tabla "compras") y el de Pagos de Salarios (tabla
// "pagos_salarios") casi no se usan en la práctica: los gastos reales se
// registran como movimientos de Libro Diario en "gastos_generales" —
// insumos con categoria = 'Costos de Producción/Insumos', salarios
// detectados porque la descripción (glosa) menciona "salario". A eso se le
// suma "gastos_caja" (Caja Chica), que es una categoría de egreso aparte y
// ya se usa en el semáforo gerencial (kpis.js) y en Libro Diario. Esta
// función junta las cuatro fuentes en 5 categorías (Insumos, Salarios,
// Gastos Fijos, Caja Chica, Otros Gastos Operativos) y además arma la lista
// de movimientos individuales para poder mostrar el detalle completo.
async function gastosMes(mes, anio) {
    const [gastosGenerales, compras, pagosSalarios, gastosCaja] = await Promise.all([
        pool.query(`
            SELECT id, fecha, categoria, descripcion, monto
            FROM gastos_generales
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = $2
            ORDER BY fecha DESC
        `, [mes, anio]),
        pool.query(`
            SELECT c.id, c.fecha, c.total, p.nombre AS proveedor
            FROM compras c
            LEFT JOIN proveedores p ON p.id = c.proveedor_id
            WHERE EXTRACT(MONTH FROM c.fecha AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM c.fecha AT TIME ZONE 'America/La_Paz') = $2
            ORDER BY c.fecha DESC
        `, [mes, anio]),
        pool.query(`
            SELECT ps.id, ps.fecha_pago AS fecha, ps.salario_neto, ps.glosa, u.nombre AS usuario
            FROM pagos_salarios ps
            JOIN usuarios u ON u.id = ps.usuario_id
            WHERE ps.mes = $1 AND ps.anio = $2
            ORDER BY ps.fecha_pago DESC
        `, [mes, anio]),
        pool.query(`
            SELECT id, fecha, descripcion, monto
            FROM gastos_caja
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') = $1
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') = $2
            ORDER BY fecha DESC
        `, [mes, anio]),
    ]);

    const grupoDe = (categoria, descripcion) => {
        if (categoria === 'Costos de Producción/Insumos') return 'Insumos';
        if (categoria === 'Gastos Fijos') return 'Gastos Fijos';
        if (descripcion && descripcion.toLowerCase().includes('salario')) return 'Salarios';
        return 'Otros gastos operativos';
    };

    const items = [];
    for (const g of gastosGenerales.rows) {
        items.push({
            fecha: g.fecha, categoria: grupoDe(g.categoria, g.descripcion),
            descripcion: g.descripcion, monto: parseFloat(g.monto) || 0,
        });
    }
    for (const c of compras.rows) {
        items.push({
            fecha: c.fecha, categoria: 'Insumos',
            descripcion: `Compra de insumos${c.proveedor ? ' a ' + c.proveedor : ''} (registro directo)`,
            monto: parseFloat(c.total) || 0,
        });
    }
    for (const p of pagosSalarios.rows) {
        items.push({
            fecha: p.fecha, categoria: 'Salarios',
            descripcion: p.glosa || `Pago de salario a ${p.usuario} (registro directo)`,
            monto: parseFloat(p.salario_neto) || 0,
        });
    }
    for (const gc of gastosCaja.rows) {
        items.push({
            fecha: gc.fecha, categoria: 'Caja Chica',
            descripcion: gc.descripcion, monto: parseFloat(gc.monto) || 0,
        });
    }
    items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const totalesPorCategoria = {};
    for (const it of items) {
        totalesPorCategoria[it.categoria] = (totalesPorCategoria[it.categoria] || 0) + it.monto;
    }
    const ORDEN_CATEGORIAS = ['Insumos', 'Salarios', 'Gastos Fijos', 'Caja Chica', 'Otros gastos operativos'];
    const categorias = ORDEN_CATEGORIAS
        .map(categoria => ({ categoria, total: totalesPorCategoria[categoria] || 0 }))
        .filter(c => c.total > 0);

    const salariosPorEmpleado = await agruparSalariosPorEmpleado(items.filter(it => it.categoria === 'Salarios'));

    return {
        totalInsumos: totalesPorCategoria['Insumos'] || 0,
        totalSalarios: totalesPorCategoria['Salarios'] || 0,
        totalGeneral: items.reduce((acc, it) => acc + it.monto, 0),
        categorias,
        items,
        salariosPorEmpleado,
    };
}

// Los pagos de salario no tienen usuario_id (son texto libre en gastos_generales),
// así que se identifica al empleado buscando su nombre (o un nombre intermedio,
// ej. "Antonio" dentro de "Jorge Antonio Ticona Calderon") como palabra completa
// dentro de la descripción. Lo que no se logra identificar cae en "Sin identificar".
async function agruparSalariosPorEmpleado(itemsSalario) {
    if (itemsSalario.length === 0) return [];
    const usuariosRes = await pool.query('SELECT nombre FROM usuarios');
    const candidatos = usuariosRes.rows
        .map(u => u.nombre)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length); // nombres completos más largos primero

    const identificar = (descripcion) => {
        if (!descripcion) return null;
        for (const nombreCompleto of candidatos) {
            const tokens = nombreCompleto.split(/\s+/).filter(t => t.length >= 3);
            for (const token of tokens) {
                const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (regex.test(descripcion)) return nombreCompleto;
            }
        }
        return null;
    };

    const totales = {};
    for (const it of itemsSalario) {
        const empleado = identificar(it.descripcion) || 'Sin identificar';
        if (!totales[empleado]) totales[empleado] = { nombre: empleado, total: 0, pagos: 0 };
        totales[empleado].total += it.monto;
        totales[empleado].pagos += 1;
    }
    return Object.values(totales).sort((a, b) => b.total - a.total);
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

function generarAnalisis({ nombreMes, anio, actual, anterior, nombreMesAnterior, dias, topProds, metodos, categoriasVenta, gastos, margen }) {
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

    if (categoriasVenta.length > 0 && actual.total > 0) {
        const principal = categoriasVenta[0];
        const pct = (principal.total / actual.total) * 100;
        analisis.push(`La categoría de productos con más ventas fue "${principal.categoria}", con Bs ${principal.total.toFixed(2)} (${pct.toFixed(0)}% del total).`);
    }

    if (gastos.totalGeneral > 0) {
        const desglose = gastos.categorias.map(c => `Bs ${c.total.toFixed(2)} en ${c.categoria.toLowerCase()}`).join(', ');
        analisis.push(`Los gastos del mes sumaron Bs ${gastos.totalGeneral.toFixed(2)} (${desglose}), dejando un margen de Bs ${margen.toFixed(2)}.`);
    }

    if (gastos.salariosPorEmpleado.length > 0) {
        const top = gastos.salariosPorEmpleado[0];
        analisis.push(`El empleado con mayor pago de salario fue ${top.nombre}, con Bs ${top.total.toFixed(2)} en ${top.pagos} pago(s).`);
    }

    return analisis;
}

async function construirReporteMensual(mes, anio) {
    const ant = mesAnterior(mes, anio);
    const [actual, anterior, dias, topProds, metodos, categoriasVenta, gastos] = await Promise.all([
        totalesMes(mes, anio),
        totalesMes(ant.mes, ant.anio),
        ventasPorDia(mes, anio),
        topProductos(mes, anio, 10),
        ventasPorMetodoPago(mes, anio),
        ventasPorCategoria(mes, anio),
        gastosMes(mes, anio),
    ]);

    const nombreMes = NOMBRES_MES[mes - 1];
    const nombreMesAnterior = NOMBRES_MES[ant.mes - 1];
    const ticketPromedio = actual.cantidad > 0 ? actual.total / actual.cantidad : 0;
    const variacionPct = anterior.total > 0 ? ((actual.total - anterior.total) / anterior.total) * 100 : null;
    const margen = actual.total - gastos.totalGeneral;

    const analisis = generarAnalisis({
        nombreMes, anio, actual, anterior, nombreMesAnterior, dias, topProds, metodos, categoriasVenta, gastos, margen,
    });

    return {
        mes, anio, nombreMes,
        totalVentas: actual.total,
        cantidadVentas: actual.cantidad,
        ticketPromedio,
        gastosInsumos: gastos.totalInsumos,
        salarios: gastos.totalSalarios,
        gastosTotal: gastos.totalGeneral,
        gastosPorCategoria: gastos.categorias,
        gastosDetalle: gastos.items,
        salariosPorEmpleado: gastos.salariosPorEmpleado,
        margen,
        mesAnterior: { mes: ant.mes, anio: ant.anio, nombre: nombreMesAnterior, total: anterior.total, cantidad: anterior.cantidad },
        variacionPct,
        ventasPorDia: dias,
        topProductos: topProds,
        ventasPorMetodoPago: metodos,
        ventasPorCategoria: categoriasVenta,
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
        const CREMA = '#F7F2E9';
        const TEXTO = '#2A1B18';
        const GRIS = '#6B5C56';
        const VERDE = '#2F7D5A';
        const ROJO = '#B23A2E';

        // Función para dibujar una fila de tarjetas KPI con una franja de color superior
        function dibujarFilaKpis(items, yPos) {
            const gap = 10;
            const ancho = (doc.page.width - 80 - (items.length - 1) * gap) / items.length;
            items.forEach((k, i) => {
                const x = 40 + i * (ancho + gap);
                doc.roundedRect(x, yPos, ancho, 58, 6).fill(CREMA);
                doc.roundedRect(x, yPos, ancho, 4, 2).fill(k.color || DORADO);
                doc.fillColor(GRIS).font('Helvetica').fontSize(8.5).text(k.label.toUpperCase(), x + 10, yPos + 14, { width: ancho - 20, characterSpacing: 0.3 });
                doc.fillColor(k.colorValor || TEXTO).font('Helvetica-Bold').fontSize(14).text(k.valor, x + 10, yPos + 30, { width: ancho - 20 });
            });
            return yPos + 58 + 12;
        }

        // Cabecera
        doc.rect(40, 40, doc.page.width - 80, 74).fill(CAFE_OSCURO);
        doc.rect(40, 108, doc.page.width - 80, 3).fill(DORADO);
        doc.fillColor('#FDFBF7').font('Helvetica-Bold').fontSize(21)
           .text(nombreEmpresa.toUpperCase(), 55, 58);
        doc.fillColor(DORADO).font('Helvetica').fontSize(12)
           .text(`Informe Mensual de Ventas  —  ${data.nombreMes} ${anio}`, 55, 85);

        let y = 130;

        // Fila 1: ventas
        const variacionColor = data.variacionPct === null ? GRIS : (data.variacionPct >= 0 ? VERDE : ROJO);
        y = dibujarFilaKpis([
            { label: 'Ventas totales', valor: `Bs ${data.totalVentas.toFixed(2)}` },
            { label: 'N° de ventas', valor: `${data.cantidadVentas}` },
            { label: 'Ticket promedio', valor: `Bs ${data.ticketPromedio.toFixed(2)}` },
            { label: `Vs. ${data.mesAnterior.nombre}`, valor: data.variacionPct === null ? 'Sin datos' : `${data.variacionPct >= 0 ? '+' : ''}${data.variacionPct.toFixed(1)}%`, color: variacionColor, colorValor: variacionColor },
        ], y);

        // Fila 2: financiero (gastos en insumos, salarios, margen)
        const margenColor = data.margen >= 0 ? VERDE : ROJO;
        y = dibujarFilaKpis([
            { label: 'Gastos en insumos', valor: `Bs ${data.gastosInsumos.toFixed(2)}`, color: ROJO },
            { label: 'Salarios pagados', valor: `Bs ${data.salarios.toFixed(2)}`, color: ROJO },
            { label: 'Margen del mes', valor: `Bs ${data.margen.toFixed(2)}`, color: margenColor, colorValor: margenColor },
        ], y);
        y += 6;

        // Análisis
        doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(13).text('Análisis del mes', 40, y);
        doc.moveTo(40, y + 16).lineTo(140, y + 16).lineWidth(1.5).stroke(DORADO);
        y += 26;
        doc.font('Helvetica').fontSize(10).fillColor(TEXTO);
        data.analisis.forEach(linea => {
            doc.circle(45, y + 4, 1.5).fill(DORADO);
            doc.fillColor(TEXTO).text(linea, 55, y, { width: doc.page.width - 95 });
            y = doc.y + 6;
        });
        y += 10;

        // Encabezado de sección con línea dorada, consistente con "Análisis del mes"
        function tituloSeccion(texto) {
            doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(12).text(texto, 40, y);
            doc.moveTo(40, y + 15).lineTo(40 + doc.font('Helvetica-Bold').fontSize(12).widthOfString(texto) + 10, y + 15)
               .lineWidth(1).stroke(DORADO);
            y += 24;
        }

        // Helper para insertar una imagen de gráfico (base64 data URL) si existe
        function insertarGrafico(key, titulo, alto = 200) {
            const dataUrl = graficos[key];
            if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return;
            if (y + 40 + alto > doc.page.height - 50) {
                doc.addPage();
                y = 40;
            }
            tituloSeccion(titulo);
            try {
                const base64 = dataUrl.split(',')[1];
                const buffer = Buffer.from(base64, 'base64');
                doc.roundedRect(40, y - 4, doc.page.width - 80, alto + 8, 6).fill(CREMA);
                doc.image(buffer, 44, y, { fit: [doc.page.width - 88, alto], align: 'center' });
                y += alto + 20;
            } catch (e) {
                console.error('Error insertando gráfico en PDF:', key, e.message);
            }
        }

// Helper genérico para dibujar una tabla con encabezado oscuro y filas alternadas.
        // La altura de cada fila se calcula según el texto más alto de esa fila (con
        // wrap), para que una descripción o categoría larga no se superponga con la
        // fila siguiente.
        function dibujarTabla(titulo, columnas, filas) {
            if (filas.length === 0) return;
            const PADDING_FILA = 8;
            const alturaDeFila = (fila) => {
                doc.font('Helvetica').fontSize(9.5);
                const alturas = columnas.map(col => doc.heightOfString(
                    fila[col.campo] != null ? String(fila[col.campo]) : '',
                    { width: col.width }
                ));
                return Math.max(...alturas, 12) + PADDING_FILA;
            };
            const dibujarEncabezado = () => {
                doc.roundedRect(40, y, doc.page.width - 80, 22, 4).fill(CAFE_OSCURO);
                doc.fillColor('#FDFBF7').font('Helvetica-Bold').fontSize(9);
                columnas.forEach(col => doc.text(col.titulo, col.x, y + 7, { width: col.width, align: col.align || 'left' }));
                y += 22;
            };

            const alturaPrimeraFila = alturaDeFila(filas[0]);
            if (y + 24 + 22 + alturaPrimeraFila > doc.page.height - 50) {
                doc.addPage();
                y = 40;
            }
            tituloSeccion(titulo);
            dibujarEncabezado();

            filas.forEach((fila, i) => {
                const altoFila = alturaDeFila(fila);
                if (y + altoFila > doc.page.height - 50) {
                    doc.addPage();
                    y = 40;
                    dibujarEncabezado();
                }
                if (i % 2 === 0) doc.rect(40, y, doc.page.width - 80, altoFila).fill(CREMA);
                doc.fillColor(TEXTO).font('Helvetica').fontSize(9.5);
                columnas.forEach(col => doc.text(fila[col.campo] != null ? String(fila[col.campo]) : '', col.x, y + 4, { width: col.width, align: col.align || 'left' }));
                y += altoFila;
            });
        }

        insertarGrafico('ventasPorDia', 'Ventas por día');
        insertarGrafico('ingresosVsEgresos', 'Ingresos vs. egresos', 180);
        insertarGrafico('topProductos', 'Productos más vendidos');
        insertarGrafico('metodoPago', 'Ventas por método de pago', 180);
        insertarGrafico('ventasCategoria', 'Ventas por categoría de producto');

        dibujarTabla('Detalle: productos más vendidos',
            [
                { titulo: 'PRODUCTO', campo: 'nombre', x: 50, width: 290 },
                { titulo: 'CANTIDAD', campo: 'cantidad', x: 345, width: 80, align: 'right' },
                { titulo: 'INGRESO (BS)', campo: 'ingresoTexto', x: 420, width: 105, align: 'right' },
            ],
            data.topProductos.map(p => ({ ...p, ingresoTexto: p.ingreso.toFixed(2) })));

        insertarGrafico('gastosCategoria', 'Gastos por categoría', 180);

        dibujarTabla('Desglose de gastos por categoría',
            [
                { titulo: 'CATEGORÍA', campo: 'categoria', x: 50, width: 340 },
                { titulo: 'MONTO (BS)', campo: 'totalTexto', x: 400, width: 125, align: 'right' },
            ],
            data.gastosPorCategoria.map(c => ({ ...c, totalTexto: c.total.toFixed(2) })));

        // Movimientos individuales más grandes (hasta 15) para no alargar demasiado el PDF
        const principalesGastos = [...data.gastosDetalle].sort((a, b) => b.monto - a.monto).slice(0, 15);
        dibujarTabla('Principales movimientos de gasto',
            [
                { titulo: 'FECHA', campo: 'fechaTexto', x: 50, width: 55 },
                { titulo: 'CATEGORÍA', campo: 'categoria', x: 110, width: 90 },
                { titulo: 'DESCRIPCIÓN', campo: 'descripcion', x: 205, width: 245 },
                { titulo: 'MONTO (BS)', campo: 'montoTexto', x: 455, width: 70, align: 'right' },
            ],
            principalesGastos.map(g => ({
                ...g,
                fechaTexto: new Date(g.fecha).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' }),
                montoTexto: g.monto.toFixed(2),
            })));

        dibujarTabla('Salarios pagados por empleado',
            [
                { titulo: 'EMPLEADO', campo: 'nombre', x: 50, width: 300 },
                { titulo: 'N° DE PAGOS', campo: 'pagos', x: 355, width: 90, align: 'right' },
                { titulo: 'TOTAL (BS)', campo: 'totalTexto', x: 450, width: 75, align: 'right' },
            ],
            data.salariosPorEmpleado.map(s => ({ ...s, totalTexto: s.total.toFixed(2) })));

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
