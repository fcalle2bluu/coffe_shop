// backend/routes/caja.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener el estado actual de la caja y sus ventas en vivo
router.get('/estado', async (req, res) => {
    try {
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
            caja: cajaActiva,
            ventas: ventas,
            total_gastos: totalGastos,
            efectivo_esperado: efectivoEsperado
        });

    } catch (error) {
        console.error('Error al obtener estado de caja:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

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
    const { caja_id, saldo_final, usuario_id } = req.body;
    
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

        // Obtener la caja activa
        const cajaRes = await pool.query('SELECT usuario_id FROM cajas WHERE id = $1', [caja_id]);
        if (cajaRes.rows.length === 0) {
            return res.status(404).json({ error: 'Turno de caja no encontrado.' });
        }
        const creadorId = cajaRes.rows[0].usuario_id;

        // Validar permisos: solo el creador o un administrador
        if (userRol !== 'ADMINISTRADOR' && userRol !== 'ADMIN' && parseInt(usuario_id) !== parseInt(creadorId)) {
            return res.status(403).json({ 
                error: 'No tienes permisos para cerrar este turno. Solo puede cerrarlo el cajero que lo abrió o un Administrador.' 
            });
        }

        await pool.query(`
            UPDATE cajas 
            SET saldo_final = $1, fecha_cierre = NOW() 
            WHERE id = $2 AND fecha_cierre IS NULL
        `, [saldo_final, caja_id]);

        res.json({ message: 'Caja cerrada correctamente' });
    } catch (error) {
        console.error('Error al cerrar caja:', error);
        res.status(500).json({ error: 'Error al cerrar la caja: ' + error.message });
    }
});

// 4. Obtener el historial de cajas pasadas
router.get('/historial', async (req, res) => {
    try {
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
                    COALESCE(SUM(CASE WHEN metodo_pago IN ('CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO') THEN total ELSE 0 END), 0) as total_consume_lo_nuestro
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
    try {
        const result = await pool.query(`
            SELECT 
                v.id as venta_id,
                TO_CHAR(v.fecha_venta AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI') as fecha_venta,
                v.total,
                v.metodo_pago,
                u.nombre as cajero
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            ORDER BY v.fecha_venta DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al cargar historial ventas por cajero:', error);
        res.status(500).json({ error: 'Error al cargar ventas' });
    }
});

// 6. Registrar un gasto de caja
router.post('/gastos', async (req, res) => {
    const { caja_id, usuario_id, monto, descripcion } = req.body;
    if (!caja_id || !usuario_id || !monto || !descripcion) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (parseFloat(monto) <= 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
    }
    try {
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
        const result = await pool.query(`
            SELECT id, monto, descripcion,
                   TO_CHAR(fecha AT TIME ZONE 'America/La_Paz', 'HH24:MI') as hora
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

module.exports = router;