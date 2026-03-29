// backend/routes/proveedores.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener todos los proveedores
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, telefono, email, direccion FROM proveedores ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo proveedores:', error);
        res.status(500).json({ error: 'Error al cargar la lista de proveedores' });
    }
});

// 2. Guardar un nuevo proveedor usando tu tabla exacta
router.post('/', async (req, res) => {
    const { nombre, telefono, email, direccion } = req.body;
    
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO proveedores (nombre, telefono, email, direccion) 
            VALUES ($1, $2, $3, $4) 
            RETURNING *
        `, [nombre, telefono || null, email || null, direccion || null]);
        
        res.json({ mensaje: 'Proveedor creado con éxito', proveedor: result.rows[0] });
    } catch (error) {
        console.error('Error creando proveedor:', error);
        res.status(500).json({ error: 'Error interno al guardar el proveedor' });
    }
});

module.exports = router;