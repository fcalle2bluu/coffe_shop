// backend/routes/inventario.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener KPIs, datos para gráficas y lista de auditoría en una sola llamada
router.get('/dashboard', async (req, res) => {
    try {
        // KPIs Básicos
        const totalRes = await pool.query('SELECT COUNT(*) FROM insumos WHERE activo = TRUE');
        const alertasRes = await pool.query('SELECT COUNT(*) FROM insumos WHERE activo = TRUE AND stock_actual <= stock_minimo');

        // Datos para Gráfica 1: Top 5 Insumos con más stock
        const topStockRes = await pool.query(`
            SELECT nombre, stock_actual 
            FROM insumos WHERE activo = TRUE 
            ORDER BY stock_actual DESC LIMIT 5
        `);

        // Datos para Gráfica 2: Distribución de Movimientos (Últimos 30 días)
        const movimientosRes = await pool.query(`
            SELECT tipo, COUNT(*) as total 
            FROM movimientos_inventario 
            WHERE fecha >= NOW() - INTERVAL '30 days'
            GROUP BY tipo
        `);

        // Lista completa para la tabla de Auditoría (Conteo Físico)
        const insumosRes = await pool.query(`
            SELECT id, nombre, stock_actual, unidad_medida 
            FROM insumos 
            WHERE activo = TRUE 
            ORDER BY nombre ASC
        `);

        res.json({
            kpis: {
                totalInsumos: totalRes.rows[0].count,
                alertasStock: alertasRes.rows[0].count
            },
            graficas: {
                topStock: topStockRes.rows,
                movimientos: movimientosRes.rows
            },
            auditoria: insumosRes.rows
        });

    } catch (error) {
        console.error('Error al cargar dashboard de inventario:', error);
        res.status(500).json({ error: 'Error al cargar los datos' });
    }
});

// 2. Procesar Auditoría (Ajuste Masivo)
router.post('/auditoria', async (req, res) => {
    const { ajustes } = req.body; // Array de { id, fisico, diferencia }
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (let item of ajustes) {
            if (item.diferencia !== 0) {
                // Si la diferencia es negativa (faltan cosas) es MERMA, si es positiva es AJUSTE (sobrante)
                const tipoMovimiento = item.diferencia < 0 ? 'MERMA' : 'AJUSTE';
                const cantidadAbsoluta = Math.abs(item.diferencia);

                // 1. Actualizar el stock real en la tabla insumos
                await client.query('UPDATE insumos SET stock_actual = $1 WHERE id = $2', [item.fisico, item.id]);

                // 2. Dejar el historial del movimiento
                await client.query(`
                    INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, fecha) 
                    VALUES ($1, $2, $3, NOW())
                `, [item.id, tipoMovimiento, cantidadAbsoluta]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Auditoría aplicada con éxito. Stock actualizado.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en auditoría:', error);
        res.status(500).json({ error: 'Error al procesar la auditoría' });
    } finally {
        client.release();
    }
});

module.exports = router;