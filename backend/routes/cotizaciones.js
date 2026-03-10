// backend/routes/cotizaciones.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener todas las cotizaciones
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre_cliente, telefono_cliente, total, estado, 
                   TO_CHAR(fecha_emision, 'DD/MM/YYYY HH24:MI') as fecha_emision
            FROM cotizaciones 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar cotizaciones' });
    }
});

// 2. Obtener productos para el modal de nueva cotización
router.get('/productos', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, precio_venta FROM productos WHERE activo = TRUE');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar productos' });
    }
});

// 3. Crear una nueva cotización con sus detalles
router.post('/', async (req, res) => {
    const { nombre_cliente, telefono_cliente, total, detalles } = req.body;
    
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Iniciar transacción

        // Insertar cabecera de cotización
        const insertCotizacion = `
            INSERT INTO cotizaciones (nombre_cliente, telefono_cliente, total, fecha_validez) 
            VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '7 days') 
            RETURNING id
        `;
        const resultCotizacion = await client.query(insertCotizacion, [nombre_cliente, telefono_cliente, total]);
        const cotizacionId = resultCotizacion.rows[0].id;

        // Insertar detalles de cotización
        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_cotizaciones (cotizacion_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [cotizacionId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);
        }

        await client.query('COMMIT'); // Confirmar transacción
        res.status(201).json({ message: 'Cotización creada con éxito', id: cotizacionId });
    } catch (error) {
        await client.query('ROLLBACK'); // Deshacer cambios en caso de error
        console.error('Error al guardar cotización:', error);
        res.status(500).json({ error: 'Error al guardar la cotización' });
    } finally {
        client.release();
    }
});

// 4. Cambiar estado de la cotización
router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    try {
        await pool.query('UPDATE cotizaciones SET estado = $1 WHERE id = $2', [estado, id]);
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

module.exports = router;