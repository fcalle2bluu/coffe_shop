const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { registrarBitacora } = require('../utils/bitacora');

// Registro rápido de un gasto de caja chica desde Venta por Mesa. Se guarda en la
// MISMA tabla que usa Control Caja (gastos_caja), ligado a la caja abierta del turno,
// para que el efectivo esperado al cerrar caja ya lo tenga descontado. A propósito NO
// hay ningún GET/listado en ESTE router: desde Venta por Mesa solo se puede insertar,
// nunca consultar el total ni el historial (eso sigue viéndose solo en Control Caja).
router.post('/gastos', async (req, res) => {
    const { monto, descripcion } = req.body;
    const usuario_id = req.usuario?.id;

    if (!usuario_id) {
        return res.status(401).json({ error: 'Sesión requerida' });
    }
    if (!monto || Number(monto) <= 0 || !descripcion) {
        return res.status(400).json({ error: 'Faltan datos obligatorios (monto, descripción)' });
    }

    try {
        // Igual que en caja.js: la caja del gasto se determina en el servidor (no con
        // un caja_id que mande el navegador), para que nunca quede pegado a una caja
        // vieja/cerrada.
        const cajaAbiertaRes = await pool.query('SELECT id FROM cajas WHERE fecha_cierre IS NULL LIMIT 1');
        if (cajaAbiertaRes.rows.length === 0) {
            return res.status(400).json({ error: 'No hay una caja abierta para registrar el gasto.' });
        }
        const caja_id = cajaAbiertaRes.rows[0].id;

        const gastoRes = await pool.query(
            'INSERT INTO gastos_caja (caja_id, usuario_id, monto, descripcion) VALUES ($1, $2, $3, $4) RETURNING id',
            [caja_id, usuario_id, monto, descripcion]
        );

        registrarBitacora({
            usuario_id, accion: 'REGISTRAR_GASTO_CAJA_CHICA', entidad_tipo: 'gasto_caja', entidad_id: gastoRes.rows[0].id,
            detalle: { caja_id, monto, descripcion }
        });

        res.status(201).json({ success: true, message: 'Gasto de caja chica registrado' });
    } catch (error) {
        console.error('Error al registrar gasto de caja chica:', error);
        res.status(500).json({ error: 'Error al registrar el gasto: ' + error.message });
    }
});

module.exports = router;
