// backend/routes/compras.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener historial de compras
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, p.nombre as proveedor, c.total, 
                   TO_CHAR(c.fecha, 'DD/MM/YYYY HH24:MI') as fecha_compra
            FROM compras c
            LEFT JOIN proveedores p ON c.proveedor_id = p.id
            ORDER BY c.id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar compras' });
    }
});

// 2. Obtener datos para el formulario (Proveedores e Insumos)
router.get('/datos-formulario', async (req, res) => {
    try {
        const provRes = await pool.query('SELECT id, nombre FROM proveedores ORDER BY nombre ASC');
        const insumosRes = await pool.query('SELECT id, nombre, unidad_medida FROM insumos WHERE activo = TRUE ORDER BY nombre ASC');
        
        res.json({
            proveedores: provRes.rows,
            insumos: insumosRes.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar datos' });
    }
});

// 3. Registrar una nueva Compra (Transacción Completa)
router.post('/', async (req, res) => {
    const { proveedor_id, total, detalles } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 🔒 Inicia Transacción

        // 1. Insertar Cabecera de Compra
        const resCompra = await client.query(`
            INSERT INTO compras (proveedor_id, total, fecha) 
            VALUES ($1, $2, NOW()) RETURNING id
        `, [proveedor_id, total]);
        
        const compraId = resCompra.rows[0].id;

        // 2. Procesar cada ítem del carrito
        for (let item of detalles) {
            // A) Insertar Detalle de la Compra
            await client.query(`
                INSERT INTO detalle_compras (compra_id, insumo_id, cantidad, costo_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [compraId, item.insumo_id, item.cantidad_base, item.costo_unitario, item.subtotal]);

            // B) Registrar Lote (con fecha de vencimiento)
            await client.query(`
                INSERT INTO lotes_insumos (insumo_id, compra_id, cantidad_comprada, costo_total, fecha_vencimiento)
                VALUES ($1, $2, $3, $4, $5)
            `, [item.insumo_id, compraId, item.cantidad_base, item.subtotal, item.fecha_vencimiento || null]);

            // C) Sumar al Stock Actual del Almacén
            await client.query(`
                UPDATE insumos SET stock_actual = stock_actual + $1 WHERE id = $2
            `, [item.cantidad_base, item.insumo_id]);

            // D) Dejar registro en el Kardex (Movimientos)
            await client.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                VALUES ($1, 'COMPRA', $2, $3, NOW())
            `, [item.insumo_id, item.cantidad_base, compraId]);
        }

        await client.query('COMMIT'); // ✅ Confirmar todo
        res.status(201).json({ message: 'Compra registrada y stock actualizado', id: compraId });
    } catch (error) {
        await client.query('ROLLBACK'); // ❌ Revertir si hay error
        console.error('Error en compra:', error);
        res.status(500).json({ error: 'Error interno al registrar la compra' });
    } finally {
        client.release();
    }
});

// 4. Crear un Proveedor Rápido
router.post('/proveedores', async (req, res) => {
    const { nombre, telefono, email, direccion } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO proveedores (nombre, telefono, email, direccion) 
            VALUES ($1, $2, $3, $4) RETURNING id, nombre
        `, [nombre, telefono, email, direccion]);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear proveedor' });
    }
});

module.exports = router;