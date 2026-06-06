const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Helper para generar el token esperado de hoy en Bolivia (GMT-4)
const obtenerTokenHoy = () => {
    const ahora = new Date();
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const horaBolivia = new Date(utc + (3600000 * -4));
    
    const yyyy = horaBolivia.getFullYear();
    const mm = String(horaBolivia.getMonth() + 1).padStart(2, '0');
    const dd = String(horaBolivia.getDate()).padStart(2, '0');
    
    return `asistencia_${yyyy}_${mm}_${dd}`;
};

// 1. Marcar Entrada o Salida (Escaneando QR)
router.post('/marcar', async (req, res) => {
    const { usuario_id, token } = req.body;

    if (!usuario_id || !token) {
        return res.status(400).json({ error: 'Faltan datos requeridos (usuario_id y token).' });
    }

    // Validar el token diario
    const tokenEsperado = obtenerTokenHoy();
    if (token !== tokenEsperado) {
        return res.status(400).json({ error: 'Código QR inválido o expirado. Asegúrate de escanear el QR actual en la pantalla del administrador.' });
    }

    try {
        // Buscar si el empleado tiene un turno abierto (entrada registrada pero sin salida)
        const turnoAbierto = await pool.query(
            'SELECT id, hora_entrada FROM asistencia WHERE usuario_id = $1 AND hora_salida IS NULL LIMIT 1',
            [usuario_id]
        );

        if (turnoAbierto.rows.length > 0) {
            // REGISTRAR SALIDA
            const registroId = turnoAbierto.rows[0].id;
            const horaEntrada = new Date(turnoAbierto.rows[0].hora_entrada);
            const ahora = new Date();

            // Calcular horas trabajadas
            const diffMs = ahora - horaEntrada;
            const horasTrabajadas = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

            await pool.query(
                `UPDATE asistencia 
                 SET hora_salida = NOW(), horas_trabajadas = $1 
                 WHERE id = $2`,
                [horasTrabajadas, registroId]
            );

            // Obtener datos del usuario para el log
            const userRes = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [usuario_id]);
            const nombre = userRes.rows[0]?.nombre || 'Empleado';

            return res.json({
                success: true,
                tipo: 'SALIDA',
                mensaje: `¡Hasta luego, ${nombre}! Salida registrada con éxito.`,
                detalles: `Horas trabajadas en el turno: ${horasTrabajadas} hrs.`
            });
        } else {
            // REGISTRAR ENTRADA
            // Validar que no haya marcado ya entrada Y salida el día de hoy
            const yaMarcadoHoy = await pool.query(
                'SELECT id FROM asistencia WHERE usuario_id = $1 AND fecha = CURRENT_DATE LIMIT 1',
                [usuario_id]
            );

            if (yaMarcadoHoy.rows.length > 0) {
                return res.status(400).json({ error: 'Ya has registrado tu asistencia de entrada y salida el día de hoy.' });
            }

            // Insertar nueva entrada
            await pool.query(
                'INSERT INTO asistencia (usuario_id, hora_entrada) VALUES ($1, NOW())',
                [usuario_id]
            );

            const userRes = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [usuario_id]);
            const nombre = userRes.rows[0]?.nombre || 'Empleado';

            return res.json({
                success: true,
                tipo: 'ENTRADA',
                mensaje: `¡Hola, ${nombre}! Entrada registrada con éxito. ¡Que tengas un buen turno!`,
                detalles: `Hora de ingreso: ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
            });
        }
    } catch (error) {
        console.error('Error al registrar asistencia:', error);
        res.status(500).json({ error: 'Ocurrió un error en el servidor al procesar la asistencia.' });
    }
});

// 2. Obtener Historial de Asistencia General (Para Administradores)
router.get('/', async (req, res) => {
    const { anio, mes, dia, usuario_id } = req.query;

    let query = `
        SELECT 
            a.id,
            a.usuario_id,
            u.nombre as empleado,
            u.rol,
            TO_CHAR(a.fecha, 'YYYY-MM-DD') as fecha,
            TO_CHAR(a.hora_entrada AT TIME ZONE 'America/La_Paz', 'HH24:MI') as entrada,
            TO_CHAR(a.hora_salida AT TIME ZONE 'America/La_Paz', 'HH24:MI') as salida,
            a.horas_trabajadas
        FROM asistencia a
        JOIN usuarios u ON a.usuario_id = u.id
    `;

    const params = [];
    const conditions = [];

    if (usuario_id) {
        params.push(usuario_id);
        conditions.push(`a.usuario_id = $${params.length}`);
    }

    if (anio) {
        params.push(anio);
        conditions.push(`EXTRACT(YEAR FROM a.fecha) = $${params.length}`);
    }

    if (mes) {
        params.push(mes);
        conditions.push(`EXTRACT(MONTH FROM a.fecha) = $${params.length}`);
    }

    if (dia) {
        params.push(dia);
        conditions.push(`EXTRACT(DAY FROM a.fecha) = $${params.length}`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.fecha DESC, a.hora_entrada DESC';

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener historial de asistencia:', error);
        res.status(500).json({ error: 'Error al obtener datos de asistencia.' });
    }
});

// 3. Obtener Historial de Asistencia Individual (Para Empleados)
router.get('/mi-historial/:usuario_id', async (req, res) => {
    const { usuario_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                id,
                TO_CHAR(fecha, 'DD/MM/YYYY') as fecha,
                TO_CHAR(hora_entrada AT TIME ZONE 'America/La_Paz', 'HH24:MI') as entrada,
                TO_CHAR(hora_salida AT TIME ZONE 'America/La_Paz', 'HH24:MI') as salida,
                horas_trabajadas
             FROM asistencia 
             WHERE usuario_id = $1 
             ORDER BY fecha DESC, hora_entrada DESC 
             LIMIT 30`,
            [usuario_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener historial personal de asistencia:', error);
        res.status(500).json({ error: 'Error al obtener historial personal.' });
    }
});

module.exports = router;
