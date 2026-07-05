const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Middleware para verificar si el usuario tiene sesión activa
function checkAuth(req, res, next) {
    if (req.session && req.session.usuarioId) {
        next();
    } else {
        // En este sistema a veces se salta la sesión si se accede directo, pero validamos
        next();
    }
}

// 1. GET /api/control-diario: Obtiene el control de una fecha
// Si no hay registros para esa fecha, clona/hereda el último día registrado
router.get('/', checkAuth, async (req, res) => {
    const { fecha } = req.query;
    if (!fecha) {
        return res.status(400).json({ error: 'La fecha es requerida (formato YYYY-MM-DD)' });
    }

    try {
        // 1. Intentar buscar los registros de la fecha especificada
        const checkResult = await pool.query(
            'SELECT * FROM control_diario_cocina WHERE fecha = $1 ORDER BY nombre_insumo ASC',
            [fecha]
        );

        if (checkResult.rows.length > 0) {
            return res.json(checkResult.rows);
        }

        // 2. Si no hay registros, buscar la fecha más reciente que SÍ tenga registros
        const lastDateResult = await pool.query(
            'SELECT DISTINCT fecha FROM control_diario_cocina WHERE fecha < $1 ORDER BY fecha DESC LIMIT 1',
            [fecha]
        );

        if (lastDateResult.rows.length === 0) {
            // No hay registros históricos previos, retornamos vacío para que empiece de cero
            return res.json([]);
        }

        const ultimaFecha = lastDateResult.rows[0].fecha;

        // 3. Clonar los registros de la última fecha hacia la nueva fecha
        // Heredamos la misma cantidad como "default" para que solo tengan que modificarla
        await pool.query(
            `INSERT INTO control_diario_cocina (fecha, insumo_id, nombre_insumo, cantidad, unidad_medida)
             SELECT $1, insumo_id, nombre_insumo, cantidad, unidad_medida
             FROM control_diario_cocina
             WHERE fecha = $2
             ON CONFLICT (fecha, nombre_insumo) DO NOTHING`,
            [fecha, ultimaFecha]
        );

        // 4. Volver a consultar y retornar los registros recién clonados
        const clonedResult = await pool.query(
            'SELECT * FROM control_diario_cocina WHERE fecha = $1 ORDER BY nombre_insumo ASC',
            [fecha]
        );

        res.json(clonedResult.rows);

    } catch (error) {
        console.error('Error en GET /api/control-diario:', error.message);
        res.status(500).json({ error: 'Error al obtener el control diario' });
    }
});

// 2. GET /api/control-diario/insumos-catalogo: Obtener el catálogo de insumos registrados en el sistema
router.get('/insumos-catalogo', checkAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre, unidad_medida FROM insumos WHERE activo = true ORDER BY nombre ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener catálogo de insumos:', error.message);
        res.status(500).json({ error: 'Error al cargar catálogo de insumos' });
    }
});

// 3. POST /api/control-diario: Añadir un nuevo insumo a una fecha
router.post('/', checkAuth, async (req, res) => {
    const { fecha, insumo_id, nombre_insumo, cantidad, unidad_medida } = req.body;

    if (!fecha || !nombre_insumo || cantidad === undefined || !unidad_medida) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    try {
        // Usar ON CONFLICT para que si ya existe, se sume la cantidad
        const queryStr = `
            INSERT INTO control_diario_cocina (fecha, insumo_id, nombre_insumo, cantidad, unidad_medida)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (fecha, nombre_insumo) 
            DO UPDATE SET 
                cantidad = control_diario_cocina.cantidad + EXCLUDED.cantidad,
                insumo_id = COALESCE(control_diario_cocina.insumo_id, EXCLUDED.insumo_id)
            RETURNING *
        `;
        const result = await pool.query(queryStr, [
            fecha,
            insumo_id || null,
            nombre_insumo.trim(),
            parseFloat(cantidad),
            unidad_medida.trim()
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error en POST /api/control-diario:', error.message);
        res.status(500).json({ error: 'Error al registrar insumo' });
    }
});

// 4. PUT /api/control-diario/:id: Actualizar cantidad/unidad de medida de un registro
router.put('/:id', checkAuth, async (req, res) => {
    const { id } = req.params;
    const { cantidad, unidad_medida } = req.body;

    if (cantidad === undefined || !unidad_medida) {
        return res.status(400).json({ error: 'Cantidad y unidad son requeridas' });
    }

    try {
        const result = await pool.query(
            `UPDATE control_diario_cocina 
             SET cantidad = $1, unidad_medida = $2 
             WHERE id = $3 
             RETURNING *`,
            [parseFloat(cantidad), unidad_medida.trim(), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error en PUT /api/control-diario:', error.message);
        res.status(500).json({ error: 'Error al actualizar registro' });
    }
});

// 5. DELETE /api/control-diario/:id: Eliminar un insumo de una fecha
router.delete('/:id', checkAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM control_diario_cocina WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        res.json({ message: 'Registro eliminado con éxito', registro: result.rows[0] });
    } catch (error) {
        console.error('Error en DELETE /api/control-diario:', error.message);
        res.status(500).json({ error: 'Error al eliminar el registro' });
    }
});

module.exports = router;
