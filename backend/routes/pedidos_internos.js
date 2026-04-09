// backend/routes/apartados.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener la lista de pedidos (Inteligente por Rol)
router.get('/', async (req, res) => {
    const { usuario_id, rol } = req.query;

    try {
        let result;
        if (rol === 'ADMIN') {
            // El ADMIN ve TODOS los pedidos de TODOS los cajeros
            result = await pool.query(`
                SELECT p.id, p.insumo_nombre, p.cantidad, p.notas, p.estado, 
                       TO_CHAR(p.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_pedido,
                       u.nombre as solicitante
                FROM pedidos_compra p
                JOIN usuarios u ON p.usuario_id = u.id
                ORDER BY 
                    CASE p.estado WHEN 'PENDIENTE' THEN 1 ELSE 2 END, 
                    p.fecha DESC
            `);
        } else {
            // El CAJERO ve SOLO SUS PROPIOS pedidos
            result = await pool.query(`
                SELECT p.id, p.insumo_nombre, p.cantidad, p.notas, p.estado, 
                       TO_CHAR(p.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_pedido,
                       u.nombre as solicitante
                FROM pedidos_compra p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.usuario_id = $1
                ORDER BY p.fecha DESC
            `, [usuario_id]);
        }
        res.json(result.rows);
    } catch (error) {
        console.error("Error al cargar pedidos:", error);
        res.status(500).json({ error: 'Error al cargar pedidos' });
    }
});

// 2. Crear un nuevo pedido de compra
router.post('/', async (req, res) => {
    const { usuario_id, insumo_nombre, cantidad, notas } = req.body;
    
    if (!usuario_id || !insumo_nombre || !cantidad) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        await pool.query(`
            INSERT INTO pedidos_compra (usuario_id, insumo_nombre, cantidad, notas)
            VALUES ($1, $2, $3, $4)
        `, [usuario_id, insumo_nombre, cantidad, notas]);
        res.status(201).json({ message: 'Pedido creado exitosamente' });
    } catch (error) {
        console.error("Error al crear pedido:", error);
        res.status(500).json({ error: 'Error al crear pedido' });
    }
});

// 3. Cambiar estado del pedido (Solo ADMIN)
router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; // 'COMPRADO' o 'RECHAZADO'
    try {
        await pool.query('UPDATE pedidos_compra SET estado = $1 WHERE id = $2', [estado, id]);
        res.json({ message: 'Estado actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

// 4. Eliminar un pedido (Solo CAJERO, y solo si está PENDIENTE)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM pedidos_compra WHERE id = $1 AND estado = 'PENDIENTE'", [id]);
        if (result.rowCount === 0) {
            return res.status(400).json({ error: 'No se puede eliminar (ya fue procesado o no existe)' });
        }
        res.json({ message: 'Pedido eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar pedido' });
    }
});

module.exports = router;