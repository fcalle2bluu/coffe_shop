const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// GET /api/recetas/debug-db
router.get('/debug-db', async (req, res) => {
    try {
        const tablesQuery = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        `);
        const tables = tablesQuery.rows.map(r => r.table_name);
        
        let recetasCols = null;
        let ingredienteCols = null;
        
        try {
            const rCols = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'recetas';
            `);
            recetasCols = rCols.rows;
        } catch (e) {
            recetasCols = { error: e.message };
        }
        
        try {
            const iCols = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'ingrediente_recetas';
            `);
            ingredienteCols = iCols.rows;
        } catch (e) {
            ingredienteCols = { error: e.message };
        }

        let testQueryErr = null;
        try {
            const testQ = await pool.query(`
                SELECT r.*, c.nombre AS categoria, p.precio_venta AS precio, p.imagen_url
                FROM recetas r
                LEFT JOIN productos p ON r.producto_id = p.id
                LEFT JOIN categorias c ON p.categoria_id = c.id
                ORDER BY r.nombre ASC
            `);
        } catch (e) {
            testQueryErr = e.message;
        }

        res.json({
            tables,
            recetasCols,
            ingredienteCols,
            testQueryErr
        });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// GET /api/recetas
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT r.*, c.nombre AS categoria, p.precio_venta AS precio, p.imagen_url
            FROM recetas r
            LEFT JOIN productos p ON r.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            ORDER BY r.nombre ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener recetas:', err);
        res.status(500).json({ error: 'Error del servidor al obtener recetas' });
    }
});

// GET /api/recetas/:id
router.get('/:id', async (req, res) => {
    try {
        const recipeId = req.params.id;
        const recipeQuery = `
            SELECT r.*, c.nombre AS categoria, p.precio_venta AS precio, p.imagen_url
            FROM recetas r
            LEFT JOIN productos p ON r.producto_id = p.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE r.id = $1
        `;
        const recipeResult = await pool.query(recipeQuery, [recipeId]);
        if (recipeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Receta no encontrada' });
        }

        const ingredientsQuery = `
            SELECT ir.*, i.nombre AS insumo_nombre, i.stock_actual AS insumo_stock_actual, i.unidad_medida AS insumo_unidad_medida
            FROM ingrediente_recetas ir
            LEFT JOIN insumos i ON ir.insumo_id = i.id
            WHERE ir.receta_id = $1
            ORDER BY ir.id ASC
        `;
        const ingredientsResult = await pool.query(ingredientsQuery, [recipeId]);

        const recipe = recipeResult.rows[0];
        recipe.ingredientes = ingredientsResult.rows;

        res.json(recipe);
    } catch (err) {
        console.error('Error al obtener detalle de receta:', err);
        res.status(500).json({ error: 'Error del servidor al obtener detalle de receta' });
    }
});

// POST /api/recetas
router.post('/', async (req, res) => {
    const { producto_id, nombre, preparacion, porciones, ingredientes } = req.body;
    try {
        await pool.query('BEGIN');
        const recipeRes = await pool.query(
            'INSERT INTO recetas (producto_id, nombre, preparacion, porciones) VALUES ($1, $2, $3, $4) RETURNING *',
            [producto_id, nombre, preparacion, porciones]
        );
        const receta = recipeRes.rows[0];

        if (ingredientes && Array.isArray(ingredientes)) {
            for (const ing of ingredientes) {
                await pool.query(
                    'INSERT INTO ingrediente_recetas (receta_id, insumo_id, nombre_ingrediente, cantidad, unidad_medida) VALUES ($1, $2, $3, $4, $5)',
                    [receta.id, ing.insumo_id, ing.nombre_ingrediente, ing.cantidad, ing.unidad_medida]
                );
            }
        }
        await pool.query('COMMIT');
        res.status(201).json(receta);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al crear receta:', err);
        res.status(500).json({ error: 'Error del servidor al crear receta' });
    }
});

// PUT /api/recetas/:id
router.put('/:id', async (req, res) => {
    const recipeId = req.params.id;
    const { producto_id, nombre, preparacion, porciones, ingredientes } = req.body;
    try {
        await pool.query('BEGIN');
        await pool.query(
            'UPDATE recetas SET producto_id = $1, nombre = $2, preparacion = $3, porciones = $4 WHERE id = $5',
            [producto_id, nombre, preparacion, porciones, recipeId]
        );

        if (ingredientes && Array.isArray(ingredientes)) {
            await pool.query('DELETE FROM ingrediente_recetas WHERE receta_id = $1', [recipeId]);
            for (const ing of ingredientes) {
                await pool.query(
                    'INSERT INTO ingrediente_recetas (receta_id, insumo_id, nombre_ingrediente, cantidad, unidad_medida) VALUES ($1, $2, $3, $4, $5)',
                    [recipeId, ing.insumo_id, ing.nombre_ingrediente, ing.cantidad, ing.unidad_medida]
                );
            }
        }
        await pool.query('COMMIT');
        res.json({ message: 'Receta actualizada correctamente' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al actualizar receta:', err);
        res.status(500).json({ error: 'Error del servidor al actualizar receta' });
    }
});

// DELETE /api/recetas/:id
router.delete('/:id', async (req, res) => {
    const recipeId = req.params.id;
    try {
        await pool.query('DELETE FROM recetas WHERE id = $1', [recipeId]);
        res.json({ message: 'Receta eliminada correctamente' });
    } catch (err) {
        console.error('Error al eliminar receta:', err);
        res.status(500).json({ error: 'Error del servidor al eliminar receta' });
    }
});

module.exports = router;
