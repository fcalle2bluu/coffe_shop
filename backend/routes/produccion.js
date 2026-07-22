const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener recetas de cocina/pastelería activas
router.get('/recetas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.nombre, p.nombre AS producto_nombre, p.id AS producto_id
            FROM recetas r
            JOIN productos p ON r.producto_id = p.id
            WHERE p.activo = TRUE
            ORDER BY r.nombre ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener recetas para producción:', error);
        res.status(500).json({ error: 'Error al obtener recetas de producción' });
    }
});

// 2. Calcular Explosión de Materiales
router.post('/explosion', async (req, res) => {
    const { recetas } = req.body; // Array de { receta_id, cantidad }
    if (!recetas || !Array.isArray(recetas) || recetas.length === 0) {
        return res.status(400).json({ error: 'Debes proporcionar un listado de recetas y cantidades válidas' });
    }

    try {
        const query = `
            WITH req_ingredientes AS (
                SELECT 
                    ir.insumo_id,
                    ir.nombre_ingrediente,
                    SUM(ir.cantidad * req.cantidad) AS cantidad_requerida
                FROM (
                    SELECT 
                        (elem->>'receta_id')::int AS receta_id,
                        (elem->>'cantidad')::numeric AS cantidad
                    FROM json_array_elements($1::json) AS elem
                ) AS req
                JOIN ingrediente_recetas ir ON ir.receta_id = req.receta_id
                WHERE ir.insumo_id IS NOT NULL
                GROUP BY ir.insumo_id, ir.nombre_ingrediente
            )
            SELECT 
                ri.insumo_id AS id,
                i.nombre,
                ri.cantidad_requerida,
                i.unidad_medida,
                COALESCE((SELECT stock_actual FROM inventario_almacen WHERE almacen_id = (SELECT id FROM almacenes WHERE nombre = 'Almacén Central') AND insumo_id = ri.insumo_id), 0.00) AS stock_central,
                COALESCE((SELECT stock_actual FROM inventario_almacen WHERE almacen_id = (SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería') AND insumo_id = ri.insumo_id), 0.00) AS stock_pasteleria
            FROM req_ingredientes ri
            JOIN insumos i ON ri.insumo_id = i.id
            ORDER BY i.nombre ASC;
        `;
        
        const result = await pool.query(query, [JSON.stringify(recetas)]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al calcular explosión de materiales:', error);
        res.status(500).json({ error: 'Error interno al procesar la explosión de insumos: ' + error.message });
    }
});

// 3. Registrar una nueva Orden de Producción (Vale pendiente)
router.post('/orden', async (req, res) => {
    const { usuario_id, observaciones, detalles } = req.body; // detalles: [{ receta_id, cantidad }]

    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
        return res.status(400).json({ error: 'La orden debe contener al menos un producto' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insertar cabecera de la orden
        const orderRes = await client.query(`
            INSERT INTO ordenes_produccion (usuario_id, observaciones, estado)
            VALUES ($1, $2, 'PENDIENTE')
            RETURNING id
        `, [usuario_id || null, observaciones || '']);
        const ordenId = orderRes.rows[0].id;

        // Insertar detalles
        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_orden (orden_id, receta_id, cantidad)
                VALUES ($1, $2, $3)
            `, [ordenId, item.receta_id, item.cantidad]);
        }

        await client.query('COMMIT');
        res.status(201).json({ mensaje: 'Orden de producción registrada con éxito', orden_id: ordenId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear orden de producción:', error);
        res.status(500).json({ error: 'Error al registrar orden de producción: ' + error.message });
    } finally {
        client.release();
    }
});

// 4. Obtener todas las órdenes de producción
router.get('/ordenes', async (req, res) => {
    try {
        const ordersRes = await pool.query(`
            SELECT 
                op.id,
                TO_CHAR(op.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI:SS') AS fecha_formateada,
                op.estado,
                op.observaciones,
                u.nombre AS solicitante
            FROM ordenes_produccion op
            LEFT JOIN usuarios u ON op.usuario_id = u.id
            ORDER BY op.fecha DESC
        `);

        const orders = ordersRes.rows;

        // Cargar detalles de cada orden
        for (let order of orders) {
            const detailRes = await pool.query(`
                SELECT 
                    do.id,
                    do.receta_id,
                    r.nombre AS receta_nombre,
                    do.cantidad
                FROM detalle_orden do
                JOIN recetas r ON do.receta_id = r.id
                WHERE do.orden_id = $1
            `, [order.id]);
            order.detalles = detailRes.rows;
        }

        res.json(orders);
    } catch (error) {
        console.error('Error al obtener órdenes de producción:', error);
        res.status(500).json({ error: 'Error al listar órdenes de producción' });
    }
});

// 5. Aprobar Orden de Producción (Vale de Transferencia Interna)
router.put('/ordenes/:id/aprobar', async (req, res) => {
    const { id } = req.params;
    const { force } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener detalles de la orden
        const orderRes = await client.query('SELECT estado FROM ordenes_produccion WHERE id = $1', [id]);
        if (orderRes.rows.length === 0) {
            throw new Error('Orden de producción no encontrada');
        }
        if (orderRes.rows[0].estado !== 'PENDIENTE') {
            throw new Error('Esta orden ya fue procesada (' + orderRes.rows[0].estado + ')');
        }

        // Obtener la explosión de materiales para esta orden
        const queryExplosion = `
            SELECT 
                ir.insumo_id,
                SUM(ir.cantidad * do.cantidad) AS cantidad_requerida
            FROM detalle_orden do
            JOIN ingrediente_recetas ir ON ir.receta_id = do.receta_id
            WHERE do.orden_id = $1 AND ir.insumo_id IS NOT NULL
            GROUP BY ir.insumo_id
        `;
        const explosionRes = await client.query(queryExplosion, [id]);
        const insumosRequeridos = explosionRes.rows;

        // Obtener IDs de almacenes
        const centralRes = await client.query("SELECT id FROM almacenes WHERE nombre = 'Almacén Central' LIMIT 1");
        const pasteleriaRes = await client.query("SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1");
        const centralId = centralRes.rows[0].id;
        const pasteleriaId = pasteleriaRes.rows[0].id;

        // 2. Validar stock en Almacén Central
        if (!force) {
            for (let reqInsumo of insumosRequeridos) {
                const stockRes = await client.query(`
                    SELECT stock_actual FROM inventario_almacen 
                    WHERE almacen_id = $1 AND insumo_id = $2
                `, [centralId, reqInsumo.insumo_id]);
                const stockCentral = parseFloat(stockRes.rows[0]?.stock_actual || 0);
                const reqCant = parseFloat(reqInsumo.cantidad_requerida);

                if (stockCentral < reqCant) {
                    const nameRes = await client.query('SELECT nombre FROM insumos WHERE id = $1', [reqInsumo.insumo_id]);
                    throw new Error(`Stock insuficiente de "${nameRes.rows[0]?.nombre}" en Almacén Central (Requerido: ${reqCant}, Disponible: ${stockCentral})`);
                }
            }
        }

        // 3. Ejecutar Transferencia (UPDATE doble)
        for (let reqInsumo of insumosRequeridos) {
            const reqCant = parseFloat(reqInsumo.cantidad_requerida);

            // Restar del Central
            await client.query(`
                UPDATE inventario_almacen 
                SET stock_actual = GREATEST(0, stock_actual - $1)
                WHERE almacen_id = $2 AND insumo_id = $3
            `, [reqCant, centralId, reqInsumo.insumo_id]);

            // Sumar a Pastelería
            await client.query(`
                UPDATE inventario_almacen 
                SET stock_actual = stock_actual + $1
                WHERE almacen_id = $2 AND insumo_id = $3
            `, [reqCant, pasteleriaId, reqInsumo.insumo_id]);

            // Registrar movimientos en movimientos_inventario
            await client.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                VALUES ($1, 'TRANSFER_SALIDA', $2, $3, NOW())
            `, [reqInsumo.insumo_id, reqCant, id]);
            await client.query(`
                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                VALUES ($1, 'TRANSFER_ENTRADA', $2, $3, NOW())
            `, [reqInsumo.insumo_id, reqCant, id]);
        }

        // 4. Marcar orden como APROBADA
        await client.query("UPDATE ordenes_produccion SET estado = 'APROBADA' WHERE id = $1", [id]);

        await client.query('COMMIT');
        res.json({ success: true, mensaje: 'Vale de transferencia aprobado. Stocks actualizados.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al aprobar orden de producción:', error);
        res.status(400).json({ error: error.message || 'Error al procesar transferencia' });
    } finally {
        client.release();
    }
});

// 6. Rechazar Orden de Producción
router.put('/ordenes/:id/rechazar', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            UPDATE ordenes_produccion 
            SET estado = 'RECHAZADA' 
            WHERE id = $1 AND estado = 'PENDIENTE'
        `);
        if (result.rowCount === 0) {
            return res.status(400).json({ error: 'La orden no existe o ya no está PENDIENTE' });
        }
        res.json({ success: true, mensaje: 'Orden de producción rechazada con éxito' });
    } catch (error) {
        console.error('Error al rechazar orden:', error);
        res.status(500).json({ error: 'Error interno al rechazar la orden' });
    }
});

// 7. Módulo de Auditoría de Pastelería - Obtener stocks teóricos
router.get('/auditoria/insumos', async (req, res) => {
    try {
        const query = `
            SELECT 
                i.id,
                i.nombre,
                i.unidad_medida,
                COALESCE(ia.stock_actual, 0.00) AS stock_teorico
            FROM insumos i
            LEFT JOIN inventario_almacen ia ON ia.insumo_id = i.id
            WHERE i.activo = TRUE AND ia.almacen_id = (SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1)
            ORDER BY i.nombre ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener insumos para auditoría de pastelería:', error);
        res.status(500).json({ error: 'Error al cargar inventario teórico' });
    }
});

