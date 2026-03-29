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

// 2. Guardar un nuevo proveedor 
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

// 3. NUEVO: Eliminar un proveedor
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM proveedores WHERE id = $1', [id]);
        res.json({ success: true, mensaje: 'Proveedor eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando proveedor:', error);
        // Código 23503 en Postgres significa que la llave foránea está en uso (tiene compras registradas)
        if (error.code === '23503') { 
            return res.status(400).json({ error: '⛔ No puedes eliminar este proveedor porque ya tiene compras registradas en el historial.' });
        }
        res.status(500).json({ error: 'Error al eliminar el proveedor' });
    }
});

module.exports = router;