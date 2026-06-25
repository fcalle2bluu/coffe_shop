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

// Endpoint para obtener el token QR de hoy (Solo Administradores)
router.get('/qr-token', async (req, res) => {
    const { usuario_id } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'Falta ID de usuario para verificar permisos.' });
    }

    try {
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const rol = userRes.rows[0].rol.toUpperCase();
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR') {
            return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden generar o ver el código QR.' });
        }

        const token = obtenerTokenHoy();
        res.json({ success: true, token });
    } catch (error) {
        console.error('Error al generar token QR:', error);
        res.status(500).json({ error: 'Error interno del servidor al generar el token QR.' });
    }
});

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
            
            // Registrar salida y calcular horas trabajadas en Postgres
            const updateResult = await pool.query(
                `UPDATE asistencia 
                 SET hora_salida = NOW(), 
                     horas_trabajadas = ROUND(EXTRACT(EPOCH FROM (NOW() - hora_entrada)) / 3600.0, 2) 
                 WHERE id = $1
                 RETURNING horas_trabajadas`,
                [registroId]
            );
            const horasTrabajadas = updateResult.rows[0]?.horas_trabajadas || 0;

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
            // Validar que no haya marcado ya entrada Y salida el día de hoy en Bolivia
            const yaMarcadoHoy = await pool.query(
                `SELECT id FROM asistencia 
                 WHERE usuario_id = $1 
                   AND fecha = TIMEZONE('America/La_Paz', NOW())::date LIMIT 1`,
                [usuario_id]
            );

            if (yaMarcadoHoy.rows.length > 0) {
                return res.status(400).json({ error: 'Ya has registrado tu asistencia de entrada y salida el día de hoy.' });
            }

            // Insertar nueva entrada con la fecha local de Bolivia
            await pool.query(
                `INSERT INTO asistencia (usuario_id, fecha, hora_entrada) 
                 VALUES ($1, TIMEZONE('America/La_Paz', NOW())::date, NOW())`,
                [usuario_id]
            );

            const userRes = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [usuario_id]);
            const nombre = userRes.rows[0]?.nombre || 'Empleado';

            const obtenerHoraBoliviaString = () => {
                const ahora = new Date();
                const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
                const horaBolivia = new Date(utc + (3600000 * -4));
                return horaBolivia.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            };

            return res.json({
                success: true,
                tipo: 'ENTRADA',
                mensaje: `¡Hola, ${nombre}! Entrada registrada con éxito. ¡Que tengas un buen turno!`,
                detalles: `Hora de ingreso: ${obtenerHoraBoliviaString()}`
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
            TO_CHAR(a.hora_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as entrada,
            TO_CHAR(a.hora_salida AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as salida,
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
                TO_CHAR(hora_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as entrada,
                TO_CHAR(hora_salida AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as salida,
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

// 4. Registrar Asistencia Manual (Solo Administradores)
router.post('/manual', async (req, res) => {
    const { usuario_id, fecha, hora_entrada, hora_salida, editor_rol, editor_id } = req.body;

    // Validar rol de administrador en base de datos para seguridad
    const adminId = editor_id;
    if (!adminId) {
        return res.status(400).json({ error: 'Faltan datos de autorización (editor_id).' });
    }

    try {
        const adminCheck = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [adminId]);
        if (adminCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado: Usuario administrador no encontrado.' });
        }
        const rolReal = adminCheck.rows[0].rol.toUpperCase();
        if (rolReal !== 'ADMINISTRADOR' && rolReal !== 'ADMIN') {
            return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden registrar asistencia manualmente.' });
        }
    } catch (dbErr) {
        console.error('Error al validar editor:', dbErr);
        return res.status(500).json({ error: 'Error interno al validar permisos.' });
    }

    if (!usuario_id || !fecha || !hora_entrada) {
        return res.status(400).json({ error: 'Faltan datos requeridos: Empleado, Fecha y Hora de Entrada.' });
    }

    try {
        let sql = '';
        let queryParams = [usuario_id, fecha];

        if (hora_salida) {
            // Calcular horas trabajadas
            const ent = new Date(`${fecha}T${hora_entrada}`);
            let sal = new Date(`${fecha}T${hora_salida}`);
            let diffMs = sal - ent;
            if (diffMs < 0) {
                // Si la salida es menor a la entrada, asumimos turno nocturno (salida al día siguiente)
                sal.setDate(sal.getDate() + 1);
                diffMs = sal - ent;
            }
            const horasTrabajadas = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

            sql = `
                INSERT INTO asistencia (usuario_id, fecha, hora_entrada, hora_salida, horas_trabajadas)
                VALUES ($1, $2, 
                        ($3::text)::timestamp AT TIME ZONE 'America/La_Paz' AT TIME ZONE 'UTC', 
                        ($4::text)::timestamp AT TIME ZONE 'America/La_Paz' AT TIME ZONE 'UTC', 
                        $5)
                ON CONFLICT (usuario_id, fecha)
                DO UPDATE SET 
                    hora_entrada = EXCLUDED.hora_entrada,
                    hora_salida = EXCLUDED.hora_salida,
                    horas_trabajadas = EXCLUDED.horas_trabajadas;
            `;
            queryParams.push(`${fecha} ${hora_entrada}:00`, `${fecha} ${hora_salida}:00`, horasTrabajadas);
        } else {
            sql = `
                INSERT INTO asistencia (usuario_id, fecha, hora_entrada, hora_salida, horas_trabajadas)
                VALUES ($1, $2, 
                        ($3::text)::timestamp AT TIME ZONE 'America/La_Paz' AT TIME ZONE 'UTC', 
                        NULL, 
                        NULL)
                ON CONFLICT (usuario_id, fecha)
                DO UPDATE SET 
                    hora_entrada = EXCLUDED.hora_entrada,
                    hora_salida = NULL,
                    horas_trabajadas = NULL;
            `;
            queryParams.push(`${fecha} ${hora_entrada}:00`);
        }

        await pool.query(sql, queryParams);
        res.json({ success: true, mensaje: 'Marcación manual registrada con éxito.' });
    } catch (error) {
        console.error('Error al registrar asistencia manual:', error);
        res.status(500).json({ error: 'Ocurrió un error al guardar la marcación manual.' });
    }
});

// 5. Eliminar un Registro de Asistencia (Solo Administradores)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const editor_id = req.headers['x-usuario-id'] || req.body.editor_id || req.query.editor_id;

    if (!editor_id) {
        return res.status(400).json({ error: 'Falta ID de editor para verificar permisos.' });
    }

    try {
        const adminCheck = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [editor_id]);
        if (adminCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado: Usuario administrador no encontrado.' });
        }
        const rolReal = adminCheck.rows[0].rol.toUpperCase();
        if (rolReal !== 'ADMINISTRADOR' && rolReal !== 'ADMIN') {
            return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden eliminar registros de asistencia.' });
        }

        const deleteResult = await pool.query('DELETE FROM asistencia WHERE id = $1 RETURNING id', [id]);
        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registro de asistencia no encontrado.' });
        }

        res.json({ success: true, mensaje: 'Registro de asistencia eliminado correctamente.' });
    } catch (error) {
        console.error('Error al eliminar asistencia:', error);
        res.status(500).json({ error: 'Ocurrió un error al intentar eliminar el registro.' });
    }
});

module.exports = router;