// 8. Registrar Auditoría de Pastelería (Mermas/Variaciones)
router.post('/auditoria', async (req, res) => {
    const { usuario_id, observaciones, ajustes } = req.body; // ajustes: [{ insumo_id, cantidad_real }]

    if (!ajustes || !Array.isArray(ajustes) || ajustes.length === 0) {
        return res.status(400).json({ error: 'Debes proporcionar los ajustes físicos del inventario' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Crear cabecera de auditoría
        const auditRes = await client.query(`
            INSERT INTO auditorias_pasteleria (usuario_id, observaciones)
            VALUES ($1, $2)
            RETURNING id
        `, [usuario_id || null, observaciones || '']);
        const auditoriaId = auditRes.rows[0].id;

        // Obtener ID de Almacén Pastelería
        const pasteleriaRes = await client.query("SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1");
        const pasteleriaId = pasteleriaRes.rows[0].id;

        for (let item of ajustes) {
            // Obtener teórico actual
            const teoricoRes = await client.query(`
                SELECT stock_actual FROM inventario_almacen
                WHERE almacen_id = $1 AND insumo_id = $2
            `, [pasteleriaId, item.insumo_id]);
            const cantidadTeorica = parseFloat(teoricoRes.rows[0]?.stock_actual || 0);
            const cantidadReal = parseFloat(item.cantidad_real);
            const diferencia = cantidadReal - cantidadTeorica;

            // Registrar detalle de auditoría
            await client.query(`
                INSERT INTO detalle_auditoria_pasteleria (auditoria_id, insumo_id, cantidad_teorica, cantidad_real, diferencia)
                VALUES ($1, $2, $3, $4, $5)
            `, [auditoriaId, item.insumo_id, cantidadTeorica, cantidadReal, diferencia]);

            if (diferencia !== 0) {
                // Actualizar stock en Almacén Pastelería
                await client.query(`
                    UPDATE inventario_almacen 
                    SET stock_actual = $1 
                    WHERE almacen_id = $2 AND insumo_id = $3
                `, [cantidadReal, pasteleriaId, item.insumo_id]);

                // Registrar en movimientos_inventario (MERMA si es menor, AJUSTE si es mayor)
                const tipoMov = diferencia < 0 ? 'MERMA' : 'AJUSTE';
                await client.query(`
                    INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                    VALUES ($1, $2, $3, $4, NOW())
                `, [item.insumo_id, tipoMov, Math.abs(diferencia), auditoriaId]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ mensaje: 'Auditoría física de pastelería registrada con éxito' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al registrar auditoría de pastelería:', error);
        res.status(500).json({ error: 'Error al registrar auditoría: ' + error.message });
    } finally {
        client.release();
    }
});

// 9. Obtener historial de auditorías de pastelería
router.get('/auditorias', async (req, res) => {
    try {
        const auditRes = await pool.query(`
            SELECT 
                ap.id,
                TO_CHAR(ap.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI:SS') AS fecha_formateada,
                ap.observaciones,
                u.nombre AS auditor
            FROM auditorias_pasteleria ap
            LEFT JOIN usuarios u ON ap.usuario_id = u.id
            ORDER BY ap.fecha DESC
        `);

        const auditorias = auditRes.rows;

        for (let aud of auditorias) {
            const detailRes = await pool.query(`
                SELECT 
                    da.id,
                    i.nombre AS insumo_nombre,
                    i.unidad_medida,
                    da.cantidad_teorica,
                    da.cantidad_real,
                    da.diferencia
                FROM detalle_auditoria_pasteleria da
                JOIN insumos i ON da.insumo_id = i.id
                WHERE da.auditoria_id = $1
            `, [aud.id]);
            aud.detalles = detailRes.rows;
        }

        res.json(auditorias);
    } catch (error) {
        console.error('Error al obtener historial de auditorías de pastelería:', error);
        res.status(500).json({ error: 'Error al obtener historial de auditorías' });
    }
});

module.exports = router;
