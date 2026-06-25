// backend/routes/mesas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Middleware para verificar rol administrador
const checkAdminPermission = async (req, res, next) => {
    const usuario_id = req.headers['x-usuario-id'] || req.query.usuario_id || req.body.usuario_id;
    if (!usuario_id) {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere ID de usuario.' });
    }
    try {
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado: Usuario no encontrado.' });
        }
        const rol = userRes.rows[0].rol.toUpperCase();
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR') {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos de administrador.' });
        }
        next();
    } catch (err) {
        console.error('Error al validar permisos de admin en mesas:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

router.use(checkAdminPermission);

// 1. Obtener todas las mesas activas
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT * FROM mesas 
            WHERE activo = true 
            ORDER BY piso DESC, numero ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener mesas:', error);
        res.status(500).json({ error: 'Error al obtener mesas' });
    }
});

// 2. Crear una nueva mesa (o reactivar una inactiva con el mismo nombre)
router.post('/', async (req, res) => {
    const { numero, piso, pos_x, pos_y } = req.body;

    if (!numero || !piso) {
        return res.status(400).json({ error: 'El identificador de mesa y el piso son obligatorios.' });
    }

    try {
        // Verificar si ya existe una mesa con ese identificador
        const checkQuery = `SELECT * FROM mesas WHERE numero = $1 LIMIT 1`;
        const checkResult = await pool.query(checkQuery, [numero]);

        if (checkResult.rows.length > 0) {
            const existingMesa = checkResult.rows[0];
            if (existingMesa.activo) {
                return res.status(400).json({ error: `La mesa '${numero}' ya existe y está activa.` });
            } else {
                // Si existe pero está inactiva, la reactivamos y actualizamos su piso y coordenadas
                const reactivateQuery = `
                    UPDATE mesas 
                    SET activo = true, piso = $2, pos_x = $3, pos_y = $4 
                    WHERE id = $1 
                    RETURNING *
                `;
                const reactivateResult = await pool.query(reactivateQuery, [
                    existingMesa.id,
                    piso,
                    pos_x !== undefined ? pos_x : 50.0,
                    pos_y !== undefined ? pos_y : 50.0
                ]);
                return res.status(200).json({ success: true, mesa: reactivateResult.rows[0], message: 'Mesa reactivada con éxito.' });
            }
        }

        // Si no existe, la creamos
        const insertQuery = `
            INSERT INTO mesas (numero, piso, pos_x, pos_y, activo)
            VALUES ($1, $2, $3, $4, true)
            RETURNING *
        `;
        const result = await pool.query(insertQuery, [
            numero,
            piso,
            pos_x !== undefined ? pos_x : 50.0,
            pos_y !== undefined ? pos_y : 50.0
        ]);

        res.status(201).json({ success: true, mesa: result.rows[0] });
    } catch (error) {
        console.error('Error al crear mesa:', error);
        res.status(500).json({ error: 'Error al crear mesa' });
    }
});

// 3. Modificar identificador o piso de una mesa
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { numero, piso } = req.body;

    if (!numero || !piso) {
        return res.status(400).json({ error: 'El identificador y el piso son requeridos.' });
    }

    try {
        // Validar que el identificador no esté repetido en otra mesa
        const checkConflict = await pool.query('SELECT * FROM mesas WHERE numero = $1 AND id <> $2 LIMIT 1', [numero, id]);
        if (checkConflict.rows.length > 0) {
            return res.status(400).json({ error: `Ya existe otra mesa con el identificador '${numero}'.` });
        }

        const updateQuery = `
            UPDATE mesas 
            SET numero = $1, piso = $2 
            WHERE id = $3 
            RETURNING *
        `;
        const result = await pool.query(updateQuery, [numero, piso, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Mesa no encontrada.' });
        }

        res.json({ success: true, mesa: result.rows[0] });
    } catch (error) {
        console.error('Error al actualizar mesa:', error);
        res.status(500).json({ error: 'Error al actualizar mesa' });
    }
});

// 4. Modificar exclusivamente la posición de la mesa (Drag & Drop)
router.put('/:id/posicion', async (req, res) => {
    const { id } = req.params;
    const { pos_x, pos_y } = req.body;

    if (pos_x === undefined || pos_y === undefined) {
        return res.status(400).json({ error: 'Las coordenadas pos_x y pos_y son requeridas.' });
    }

    try {
        const updateQuery = `
            UPDATE mesas 
            SET pos_x = $1, pos_y = $2 
            WHERE id = $3 
            RETURNING *
        `;
        const result = await pool.query(updateQuery, [pos_x, pos_y, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Mesa no encontrada.' });
        }

        res.json({ success: true, mesa: result.rows[0] });
    } catch (error) {
        console.error('Error al actualizar posición de mesa:', error);
        res.status(500).json({ error: 'Error al actualizar posición de mesa' });
    }
});

// 5. Desactivar mesa (eliminación lógica)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Verificar si la mesa tiene una comanda activa
        const selectMesa = await pool.query('SELECT numero FROM mesas WHERE id = $1 LIMIT 1', [id]);
        if (selectMesa.rows.length === 0) {
            return res.status(404).json({ error: 'Mesa no encontrada.' });
        }
        const numeroMesa = selectMesa.rows[0].numero;

        const checkComanda = await pool.query(
            "SELECT * FROM comandas WHERE mesa = $1 AND estado IN ('CREADA', 'ENTREGADA') LIMIT 1",
            [numeroMesa]
        );
        if (checkComanda.rows.length > 0) {
            return res.status(400).json({ error: 'No se puede eliminar una mesa que tiene una comanda activa.' });
        }

        // Eliminación lógica
        const deleteQuery = `UPDATE mesas SET activo = false WHERE id = $1 RETURNING *`;
        const result = await pool.query(deleteQuery, [id]);

        res.json({ success: true, message: `Mesa '${numeroMesa}' desactivada con éxito.`, mesa: result.rows[0] });
    } catch (error) {
        console.error('Error al eliminar mesa:', error);
        res.status(500).json({ error: 'Error al eliminar mesa' });
    }
});

module.exports = router;
