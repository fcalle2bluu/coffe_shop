// backend/routes/almacen.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
}

// Configuración de Multer (Memoria)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB MAX


// 1. Obtener insumos ACTIVOS (Tabla de Stock)
router.get('/insumos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre, unidad_medida, stock_actual, stock_minimo, activo, imagen_url 
            FROM insumos 
            WHERE activo = TRUE 
            ORDER BY nombre ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo insumos:', error);
        res.status(500).json({ error: 'Error al cargar el inventario' });
    }
});

// 2. Registrar un Ajuste Rápido (+ / -)
router.post('/ajuste', async (req, res) => {
    const { insumo_id, tipo, cantidad } = req.body;
    
    if (!insumo_id || !tipo || !cantidad || cantidad <= 0) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }
    
    const cliente = await pool.connect(); 
    try {
        await cliente.query('BEGIN'); 
        
        const cantidadReal = tipo === 'MERMA' ? -Math.abs(cantidad) : Math.abs(cantidad);
        
        const updateResult = await cliente.query(`
            UPDATE insumos 
            SET stock_actual = stock_actual + $1 
            WHERE id = $2 
            RETURNING stock_actual
        `, [cantidadReal, insumo_id]);
        
        if (updateResult.rowCount === 0) throw new Error('Insumo no encontrado');
        if (updateResult.rows[0].stock_actual < 0) throw new Error('Stock insuficiente');

        await cliente.query(`
            INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, fecha) 
            VALUES ($1, $2, $3, NOW())
        `, [insumo_id, tipo, Math.abs(cantidad)]);

        await cliente.query('COMMIT'); 
        res.json({ mensaje: 'Ajuste registrado', nuevoStock: updateResult.rows[0].stock_actual });
    } catch (error) {
        await cliente.query('ROLLBACK'); 
        res.status(400).json({ error: error.message });
    } finally {
        cliente.release(); 
    }
});

// 3. Crear un NUEVO Insumo
router.post('/', upload.single('imagen'), async (req, res) => {
    // Si viene FormData, req.body tendrá datos como strings y req.file tendrá la imagen
    const { nombre, unidad_medida, stock_inicial, stock_minimo } = req.body;
    let imagen_url = null;
    
    if (!nombre || !unidad_medida) {
        return res.status(400).json({ error: 'El nombre y unidad son obligatorios' });
    }

    try {
        let mensajeAdvertencia = null;
        
        // [Fase A] - Subida de Imagen a Supabase Storage
        if (req.file) {
            if (!supabaseUrl || !supabaseKey) {
                console.warn('⚠️ No hay keys de Supabase configuradas para subir la imagen.');
                mensajeAdvertencia = 'El insumo se guardó, pero la foto no porque faltan las claves de Supabase en tu servidor (.env).';
            } else {
                const nombreArchivo = `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
                
                const { data, error } = await supabase.storage
                    .from('insumos') // Nombre del bucket fijo
                    .upload(nombreArchivo, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: false
                    });

                if (error) {
                    console.error('Error subiendo a Supabase:', error);
                    mensajeAdvertencia = 'Error subiendo la foto a Supabase (revisa los permisos del Bucket "insumos"): ' + error.message;
                } else {
                    const { data: publicUrlData } = supabase.storage
                        .from('insumos')
                        .getPublicUrl(nombreArchivo);
                    
                    imagen_url = publicUrlData.publicUrl;
                }
            }
        }

        // [Fase B] - Guardado en PostgreSQL
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            
            // Inyectamos la URL de la imagen en la tabla (requiere la columna imagen_url)
            const insertInsumo = await cliente.query(`
                INSERT INTO insumos (nombre, unidad_medida, stock_actual, stock_minimo, imagen_url) 
                VALUES ($1, $2, $3, $4, $5) 
                RETURNING *
            `, [nombre, unidad_medida, stock_inicial || 0, stock_minimo || 0, imagen_url]);
            
            const nuevoInsumo = insertInsumo.rows[0];

            if (stock_inicial > 0) {
                await cliente.query(`
                    INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, fecha) 
                    VALUES ($1, 'COMPRA', $2, NOW())
                `, [nuevoInsumo.id, stock_inicial]);
            }

            await cliente.query('COMMIT'); 
            
            res.json({ 
                mensaje: 'Insumo creado con éxito', 
                insumo: nuevoInsumo,
                advertencia: mensajeAdvertencia 
            });
        } catch (dbError) {
            await cliente.query('ROLLBACK'); 
            throw dbError; // Pasamos el error al catch general
        } finally {
            cliente.release();
        }

    } catch (error) {
        console.error('Error creando insumo o subiendo archivo:', error);
        res.status(500).json({ error: 'Error interno guardando insumo: ' + error.message });
    }
});

// 4. Obtener el historial de movimientos
router.get('/movimientos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                m.id, 
                i.nombre AS insumo, 
                m.tipo, 
                m.cantidad, 
                TO_CHAR(m.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI:SS') AS fecha_hora            
            FROM movimientos_inventario m
            JOIN insumos i ON m.insumo_id = i.id
            ORDER BY m.fecha DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al cargar el historial' });
    }
});

// 5. NUEVO: Eliminar Insumo (Soft Delete)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // En lugar de borrarlo, lo marcamos como inactivo para proteger el historial contable
        await pool.query('UPDATE insumos SET activo = FALSE WHERE id = $1', [id]);
        res.json({ success: true, mensaje: 'Insumo eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando insumo:', error);
        res.status(500).json({ error: 'Error al eliminar el insumo' });
    }
});

module.exports = router;