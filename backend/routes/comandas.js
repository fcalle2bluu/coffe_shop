// backend/routes/comandas.js
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
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR' && rol !== 'CAJERO') {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos suficientes.' });
        }
        next();
    } catch (err) {
        console.error('Error al validar permisos de admin en comandas:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

// Middleware MESERO o Admin/Cajero: para que el mesero cree/liste/elimine sus propios pedidos
const checkMeseroOAdmin = async (req, res, next) => {
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
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR' && rol !== 'CAJERO' && rol !== 'MESERO') {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos suficientes.' });
        }
        req.rolActual = rol;
        next();
    } catch (err) {
        console.error('Error al validar permisos de mesero en comandas:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

// Middleware COCINERO o Admin/Cajero: para la pantalla de cocina (leer/actualizar pendientes)
const checkCocineroOAdmin = async (req, res, next) => {
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
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR' && rol !== 'CAJERO' && rol !== 'COCINERO') {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos suficientes.' });
        }
        next();
    } catch (err) {
        console.error('Error al validar permisos de cocinero en comandas:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

// === Rutas de MESERO (deben ir antes del router.use admin-only) ===

// Crear una nueva comanda (Mesero inicia pedido)
router.post('/', checkMeseroOAdmin, async (req, res) => {
    const { mesa, usuario_id, total, detalles, fecha_hora, notas } = req.body;

    if (!mesa || !usuario_id || !detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'Datos de comanda incompletos o carrito vacío.' });
    }

    // La fecha/hora la manda el navegador del mesero (hora local del punto de venta);
    // si no llega por algún motivo, se usa la hora del servidor como respaldo.
    const fechaHoraCliente = fecha_hora ? new Date(fecha_hora) : new Date();

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
            SELECT id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1
        `);
        const cajaId = cajaRes.rows.length > 0 ? cajaRes.rows[0].id : null;

        // Número de comanda correlativo por turno (control interno): reinicia
        // en 1 con cada caja/turno nuevo. Si no hay caja abierta, se acota por
        // el día para que igual sirva de control aunque no se haya abierto turno.
        const numeroComandaRes = cajaId
            ? await client.query(`SELECT COALESCE(MAX(numero_comanda), 0) + 1 AS siguiente FROM comandas WHERE caja_id = $1`, [cajaId])
            : await client.query(`SELECT COALESCE(MAX(numero_comanda), 0) + 1 AS siguiente FROM comandas WHERE caja_id IS NULL AND fecha_creacion::date = CURRENT_DATE`);
        const numeroComanda = numeroComandaRes.rows[0].siguiente;

        // 1. Insertar Cabecera de Comanda
        const insertComanda = `
            INSERT INTO comandas (mesa, usuario_id, caja_id, estado, estado_cocina, total, fecha_hora_cliente, notas, numero_comanda)
            VALUES ($1, $2, $3, 'CREADA', 'PENDIENTE', $4, $5, $6, $7)
            RETURNING id, numero_comanda
        `;
        const resultComanda = await client.query(insertComanda, [mesa, usuario_id, cajaId, total, fechaHoraCliente, notas || null, numeroComanda]);
        const comandaId = resultComanda.rows[0].id;

        // 2. Insertar Detalle de Comanda
        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_comandas (comanda_id, producto_id, cantidad, precio_unitario, subtotal, notas)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [comandaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal, item.notas || null]);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, comanda_id: comandaId, numero_comanda: numeroComanda });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear comanda:', error);
        res.status(500).json({ error: 'Error interno al guardar comanda: ' + error.message });
    } finally {
        client.release();
    }
});

// Listar TODAS las comandas activas (pendientes de cobro) para la pestaña "Control":
// visible para cualquier mesero, sin importar quién la creó ni el día, ya que el
// salón es compartido y cualquier mesero puede necesitar sumar o revisar una mesa.
router.get('/mesero/activas', checkMeseroOAdmin, async (req, res) => {
    try {
        const query = `
            SELECT c.*, u.nombre as mesero_nombre,
                (
                    SELECT json_agg(json_build_object(
                        'id', dc.id,
                        'producto_id', dc.producto_id,
                        'nombre', p.nombre,
                        'cantidad', dc.cantidad,
                        'precio_unitario', dc.precio_unitario,
                        'subtotal', dc.subtotal,
                        'notas', dc.notas
                    ) ORDER BY dc.id)
                    FROM detalle_comandas dc
                    JOIN productos p ON dc.producto_id = p.id
                    WHERE dc.comanda_id = c.id
                ) as items
            FROM comandas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.estado IN ('CREADA', 'ENTREGADA')
            ORDER BY c.fecha_creacion DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener comandas activas:', error);
        res.status(500).json({ error: 'Error al obtener comandas activas' });
    }
});

