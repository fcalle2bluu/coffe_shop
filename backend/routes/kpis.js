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

// [NUEVO] Endpoint para obtener la lista de meses y años con datos
router.get('/meses-disponibles', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT anio, mes
            FROM (
                SELECT EXTRACT(YEAR FROM fecha_venta AT TIME ZONE 'America/La_Paz')::integer AS anio,
                       EXTRACT(MONTH FROM fecha_venta AT TIME ZONE 'America/La_Paz')::integer AS mes
                FROM ventas
                UNION
                SELECT EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz')::integer AS anio,
                       EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz')::integer AS mes
                FROM compras
                UNION
                SELECT EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz')::integer AS anio,
                       EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz')::integer AS mes
                FROM gastos_caja
                UNION
                SELECT EXTRACT(YEAR FROM fecha AT TIME ZONE 'America/La_Paz')::integer AS anio,
                       EXTRACT(MONTH FROM fecha AT TIME ZONE 'America/La_Paz')::integer AS mes
                FROM gastos_generales
                UNION
                SELECT anio::integer AS anio, mes::integer AS mes FROM pagos_salarios
            ) t
            WHERE anio IS NOT NULL AND mes IS NOT NULL
            ORDER BY anio DESC, mes DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener meses disponibles:', error);
        res.status(500).json({ error: 'Error al obtener meses disponibles' });
    }
});

