// backend/routes/almacen.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener todos los insumos (Tabla superior)
router.get('/insumos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre, unidad_medida, stock_actual, stock_minimo, activo 
            FROM insumos 
            ORDER BY nombre ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo insumos:', error);
        res.status(500).json({ error: 'Error al cargar el inventario' });
    }
});

// 2. Registrar un Ajuste Rápido (+ / -)
router.post('/ajuste', async (req, res) => {
    const { insumo_id, tipo, cantidad } = req.body;
    
    if (!insumo_id || !tipo || !cantidad || cantidad <= 0) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }
    
    const cliente = await pool.connect(); 
    try {
        await cliente.query('BEGIN'); 
        
        const cantidadReal = tipo === 'MERMA' ? -Math.abs(cantidad) : Math.abs(cantidad);
        
        const updateResult = await cliente.query(`
            UPDATE insumos 
            SET stock_actual = stock_actual + $1 
            WHERE id = $2 
            RETURNING stock_actual
        `, [cantidadReal, insumo_id]);
        
        if (updateResult.rowCount === 0) throw new Error('Insumo no encontrado');
        if (updateResult.rows[0].stock_actual < 0) throw new Error('Stock insuficiente');

        await cliente.query(`
            INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, fecha) 
            VALUES ($1, $2, $3, NOW())
        `, [insumo_id, tipo, Math.abs(cantidad)]);

        await cliente.query('COMMIT'); 
        res.json({ mensaje: 'Ajuste registrado', nuevoStock: updateResult.rows[0].stock_actual });
    } catch (error) {
        await cliente.query('ROLLBACK'); 
        res.status(400).json({ error: error.message });
    } finally {
        cliente.release(); 
    }
});

// 3. Crear un NUEVO Insumo (Botón Naranja)
router.post('/', async (req, res) => {
    const { nombre, unidad_medida, stock_inicial, stock_minimo } = req.body;
    
    if (!nombre || !unidad_medida) {
        return res.status(400).json({ error: 'El nombre y unidad son obligatorios' });
    }

    const cliente = await pool.connect();

    try {
        await cliente.query('BEGIN'); // Iniciamos transacción segura

        // Crear el insumo
        const insertInsumo = await cliente.query(`
            INSERT INTO insumos (nombre, unidad_medida, stock_actual, stock_minimo) 
            VALUES ($1, $2, $3, $4) 
            RETURNING *
        `, [nombre, unidad_medida, stock_inicial || 0, stock_minimo || 0]);
        
        const nuevoInsumo = insertInsumo.rows[0];

        // Si le pusieron stock inicial mayor a 0, registrarlo en el historial
        if (stock_inicial > 0) {
            await cliente.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, fecha) 
                VALUES ($1, 'COMPRA', $2, NOW())
            `, [nuevoInsumo.id, stock_inicial]);
        }

        await cliente.query('COMMIT'); // Guardamos todo
        res.json({ mensaje: 'Insumo creado con éxito', insumo: nuevoInsumo });

    } catch (error) {
        await cliente.query('ROLLBACK'); // Si algo falla, deshacemos
        console.error('Error creando insumo:', error);
        res.status(500).json({ error: 'Error al guardar el insumo' });
    } finally {
        cliente.release();
    }
});

// 4. Obtener el historial de movimientos (Tabla inferior)
router.get('/movimientos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                m.id, 
                i.nombre AS insumo, 
                m.tipo, 
                m.cantidad, 
                TO_CHAR(m.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI:SS') AS fecha_hora            FROM movimientos_inventario m
            JOIN insumos i ON m.insumo_id = i.id
            ORDER BY m.fecha DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al cargar el historial' });
    }
});

module.exports = router;