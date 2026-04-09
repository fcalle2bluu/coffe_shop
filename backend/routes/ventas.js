// backend/routes/ventas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener catálogo de productos para el POS
router.get('/productos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.nombre, p.precio_venta, c.nombre as categoria 
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.activo = TRUE
            ORDER BY p.nombre ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar productos:', error);
        res.status(500).json({ error: 'Error al cargar el catálogo' });
    }
});

// 2. Procesar una nueva venta (Transacción Completa)
router.post('/', async (req, res) => {
    const { usuario_id, caja_id, total, metodo_pago, detalles } = req.body;
    
    // Validaciones básicas
    if (!detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'El carrito está vacío' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 🔒 Inicia la transacción

        // Paso 1: Registrar la cabecera de la venta
        const insertVenta = `
            INSERT INTO ventas (usuario_id, caja_id, total, metodo_pago) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id
        `;
        const resultVenta = await client.query(insertVenta, [usuario_id, caja_id, total, metodo_pago]);
        const ventaId = resultVenta.rows[0].id;

        // Paso 2: Registrar los detalles y descontar del inventario
        for (let item of detalles) {
            // a. Insertarlo en detalle_ventas
            await client.query(`
                INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);
        }

        await client.query('COMMIT'); // ✅ Confirma y guarda todo en la BD
        
        // Devolver un JSON con el ID de la venta
        res.status(201).json({ venta_id: ventaId });

    } catch (error) {
        await client.query('ROLLBACK'); // ❌ Si algo falla, deshace todos los cambios
        console.error('Error en la transacción de venta:', error);
        
        // Devolver un status 500 con el mensaje de error
        res.status(500).json({ error: error.message || 'Error interno al procesar la venta' });
    } finally {
        client.release(); // Libera la conexión
    }
});

module.exports = router;