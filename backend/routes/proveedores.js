// backend/routes/proveedores.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener todos los proveedores para llenar el "Select"
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, telefono FROM proveedores ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo proveedores:', error);
        res.status(500).json({ error: 'Error al cargar la lista de proveedores' });
    }
});

// 2. Guardar un nuevo proveedor desde el Modal
router.post('/', async (req, res) => {
    const { nombre, telefono } = req.body;
    
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO proveedores (nombre, telefono) 
            VALUES ($1, $2) 
            RETURNING *
        `, [nombre, telefono || '']);
        
        res.json({ mensaje: 'Proveedor creado con éxito', proveedor: result.rows[0] });
    } catch (error) {
        console.error('Error creando proveedor:', error);
        res.status(500).json({ error: 'Error interno al guardar el proveedor' });
    }
});

module.exports = router;