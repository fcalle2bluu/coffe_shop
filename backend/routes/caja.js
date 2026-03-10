// backend/routes/caja.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener el estado actual de la caja y sus ventas en vivo
router.get('/estado', async (req, res) => {
    try {
        // Buscar si hay una caja abierta (fecha_cierre es null)
        const cajaRes = await pool.query('SELECT * FROM cajas WHERE fecha_cierre IS NULL ORDER BY id DESC LIMIT 1');
        
        if (cajaRes.rows.length === 0) {
            return res.json({ abierta: false });
        }

        const cajaActiva = cajaRes.rows[0];

        // Calcular las ventas realizadas en esta caja específica
        const ventasRes = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO' THEN total ELSE 0 END), 0) as total_efectivo,
                COALESCE(SUM(CASE WHEN metodo_pago = 'QR' THEN total ELSE 0 END), 0) as total_qr,
                COALESCE(SUM(CASE WHEN metodo_pago = 'TARJETA' THEN total ELSE 0 END), 0) as total_tarjeta,
                COALESCE(SUM(total), 0) as total_ventas
            FROM ventas 
            WHERE caja_id = $1
        `, [cajaActiva.id]);

        const ventas = ventasRes.rows[0];

        // El efectivo esperado es el saldo inicial + las ventas en efectivo
        const efectivoEsperado = parseFloat(cajaActiva.saldo_inicial) + parseFloat(ventas.total_efectivo);

        res.json({
            abierta: true,
            caja: cajaActiva,
            ventas: ventas,
            efectivo_esperado: efectivoEsperado
        });

    } catch (error) {
        console.error('Error al obtener estado de caja:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 2. Abrir un nuevo turno de caja
router.post('/abrir', async (req, res) => {
    const { saldo_inicial } = req.body;
    try {
        // Verificar que no haya otra caja abierta
        const validacion = await pool.query('SELECT id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1');
        if (validacion.rows.length > 0) {
            return res.status(400).json({ error: 'Ya existe una caja abierta. Ciérrala primero.' });
        }

        const result = await pool.query(`
            INSERT INTO cajas (saldo_inicial, fecha_apertura) 
            VALUES ($1, NOW()) RETURNING id
        `, [saldo_inicial]);

        res.status(201).json({ message: 'Caja abierta con éxito', id: result.rows[0].id });
    } catch (error) {
        console.error('Error al abrir caja:', error);
        res.status(500).json({ error: 'Error al abrir la caja' });
    }
});

// 3. Cerrar el turno de caja
router.post('/cerrar', async (req, res) => {
    const { caja_id, saldo_final } = req.body;
    try {
        await pool.query(`
            UPDATE cajas 
            SET saldo_final = $1, fecha_cierre = NOW() 
            WHERE id = $2 AND fecha_cierre IS NULL
        `, [saldo_final, caja_id]);

        res.json({ message: 'Caja cerrada correctamente' });
    } catch (error) {
        console.error('Error al cerrar caja:', error);
        res.status(500).json({ error: 'Error al cerrar la caja' });
    }
});

// 4. Obtener el historial de cajas pasadas
router.get('/historial', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, saldo_inicial, saldo_final, 
                   TO_CHAR(fecha_apertura, 'DD/MM/YYYY HH24:MI') as apertura,
                   TO_CHAR(fecha_cierre, 'DD/MM/YYYY HH24:MI') as cierre,
                   (saldo_final - saldo_inicial) as diferencia
            FROM cajas 
            WHERE fecha_cierre IS NOT NULL
            ORDER BY id DESC LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar historial' });
    }
});

module.exports = router;