// backend/routes/kpis.js
const express = require('express');
const router = express.Router();

// Importamos la conexión (subimos un nivel con '..' y entramos a config)
const pool = require('../config/conexion');

// Como en server.js ya le diremos que esta ruta es '/api/kpis', aquí solo usamos '/'
router.get('/', async (req, res) => {
    try {
        // Ventas del día
        const ventasResult = await pool.query(`
            SELECT COALESCE(SUM(total), 0) AS total 
            FROM ventas 
            WHERE DATE(fecha_venta AT TIME ZONE 'America/La_Paz') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date
        `);
        
        // Ventas del mes
        const ventasMesResult = await pool.query(`
            SELECT COALESCE(SUM(total), 0) AS total 
            FROM ventas 
            WHERE EXTRACT(MONTH FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `);

        // Compras del mes
        const comprasResult = await pool.query(`
            SELECT COALESCE(SUM(total), 0) AS total 
            FROM compras 
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `);

        // Gastos de caja del mes
        const gastosCajaResult = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) AS total 
            FROM gastos_caja 
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `);

        // Gastos generales del mes
        const gastosGeneralesResult = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) AS total 
            FROM gastos_generales 
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `);

        // Total de Proveedores
        const proveedoresResult = await pool.query(`
            SELECT COUNT(*) AS total 
            FROM proveedores
        `);

        // Productos registrados
        const productosResult = await pool.query(`
            SELECT COUNT(*) AS total 
            FROM productos
        `);

        const ventasDia = parseFloat(ventasResult.rows[0].total) || 0;
        const ventasMes = parseFloat(ventasMesResult.rows[0].total) || 0;
        const compras = parseFloat(comprasResult.rows[0].total) || 0;
        const gastosCaja = parseFloat(gastosCajaResult.rows[0].total) || 0;
        const gastosGenerales = parseFloat(gastosGeneralesResult.rows[0].total) || 0;
        const totalGastos = compras + gastosCaja + gastosGenerales;

        // Enviamos todo al Frontend
        res.json({
            ventasDia: ventasDia.toFixed(2),
            ventasMes: ventasMes.toFixed(2),
            gastosMes: totalGastos.toFixed(2),
            comprasMes: compras.toFixed(2),
            proveedores: proveedoresResult.rows[0].total,
            productos: productosResult.rows[0].total
        });

    } catch (error) {
        console.error('Error obteniendo KPIs:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// [NUEVO] Estadísticas avanzadas para gráficos
router.get('/stats-avanzadas', async (req, res) => {
    try {
        // 1. Matriz BCG (Rendimiento de Productos)
        const bcgResult = await pool.query(`
            SELECT p.nombre, 
                   SUM(dv.cantidad) as volumen, 
                   SUM(dv.subtotal) as ingresos
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            GROUP BY p.nombre
            ORDER BY ingresos DESC
            LIMIT 15
        `);

        // 2. Horas Pico (Agrupado por hora)
        const horasResult = await pool.query(`
            SELECT EXTRACT(HOUR FROM fecha_venta AT TIME ZONE 'America/La_Paz') as hora, 
                   COUNT(*) as ventas_cont, 
                   SUM(total) as ingresos
            FROM ventas
            GROUP BY hora
            ORDER BY hora ASC
        `);

        // 3. Rendimiento Mensual (Ventas vs Compras/Gastos de los últimos 6 meses)
        const rendimientoResult = await pool.query(`
            SELECT 
                EXTRACT(MONTH FROM m.month) AS mes,
                EXTRACT(YEAR FROM m.month) AS anio,
                COALESCE(v.total, 0) AS ventas,
                COALESCE(c.total, 0) AS compras,
                (COALESCE(g_caja.total, 0) + COALESCE(g_gen.total, 0)) AS gastos
            FROM (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '6 months',
                    CURRENT_DATE,
                    INTERVAL '1 month'
                )::date AS month
            ) m
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM fecha_venta) AS mes, 
                    EXTRACT(YEAR FROM fecha_venta) AS anio,
                    SUM(total) AS total
                FROM ventas
                GROUP BY mes, anio
            ) v ON EXTRACT(MONTH FROM m.month) = v.mes AND EXTRACT(YEAR FROM m.month) = v.anio
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM fecha) AS mes, 
                    EXTRACT(YEAR FROM fecha) AS anio,
                    SUM(total) AS total
                FROM compras
                GROUP BY mes, anio
            ) c ON EXTRACT(MONTH FROM m.month) = c.mes AND EXTRACT(YEAR FROM m.month) = c.anio
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM fecha) AS mes, 
                    EXTRACT(YEAR FROM fecha) AS anio,
                    SUM(monto) AS total
                FROM gastos_caja
                GROUP BY mes, anio
            ) g_caja ON EXTRACT(MONTH FROM m.month) = g_caja.mes AND EXTRACT(YEAR FROM m.month) = g_caja.anio
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM fecha) AS mes, 
                    EXTRACT(YEAR FROM fecha) AS anio,
                    SUM(monto) AS total
                FROM gastos_generales
                GROUP BY mes, anio
            ) g_gen ON EXTRACT(MONTH FROM m.month) = g_gen.mes AND EXTRACT(YEAR FROM m.month) = g_gen.anio
            ORDER BY anio ASC, mes ASC
        `);

        res.json({
            bcg: bcgResult.rows,
            horas: horasResult.rows,
            rendimiento: rendimientoResult.rows
        });

    } catch (error) {
        console.error('Error en stats avanzadas:', error);
        res.status(500).json({ error: 'Error al procesar estadísticas' });
    }
});

// [NUEVO] Productos más vendidos con filtro de tiempo
router.get('/productos-mas-vendidos', async (req, res) => {
    const { filtro } = req.query;
    
    let query = `
        SELECT p.nombre, 
               COALESCE(SUM(dv.cantidad), 0) as total_vendido
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        JOIN ventas v ON dv.venta_id = v.id
    `;
    
    const conditions = [];

    if (filtro === 'hoy') {
        conditions.push(`DATE(v.fecha_venta) = CURRENT_DATE`);
    } else if (filtro === 'semana') {
        conditions.push(`v.fecha_venta >= CURRENT_DATE - INTERVAL '7 days'`);
    } else if (filtro === 'mes') {
        conditions.push(`v.fecha_venta >= CURRENT_DATE - INTERVAL '30 days'`);
    } else if (filtro === 'anio') {
        conditions.push(`v.fecha_venta >= CURRENT_DATE - INTERVAL '365 days'`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
        GROUP BY p.nombre
        ORDER BY total_vendido DESC
        LIMIT 10
    `;

    try {
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener productos más vendidos:', error);
        res.status(500).json({ error: 'Error al procesar consulta de productos más vendidos' });
    }
});

// Endpoint Gerencial para Semáforo y Punto de Equilibrio
router.get('/gerencial', async (req, res) => {
    try {
        const queryVentas = `
            SELECT COALESCE(SUM(total), 0) AS total 
            FROM ventas 
            WHERE EXTRACT(MONTH FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;
        const queryCompras = `
            SELECT COALESCE(SUM(total), 0) AS total 
            FROM compras 
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;
        const queryGastosCaja = `
            SELECT COALESCE(SUM(monto), 0) AS total 
            FROM gastos_caja 
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;
        const queryGastosGenerales = `
            SELECT COALESCE(SUM(monto), 0) AS total 
            FROM gastos_generales 
            WHERE EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;
        const queryGastosFijos = `
            SELECT COALESCE(SUM(monto), 0) AS total 
            FROM gastos_generales 
            WHERE categoria = 'Gastos Fijos'
              AND EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz') = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;

        const [ventasRes, comprasRes, gastosCajaRes, gastosGeneralesRes, gastosFijosRes] = await Promise.all([
            pool.query(queryVentas),
            pool.query(queryCompras),
            pool.query(queryGastosCaja),
            pool.query(queryGastosGenerales),
            pool.query(queryGastosFijos)
        ]);

        const ingresos = parseFloat(ventasRes.rows[0].total) || 0;
        const egresosCompras = parseFloat(comprasRes.rows[0].total) || 0;
        const egresosCaja = parseFloat(gastosCajaRes.rows[0].total) || 0;
        const egresosGenerales = parseFloat(gastosGeneralesRes.rows[0].total) || 0;
        
        const egresos = egresosCompras + egresosCaja + egresosGenerales;
        const balance = ingresos - egresos;

        // Semáforo: Rojo si negativo, Amarillo si neutro o ganancia muy baja (< 200), Verde si > 200
        let semaforoColor = 'VERDE';
        if (balance < 0) {
            semaforoColor = 'ROJO';
        } else if (balance <= 200) {
            semaforoColor = 'AMARILLO';
        }

        // Punto de Equilibrio: comparamos Gastos Fijos con Ingresos
        const gastosFijosTarget = parseFloat(gastosFijosRes.rows[0].total) || 1000.00;
        const cubiertoPorcentaje = gastosFijosTarget > 0 
            ? Math.min(Math.round((ingresos / gastosFijosTarget) * 100), 100) 
            : 100;

        res.json({
            ingresos: ingresos.toFixed(2),
            egresos: egresos.toFixed(2),
            balance: balance.toFixed(2),
            semaforoColor: semaforoColor,
            gastosFijos: gastosFijosTarget.toFixed(2),
            puntoEquilibrioPorcentaje: cubiertoPorcentaje
        });
    } catch (error) {
        console.error('Error al generar KPI gerencial:', error);
        res.status(500).json({ error: 'Error al generar KPI gerencial: ' + error.message });
    }
});

// Exportamos el router para que server.js lo pueda usar
module.exports = router;