// backend/routes/caja.js
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
        console.error('Error al validar permisos de admin en caja:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

// Middleware CAJERO o Admin: para endpoints de consulta (estado de caja)
const checkCajeroOAdmin = async (req, res, next) => {
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
        console.error('Error al validar permisos en caja:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

// 1. Obtener el estado actual de la caja — accesible también para CAJERO
router.get('/estado', checkCajeroOAdmin, async (req, res) => {
    const { usuario_id } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'Identificador de usuario es requerido.' });
    }

    try {
        // Validar rol de usuario
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const userRol = userRes.rows[0].rol.toUpperCase();
        const esCajero = userRol === 'CAJERO';

        // Buscar si hay una caja abierta (fecha_cierre es null)
        const cajaRes = await pool.query(`
            SELECT c.*, u.nombre as usuario_nombre,
                   TO_CHAR(c.fecha_apertura AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_apertura_formateada
            FROM cajas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.fecha_cierre IS NULL 
            ORDER BY c.id DESC LIMIT 1
        `);
        
        if (cajaRes.rows.length === 0) {
            return res.json({ abierta: false });
        }

        const cajaActiva = cajaRes.rows[0];

        // Calcular las ventas realizadas en esta caja específica
        const ventasRes = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO' THEN total ELSE 0 END), 0) as total_efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago IN ('QR', 'QR DIGITAL') THEN total ELSE 0 END), 0) as total_qr,
                COALESCE(SUM(CASE WHEN metodo_pago IN ('TARJETA', 'TARJETA DE DÉBITO/CRÉDITO') THEN total ELSE 0 END), 0) as total_tarjeta,
                COALESCE(SUM(CASE WHEN metodo_pago IN ('CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO') THEN total ELSE 0 END), 0) as total_consume_lo_nuestro,
                COALESCE(SUM(CASE WHEN metodo_pago = 'BILLETERA MOVIL' THEN total ELSE 0 END), 0) as total_billetera,
                COALESCE(SUM(total), 0) as total_ventas
            FROM ventas 
            WHERE caja_id = $1
        `, [cajaActiva.id]);

        const ventas = ventasRes.rows[0];

        // Calcular los gastos del turno activo
        const gastosRes = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) as total_gastos
            FROM gastos_caja
            WHERE caja_id = $1
        `, [cajaActiva.id]);

        const totalGastos = parseFloat(gastosRes.rows[0].total_gastos);

        // El efectivo esperado es el saldo inicial + las ventas en efectivo - gastos de caja
        const efectivoEsperado = parseFloat(cajaActiva.saldo_inicial) + parseFloat(ventas.total_efectivo) - totalGastos;

        res.json({
            abierta: true,
            caja: esCajero ? { ...cajaActiva, saldo_inicial: null } : cajaActiva,
            ventas: ventas,
            total_gastos: totalGastos,
            efectivo_esperado: esCajero ? null : efectivoEsperado
        });

    } catch (error) {
        console.error('Error al obtener estado de caja:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Aplicar check estricto (solo admin) a todas las rutas restantes
router.use(checkAdminPermission);

// 2. Abrir un nuevo turno de caja
router.post('/abrir', async (req, res) => {
    const { saldo_inicial, usuario_id } = req.body;
    try {
        // Verificar que no haya otra caja abierta
        const validacion = await pool.query('SELECT id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1');
        if (validacion.rows.length > 0) {
            return res.status(400).json({ error: 'Ya existe una caja abierta. Ciérrala primero.' });
        }

        const result = await pool.query(`
            INSERT INTO cajas (saldo_inicial, usuario_id, fecha_apertura) 
            VALUES ($1, $2, NOW()) RETURNING id
        `, [saldo_inicial, usuario_id || null]);

        res.status(201).json({ message: 'Caja abierta con éxito', id: result.rows[0].id });
    } catch (error) {
        console.error('Error al abrir caja:', error);
        res.status(500).json({ error: 'Error al abrir la caja' });
    }
});

// 3. Cerrar el turno de caja
router.post('/cerrar', async (req, res) => {
    const { saldo_final, usuario_id } = req.body;

    if (!usuario_id) {
        return res.status(400).json({ error: 'Identificador de usuario es requerido para cerrar caja.' });
    }

    try {
        // Obtener rol del usuario que intenta cerrar
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: 'Usuario no válido.' });
        }
        const userRol = userRes.rows[0].rol.toUpperCase();

        // La caja a cerrar SIEMPRE es la que está realmente abierta según el servidor,
        // nunca un caja_id que mande el navegador: si la pantalla llevaba rato abierta
        // y el turno ya había cambiado (alguien más cerró y abrió una caja nueva
        // mientras tanto), el id viejo guardado en el cliente apuntaba a una caja que
        // ya estaba cerrada. El UPDATE no tocaba ninguna fila pero igual respondía
        // "Caja cerrada correctamente", dejando la caja realmente activa abierta sin
        // que nadie se diera cuenta.
        const cajaAbiertaRes = await pool.query('SELECT id, usuario_id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1');
        if (cajaAbiertaRes.rows.length === 0) {
            return res.status(400).json({ error: 'No hay ninguna caja abierta para cerrar. Actualiza la página.' });
        }
        const caja_id = cajaAbiertaRes.rows[0].id;
        const creadorId = cajaAbiertaRes.rows[0].usuario_id;

        // Validar permisos: solo el creador o un administrador
        if (userRol !== 'ADMINISTRADOR' && userRol !== 'ADMIN' && parseInt(usuario_id) !== parseInt(creadorId)) {
            return res.status(403).json({
                error: 'No tienes permisos para cerrar este turno. Solo puede cerrarlo el cajero que lo abrió o un Administrador.'
            });
        }

        await pool.query(`
            UPDATE cajas
            SET saldo_final = $1, fecha_cierre = NOW()
            WHERE id = $2
        `, [saldo_final, caja_id]);

        res.json({ message: 'Caja cerrada correctamente' });
    } catch (error) {
        console.error('Error al cerrar caja:', error);
        res.status(500).json({ error: 'Error al cerrar la caja: ' + error.message });
    }
});

