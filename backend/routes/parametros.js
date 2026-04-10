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

// --- GESTIÓN DE USUARIOS ---

// 3. Listar usuarios
router.get('/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, username, rol, activo FROM usuarios ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// 4. Crear usuario
router.post('/usuarios', async (req, res) => {
    const { nombre, username, pin, rol } = req.body;

    if (!nombre || !username || !pin || !rol) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        // Verificar si el username ya existe
        const check = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
        }

        await pool.query(`
            INSERT INTO usuarios (nombre, username, pin, rol, activo)
            VALUES ($1, $2, $3, $4, true)
        `, [nombre, username, pin, rol]);

        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error('Error al crear usuario:', error);
        // Devolvemos el mensaje específico del error para diagnosticar (ej: violación de check constraint)
        res.status(500).json({ error: error.message || 'Error al registrar usuario' });
    }
});

// 5. Alternar estado activo/inactivo
router.put('/usuarios/:id/status', async (req, res) => {
    const { id } = req.params;
    const { activo } = req.body;

    try {
        await pool.query('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, id]);
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// 6. Eliminar usuario
router.delete('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

// 4. Obtener Historial de Accesos
router.get('/historial', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.id, u.nombre as usuario, h.dispositivo, h.ip, 
                TO_CHAR(h.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_formateada
            FROM historial_accesos h
            JOIN usuarios u ON h.usuario_id = u.id
            ORDER BY h.fecha DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ error: 'Error al obtener historial de accesos' });
    }
});

module.exports = router;