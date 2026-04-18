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
            WHERE DATE(fecha_venta) = CURRENT_DATE
        `);
        
        // Compras del mes
        const comprasResult = await pool.query(`
            SELECT COALESCE(SUM(total), 0) AS total 
            FROM compras 
            WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
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

        // Enviamos todo al Frontend
        res.json({
            ventasDia: parseFloat(ventasResult.rows[0].total).toFixed(2),
            comprasMes: parseFloat(comprasResult.rows[0].total).toFixed(2),
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
            SELECT EXTRACT(HOUR FROM fecha_venta) as hora, 
                   COUNT(*) as ventas_cont, 
                   SUM(total) as ingresos
            FROM ventas
            GROUP BY hora
            ORDER BY hora ASC
        `);

        res.json({
            bcg: bcgResult.rows,
            horas: horasResult.rows
        });

    } catch (error) {
        console.error('Error en stats avanzadas:', error);
        res.status(500).json({ error: 'Error al procesar estadísticas' });
    }
});

// Exportamos el router para que server.js lo pueda usar
module.exports = router;