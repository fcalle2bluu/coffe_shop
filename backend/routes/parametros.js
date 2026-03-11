// backend/routes/parametros.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener los parámetros actuales
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parametros WHERE id = 1');
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al cargar parámetros:', error);
        res.status(500).json({ error: 'Error al cargar configuración' });
    }
});

// 2. Actualizar los parámetros
router.put('/', async (req, res) => {
    const { 
        nombre_empresa, documento_empresa, direccion, telefono, 
        moneda, impuesto_nombre, impuesto_porcentaje, 
        mensaje_ticket_superior, mensaje_ticket_inferior, impresora_papel 
    } = req.body;

    try {
        await pool.query(`
            UPDATE parametros SET 
                nombre_empresa = $1, documento_empresa = $2, direccion = $3, telefono = $4,
                moneda = $5, impuesto_nombre = $6, impuesto_porcentaje = $7,
                mensaje_ticket_superior = $8, mensaje_ticket_inferior = $9, impresora_papel = $10
            WHERE id = 1
        `, [
            nombre_empresa, documento_empresa, direccion, telefono, 
            moneda, impuesto_nombre, impuesto_porcentaje, 
            mensaje_ticket_superior, mensaje_ticket_inferior, impresora_papel
        ]);

        res.json({ message: 'Configuración guardada exitosamente' });
    } catch (error) {
        console.error('Error al guardar parámetros:', error);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
});

module.exports = router;