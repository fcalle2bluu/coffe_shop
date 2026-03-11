// backend/routes/comprobantes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener el historial de todas las ventas (Comprobantes)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, total, metodo_pago, estado, 
                   TO_CHAR(fecha_venta, 'DD/MM/YYYY HH24:MI') as fecha
            FROM ventas 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar comprobantes:', error);
        res.status(500).json({ error: 'Error al cargar los comprobantes' });
    }
});

// 2. Obtener los detalles exactos de un ticket (Para imprimir)
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Cabecera de la venta
        const cabecera = await pool.query(`
            SELECT id, total, metodo_pago, estado, TO_CHAR(fecha_venta, 'DD/MM/YYYY HH24:MI') as fecha
            FROM ventas WHERE id = $1
        `, [id]);

        if (cabecera.rows.length === 0) return res.status(404).json({ error: 'Ticket no encontrado' });

        // Detalles de los productos vendidos en ese ticket
        const detalles = await pool.query(`
            SELECT p.nombre, dv.cantidad, dv.precio_unitario, dv.subtotal
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            WHERE dv.venta_id = $1
        `, [id]);

        res.json({
            ticket: cabecera.rows[0],
            items: detalles.rows
        });
    } catch (error) {
        console.error('Error al cargar detalle del ticket:', error);
        res.status(500).json({ error: 'Error al cargar el detalle' });
    }
});

// 3. Anular una venta (Cambiar estado a ANULADA)
router.put('/:id/anular', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            UPDATE ventas 
            SET estado = 'ANULADA' 
            WHERE id = $1 AND estado = 'COMPLETADA'
            RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'La venta ya está anulada o no existe' });
        }

        // 💡 NOTA PARA EL FUTURO: Aquí agregaríamos la lógica para devolver 
        // los insumos al inventario usando las "recetas" si la venta se anula.

        res.json({ message: 'Venta anulada correctamente' });
    } catch (error) {
        console.error('Error al anular venta:', error);
        res.status(500).json({ error: 'Error al anular la venta' });
    }
});

module.exports = router;