// [NUEVO] Endpoint para Rendimiento Mensual con granularidad diaria de un mes seleccionado (incluye ventas históricas)
router.get('/rendimiento-mensual', async (req, res) => {
    try {
        const mes = parseInt(req.query.mes);
        const anio = parseInt(req.query.anio);

        if (!mes || !anio || isNaN(mes) || isNaN(anio)) {
            return res.status(400).json({ error: 'El mes y año son requeridos y deben ser numéricos.' });
        }

        const startStr = `${anio}-${String(mes).padStart(2, '0')}-01`;
        
        // Obtenemos los salarios totales pagados del mes/año para distribuirlos por día de forma proporcional
        const salariosResult = await pool.query(
            `SELECT COALESCE(SUM(salario_neto), 0) AS total FROM pagos_salarios WHERE mes = $1 AND anio = $2`,
            [mes, anio]
        );
        const totalSalarios = parseFloat(salariosResult.rows[0].total) || 0;
        
        const daysInMonth = new Date(anio, mes, 0).getDate();
        const diarioSalario = totalSalarios / daysInMonth;

        const query = `
            WITH days AS (
                SELECT (generate_series(
                    $1::date,
                    ($1::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
                    INTERVAL '1 day'
                ))::date AS fecha
            )
            SELECT 
                EXTRACT(DAY FROM d.fecha)::integer AS dia,
                COALESCE(v.total, 0) AS ventas,
                COALESCE(g_caja.total, 0) AS caja_chica,
                COALESCE(g_gen.total, 0) AS libro_diario_gastos
            FROM days d
            LEFT JOIN (
                SELECT 
                    (fecha_venta AT TIME ZONE 'America/La_Paz')::date AS fecha_dia,
                    SUM(total) AS total
                FROM ventas
                GROUP BY (fecha_venta AT TIME ZONE 'America/La_Paz')::date
            ) v ON d.fecha = v.fecha_dia
            LEFT JOIN (
                SELECT 
                    (fecha AT TIME ZONE 'America/La_Paz')::date AS fecha_dia,
                    SUM(monto) AS total
                FROM gastos_caja
                GROUP BY (fecha AT TIME ZONE 'America/La_Paz')::date
            ) g_caja ON d.fecha = g_caja.fecha_dia
            LEFT JOIN (
                SELECT 
                    (fecha AT TIME ZONE 'America/La_Paz')::date AS fecha_dia,
                    SUM(monto) AS total
                FROM gastos_generales
                GROUP BY (fecha AT TIME ZONE 'America/La_Paz')::date
            ) g_gen ON d.fecha = g_gen.fecha_dia
            ORDER BY dia ASC
        `;

        const result = await pool.query(query, [startStr]);
        
        const rows = result.rows.map(r => {
            const ventas = parseFloat(r.ventas) || 0;
            const cajaChica = parseFloat(r.caja_chica) || 0;
            const libroDiarioGastos = parseFloat(r.libro_diario_gastos) || 0;
            const libroDiario = libroDiarioGastos + diarioSalario;
            return {
                dia: r.dia,
                ventas: ventas.toFixed(2),
                caja_chica: cajaChica.toFixed(2),
                libro_diario: libroDiario.toFixed(2)
            };
        });

        res.json(rows);

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
            SELECT id, monto, descripcion, fecha,
                   TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI:SS') as fecha_bolivia
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

// [NUEVO] Endpoint para Análisis de Combos y Afinidad de Compra (Market Basket Analysis)
router.get('/analisis-combos', async (req, res) => {
    try {
        const dias = req.query.dias || 'all';
        let timeFilter = '';
        let params = [];

        if (dias !== 'all') {
            const numDias = parseInt(dias) || 30;
            timeFilter = ` AND v.fecha_venta >= CURRENT_TIMESTAMP - INTERVAL '${numDias} days' `;
        }

        // 1. Obtener total de tickets e ingresos en el período
        const totalTicketsResult = await pool.query(`
            SELECT 
                COUNT(v.id) AS total_tickets,
                COALESCE(SUM(v.total), 0) AS total_revenue
            FROM ventas v
            WHERE 1=1 ${timeFilter}
        `, params);
        const totalTickets = parseInt(totalTicketsResult.rows[0].total_tickets) || 1;
        const totalRevenue = parseFloat(totalTicketsResult.rows[0].total_revenue) || 0;

        // 2. Obtener estadísticas de tickets multiproducto (2+ items)
        const multiQuery = `
            WITH ticket_counts AS (
                SELECT 
                    dv.venta_id,
                    SUM(dv.cantidad) AS total_qty
                FROM detalle_ventas dv
                JOIN ventas v ON dv.venta_id = v.id
                WHERE 1=1 ${timeFilter}
                GROUP BY dv.venta_id
            )
            SELECT 
                COUNT(v.id)::integer AS count,
                COALESCE(AVG(v.total), 0)::numeric AS avg_total
            FROM ventas v
            JOIN ticket_counts tc ON v.id = tc.venta_id
            WHERE tc.total_qty >= 2
        `;
        const multiRes = await pool.query(multiQuery, params);
        const multiproductCount = parseInt(multiRes.rows[0].count) || 0;
        const multiproductAvg = parseFloat(multiRes.rows[0].avg_total) || 0;

        // 3. Obtener promedio de ticket monoproducto (1 item)
        const monoQuery = `
            WITH ticket_counts AS (
                SELECT 
                    dv.venta_id,
                    SUM(dv.cantidad) AS total_qty
                FROM detalle_ventas dv
                JOIN ventas v ON dv.venta_id = v.id
                WHERE 1=1 ${timeFilter}
                GROUP BY dv.venta_id
            )
            SELECT 
                COALESCE(AVG(v.total), 0)::numeric AS avg_total
            FROM ventas v
            JOIN ticket_counts tc ON v.id = tc.venta_id
            WHERE tc.total_qty = 1
        `;
        const monoRes = await pool.query(monoQuery, params);
        const monoproductAvg = parseFloat(monoRes.rows[0].avg_total) || 0;

        // 4. Obtener lista de productos con su volumen de ventas en el período
        const prodQuery = `
            SELECT 
                p.id,
                p.nombre AS name,
                p.precio_venta AS precio,
                p.categoria_id,
                c.nombre AS categoria,
                COALESCE(vol.qty, 0)::integer AS vol_qty,
                COALESCE(vol.tickets, 0)::integer AS freq
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN (
                SELECT 
                    dv.producto_id,
                    SUM(dv.cantidad) AS qty,
                    COUNT(DISTINCT dv.venta_id) AS tickets
                FROM detalle_ventas dv
                JOIN ventas v ON dv.venta_id = v.id
                WHERE 1=1 ${timeFilter}
                GROUP BY dv.producto_id
            ) vol ON p.id = vol.producto_id
            WHERE p.activo = true
        `;
        const productsRes = await pool.query(prodQuery, params);
        const products = productsRes.rows;

        // Si no hay productos o ventas, retornar vacío
        if (products.length === 0) {
            return res.json({ products: [], top20: [], affinityPairs: [], futureCombos: [] });
        }

        // 3. Obtener frecuencias de coocurrencia de pares de productos
        const pairQuery = `
            SELECT 
                d1.producto_id AS a_id,
                d2.producto_id AS b_id,
                COUNT(DISTINCT d1.venta_id)::integer AS pair_tickets,
                SUM(d1.subtotal + d2.subtotal)::numeric AS pair_revenue
            FROM detalle_ventas d1
            JOIN detalle_ventas d2 ON d1.venta_id = d2.venta_id AND d1.producto_id < d2.producto_id
            JOIN ventas v ON d1.venta_id = v.id
            WHERE 1=1 ${timeFilter}
            GROUP BY d1.producto_id, d2.producto_id
            ORDER BY pair_tickets DESC
        `;
        const pairsRes = await pool.query(pairQuery, params);
        const pairs = pairsRes.rows;

        // Mapear frecuencias para cálculos rápidos
        const freqMap = {};
        const nameMap = {};
        const priceMap = {};
        const categoryMap = {};
        const maxVol = Math.max(...products.map(p => p.vol_qty), 1);

        products.forEach(p => {
            freqMap[p.id] = p.freq || 0;
            nameMap[p.id] = p.name;
            priceMap[p.id] = parseFloat(p.precio) || 0;
            categoryMap[p.id] = p.categoria_id;
        });

        // 4. Calcular co-ocurrencia, confianza y lift para todos los pares
        const allPairs = pairs.map(p => {
            const fA = freqMap[p.a_id] || 0;
            const fB = freqMap[p.b_id] || 0;
            const pairTickets = p.pair_tickets;

            // Co-ocurrencia = tickets con A y B / total tickets
            const coocc = totalTickets > 0 ? (pairTickets / totalTickets * 100) : 0;
            // Confianza A -> B = tickets con A y B / tickets con A
            const confA = fA > 0 ? (pairTickets / fA * 100) : 0;
            // Confianza B -> A = tickets con A y B / tickets con B
            const confB = fB > 0 ? (pairTickets / fB * 100) : 0;
            // Lift = (pair_tickets * totalTickets) / (fA * fB)
            const lift = (fA > 0 && fB > 0) ? ((pairTickets * totalTickets) / (fA * fB)) : 1.0;

            return {
                a: String(p.a_id),
                b: String(p.b_id),
                ventas: pairTickets,
                ingreso: parseFloat(p.pair_revenue) || 0,
                coocc: parseFloat(coocc.toFixed(1)),
                conf: parseFloat(Math.max(confA, confB).toFixed(1)), // confianza de la dirección más fuerte
                lift: parseFloat(lift.toFixed(2))
            };
        });

        // Filtrar top 20 para la tabla
        const top20 = allPairs.slice(0, 20);

        // Para el mapa de afinidad, seleccionamos los 9 productos más vendidos
        const top9Products = [...products]
            .sort((x, y) => y.vol_qty - x.vol_qty)
            .slice(0, 9)
            .map(p => {
                let color = '#B8923D'; // dorado por defecto
                if (p.categoria_id === 1) color = '#C2541E'; // naranja/marrón
                else if (p.categoria_id === 2) color = '#3D7A52'; // verde
                
                return {
                    id: String(p.id),
                    name: p.name,
                    vol: Math.round((p.vol_qty / maxVol) * 100),
                    precio: parseFloat(p.precio) || 0,
                    color: color
                };
            });

        const top9Ids = new Set(top9Products.map(p => p.id));
        const affinityPairs = allPairs
            .filter(p => top9Ids.has(p.a) && top9Ids.has(p.b))
            .slice(0, 15); // limitamos a los 15 más fuertes de la constelación

        // 5. Generar combos potenciales futuros
        // Buscamos pares con alto lift y coocurrencia
        const futureCombos = allPairs
            .filter(p => p.lift > 1.0 && p.ventas >= 1) // pares con afinidad real
            .slice(0, 5) // tomamos hasta 5
            .map(p => {
                const A = nameMap[p.a];
                const B = nameMap[p.b];
                
                // Descuento sugerido según el lift (a mayor lift, mayor afinidad, podemos dar un descuento atractivo)
                const descuento = p.lift > 2.0 ? 0.15 : (p.lift > 1.5 ? 0.12 : 0.10);
                // Aumento de demanda esperado (lift esperado en el combo)
                const liftEsperado = p.lift > 2.0 ? 0.25 : (p.lift > 1.5 ? 0.20 : 0.15);

                const notas = [
                    `Excelente afinidad de consumo. Promocionarlo formalmente aumentará las ventas cruzadas.`,
                    `Frecuente combinación matutina/tarde. Ideal para un combo rápido de mostrador.`,
                    `Consumo complementario detectado. Un descuento del ${(descuento*100).toFixed(0)}% motivará la decisión de compra.`,
                    `Fuerte co-ocurrencia. Ofrecerlo como combo impulsará el ticket promedio de la tarde.`,
                    `Interesante combinación cruzada. Recomendado para promoción en carteles físicos.`
                ];
                const randomNota = notas[Math.floor(Math.random() * notas.length)];

                return {
                    a: p.a,
                    b: p.b,
                    coocc: p.coocc,
                    ventasActuales: p.ventas,
                    score: p.lift >= 2.0 ? 'high' : 'mid',
                    descuentoSugerido: descuento,
                    liftEsperado: liftEsperado,
                    nota: `Afinidad detectada entre ${A} y ${B}. ${randomNota}`
                };
            });

        // Si no se generan suficientes combos futuros, rellenamos con algunos fijos de los productos más vendidos
        if (futureCombos.length === 0 && top9Products.length >= 2) {
            const p1 = top9Products[0];
            const p2 = top9Products[1];
            futureCombos.push({
                a: p1.id,
                b: p2.id,
                coocc: 15.0,
                ventasActuales: 10,
                score: 'high',
                descuentoSugerido: 0.12,
                liftEsperado: 0.20,
                nota: `Afinidad preventiva entre ${p1.name} y ${p2.name} sugerida para impulsar ventas cruzadas.`
            });
        }

        res.json({
            kpis: {
                totalTickets,
                totalRevenue,
                multiproductCount,
                multiproductAvg,
                monoproductAvg
            },
            products: top9Products,
            top20,
            affinityPairs,
            futureCombos
        });

    } catch (error) {
        console.error('Error al calcular análisis de combos:', error);
        res.status(500).json({ error: 'Error al procesar análisis de combos contables' });
    }
});

// Exportamos el router para que server.js lo pueda usar
module.exports = router;