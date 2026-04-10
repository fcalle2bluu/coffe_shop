// backend/routes/compras.js
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

// 1. Obtener historial de compras (AHORA CON DETALLES INCLUIDOS)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, 
                   p.nombre as proveedor, 
                   p.telefono as prov_tel,
                   c.total, 
                   c.foto_url,
                   TO_CHAR(c.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_compra,
                   (
                       SELECT json_agg(
                           json_build_object(
                               'nombre', i.nombre,
                               'cantidad', dc.cantidad,
                               'unidad', i.unidad_medida,
                               'imagen_url', i.imagen_url
                           )
                       )
                       FROM detalle_compras dc
                       JOIN insumos i ON dc.insumo_id = i.id
                       WHERE dc.compra_id = c.id
                   ) as detalles_compra
            FROM compras c
            LEFT JOIN proveedores p ON c.proveedor_id = p.id
            ORDER BY c.id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar historial:', error);
        res.status(500).json({ error: 'Error BD: ' + error.message });
    }
});

// 2. Registrar una nueva Compra (Transacción Completa con Foto)
router.post('/', upload.single('foto'), async (req, res) => {
    
    // Si enviamos con FormData, los campos de texto podrían venir en req.body.datos como string JSON
    let proveedor_id, total, detalles;
    
    // Soportar tanto FormData (req.body.datos) como JSON raw (req.body)
    if (req.body.datos) {
        const parsed = JSON.parse(req.body.datos);
        proveedor_id = parsed.proveedor_id;
        total = parsed.total;
        detalles = parsed.detalles;
    } else {
        proveedor_id = req.body.proveedor_id;
        total = req.body.total;
        detalles = req.body.detalles;
    }
    
    let foto_url = null;

    if (!detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'El carrito de compras está vacío.' });
    }
    
    // --- Subida a Supabase si existe foto ---
    if (req.file) {
        if (!supabaseUrl || !supabaseKey) {
            console.warn('⚠️ Faltan keys de Supabase para subir comprobante.');
        } else {
            try {
                const nombreArchivo = `${Date.now()}_comprobante_${req.file.originalname.replace(/\\s+/g, '_')}`;
                
                const { data, error } = await supabase.storage
                    .from('insumos') // Reutilizamos el bucket de insumos
                    .upload(nombreArchivo, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: false
                    });

                if (error) throw error;

                const { data: publicData } = supabase.storage
                    .from('insumos')
                    .getPublicUrl(nombreArchivo);

                foto_url = publicData.publicUrl;
            } catch (errSupabase) {
                console.error("Error subiendo foto de compra a Supabase:", errSupabase);
                // Continuamos aunque falle la foto para no detener la compra
            }
        }
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); 

        // 1. Insertar Cabecera
        const resCompra = await client.query(`
            INSERT INTO compras (proveedor_id, total, fecha, foto_url) 
            VALUES ($1, $2, NOW(), $3) RETURNING id
        `, [proveedor_id, total, foto_url]);
        
        const compraId = resCompra.rows[0].id;

        // 2. Procesar cada ítem
        for (let item of detalles) {
            const cantidad = parseFloat(item.cantidad);
            const subtotal = parseFloat(item.costo); 
            const costoUnitario = cantidad > 0 ? (subtotal / cantidad) : 0;
            const fechaVencimiento = item.vencimiento ? item.vencimiento : null;

            await client.query(`
                INSERT INTO detalle_compras (compra_id, insumo_id, cantidad, costo_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [compraId, item.insumo_id, cantidad, costoUnitario, subtotal]);

            await client.query(`
                INSERT INTO lotes_insumos (insumo_id, compra_id, cantidad_comprada, costo_total, fecha_vencimiento)
                VALUES ($1, $2, $3, $4, $5)
            `, [item.insumo_id, compraId, cantidad, subtotal, fechaVencimiento]);

            await client.query(`
                UPDATE insumos SET stock_actual = stock_actual + $1 WHERE id = $2
            `, [cantidad, item.insumo_id]);

            // Novedad: Si se subió foto, también actualizar la foto del insumo en el Stock!
            if (foto_url) {
                await client.query(`
                    UPDATE insumos SET imagen_url = $1 WHERE id = $2
                `, [foto_url, item.insumo_id]);
            }

            await client.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                VALUES ($1, 'COMPRA', $2, $3, NOW())
            `, [item.insumo_id, cantidad, compraId]);
        }

        await client.query('COMMIT'); 
        res.status(201).json({ message: 'Compra registrada y stock actualizado', id: compraId });
        
    } catch (error) {
        await client.query('ROLLBACK'); 
        console.error('Error en compra:', error);
        res.status(500).json({ error: 'Error de Base de Datos: ' + error.message });
    } finally {
        client.release(); 
    }
});

module.exports = router;