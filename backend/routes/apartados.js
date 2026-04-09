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

// 5. Entregar apartado y descontar inventario vía receta (Transacción Completa)
router.put('/:id/entregar', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 🔒 Inicia la transacción

        // 1. Cambiar estado a 'ENTREGADO'
        const resApartado = await client.query(`
            UPDATE apartados 
            SET estado = 'ENTREGADO' 
            WHERE id = $1 AND estado != 'ENTREGADO'
            RETURNING id
        `, [id]);

        if (resApartado.rowCount === 0) {
            throw new Error('El apartado no existe o ya fue entregado previamente');
        }

        // 2. Hacer SELECT a detalle_apartados para obtener los productos
        const detallesRes = await client.query(`
            SELECT producto_id, cantidad 
            FROM detalle_apartados 
            WHERE apartado_id = $1
        `, [id]);

        // 3. Recorrer los detalles y descontar por receta
        for (let item of detallesRes.rows) {
            // Hacer SELECT a recetas para verificar qué insumos componen esos productos
            const recetasRes = await client.query(`
                SELECT insumo_id, cantidad_necesaria
                FROM recetas
                WHERE producto_id = $1
            `, [item.producto_id]);

            // Calcular merma y actualizar insumos
            for (let receta of recetasRes.rows) {
                // Calcular la merma
                const cantidad_calculada = item.cantidad * receta.cantidad_necesaria;

                // Actualizar el stock
                await client.query(`
                    UPDATE insumos 
                    SET stock_actual = stock_actual - $1 
                    WHERE id = $2
                `, [cantidad_calculada, receta.insumo_id]);

                // Insertar en movimientos_inventario
                await client.query(`
                    INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                    VALUES ($1, 'ENTREGA', $2, $3, CURRENT_TIMESTAMP)
                `, [receta.insumo_id, cantidad_calculada, id]);
            }
        }

        await client.query('COMMIT'); // ✅ Confirma todo
        res.json({ message: 'Apartado entregado e inventario actualizado exitosamente' });

    } catch (error) {
        await client.query('ROLLBACK'); // ❌ Revierte cambios en caso de fallo
        console.error("Error en la transacción de entrega de apartado:", error);
        res.status(500).json({ error: error.message || 'Error interno al procesar la entrega del apartado' });
    } finally {
        client.release();
    }
});

module.exports = router;