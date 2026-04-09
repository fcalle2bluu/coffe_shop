// backend/routes/apartados.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener la lista de Apartados (Reservas de clientes)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre_cliente, telefono_cliente, total, saldo_pendiente, estado,
                   TO_CHAR(fecha_creacion, 'DD/MM/YYYY HH24:MI') as fecha_creacion,
                   TO_CHAR(fecha_limite, 'DD/MM/YYYY') as fecha_limite
            FROM apartados
            ORDER BY 
                CASE estado WHEN 'PENDIENTE' THEN 1 WHEN 'PAGADO' THEN 2 ELSE 3 END, 
                fecha_creacion DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error al cargar apartados:", error);
        res.status(500).json({ error: 'Error al cargar apartados' });
    }
});

// 2. Obtener los detalles de un apartado específico (para el Modal de Entregas)
router.get('/:id/detalles', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT da.id, da.producto_id, p.nombre as producto_nombre, da.cantidad, da.precio_unitario, da.subtotal, 
                   COALESCE(da.cantidad_entregada, 0) as cantidad_entregada
            FROM detalle_apartados da
            JOIN productos p ON da.producto_id = p.id
            WHERE da.apartado_id = $1
        `, [id]);
        res.json(result.rows);
    } catch (error) {
        console.error("Error al cargar detalles del apartado:", error);
        res.status(500).json({ error: 'Error al cargar detalles' });
    }
});

// 3. Crear un nuevo Apartado
router.post('/', async (req, res) => {
    const { nombre_cliente, telefono_cliente, total, abono_inicial, fecha_limite, detalles } = req.body;
    
    if (!detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'La reserva no tiene productos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const saldo_pendiente = total - (abono_inicial || 0);
        const estadoInicial = saldo_pendiente <= 0 ? 'PAGADO' : 'PENDIENTE';

        const resApartado = await client.query(`
            INSERT INTO apartados (nombre_cliente, telefono_cliente, total, saldo_pendiente, estado, fecha_limite)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, [nombre_cliente, telefono_cliente, total, saldo_pendiente, estadoInicial, fecha_limite]);
        
        const apartadoId = resApartado.rows[0].id;

        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_apartados (apartado_id, producto_id, cantidad, precio_unitario, subtotal, cantidad_entregada)
                VALUES ($1, $2, $3, $4, $5, 0)
            `, [apartadoId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);
        }

        if (abono_inicial > 0) {
            await client.query(`
                INSERT INTO abonos_apartados (apartado_id, monto)
                VALUES ($1, $2)
            `, [apartadoId, abono_inicial]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Reserva creada exitosamente' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al crear apartado:", error);
        res.status(500).json({ error: 'Error al crear la reserva' });
    } finally {
        client.release();
    }
});

// 4. Entregar apartado parcialmente o totalmente (con descuento de inventario vía receta)
router.put('/:id/entregar', async (req, res) => {
    const { id } = req.params;
    const { items_entrega } = req.body; // [{ detalle_id, entregado_ahora, producto_id }]
    
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 🔒 Inicia la transacción

        let entregadoPorCompleto = true;

        for (let item of items_entrega) {
            if (item.entregado_ahora > 0) {
                // Actualizar detalle_apartados incrementando la cantidad entregada
                await client.query(`
                    UPDATE detalle_apartados 
                    SET cantidad_entregada = COALESCE(cantidad_entregada, 0) + $1
                    WHERE id = $2
                `, [item.entregado_ahora, item.detalle_id]);

                // (Se ha eliminado el motor de inventario por receta a petición del usuario.
                // El inventario solo se descuenta en Almacén -> Caja mediante pedidos internos)
            }
            
            // Verificación si con esta entrega ya se completó la linea
            const checkLinea = await client.query(`
                SELECT cantidad, COALESCE(cantidad_entregada, 0) as cantidad_entregada 
                FROM detalle_apartados WHERE id = $1
            `, [item.detalle_id]);
            
            if (checkLinea.rows[0].cantidad_entregada < checkLinea.rows[0].cantidad) {
                entregadoPorCompleto = false;
            }
        }

        // Si se entregaron todas las líneas de todos los productos en su totalidad, marcar como 'ENTREGADO'
        if (entregadoPorCompleto) {
            await client.query(`
                UPDATE apartados 
                SET estado = 'ENTREGADO' 
                WHERE id = $1
            `, [id]);
        }

        await client.query('COMMIT'); // ✅ Confirma todo
        res.json({ message: 'Entrega procesada e inventario actualizado' });

    } catch (error) {
        await client.query('ROLLBACK'); // ❌ Revierte cambios en caso de fallo
        console.error("Error en la transacción de entrega parcial:", error);
        res.status(500).json({ error: error.message || 'Error interno al procesar la entrega del apartado' });
    } finally {
        client.release();
    }
});

module.exports = router;