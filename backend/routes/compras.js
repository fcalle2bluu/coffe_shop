// backend/routes/compras.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener historial de compras
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, p.nombre as proveedor, c.total, 
                   TO_CHAR(c.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_compra
            FROM compras c
            LEFT JOIN proveedores p ON c.proveedor_id = p.id
            ORDER BY c.id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar historial:', error);
        res.status(500).json({ error: 'Error BD: ' + error.message });
    }
});

// 2. Registrar una nueva Compra (Transacción Completa)
router.post('/', async (req, res) => {
    // Ya no usamos usuario_id aquí porque tu tabla no lo requiere
    const { proveedor_id, total, detalles } = req.body;
    
    // Validación de seguridad
    if (!detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'El carrito de compras está vacío.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 🔒 Inicia Transacción

        // 1. Insertar Cabecera de Compra (ADAPTADO EXACTAMENTE A TU TABLA)
        const resCompra = await client.query(`
            INSERT INTO compras (proveedor_id, total, fecha) 
            VALUES ($1, $2, NOW()) RETURNING id
        `, [proveedor_id, total]);
        
        const compraId = resCompra.rows[0].id;

        // 2. Procesar cada ítem del carrito
        for (let item of detalles) {
            
            const cantidad = parseFloat(item.cantidad);
            const subtotal = parseFloat(item.costo); 
            // Calculamos el costo unitario internamente
            const costoUnitario = cantidad > 0 ? (subtotal / cantidad) : 0;
            // Si el frontend no manda vencimiento, enviamos null
            const fechaVencimiento = item.vencimiento ? item.vencimiento : null;

            // A) Insertar Detalle de la Compra (ADAPTADO A TU TABLA)
            await client.query(`
                INSERT INTO detalle_compras (compra_id, insumo_id, cantidad, costo_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [compraId, item.insumo_id, cantidad, costoUnitario, subtotal]);

            // B) Registrar Lote (ADAPTADO A TU TABLA)
            await client.query(`
                INSERT INTO lotes_insumos (insumo_id, compra_id, cantidad_comprada, costo_total, fecha_vencimiento)
                VALUES ($1, $2, $3, $4, $5)
            `, [item.insumo_id, compraId, cantidad, subtotal, fechaVencimiento]);

            // C) Sumar al Stock Actual del Almacén (ADAPTADO A TU TABLA)
            await client.query(`
                UPDATE insumos SET stock_actual = stock_actual + $1 WHERE id = $2
            `, [cantidad, item.insumo_id]);

            // D) Dejar registro en el Kardex/Movimientos (ADAPTADO A TU TABLA)
            await client.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                VALUES ($1, 'COMPRA', $2, $3, NOW())
            `, [item.insumo_id, cantidad, compraId]);
        }

        await client.query('COMMIT'); // ✅ Confirmar todo si nada falló
        res.status(201).json({ message: 'Compra registrada y stock actualizado', id: compraId });
        
    } catch (error) {
        await client.query('ROLLBACK'); // ❌ Revertir todo si hay error
        console.error('Error en compra:', error);
        res.status(500).json({ error: 'Error de Base de Datos: ' + error.message });
    } finally {
        client.release(); // Libera la conexión
    }
});

module.exports = router;