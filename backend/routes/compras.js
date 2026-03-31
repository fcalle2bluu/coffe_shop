// backend/routes/compras.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener historial de compras (AHORA CON DETALLES INCLUIDOS)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, 
                   p.nombre as proveedor, 
                   p.telefono as prov_tel,
                   c.total, 
                   TO_CHAR(c.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_compra,
                   (
                       SELECT string_agg(i.nombre || ' (' || dc.cantidad || ' ' || i.unidad_medida || ')', ', ')
                       FROM detalle_compras dc
                       JOIN insumos i ON dc.insumo_id = i.id
                       WHERE dc.compra_id = c.id
                   ) as detalles_compra
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
    const { proveedor_id, total, detalles } = req.body;
    
    if (!detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'El carrito de compras está vacío.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); 

        // 1. Insertar Cabecera
        const resCompra = await client.query(`
            INSERT INTO compras (proveedor_id, total, fecha) 
            VALUES ($1, $2, NOW()) RETURNING id
        `, [proveedor_id, total]);
        
        const compraId = resCompra.rows[0].id;

        // 2. Procesar cada ítem
        for (let item of detalles) {
            const cantidad = parseFloat(item.cantidad);
            const subtotal = parseFloat(item.costo); 
            const costoUnitario = cantidad > 0 ? (subtotal / cantidad) : 0;
            const fechaVencimiento = item.vencimiento ? item.vencimiento : null;

            await client.query(`
                INSERT INTO detalle_compras (compra_id, insumo_id, cantidad, costo_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [compraId, item.insumo_id, cantidad, costoUnitario, subtotal]);

            await client.query(`
                INSERT INTO lotes_insumos (insumo_id, compra_id, cantidad_comprada, costo_total, fecha_vencimiento)
                VALUES ($1, $2, $3, $4, $5)
            `, [item.insumo_id, compraId, cantidad, subtotal, fechaVencimiento]);

            await client.query(`
                UPDATE insumos SET stock_actual = stock_actual + $1 WHERE id = $2
            `, [cantidad, item.insumo_id]);

            await client.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                VALUES ($1, 'COMPRA', $2, $3, NOW())
            `, [item.insumo_id, cantidad, compraId]);
        }

        await client.query('COMMIT'); 
        res.status(201).json({ message: 'Compra registrada y stock actualizado', id: compraId });
        
    } catch (error) {
        await client.query('ROLLBACK'); 
        console.error('Error en compra:', error);
        res.status(500).json({ error: 'Error de Base de Datos: ' + error.message });
    } finally {
        client.release(); 
    }
});

module.exports = router;