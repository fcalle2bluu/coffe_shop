// backend/routes/apartados.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { enviarNotificacionPush, enviarNotificacionPushAAdministradores } = require('../config/firebase');

// 1. Obtener la lista de pedidos
router.get('/', async (req, res) => {
    const { usuario_id, rol } = req.query;

    try {
        let result;
        if (rol === 'ADMIN') {
            result = await pool.query(`
                SELECT p.id, p.insumo_id, COALESCE(i.nombre, p.insumo_nombre) as insumo_nombre, p.cantidad, p.notas, p.estado, p.imagen_url,
                       TO_CHAR(p.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_pedido,
                       u.nombre as solicitante, i.stock_actual, i.unidad_medida
                FROM pedidos_compra p
                JOIN usuarios u ON p.usuario_id = u.id
                LEFT JOIN insumos i ON p.insumo_id = i.id
                ORDER BY 
                    CASE p.estado WHEN 'PENDIENTE' THEN 1 ELSE 2 END, 
                    p.fecha DESC
            `);
        } else {
            result = await pool.query(`
                SELECT p.id, p.insumo_id, COALESCE(i.nombre, p.insumo_nombre) as insumo_nombre, p.cantidad, p.notas, p.estado, p.imagen_url,
                       TO_CHAR(p.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_pedido,
                       u.nombre as solicitante, i.unidad_medida
                FROM pedidos_compra p
                JOIN usuarios u ON p.usuario_id = u.id
                LEFT JOIN insumos i ON p.insumo_id = i.id
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

// 2. Crear un nuevo pedido de compra (ahora usando insumo_id)
router.post('/', async (req, res) => {
    const { usuario_id, insumo_id, insumo_nombre, cantidad, notas, imagen_url } = req.body;
    
    if (!usuario_id || (!insumo_id && !insumo_nombre) || !cantidad) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {
        await pool.query(`
            INSERT INTO pedidos_compra (usuario_id, insumo_id, insumo_nombre, cantidad, notas, imagen_url)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [usuario_id, insumo_id, insumo_nombre, cantidad.toString(), notas, imagen_url || null]);

        // Consultar nombre del solicitante para la notificación
        try {
            const userRes = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [usuario_id]);
            const solicitante = userRes.rows[0]?.nombre || 'Un cajero';
            enviarNotificacionPushAAdministradores(
                pool,
                'Nuevo Requerimiento de Insumo',
                `${solicitante} ha solicitado ${cantidad} de ${insumo_nombre}.`
            );
        } catch (pushErr) {
            console.error('Error al intentar enviar push para nuevo pedido:', pushErr.message);
        }

        res.status(201).json({ message: 'Pedido creado exitosamente' });
    } catch (error) {
        console.error("Error al crear pedido:", error);
        res.status(500).json({ error: 'Error al crear pedido' });
    }
});

// 3. Cambiar estado simple (COMPRADO externo, o RECHAZADO)
router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    try {
        await pool.query('UPDATE pedidos_compra SET estado = $1 WHERE id = $2', [estado, id]);

        // Si el estado es RECHAZADO, enviar notificación push al cajero
        if (estado === 'RECHAZADO') {
            try {
                const pedidoRes = await pool.query('SELECT usuario_id, insumo_nombre FROM pedidos_compra WHERE id = $1', [id]);
                if (pedidoRes.rows.length > 0) {
                    const { usuario_id, insumo_nombre } = pedidoRes.rows[0];
                    enviarNotificacionPush(
                        pool,
                        usuario_id,
                        'Pedido Rechazado',
                        `Tu solicitud de ${insumo_nombre} ha sido rechazada por el administrador.`
                    );
                }
            } catch (pushErr) {
                console.error('Error al enviar push de rechazo:', pushErr.message);
            }
        }

        res.json({ message: 'Estado actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

// 4. Despachar Insumo (Descuenta stock)
router.put('/:id/despachar', async (req, res) => {
    const { id } = req.params;
    const { cantidad_entregada, insumo_id } = req.body;

    if (!insumo_id || cantidad_entregada <= 0) {
        return res.status(400).json({ error: 'Datos no válidos para el despacho' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query('UPDATE pedidos_compra SET estado = $1 WHERE id = $2', ['COMPRADO', id]);
        
        await client.query(`
            UPDATE insumos SET stock_actual = stock_actual - $1 WHERE id = $2
        `, [cantidad_entregada, insumo_id]);
        
        await client.query(`
            INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
            VALUES ($1, 'AJUSTE', $2, $3, NOW())
        `, [insumo_id, cantidad_entregada, id]);
        
        await client.query('COMMIT');

        // Enviar notificación push al cajero
        try {
            const pedidoRes = await pool.query('SELECT usuario_id, insumo_nombre FROM pedidos_compra WHERE id = $1', [id]);
            if (pedidoRes.rows.length > 0) {
                const { usuario_id, insumo_nombre } = pedidoRes.rows[0];
                enviarNotificacionPush(
                    pool,
                    usuario_id,
                    'Pedido Despachado',
                    `Tu solicitud de ${insumo_nombre} ha sido despachada (${cantidad_entregada} entregados).`
                );
            }
        } catch (pushErr) {
            console.error('Error al enviar push de despacho:', pushErr.message);
        }

        res.json({ message: 'Insumo despachado a caja y descontado del inventario general' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error despachando:', error);
        res.status(500).json({ error: 'Error al despachar inventario' });
    } finally {
        client.release();
    }
});

// 5. Eliminar un pedido
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