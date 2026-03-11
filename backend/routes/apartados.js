// backend/routes/apartados.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Listar todos los apartados activos
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre_cliente, telefono_cliente, total, saldo_pendiente, estado, 
                   TO_CHAR(fecha_creacion, 'DD/MM/YYYY') as fecha,
                   TO_CHAR(fecha_limite, 'DD/MM/YYYY') as limite
            FROM apartados 
            ORDER BY 
                CASE estado 
                    WHEN 'PENDIENTE' THEN 1 
                    WHEN 'PAGADO' THEN 2 
                    ELSE 3 
                END, fecha_limite ASC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar apartados' });
    }
});

// 2. Crear un nuevo apartado con adelanto (Transacción)
router.post('/', async (req, res) => {
    const { cliente, telefono, total, abono_inicial, metodo_pago, fecha_limite, detalles } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const saldo = total - abono_inicial;
        const estado = saldo <= 0 ? 'PAGADO' : 'PENDIENTE';

        // Insertar Apartado
        const resApartado = await client.query(`
            INSERT INTO apartados (nombre_cliente, telefono_cliente, total, saldo_pendiente, estado, fecha_limite) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, [cliente, telefono, total, saldo, estado, fecha_limite]);
        
        const apartadoId = resApartado.rows[0].id;

        // Insertar Detalles
        for (let item of detalles) {
            await client.query(`
                INSERT INTO detalle_apartados (apartado_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [apartadoId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]);
        }

        // Registrar Abono Inicial (Si hay)
        if (abono_inicial > 0) {
            await client.query(`
                INSERT INTO abonos_apartados (apartado_id, monto, metodo_pago)
                VALUES ($1, $2, $3)
            `, [apartadoId, abono_inicial, metodo_pago]);
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Apartado creado con éxito', id: apartadoId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear apartado:', error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        client.release();
    }
});

// 3. Registrar un nuevo Abono
router.post('/:id/abonos', async (req, res) => {
    const { id } = req.params;
    const { monto, metodo_pago } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Obtener saldo actual
        const resAp = await client.query('SELECT saldo_pendiente FROM apartados WHERE id = $1', [id]);
        let saldoActual = resAp.rows[0].saldo_pendiente;
        
        if (monto > saldoActual) throw new Error("El abono supera el saldo pendiente");

        let nuevoSaldo = saldoActual - monto;
        let nuevoEstado = nuevoSaldo <= 0 ? 'PAGADO' : 'PENDIENTE';

        // Insertar Abono
        await client.query('INSERT INTO abonos_apartados (apartado_id, monto, metodo_pago) VALUES ($1, $2, $3)', [id, monto, metodo_pago]);
        
        // Actualizar Cabecera
        await client.query('UPDATE apartados SET saldo_pendiente = $1, estado = $2 WHERE id = $3', [nuevoSaldo, nuevoEstado, id]);

        await client.query('COMMIT');
        res.json({ message: 'Abono registrado', nuevo_saldo: nuevoSaldo, estado: nuevoEstado });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message || 'Error al abonar' });
    } finally {
        client.release();
    }
});

// 4. Marcar como entregado
router.put('/:id/entregar', async (req, res) => {
    try {
        await pool.query("UPDATE apartados SET estado = 'ENTREGADO' WHERE id = $1 AND estado = 'PAGADO'", [req.params.id]);
        res.json({ message: 'Producto entregado al cliente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al entregar' });
    }
});

module.exports = router;