// 4. Obtener el historial de cajas pasadas
router.get('/historial', async (req, res) => {
    const { usuario_id } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'Identificador de usuario es requerido.' });
    }

    try {
        // Validar rol de usuario
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const userRol = userRes.rows[0].rol.toUpperCase();
        if (userRol === 'CAJERO') {
            return res.status(403).json({ error: 'Acceso denegado. No tienes permiso para ver el historial de caja.' });
        }

        const result = await pool.query(`
            SELECT 
                c.id, 
                c.saldo_inicial, 
                c.saldo_final, 
                u.nombre as usuario_nombre,
                TO_CHAR(c.fecha_apertura AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as apertura,
                TO_CHAR(c.fecha_cierre AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as cierre,
                COALESCE(v.total_efectivo, 0) as ventas_efectivo,
                COALESCE(v.total_qr, 0) as ventas_qr,
                COALESCE(v.total_tarjeta, 0) as ventas_tarjeta,
                COALESCE(v.total_consume_lo_nuestro, 0) as ventas_cln,
                COALESCE(g.total_gastos, 0) as total_gastos,
                (c.saldo_final - (c.saldo_inicial + COALESCE(v.total_efectivo, 0) - COALESCE(g.total_gastos, 0))) as diferencia
            FROM cajas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            LEFT JOIN (
                SELECT 
                    caja_id,
                    COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO' THEN total ELSE 0 END), 0) as total_efectivo,
                    COALESCE(SUM(CASE WHEN metodo_pago IN ('QR', 'QR DIGITAL') THEN total ELSE 0 END), 0) as total_qr,
                    COALESCE(SUM(CASE WHEN metodo_pago IN ('TARJETA', 'TARJETA DE DÉBITO/CRÉDITO') THEN total ELSE 0 END), 0) as total_tarjeta,
                    COALESCE(SUM(CASE WHEN metodo_pago IN ('CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO') THEN total ELSE 0 END), 0) as total_consume_lo_nuestro,
                    COALESCE(SUM(CASE WHEN metodo_pago = 'BILLETERA MOVIL' THEN total ELSE 0 END), 0) as total_billetera
                FROM ventas
                GROUP BY caja_id
            ) v ON c.id = v.caja_id
            LEFT JOIN (
                SELECT 
                    caja_id,
                    COALESCE(SUM(monto), 0) as total_gastos
                FROM gastos_caja
                GROUP BY caja_id
            ) g ON c.id = g.caja_id
            WHERE c.fecha_cierre IS NOT NULL
            ORDER BY c.id DESC LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener historial de cajas:', error);
        res.status(500).json({ error: 'Error al cargar historial' });
    }
});

// 5. [NUEVO] Obtener historial exhaustivo de ventas por cajero
router.get('/historial-ventas-cajeros', async (req, res) => {
    const { usuario_id } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'Identificador de usuario es requerido.' });
    }

    try {
        // Validar rol de usuario
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const userRol = userRes.rows[0].rol.toUpperCase();
        const esCajero = userRol === 'CAJERO';

        let query = `
            SELECT 
                v.id as venta_id,
                v.usuario_id,
                TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI') as fecha_venta,
                v.total,
                v.metodo_pago,
                v.es_historica,
                u.nombre as cajero
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
        `;

        const queryParams = [];
        if (esCajero) {
            query += ` WHERE v.usuario_id = $1 `;
            queryParams.push(parseInt(usuario_id));
        }

        query += ` ORDER BY v.fecha_venta DESC `;

        const result = await pool.query(query, queryParams);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar historial ventas por cajero:', error);
        res.status(500).json({ error: 'Error al cargar ventas' });
    }
});

// 6. Registrar un gasto de caja
router.post('/gastos', async (req, res) => {
    const { usuario_id, monto, descripcion } = req.body;
    if (!usuario_id || !monto || !descripcion) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (parseFloat(monto) <= 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    try {
        // Igual que en /cerrar: la caja del gasto se determina en el servidor, no con
        // el caja_id que traiga el navegador, para que un gasto nunca quede pegado a
        // una caja vieja/cerrada si la pantalla no se había refrescado.
        const cajaAbiertaRes = await pool.query('SELECT id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1');
        if (cajaAbiertaRes.rows.length === 0) {
            return res.status(400).json({ error: 'No hay una caja abierta para registrar el gasto.' });
        }
        const caja_id = cajaAbiertaRes.rows[0].id;

        await pool.query(`
            INSERT INTO gastos_caja (caja_id, usuario_id, monto, descripcion)
            VALUES ($1, $2, $3, $4)
        `, [caja_id, usuario_id, monto, descripcion]);
        res.status(201).json({ message: 'Gasto registrado con éxito' });
    } catch (error) {
        console.error('Error al registrar gasto de caja:', error);
        res.status(500).json({ error: 'Error al registrar el gasto de caja' });
    }
});

// 7. Obtener los gastos de una caja específica
router.get('/gastos/:caja_id', async (req, res) => {
    const { caja_id } = req.params;
    try {
        // Se incluye la fecha además de la hora porque un turno puede quedar abierto
        // de un día para otro (ej. un local que cierra pasada la medianoche); mostrar
        // solo "HH:MI" hacía que la lista pareciera desordenada cuando en realidad
        // los gastos más antiguos con hora numéricamente mayor eran del día anterior.
        const result = await pool.query(`
            SELECT id, monto, descripcion,
                   TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'DD/MM HH24:MI') as hora
            FROM gastos_caja
            WHERE caja_id = $1
            ORDER BY fecha DESC
        `, [caja_id]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener gastos de caja:', error);
        res.status(500).json({ error: 'Error al obtener los gastos' });
    }
});

// 8. Modificar método de pago de una venta (Solo Administradores)
router.put('/ventas/:id/metodo-pago', async (req, res) => {
    const { id } = req.params;
    const { metodo_pago, editor_rol } = req.body;

    // Validar rol de administrador
    if (editor_rol !== 'ADMINISTRADOR' && editor_rol !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden modificar los métodos de pago de ventas.' });
    }

    if (!metodo_pago) {
        return res.status(400).json({ error: 'Falta el método de pago.' });
    }

    // Normalizar el método de pago
    const metodoNormalizado = metodo_pago.toUpperCase();
    const metodosPermitidos = ['EFECTIVO', 'QR', 'TARJETA', 'CONSUME LO NUESTRO', 'BILLETERA MOVIL'];
    if (!metodosPermitidos.includes(metodoNormalizado)) {
        return res.status(400).json({ error: 'Método de pago no válido.' });
    }

    try {
        await pool.query(
            'UPDATE ventas SET metodo_pago = $1 WHERE id = $2',
            [metodoNormalizado, id]
        );
        res.json({ success: true, mensaje: 'Método de pago de venta actualizado con éxito.' });
    } catch (error) {
        console.error('Error al actualizar método de pago de venta:', error);
        res.status(500).json({ error: 'Error al actualizar el método de pago en el servidor.' });
    }
});

// Endpoint para registrar una venta histórica
router.post('/venta-historica', async (req, res) => {
    const { usuario_id, total, metodo_pago, fecha_venta } = req.body;

    if (!usuario_id || !total || parseFloat(total) <= 0 || !metodo_pago || !fecha_venta) {
        return res.status(400).json({ error: 'Todos los campos son requeridos y el total debe ser mayor a 0.' });
    }

    try {
        const query = `
            INSERT INTO ventas (usuario_id, caja_id, total, metodo_pago, fecha_venta, estado, es_historica)
            VALUES ($1, NULL, $2, $3, $4::timestamp, 'COMPLETADA', true)
            RETURNING id
        `;
        const result = await pool.query(query, [usuario_id, total, metodo_pago, fecha_venta]);
        res.status(201).json({ success: true, venta_id: result.rows[0].id });
    } catch (error) {
        console.error('Error al registrar venta histórica:', error);
        res.status(500).json({ error: 'Error al registrar venta histórica: ' + error.message });
    }
});

// Endpoint para modificar manualmente si una venta es histórica o no
router.put('/ventas/:id/historica', async (req, res) => {
    const { id } = req.params;
    const { es_historica } = req.body; // true o false

    try {
        await pool.query(
            'UPDATE ventas SET es_historica = $1 WHERE id = $2',
            [es_historica, id]
        );
        res.json({ success: true, mensaje: 'Estado de venta histórica actualizado con éxito.' });
    } catch (error) {
        console.error('Error al actualizar es_historica de venta:', error);
        res.status(500).json({ error: 'Error al actualizar el estado de venta histórica en el servidor.' });
    }
});

// [NUEVO] Obtener las ventas de una caja/turno específico (para confirmación de eliminación)
router.get('/ventas/:caja_id', async (req, res) => {
    const { caja_id } = req.params;
    try {
        const result = await pool.query(`
            SELECT v.id, TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_venta,
                   v.total, v.metodo_pago, u.nombre as cajero
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            WHERE v.caja_id = $1
            ORDER BY v.fecha_venta DESC
        `, [caja_id]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener ventas de caja:', error);
        res.status(500).json({ error: 'Error al obtener las ventas del turno.' });
    }
});

// [NUEVO] Borrar un turno de caja y toda su información conectada (Solo Administradores)
router.delete('/eliminar/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario_id } = req.body;

    if (!usuario_id) {
        return res.status(400).json({ error: 'Identificador de usuario es requerido para eliminar un turno.' });
    }

    const client = await pool.connect();
    try {
        // Validar rol de administrador
        const userRes = await client.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: 'Usuario no válido.' });
        }
        const userRol = userRes.rows[0].rol.toUpperCase();
        if (userRol !== 'ADMINISTRADOR' && userRol !== 'ADMIN') {
            return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden eliminar turnos de caja.' });
        }

        // Iniciar transacción
        await client.query('BEGIN');

        // 1. Eliminar detalles de ventas
        await client.query(`
            DELETE FROM detalle_ventas 
            WHERE venta_id IN (SELECT id FROM ventas WHERE caja_id = $1)
        `, [id]);

        // 2. Eliminar ventas
        await client.query('DELETE FROM ventas WHERE caja_id = $1', [id]);

        // 3. Eliminar gastos asociados
        await client.query('DELETE FROM gastos_caja WHERE caja_id = $1', [id]);

        // 4. Eliminar detalles de comandas
        await client.query(`
            DELETE FROM detalle_comandas 
            WHERE comanda_id IN (SELECT id FROM comandas WHERE caja_id = $1)
        `, [id]);

        // 5. Eliminar comandas
        await client.query('DELETE FROM comandas WHERE caja_id = $1', [id]);

        // 6. Eliminar la caja
        const deleteCajaRes = await client.query('DELETE FROM cajas WHERE id = $1 RETURNING id', [id]);
        if (deleteCajaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Turno de caja no encontrado.' });
        }

        await client.query('COMMIT');
        res.json({ success: true, mensaje: 'Turno de caja y toda su información relacionada eliminados con éxito.' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error al eliminar turno de caja:', error);
        res.status(500).json({ error: 'Error al eliminar el turno de caja: ' + error.message });
    } finally {
        if (client) client.release();
    }
});

// 10. Eliminar un gasto de caja (Solo Administradores)
router.delete('/gastos/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario_id } = req.body;

    if (!usuario_id) {
        return res.status(400).json({ error: 'Identificador de usuario es requerido para eliminar un gasto.' });
    }

    try {
        // Validar rol de administrador
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: 'Usuario no válido.' });
        }
        const userRol = userRes.rows[0].rol.toUpperCase();
        if (userRol !== 'ADMINISTRADOR' && userRol !== 'ADMIN') {
            return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden eliminar gastos de caja.' });
        }

        // Eliminar el gasto
        const deleteRes = await pool.query('DELETE FROM gastos_caja WHERE id = $1 RETURNING id', [id]);
        if (deleteRes.rows.length === 0) {
            return res.status(404).json({ error: 'Gasto no encontrado.' });
        }

        res.json({ success: true, mensaje: 'Gasto de caja eliminado con éxito.' });
    } catch (error) {
        console.error('Error al eliminar gasto de caja:', error);
        res.status(500).json({ error: 'Error al eliminar el gasto de caja: ' + error.message });
    }
});

module.exports = router;