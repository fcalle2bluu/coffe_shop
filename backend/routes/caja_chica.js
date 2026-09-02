const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Registro rápido de un gasto de caja chica desde Venta por Mesa.
// A propósito NO existe ningún GET/listado en este router: el mesero/cajero
// solo puede insertar, nunca consultar el total ni el historial.
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
        await pool.query(
            'INSERT INTO gastos_caja_chica (usuario_id, monto, descripcion) VALUES ($1, $2, $3)',
            [usuario_id, monto, descripcion]
        );
        res.status(201).json({ success: true, message: 'Gasto de caja chica registrado' });
    } catch (error) {
        console.error('Error al registrar gasto de caja chica:', error);
        res.status(500).json({ error: 'Error al registrar el gasto: ' + error.message });
    }
});

module.exports = router;
