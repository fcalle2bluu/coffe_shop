// backend/routes/comandas.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// GET /api/comandas/debug-db
router.get('/debug-db', async (req, res) => {
    try {
        const searchPath = await pool.query("SHOW search_path");
        const cols = await pool.query(`
            SELECT table_schema, table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'comandas'
        `);
        
        let selectErr = null;
        let selectResult = null;
        try {
            const sel = await pool.query("SELECT * FROM comandas LIMIT 1");
            selectResult = sel.rows;
        } catch (e) {
            selectErr = e.message;
        }

        // Intentar agregar la columna por si acaso no está en el schema correcto
        let alterResult = null;
        try {
            await pool.query("ALTER TABLE comandas ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'CREADA'");
            alterResult = "ALTER TABLE succeeded";
        } catch (e) {
            alterResult = "ALTER TABLE failed: " + e.message;
        }

        res.json({
            searchPath: searchPath.rows,
            columns: cols.rows,
            selectResult,
            selectErr,
            alterResult
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1. Obtener todas las comandas activas (CREADA, ENTREGADA)
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT c.*, u.nombre as mesero_nombre
            FROM comandas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.estado IN ('CREADA', 'ENTREGADA')
            ORDER BY c.fecha_creacion DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener comandas:', error);
        res.status(500).json({ error: 'Error al obtener comandas' });
    }
});

// 2. Obtener el estado consolidado de las mesas activas
router.get('/mesas-estado', async (req, res) => {
    try {
        const query = `
            SELECT c.*, u.nombre as mesero_nombre
            FROM comandas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.estado IN ('CREADA', 'ENTREGADA')
        `;
        const result = await pool.query(query);
        
        // Crear mapa de comandas activas por mesa
        const comandasActivas = {};
        result.rows.forEach(c => {
            comandasActivas[c.mesa] = c;
        });

        // Obtener mesas desde la base de datos
        const mesasQuery = `
            SELECT * FROM mesas 
            WHERE activo = true 
            ORDER BY piso DESC, numero ASC
        `;
        const mesasResult = await pool.query(mesasQuery);

        const mesas = mesasResult.rows.map(m => {
            const comanda = comandasActivas[m.numero];
            return {
                id: m.id,
                mesa: m.numero, // Mantener clave 'mesa' para compatibilidad
                piso: m.piso,
                pos_x: m.pos_x,
                pos_y: m.pos_y,
                estado: comanda ? 'ocupada' : 'libre',
                comanda: comanda || null
            };
        });
        
        res.json(mesas);
    } catch (error) {
        console.error('Error al obtener estado de mesas:', error);
        res.status(500).json({ error: 'Error al obtener estado de mesas' });
    }
});

// 3. Obtener el detalle de una comanda activa por número de mesa
router.get('/mesa/:numero', async (req, res) => {
    const { numero } = req.params;
    try {
        // Obtener cabecera
        const queryComanda = `
            SELECT c.*, u.nombre as mesero_nombre
            FROM comandas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.mesa = $1 AND c.estado IN ('CREADA', 'ENTREGADA')
            LIMIT 1
        `;
        const resultComanda = await pool.query(queryComanda, [numero]);
        
        if (resultComanda.rows.length === 0) {
            return res.json({ activa: false });
        }

        const comanda = resultComanda.rows[0];

        // Obtener detalles del pedido
        const queryDetalle = `
            SELECT dc.*, p.nombre as producto_nombre, p.imagen_url
            FROM detalle_comandas dc
            JOIN productos p ON dc.producto_id = p.id
            WHERE dc.comanda_id = $1
        `;
        const resultDetalle = await pool.query(queryDetalle, [comanda.id]);

        res.json({
            activa: true,
            comanda: comanda,
            items: resultDetalle.rows
        });
    } catch (error) {
        console.error(`Error al obtener comanda de mesa ${numero}:`, error);
        res.status(500).json({ error: 'Error al obtener comanda de la mesa' });
    }
});

// 4. Crear una nueva comanda (Mesero inicia pedido)
router.post('/', async (req, res) => {
    const { mesa, usuario_id, total, detalles } = req.body;

    if (!mesa || !usuario_id || !detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'Datos de comanda incompletos o carrito vacío.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Validar si la mesa ya tiene una comanda activa
        const checkQuery = `
            SELECT id FROM comandas 
            WHERE mesa = $1 AND estado IN ('CREADA', 'ENTREGADA') 
            LIMIT 1
        `;
        const checkResult = await client.query(checkQuery, [mesa]);
        if (checkResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `La mesa ${mesa} ya tiene una comanda activa.` });
        }

        // Obtener caja abierta (si existe)
        const cajaRes = await client.query(`
            SELECT id FROM cajas WHERE estado = 'ABIERTA' LIMIT 1
        `);
        const cajaId = cajaRes.rows.length > 0 ? cajaRes.rows[0].id : null;

        // 1. Insertar Cabecera de Comanda
        const insertComanda = `
            INSERT INTO comandas (mesa, usuario_id, caja_id, estado, total)
            VALUES ($1, $2, $3, 'CREADA', $4)
            RETURNING id
        `;
        const resultComanda = await client.query(insertComanda, [mesa, usuario_id, cajaId, total]);
        const comandaId = resultComanda.rows[0].id;

        // 2. Insertar Detalle de Comanda
        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_comandas (comanda_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [comandaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, comanda_id: comandaId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear comanda:', error);
        res.status(500).json({ 
            error: 'Error interno al guardar comanda: ' + error.message, 
            stack: error.stack, 
            table: error.table, 
            schema: error.schema,
            detail: error.detail,
            hint: error.hint,
            query: error.query,
            where: error.where
        });
    } finally {
        client.release();
    }
});

// 5. Cambiar el estado de la comanda (ej: CREADA -> ENTREGADA, o CANCELADA)
router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
        return res.status(400).json({ error: 'El estado es requerido.' });
    }

    try {
        const query = `
            UPDATE comandas 
            SET estado = $1, fecha_actualizacion = CURRENT_TIMESTAMP 
            WHERE id = $2 
            RETURNING id
        `;
        const result = await pool.query(query, [estado, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comanda no encontrada.' });
        }
        res.json({ success: true, message: `Comanda actualizada a estado ${estado}` });
    } catch (error) {
        console.error('Error al actualizar comanda:', error);
        res.status(500).json({ error: 'Error al actualizar comanda' });
    }
});

