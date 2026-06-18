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

        // Salarios pagados del mes
        const salariosResult = await pool.query(`
            SELECT COALESCE(SUM(salario_neto), 0) AS total 
            FROM pagos_salarios 
            WHERE mes = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND anio = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
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
        const salarios = parseFloat(salariosResult.rows[0].total) || 0;
        const totalGastos = compras + gastosCaja + gastosGenerales + salarios;

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

// [NUEVO] Endpoint para Rendimiento Mensual parametrizado y con zona horaria local exacta
router.get('/rendimiento-mensual', async (req, res) => {
    try {
        let meses = parseInt(req.query.meses) || 6;
        const incluirHistoricas = req.query.incluir_historicas === 'true';

        if (![3, 6, 12].includes(meses)) {
            meses = 6;
        }

        const ventasFilter = incluirHistoricas ? '' : 'WHERE es_historica = FALSE';

        const query = `
            SELECT 
                EXTRACT(MONTH FROM m.month) AS mes,
                EXTRACT(YEAR FROM m.month) AS anio,
                COALESCE(v.total, 0) AS ventas,
                COALESCE(c.total, 0) AS compras,
                (COALESCE(g_caja.total, 0) + COALESCE(g_gen.total, 0) + COALESCE(sal.total, 0)) AS gastos
            FROM (
                SELECT (generate_series(
                    DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz') - INTERVAL '${meses - 1} months',
                    DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz'),
                    INTERVAL '1 month'
                ))::date AS month
            ) m
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM (fecha_venta AT TIME ZONE 'America/La_Paz')) AS mes, 
                    EXTRACT(YEAR FROM (fecha_venta AT TIME ZONE 'America/La_Paz')) AS anio,
                    SUM(total) AS total
                FROM ventas
                ${ventasFilter}
                GROUP BY mes, anio
            ) v ON EXTRACT(MONTH FROM m.month) = v.mes AND EXTRACT(YEAR FROM m.month) = v.anio
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/La_Paz')) AS mes, 
                    EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/La_Paz')) AS anio,
                    SUM(total) AS total
                FROM compras
                GROUP BY mes, anio
            ) c ON EXTRACT(MONTH FROM m.month) = c.mes AND EXTRACT(YEAR FROM m.month) = c.anio
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/La_Paz')) AS mes, 
                    EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/La_Paz')) AS anio,
                    SUM(monto) AS total
                FROM gastos_caja
                GROUP BY mes, anio
            ) g_caja ON EXTRACT(MONTH FROM m.month) = g_caja.mes AND EXTRACT(YEAR FROM m.month) = g_caja.anio
            LEFT JOIN (
                SELECT 
                    EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/La_Paz')) AS mes, 
                    EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/La_Paz')) AS anio,
                    SUM(monto) AS total
                FROM gastos_generales
                GROUP BY mes, anio
            ) g_gen ON EXTRACT(MONTH FROM m.month) = g_gen.mes AND EXTRACT(YEAR FROM m.month) = g_gen.anio
            LEFT JOIN (
                SELECT 
                    mes,
                    anio,
                    SUM(salario_neto) AS total
                FROM pagos_salarios
                GROUP BY mes, anio
            ) sal ON EXTRACT(MONTH FROM m.month) = sal.mes AND EXTRACT(YEAR FROM m.month) = sal.anio
            ORDER BY anio ASC, mes ASC
        `;

        const result = await pool.query(query);
        res.json(result.rows);

    } catch (error) {
        console.error('Error al obtener rendimiento mensual:', error);
        res.status(500).json({ error: 'Error al procesar consulta de rendimiento mensual' });
    }
});

// [NUEVO] Actividad Semanal de Ventas (domingo a sábado)
router.get('/ventas-semanal', async (req, res) => {
    try {
        const { fecha_inicio } = req.query; // YYYY-MM-DD format (domingo)
        if (!fecha_inicio) {
            return res.status(400).json({ error: 'La fecha de inicio de la semana (domingo) es requerida.' });
        }

        const query = `
            SELECT 
                d.dia::date as fecha,
                EXTRACT(DOW FROM d.dia) as dia_semana,
                COALESCE(v.total, 0) as total
            FROM (
                SELECT ($1::date + i.n)::date as dia
                FROM generate_series(0, 6) i(n)
            ) d
            LEFT JOIN (
                SELECT 
                    (fecha_venta AT TIME ZONE 'America/La_Paz')::date as fecha,
                    SUM(total) as total
                FROM ventas
                WHERE es_historica = FALSE
                GROUP BY fecha
            ) v ON d.dia = v.fecha
            ORDER BY d.dia ASC
        `;

        const result = await pool.query(query, [fecha_inicio]);
        res.json(result.rows);

    } catch (error) {
        console.error('Error al obtener ventas semanales:', error);
        res.status(500).json({ error: 'Error al procesar consulta de ventas semanales' });
    }
});

// [NUEVO] Desglose de Ventas por Categoría para un día específico
router.get('/ventas-dia-detalle', async (req, res) => {
    try {
        const { fecha } = req.query; // YYYY-MM-DD
        if (!fecha) {
            return res.status(400).json({ error: 'La fecha es requerida.' });
        }

        const query = `
            SELECT 
                c.nombre as categoria, 
                COALESCE(SUM(dv.subtotal), 0) as total
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN categorias c ON p.categoria_id = c.id
            JOIN ventas v ON dv.venta_id = v.id
            WHERE (v.fecha_venta AT TIME ZONE 'America/La_Paz')::date = $1::date
              AND v.es_historica = FALSE
            GROUP BY c.nombre
            ORDER BY total DESC
        `;

        const result = await pool.query(query, [fecha]);
        res.json(result.rows);

    } catch (error) {
        console.error('Error al obtener detalle de ventas del día:', error);
        res.status(500).json({ error: 'Error al procesar consulta de detalle de ventas del día' });
    }
});

// [NUEVO] Estadísticas avanzadas para gráficos
router.get('/stats-avanzadas', async (req, res) => {
    try {
        const { fecha } = req.query; // YYYY-MM-DD o vacío/historico
        let params = [];
        let filterBCG = '';
        let filterHoras = '';
        
        if (fecha && fecha !== 'historico') {
            filterBCG = ` AND (v.fecha_venta AT TIME ZONE 'America/La_Paz')::date = $1::date `;
            filterHoras = ` AND (fecha_venta AT TIME ZONE 'America/La_Paz')::date = $1::date `;
            params = [fecha];
        }

        // 1. Matriz BCG (Rendimiento de Productos)
        const bcgResult = await pool.query(`
            SELECT p.nombre, 
                   SUM(dv.cantidad) as volumen, 
                   SUM(dv.subtotal) as ingresos
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN ventas v ON dv.venta_id = v.id
            WHERE v.es_historica = FALSE ${filterBCG}
            GROUP BY p.nombre
            ORDER BY ingresos DESC
            LIMIT 15
        `, params);

        // 2. Horas Pico (Agrupado por hora)
        const horasResult = await pool.query(`
            SELECT EXTRACT(HOUR FROM fecha_venta AT TIME ZONE 'America/La_Paz') as hora, 
                   COUNT(*) as ventas_cont, 
                   SUM(total) as ingresos
            FROM ventas
            WHERE es_historica = FALSE ${filterHoras}
            GROUP BY hora
            ORDER BY hora ASC
        `, params);

        // 3. Ventas por Categoría (Nuevo para el Dashboard)
        const categoriasResult = await pool.query(`
            SELECT c.nombre as categoria, COALESCE(SUM(dv.subtotal), 0) as total
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN categorias c ON p.categoria_id = c.id
            JOIN ventas v ON dv.venta_id = v.id
            WHERE v.es_historica = FALSE ${filterBCG}
            GROUP BY c.nombre
            ORDER BY total DESC
        `, params);

        // 4. Todos los productos vendidos por hora (ordenados de más a menos vendido)
        const topProductosHoraResult = await pool.query(`
            SELECT EXTRACT(HOUR FROM v.fecha_venta AT TIME ZONE 'America/La_Paz') as hora,
                   p.nombre as producto,
                   SUM(dv.cantidad) as total_qty
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            JOIN ventas v ON dv.venta_id = v.id
            WHERE v.es_historica = FALSE ${filterBCG}
            GROUP BY hora, producto
            ORDER BY hora ASC, total_qty DESC;
        `, params);

        res.json({
            bcg: bcgResult.rows,
            horas: horasResult.rows,
            categorias: categoriasResult.rows,
            productosHora: topProductosHoraResult.rows
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
    
    const conditions = ['v.es_historica = FALSE'];

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

// [NUEVO] Obtener top productos filtrados por tiempo y métrica
router.get('/top-productos', async (req, res) => {
    const { filtro, metrica } = req.query; // filtro: hoy, semana, mes, anio, hora, todos. metrica: dinero, cantidad
    
    let orderCol = metrica === 'dinero' ? 'total_dinero' : 'total_cantidad';
    
    let query = `
        SELECT p.nombre, 
               COALESCE(SUM(dv.cantidad), 0) as total_cantidad,
               COALESCE(SUM(dv.subtotal), 0) as total_dinero
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        JOIN ventas v ON dv.venta_id = v.id
        WHERE v.es_historica = FALSE
    `;
    
    const conditions = [];

    if (filtro === 'hora') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`);
    } else if (filtro === 'hoy') {
        conditions.push(`DATE(v.fecha_venta AT TIME ZONE 'America/La_Paz') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date`);
    } else if (filtro === 'semana') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '7 days'`);
    } else if (filtro === 'mes') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '30 days'`);
    } else if (filtro === 'anio') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '365 days'`);
    }

    if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
    }

    query += `
        GROUP BY p.nombre
        ORDER BY ${orderCol} DESC
        LIMIT 10
    `;

    try {
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener top productos:', error);
        res.status(500).json({ error: 'Error al procesar consulta de top productos' });
    }
});

// [NUEVO] Obtener ventas por categoría filtradas por tiempo y métrica
router.get('/ventas-categoria', async (req, res) => {
    const { filtro, metrica } = req.query; // filtro: hoy, semana, mes, anio, hora, todos. metrica: dinero, cantidad
    
    let orderCol = metrica === 'dinero' ? 'total_dinero' : 'total_cantidad';
    
    let query = `
        SELECT c.nombre as categoria, 
               COALESCE(SUM(dv.cantidad), 0) as total_cantidad,
               COALESCE(SUM(dv.subtotal), 0) as total_dinero
        FROM detalle_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        JOIN categorias c ON p.categoria_id = c.id
        JOIN ventas v ON dv.venta_id = v.id
        WHERE v.es_historica = FALSE
    `;
    
    const conditions = [];

    if (filtro === 'hora') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`);
    } else if (filtro === 'hoy') {
        conditions.push(`DATE(v.fecha_venta AT TIME ZONE 'America/La_Paz') = (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date`);
    } else if (filtro === 'semana') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '7 days'`);
    } else if (filtro === 'mes') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '30 days'`);
    } else if (filtro === 'anio') {
        conditions.push(`v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '365 days'`);
    }

    if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
    }

    query += `
        GROUP BY c.nombre
        ORDER BY ${orderCol} DESC
    `;

    try {
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener ventas por categoria:', error);
        res.status(500).json({ error: 'Error al procesar consulta de ventas por categoria' });
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

        const querySalarios = `
            SELECT COALESCE(SUM(salario_neto), 0) AS total 
            FROM pagos_salarios 
            WHERE mes = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND anio = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;

        const [ventasRes, comprasRes, gastosCajaRes, gastosGeneralesRes, gastosFijosRes, salariosRes] = await Promise.all([
            pool.query(queryVentas),
            pool.query(queryCompras),
            pool.query(queryGastosCaja),
            pool.query(queryGastosGenerales),
            pool.query(queryGastosFijos),
            pool.query(querySalarios)
        ]);

        const ingresos = parseFloat(ventasRes.rows[0].total) || 0;
        const egresosCompras = parseFloat(comprasRes.rows[0].total) || 0;
        const egresosCaja = parseFloat(gastosCajaRes.rows[0].total) || 0;
        const egresosGenerales = parseFloat(gastosGeneralesRes.rows[0].total) || 0;
        const egresosSalarios = parseFloat(salariosRes.rows[0].total) || 0;
        
        const egresos = egresosCompras + egresosCaja + egresosGenerales + egresosSalarios;
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

// Endpoint para ver el desglose detallado de los egresos/gastos del mes
router.get('/breakdown', async (req, res) => {
    try {
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

        const querySalarios = `
            SELECT COALESCE(SUM(salario_neto), 0) AS total 
            FROM pagos_salarios 
            WHERE mes = EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
              AND anio = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')
        `;

        const [comprasRes, gastosCajaRes, gastosGeneralesRes, salariosRes] = await Promise.all([
            pool.query(queryCompras),
            pool.query(queryGastosCaja),
            pool.query(queryGastosGenerales),
            pool.query(querySalarios)
        ]);

        const compras = parseFloat(comprasRes.rows[0].total) || 0;
        const gastosCaja = parseFloat(gastosCajaRes.rows[0].total) || 0;
        const gastosGenerales = parseFloat(gastosGeneralesRes.rows[0].total) || 0;
        const salarios = parseFloat(salariosRes.rows[0].total) || 0;

        res.json({
            compras: compras.toFixed(2),
            gastosCaja: gastosCaja.toFixed(2),
            gastosGenerales: gastosGenerales.toFixed(2),
            salarios: salarios.toFixed(2),
            totalEgresos: (compras + gastosCaja + gastosGenerales + salarios).toFixed(2)
        });
    } catch (error) {
        console.error('Error en desglose de KPIs:', error);
        res.status(500).json({ error: 'Error al obtener desglose de egresos' });
    }
});

// Exportamos el router para que server.js lo pueda usar
module.exports = router;