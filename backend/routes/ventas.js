// backend/routes/ventas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const whatsappRoutes = require('./whatsapp');

// 1. Obtener catálogo de productos para el POS
router.get('/productos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.nombre, p.precio_venta, p.imagen_url, c.nombre as categoria 
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
// 1.5. Obtener categorías para el dropdown
router.get('/categorias', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre FROM categorias ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar categorias:', error);
        res.status(500).json({ error: 'Error al cargar categorias' });
    }
});

// 1.5.1 Crear nueva categoría
router.post('/categorias', async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
    try {
        const result = await pool.query(
            'INSERT INTO categorias (nombre) VALUES ($1) RETURNING id, nombre',
            [nombre]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error al crear categoría:', error);
        res.status(500).json({ error: 'Error interno al crear categoría' });
    }
});

// 1.6. Crear nuevo producto
router.post('/productos', async (req, res) => {
    const { nombre, precio_venta, categoria_id, imagen_url } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO productos (nombre, precio_venta, categoria_id, imagen_url, activo) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
            [nombre, precio_venta, categoria_id, imagen_url || null]
        );
        const newId = result.rows[0].id;

        // Hook automático asíncrono
        if (whatsappRoutes && typeof whatsappRoutes.syncProductToMeta === 'function') {
            whatsappRoutes.syncProductToMeta(newId).catch(err => console.error("Error de sync automático:", err.message));
        }

        res.status(201).json({ id: newId });
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({ error: 'Error interno al crear producto' });
    }
});

// 1.7. Modificar producto
router.put('/productos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, precio_venta, categoria_id, imagen_url } = req.body;
    try {
        await pool.query(
            'UPDATE productos SET nombre = $1, precio_venta = $2, categoria_id = $3, imagen_url = $4 WHERE id = $5',
            [nombre, precio_venta, categoria_id, imagen_url || null, id]
        );

        // Hook automático asíncrono
        if (whatsappRoutes && typeof whatsappRoutes.syncProductToMeta === 'function') {
            whatsappRoutes.syncProductToMeta(id).catch(err => console.error("Error de sync automático:", err.message));
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error al modificar producto:', error);
        res.status(500).json({ error: 'Error interno al modificar producto' });
    }
});

// 1.8. Eliminar producto individual
router.delete('/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM detalle_ventas WHERE producto_id = $1', [id]);
        await pool.query('DELETE FROM productos WHERE id = $1', [id]);

        // Hook automático asíncrono
        if (whatsappRoutes && typeof whatsappRoutes.deleteProductFromMeta === 'function') {
            whatsappRoutes.deleteProductFromMeta(id).catch(err => console.error("Error de sync automático al eliminar:", err.message));
        }

        res.json({ success: true, message: 'Producto eliminado exitosamente.' });
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        res.status(500).json({ error: 'Error interno al eliminar producto: ' + error.message });
    }
});

// 1.9. Eliminar todos los productos (limpieza)
router.post('/clear-all-products', async (req, res) => {
    try {
        await pool.query('DELETE FROM detalle_ventas');
        await pool.query('DELETE FROM ventas');
        await pool.query('DELETE FROM productos');
        res.json({ success: true, message: 'Todos los productos y ventas han sido eliminados de la base de datos.' });
    } catch (error) {
        console.error('Error al borrar productos:', error);
        res.status(500).json({ error: 'Error interno al limpiar catálogo: ' + error.message });
    }
});

// 2. Procesar una nueva venta (Transacción Completa)
router.post('/', async (req, res) => {
    let { usuario_id, caja_id, total, metodo_pago, detalles } = req.body;
    
    // Valores por defecto si no vienen especificados
    usuario_id = usuario_id || 1;
    caja_id = caja_id || null;

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

            // b. Backflush: Descontar de Almacén Pastelería según la receta
            const recetaRes = await client.query('SELECT id FROM recetas WHERE producto_id = $1 LIMIT 1', [item.producto_id]);
            if (recetaRes.rows.length > 0) {
                const recetaId = recetaRes.rows[0].id;
                const ingredientesRes = await client.query(
                    'SELECT insumo_id, cantidad FROM ingrediente_recetas WHERE receta_id = $1 AND insumo_id IS NOT NULL',
                    [recetaId]
                );

                const almacenPasteleriaRes = await client.query(
                    "SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1"
                );
                const almacenPasteleriaId = almacenPasteleriaRes.rows[0]?.id;

                if (almacenPasteleriaId) {
                    for (let ing of ingredientesRes.rows) {
                        const cantADescontar = parseFloat(item.cantidad) * parseFloat(ing.cantidad);

                        // Restar del stock de Pastelería (hasta llegar a cero o al remanente, usando GREATEST(0, stock_actual - cant))
                        await client.query(`
                            UPDATE inventario_almacen 
                            SET stock_actual = GREATEST(0, stock_actual - $1)
                            WHERE almacen_id = $2 AND insumo_id = $3
                        `, [cantADescontar, almacenPasteleriaId, ing.insumo_id]);

                        // Registrar el movimiento en el historial
                        await client.query(`
                            INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                            VALUES ($1, 'VENTA', $2, $3, NOW())
                        `, [ing.insumo_id, cantADescontar, ventaId]);
                    }
                }
            }
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