// 6. Procesar Pago y Finalizar Venta (Comanda -> Venta)
router.post('/:id/pagar', async (req, res) => {
    const { id } = req.params;
    const { metodo_pago, usuario_id } = req.body;

    if (!metodo_pago) {
        return res.status(400).json({ error: 'El método de pago es requerido.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener la comanda y sus productos
        const comandaRes = await client.query('SELECT * FROM comandas WHERE id = $1', [id]);
        if (comandaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Comanda no encontrada.' });
        }

        const comanda = comandaRes.rows[0];
        if (comanda.estado === 'PAGADA' || comanda.estado === 'CANCELADA') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Esta comanda ya está cerrada o cancelada.' });
        }

        // Obtener caja abierta para el cobro
        const cajaRes = await client.query(`
            SELECT id FROM cajas WHERE estado = 'ABIERTA' LIMIT 1
        `);
        if (cajaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No se puede cobrar si no hay una caja abierta.' });
        }
        const cajaId = cajaRes.rows[0].id;

        // Obtener los detalles de la comanda
        const detallesRes = await client.query(
            'SELECT * FROM detalle_comandas WHERE comanda_id = $1', 
            [id]
        );
        const detalles = detallesRes.rows;

        // 2. Registrar la cabecera en la tabla 'ventas' (Reutiliza el esquema del POS original)
        const insertVenta = `
            INSERT INTO ventas (usuario_id, caja_id, total, metodo_pago, fecha_venta) 
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) 
            RETURNING id
        `;
        const resultVenta = await client.query(insertVenta, [
            usuario_id || comanda.usuario_id, 
            cajaId, 
            comanda.total, 
            metodo_pago
        ]);
        const ventaId = resultVenta.rows[0].id;

        // 3. Registrar los productos en 'detalle_ventas'
        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);
        }

        // 4. Actualizar estado de comanda a PAGADA
        await client.query(`
            UPDATE comandas 
            SET estado = 'PAGADA', caja_id = $1, fecha_actualizacion = CURRENT_TIMESTAMP 
            WHERE id = $2
        `, [cajaId, id]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, venta_id: ventaId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al procesar pago de comanda:', error);
        res.status(500).json({ error: 'Error interno al procesar el pago: ' + error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