// Editar una comanda propia desde "Control": permite cambiar cantidades, agregar/quitar productos y notas.
// Al guardar, se reemplaza el detalle completo y se marca estado_cocina = PENDIENTE para que cocina
// vea el pedido actualizado en su próxima consulta (mismo mecanismo que una comanda nueva).
// Cualquier mesero puede editar cualquier comanda activa (el salón es compartido), no solo la propia.
router.put('/mesero/:id', checkMeseroOAdmin, async (req, res) => {
    const { id } = req.params;
    const { detalles, total, notas } = req.body;

    if (!detalles || detalles.length === 0) {
        return res.status(400).json({ error: 'La comanda debe tener al menos un producto.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const comandaRes = await client.query('SELECT estado FROM comandas WHERE id = $1', [id]);
        if (comandaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Comanda no encontrada.' });
        }

        const comanda = comandaRes.rows[0];
        if (comanda.estado === 'PAGADA') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No se puede editar una comanda ya cobrada.' });
        }

        // Reemplazar el detalle completo (más simple y confiable que hacer un diff item por item).
        // es_nuevo lo calcula el cliente (que ya sabe qué se sumó en esta edición) y es opcional:
        // si no llega (apps o pantallas viejas), queda en false y simplemente no se resalta nada.
        await client.query('DELETE FROM detalle_comandas WHERE comanda_id = $1', [id]);
        for (const item of detalles) {
            await client.query(`
                INSERT INTO detalle_comandas (comanda_id, producto_id, cantidad, precio_unitario, subtotal, notas, es_nuevo)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [id, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal, item.notas || null, item.es_nuevo === true]);
        }

        await client.query(`
            UPDATE comandas
            SET total = $1, notas = $2, estado_cocina = 'PENDIENTE', fecha_actualizacion = CURRENT_TIMESTAMP, version = version + 1
            WHERE id = $3
        `, [total, notas || null, id]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Comanda actualizada correctamente' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al editar comanda:', error);
        res.status(500).json({ error: 'Error interno al editar comanda: ' + error.message });
    } finally {
        client.release();
    }
});

// Solicitar reimpresión manual desde "Control" (el mesero pide que la comanda se
// vuelva a imprimir/mostrar en cocina, sin necesidad de cambiar productos). Se
// incrementa version para que la app de cocina la detecte y reimprima, y vuelve
// a marcarla como PENDIENTE por si ya estaba completada/rechazada.
router.post('/mesero/:id/imprimir', checkMeseroOAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            UPDATE comandas
            SET estado_cocina = 'PENDIENTE', fecha_actualizacion = CURRENT_TIMESTAMP, version = version + 1
            WHERE id = $1
            RETURNING id, version
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comanda no encontrada.' });
        }
        res.json({ success: true, message: 'Se solicitó la reimpresión a cocina', version: result.rows[0].version });
    } catch (error) {
        console.error('Error al solicitar reimpresión:', error);
        res.status(500).json({ error: 'Error al solicitar reimpresión: ' + error.message });
    }
});

// Eliminar una comanda activa desde "Control" (cualquier mesero, admin o cajero, ya que el salón es compartido)
router.delete('/:id', checkMeseroOAdmin, async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const comandaRes = await client.query('SELECT estado FROM comandas WHERE id = $1', [id]);
        if (comandaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Comanda no encontrada.' });
        }

        const comanda = comandaRes.rows[0];
        if (comanda.estado === 'PAGADA') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No se puede eliminar una comanda ya cobrada.' });
        }

        await client.query('DELETE FROM detalle_comandas WHERE comanda_id = $1', [id]);
        await client.query('DELETE FROM comandas WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Comanda eliminada correctamente' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar comanda:', error);
        res.status(500).json({ error: 'Error al eliminar comanda: ' + error.message });
    } finally {
        client.release();
    }
});

// === Rutas de COCINERO (deben ir antes del router.use admin-only) ===

// Obtener las comandas pendientes para la pantalla/impresión de cocina
router.get('/cocina/pendientes', checkCocineroOAdmin, async (req, res) => {
    try {
        const query = `
            SELECT c.id, c.mesa, c.total, c.fecha_creacion, c.fecha_hora_cliente, c.estado, c.estado_cocina, c.notas, c.version, c.numero_comanda, u.nombre as mesero_nombre,
                (
                    SELECT json_agg(json_build_object('producto_id', dc.producto_id, 'nombre', p.nombre, 'cantidad', dc.cantidad, 'notas', dc.notas, 'es_nuevo', dc.es_nuevo))
                    FROM detalle_comandas dc
                    JOIN productos p ON dc.producto_id = p.id
                    WHERE dc.comanda_id = c.id
                ) as items
            FROM comandas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.estado_cocina = 'PENDIENTE' AND c.estado IN ('CREADA', 'ENTREGADA')
            ORDER BY c.fecha_creacion ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener comandas pendientes de cocina:', error);
        res.status(500).json({ error: 'Error al obtener comandas pendientes de cocina' });
    }
});

// Actualizar el estado de cocina de una comanda (RECHAZADA / COMPLETADA)
router.put('/:id/estado-cocina', checkCocineroOAdmin, async (req, res) => {
    const { id } = req.params;
    const { estado_cocina } = req.body;

    if (!['RECHAZADA', 'COMPLETADA'].includes(estado_cocina)) {
        return res.status(400).json({ error: "El estado de cocina debe ser 'RECHAZADA' o 'COMPLETADA'." });
    }

    try {
        const result = await pool.query(
            'UPDATE comandas SET estado_cocina = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
            [estado_cocina, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comanda no encontrada.' });
        }
        res.json({ success: true, message: `Comanda actualizada a estado de cocina ${estado_cocina}` });
    } catch (error) {
        console.error('Error al actualizar estado de cocina:', error);
        res.status(500).json({ error: 'Error al actualizar estado de cocina' });
    }
});

// Obtener el estado consolidado de las mesas activas (mesero también lo necesita
// para saber qué mesa está libre/ocupada al elegir dónde mandar el pedido)
router.get('/mesas-estado', checkMeseroOAdmin, async (req, res) => {
    try {
        const query = `
            SELECT c.*, u.nombre as mesero_nombre,
                (
                    SELECT json_agg(json_build_object(
                        'id', dc.id,
                        'producto_id', dc.producto_id,
                        'nombre', p.nombre,
                        'cantidad', dc.cantidad,
                        'precio_unitario', dc.precio_unitario,
                        'subtotal', dc.subtotal,
                        'notas', dc.notas
                    ) ORDER BY dc.id)
                    FROM detalle_comandas dc
                    JOIN productos p ON dc.producto_id = p.id
                    WHERE dc.comanda_id = c.id
                ) as items
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
            ORDER BY piso DESC, COALESCE(NULLIF(regexp_replace(numero, '[^0-9]', '', 'g'), '')::int, 999999) ASC, numero ASC
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
        res.status(500).json({ error: 'Error al obtener estado de mesas: ' + error.message });
    }
});

router.use(checkAdminPermission);

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
    const { metodo_pago, usuario_id, pagos } = req.body;
    const pagosBody = Array.isArray(pagos) ? pagos : null;

    if (!pagosBody && !metodo_pago) {
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

        const totalComanda = parseFloat(comanda.total);

        // Cobro dividido: una lista de {metodo_pago, monto} que debe sumar el total.
        // Cobro normal (compatibilidad hacia atrás): un solo pago por el total completo.
        let listaPagos;
        if (pagosBody && pagosBody.length > 0) {
            listaPagos = pagosBody.map(p => ({
                metodo_pago: (p.metodo_pago || '').toString(),
                monto: parseFloat(p.monto)
            }));
            if (listaPagos.some(p => !p.metodo_pago || !(p.monto > 0))) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Cada pago debe tener un método y un monto mayor a cero.' });
            }
            const sumaPagos = listaPagos.reduce((acc, p) => acc + p.monto, 0);
            if (Math.abs(sumaPagos - totalComanda) > 0.05) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `La suma de los pagos (Bs. ${sumaPagos.toFixed(2)}) no coincide con el total de la comanda (Bs. ${totalComanda.toFixed(2)}).`
                });
            }
        } else {
            listaPagos = [{ metodo_pago, monto: totalComanda }];
        }

        // Obtener caja abierta para el cobro
        const cajaRes = await client.query(`
            SELECT id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1
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

        // 2. Registrar una fila en 'ventas' por cada método de pago usado (una sola
        // en el cobro normal). Todas quedan vinculadas a la comanda (comanda_id) para
        // poder reconstruir el total y el desglose real al imprimir el comprobante.
        // Los productos y el descuento de inventario solo se registran una vez,
        // contra la primera venta, para no duplicarlos entre los distintos pagos.
        let ventaPrincipalId = null;
        for (let i = 0; i < listaPagos.length; i++) {
            const pago = listaPagos[i];
            const insertVenta = `
                INSERT INTO ventas (usuario_id, caja_id, total, metodo_pago, fecha_venta, comanda_id)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
                RETURNING id
            `;
            const resultVenta = await client.query(insertVenta, [
                usuario_id || comanda.usuario_id,
                cajaId,
                pago.monto,
                pago.metodo_pago,
                id
            ]);
            const ventaId = resultVenta.rows[0].id;

            if (i !== 0) continue;
            ventaPrincipalId = ventaId;

            // 3. Registrar los productos en 'detalle_ventas' (solo en la venta principal)
            for (let item of detalles) {
                await client.query(`
                    INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                    VALUES ($1, $2, $3, $4, $5)
                `, [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);

                // Backflush: Descontar de Almacén Pastelería según la receta
                const recetaRes = await client.query('SELECT id FROM recetas WHERE producto_id = $1 LIMIT 1', [item.producto_id]);
                if (recetaRes.rows.length > 0) {
                    const recetaId = recetaRes.rows[0].id;
                    const ingredientesRes = await client.query(
                        'SELECT insumo_id, cantidad FROM ingrediente_recetas WHERE receta_id = $1 AND insumo_id IS NOT NULL',
                        [recetaId]
                    );

                    const almacenPasteleriaRes = await client.query(
                        "SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1"
                    );
                    const almacenPasteleriaId = almacenPasteleriaRes.rows[0]?.id;

                    if (almacenPasteleriaId) {
                        for (let ing of ingredientesRes.rows) {
                            const cantADescontar = parseFloat(item.cantidad) * parseFloat(ing.cantidad);

                            // Restar del stock de Pastelería (hasta llegar a cero o al remanente, usando GREATEST(0, stock_actual - cant))
                            await client.query(`
                                UPDATE inventario_almacen
                                SET stock_actual = GREATEST(0, stock_actual - $1)
                                WHERE almacen_id = $2 AND insumo_id = $3
                            `, [cantADescontar, almacenPasteleriaId, ing.insumo_id]);

                            // Registrar el movimiento en el historial
                            await client.query(`
                                INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, referencia_id, fecha)
                                VALUES ($1, 'VENTA', $2, $3, NOW())
                            `, [ing.insumo_id, cantADescontar, ventaId]);
                        }
                    }
                }
            }
        }

        // 4. Actualizar estado de comanda a PAGADA
        await client.query(`
            UPDATE comandas
            SET estado = 'PAGADA', caja_id = $1, fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [cajaId, id]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, venta_id: ventaPrincipalId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al procesar pago de comanda:', error);
        res.status(500).json({ error: 'Error interno al procesar el pago: ' + error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
