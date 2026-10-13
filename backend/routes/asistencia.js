const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { registrarBitacora } = require('../utils/bitacora');

// Margen de gracia: si alguien vuelve a marcar dentro de estos minutos de su
// entrada, se ignora en vez de cerrarle el turno. Pasaba al dejar el dedo
// apoyado de más en el lector: el aparato generaba dos marcaciones seguidas y
// el turno quedaba en 0.00 hrs. Vale para el lector y para el QR.
const GRACIA_MINUTOS = parseInt(process.env.ASISTENCIA_GRACIA_MIN, 10) || 5;

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
    // El rol viene de la sesión verificada (req.usuario), no de un usuario_id que mande el cliente:
    // así un empleado no-admin no puede pedir el token pasando el id de otra persona.
    const rol = (req.usuario.rol || '').toUpperCase();
    if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR') {
        return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden generar o ver el código QR.' });
    }

    const token = obtenerTokenHoy();
    res.json({ success: true, token });
});

// 1. Marcar Entrada o Salida (Escaneando QR)
router.post('/marcar', async (req, res) => {
    // El empleado que marca es el dueño de la sesión, no un usuario_id que mande el body:
    // evita que alguien marque entrada/salida a nombre de otro usando su propio token válido.
    const usuario_id = req.usuario.id;
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Falta el token del código QR.' });
    }

    // Validar el token diario
    const tokenEsperado = obtenerTokenHoy();
    if (token !== tokenEsperado) {
        return res.status(400).json({ error: 'Código QR inválido o expirado. Asegúrate de escanear el QR actual en la pantalla del administrador.' });
    }

    try {
        // Buscar si el empleado tiene un turno abierto HOY (entrada registrada pero sin salida).
        // Solo se considera el día de hoy: un turno sin cerrar de un día anterior quedó
        // abandonado (se le olvidó marcar salida) y no debe cerrarse con la hora actual,
        // porque eso generaba turnos fantasma de 40, 90 e incluso 140 horas "trabajadas".
        const turnoAbierto = await pool.query(
            `SELECT id, hora_entrada,
                    EXTRACT(EPOCH FROM (NOW() - hora_entrada))/60 AS minutos
             FROM asistencia
             WHERE usuario_id = $1 AND hora_salida IS NULL
               AND fecha = TIMEZONE('America/La_Paz', NOW())::date
             LIMIT 1`,
            [usuario_id]
        );

        // Margen de gracia: un segundo escaneo apenas después de la entrada no es
        // una salida (doble toque, o la app que mandó dos veces). Mismo criterio
        // que el lector de huella, para que los dos se comporten igual.
        if (turnoAbierto.rows.length > 0 && Number(turnoAbierto.rows[0].minutos) < GRACIA_MINUTOS) {
            const minutos = Number(turnoAbierto.rows[0].minutos);
            // Va como 'ENTRADA' a propósito: la app arma el título con ese dato y
            // así muestra "¡Entrada Registrada!", que es lo que de verdad pasó.
            // Si mandáramos otra cosa diría "¡Salida Registrada!", que es peor.
            return res.json({
                success: true,
                tipo: 'ENTRADA',
                mensaje: 'Tu entrada ya estaba registrada.',
                detalles: minutos < 1
                    ? 'Acabás de marcar hace unos segundos. Para marcar la salida, volvé al terminar tu turno.'
                    : `Marcaste tu entrada hace ${Math.round(minutos)} min. Para marcar la salida, volvé al terminar tu turno.`
            });
        }

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

            registrarBitacora({
                usuario_id, usuario_nombre: nombre, accion: 'MARCAR_ASISTENCIA_SALIDA', entidad_tipo: 'asistencia', entidad_id: registroId,
                detalle: { horas_trabajadas: horasTrabajadas }
            });

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

            registrarBitacora({
                usuario_id, usuario_nombre: nombre, accion: 'MARCAR_ASISTENCIA_ENTRADA', entidad_tipo: 'asistencia'
            });

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

    // Si a un turno le falta la salida (o la que tiene es absurda, ej. >20h por un
    // escaneo de días después), en vez de dejarlo en blanco se estima con el promedio
    // de horas trabajadas que ese mismo empleado tiene en sus turnos válidos.
    let query = `
        SELECT
            a.id,
            a.usuario_id,
            u.nombre as empleado,
            u.rol,
            TO_CHAR(a.fecha, 'YYYY-MM-DD') as fecha,
            TO_CHAR(a.hora_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as entrada,
            CASE
                WHEN a.hora_salida IS NULL AND a.fecha = TIMEZONE('America/La_Paz', NOW())::date THEN NULL
                WHEN a.hora_salida IS NULL OR a.horas_trabajadas > 20 THEN
                    TO_CHAR((a.hora_entrada + (COALESCE(prom.horas, 8) * INTERVAL '1 hour')) AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI')
                ELSE TO_CHAR(a.hora_salida AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI')
            END as salida,
            CASE
                WHEN a.hora_salida IS NULL AND a.fecha = TIMEZONE('America/La_Paz', NOW())::date THEN NULL
                WHEN a.hora_salida IS NULL OR a.horas_trabajadas > 20 THEN ROUND(COALESCE(prom.horas, 8), 2)
                ELSE a.horas_trabajadas
            END as horas_trabajadas,
            CASE
                WHEN a.hora_salida IS NULL AND a.fecha = TIMEZONE('America/La_Paz', NOW())::date THEN 'EN_TURNO'
                WHEN a.hora_salida IS NULL OR a.horas_trabajadas > 20 THEN 'ESTIMADO'
                ELSE 'OK'
            END as estado_salida
        FROM asistencia a
        JOIN usuarios u ON a.usuario_id = u.id
        LEFT JOIN LATERAL (
            SELECT AVG(a2.horas_trabajadas) as horas
            FROM asistencia a2
            WHERE a2.usuario_id = a.usuario_id
              AND a2.hora_salida IS NOT NULL
              AND a2.horas_trabajadas <= 20
        ) prom ON true
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
    // Ignoramos el usuario_id de la URL: cada quien solo puede ver su propio historial,
    // el real viene de la sesión verificada (req.usuario), no de un id manipulable en el path.
    const usuario_id = req.usuario.id;

    try {
        const result = await pool.query(
            `WITH prom AS (
                SELECT AVG(horas_trabajadas) as horas
                FROM asistencia
                WHERE usuario_id = $1 AND hora_salida IS NOT NULL AND horas_trabajadas <= 20
             )
             SELECT
                a.id,
                TO_CHAR(a.fecha, 'DD/MM/YYYY') as fecha,
                TO_CHAR(a.hora_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as entrada,
                CASE
                    WHEN a.hora_salida IS NULL AND a.fecha = TIMEZONE('America/La_Paz', NOW())::date THEN NULL
                    WHEN a.hora_salida IS NULL OR a.horas_trabajadas > 20 THEN
                        TO_CHAR((a.hora_entrada + (COALESCE(prom.horas, 8) * INTERVAL '1 hour')) AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI')
                    ELSE TO_CHAR(a.hora_salida AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI')
                END as salida,
                CASE
                    WHEN a.hora_salida IS NULL AND a.fecha = TIMEZONE('America/La_Paz', NOW())::date THEN NULL
                    WHEN a.hora_salida IS NULL OR a.horas_trabajadas > 20 THEN ROUND(COALESCE(prom.horas, 8), 2)
                    ELSE a.horas_trabajadas
                END as horas_trabajadas,
                CASE
                    WHEN a.hora_salida IS NULL AND a.fecha = TIMEZONE('America/La_Paz', NOW())::date THEN 'EN_TURNO'
                    WHEN a.hora_salida IS NULL OR a.horas_trabajadas > 20 THEN 'ESTIMADO'
                    ELSE 'OK'
                END as estado_salida
             FROM asistencia a, prom
             WHERE a.usuario_id = $1
             ORDER BY a.fecha DESC, a.hora_entrada DESC
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
    const { usuario_id, fecha, hora_entrada, hora_salida } = req.body;

    // El rol de quien edita viene de la sesión verificada, no de editor_id/editor_rol del body:
    // así nadie puede pasar el id de un admin para registrar asistencia manual sin serlo.
    const rolReal = (req.usuario.rol || '').toUpperCase();
    if (rolReal !== 'ADMINISTRADOR' && rolReal !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden registrar asistencia manualmente.' });
    }

    if (!usuario_id || !fecha) {
        return res.status(400).json({ error: 'Faltan datos requeridos: Empleado y Fecha.' });
    }

    try {
        // La hora de entrada es opcional: permite marcar SOLO la salida de un
        // turno que ya tiene entrada registrada, sin tener que volver a
        // escribirla. Si no se manda, se recupera la ya guardada para ese
        // empleado/fecha; si no existe ninguna, recién ahí se pide.
        let horaEntradaFinal = hora_entrada;
        if (!horaEntradaFinal) {
            const existente = await pool.query(
                `SELECT TO_CHAR(hora_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI') as hora
                 FROM asistencia WHERE usuario_id = $1 AND fecha = $2`,
                [usuario_id, fecha]
            );
            if (existente.rows.length === 0 || !existente.rows[0].hora) {
                return res.status(400).json({ error: 'No hay una hora de entrada registrada para ese empleado en esa fecha; indícala primero.' });
            }
            horaEntradaFinal = existente.rows[0].hora;
        }

        let sql = '';
        let queryParams = [usuario_id, fecha];

        if (hora_salida) {
            // Calcular horas trabajadas
            const ent = new Date(`${fecha}T${horaEntradaFinal}`);
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
            queryParams.push(`${fecha} ${horaEntradaFinal}:00`, `${fecha} ${hora_salida}:00`, horasTrabajadas);
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
            queryParams.push(`${fecha} ${horaEntradaFinal}:00`);
        }

        await pool.query(sql, queryParams);

        registrarBitacora({
            usuario_id: req.usuario.id, usuario_nombre: req.usuario.nombre, accion: 'REGISTRAR_ASISTENCIA_MANUAL',
            entidad_tipo: 'asistencia', detalle: { empleado_id: usuario_id, fecha, hora_entrada: horaEntradaFinal, hora_salida: hora_salida || null }
        });

        res.json({ success: true, mensaje: 'Marcación manual registrada con éxito.' });
    } catch (error) {
        console.error('Error al registrar asistencia manual:', error);
        res.status(500).json({ error: 'Ocurrió un error al guardar la marcación manual.' });
    }
});

// 5. Eliminar un Registro de Asistencia (Solo Administradores)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    // El rol de quien borra viene de la sesión verificada, no de un editor_id que mande el cliente.
    const rolReal = (req.usuario.rol || '').toUpperCase();
    if (rolReal !== 'ADMINISTRADOR' && rolReal !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso denegado: Solo administradores pueden eliminar registros de asistencia.' });
    }

    try {
        const deleteResult = await pool.query('DELETE FROM asistencia WHERE id = $1 RETURNING id, usuario_id, fecha', [id]);
        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ error: 'Registro de asistencia no encontrado.' });
        }

        registrarBitacora({
            usuario_id: req.usuario.id, usuario_nombre: req.usuario.nombre, accion: 'ELIMINAR_ASISTENCIA',
            entidad_tipo: 'asistencia', entidad_id: Number(id), detalle: deleteResult.rows[0]
        });

        res.json({ success: true, mensaje: 'Registro de asistencia eliminado correctamente.' });
    } catch (error) {
        console.error('Error al eliminar asistencia:', error);
        res.status(500).json({ error: 'Ocurrió un error al intentar eliminar el registro.' });
    }
});


// ── Marcaciones que llegan del lector de huella/cara (Dahua) ──
// No la llama una persona sino el puente que corre en la PC de la cafetería, así
// que no hay sesión: se autentica con una clave propia (LECTOR_API_KEY).
// La ruta está exceptuada del middleware de sesión en middleware/auth.js.
//
// Es idempotente: cada marcación trae el número de registro del aparato (rec_no)
// y esa es la clave primaria de lector_marcaciones, así que si el puente reenvía
// lo mismo (se reinició, se cortó la red) no se aplica dos veces.
router.post('/dispositivo', async (req, res) => {
    const clave = req.headers['x-lector-key'];
    if (!process.env.LECTOR_API_KEY) {
        return res.status(503).json({ error: 'El lector no está configurado en el servidor.' });
    }
    if (!clave || clave !== process.env.LECTOR_API_KEY) {
        return res.status(401).json({ error: 'Clave del lector inválida.' });
    }

    const marcaciones = Array.isArray(req.body.marcaciones) ? req.body.marcaciones : [];
    if (marcaciones.length === 0) return res.json({ procesadas: 0, resultados: [] });

    const resultados = [];
    for (const m of marcaciones) {
        const recNo = parseInt(m.rec_no, 10);
        const lectorUserId = parseInt(m.user_id, 10);
        const fechaHora = m.fecha_hora ? new Date(m.fecha_hora) : null;

        if (!Number.isInteger(recNo) || !fechaHora || isNaN(fechaHora.getTime())) {
            resultados.push({ rec_no: m.rec_no, resultado: 'descartada: datos incompletos' });
            continue;
        }

        // El aparato también registra los intentos que NO reconoció: esos no son
        // asistencia de nadie.
        if (m.reconocido === false) {
            resultados.push({ rec_no: recNo, resultado: 'ignorada: no reconocido' });
            continue;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Si ya se procesó antes, el INSERT no devuelve fila y no se toca nada.
            const nueva = await client.query(
                `INSERT INTO lector_marcaciones (rec_no, lector_user_id, nombre_lector, fecha_hora, resultado)
                 VALUES ($1, $2, $3, $4, 'procesando')
                 ON CONFLICT (rec_no) DO NOTHING
                 RETURNING rec_no`,
                [recNo, Number.isInteger(lectorUserId) ? lectorUserId : null, m.nombre || null, fechaHora]
            );
            if (nueva.rows.length === 0) {
                await client.query('ROLLBACK');
                resultados.push({ rec_no: recNo, resultado: 'ya estaba registrada' });
                continue;
            }

            // El número del lector se busca primero en lector_user_id; si nadie lo
            // tiene asignado, se prueba contra el id del empleado (hoy coinciden).
            const emp = await client.query(
                `SELECT id, nombre FROM usuarios
                 WHERE activo AND (lector_user_id = $1 OR (lector_user_id IS NULL AND id = $1))
                 ORDER BY (lector_user_id = $1) DESC LIMIT 1`,
                [lectorUserId]
            );
            if (emp.rows.length === 0) {
                await client.query(`UPDATE lector_marcaciones SET resultado = $2 WHERE rec_no = $1`,
                    [recNo, 'sin empleado asignado']);
                await client.query('COMMIT');
                resultados.push({ rec_no: recNo, resultado: 'sin empleado asignado a ese número del lector' });
                continue;
            }
            const usuario = emp.rows[0];

            // Mismo criterio que el QR: si hay turno abierto HOY se cierra, si no
            // se abre uno. La diferencia es que acá la hora es la del aparato, no
            // la del momento en que llegó el aviso.
            const abierto = await client.query(
                `SELECT id,
                        EXTRACT(EPOCH FROM ($2::timestamptz - hora_entrada))/60 AS minutos
                 FROM asistencia
                 WHERE usuario_id = $1 AND hora_salida IS NULL
                   AND fecha = TIMEZONE('America/La_Paz', $2::timestamptz)::date
                 LIMIT 1`,
                [usuario.id, fechaHora]
            );

            let resultado;
            if (abierto.rows.length > 0) {
                const minutos = Number(abierto.rows[0].minutos);
                if (minutos < 0) {
                    resultado = 'ignorada: la salida sería anterior a la entrada';
                } else if (minutos < GRACIA_MINUTOS) {
                    // Dedo apoyado de más, o dos intentos seguidos: no es una salida.
                    resultado = `ignorada: a ${Math.round(minutos * 60)} seg de la entrada (gracia de ${GRACIA_MINUTOS} min)`;
                } else {
                    const r = await client.query(
                        `UPDATE asistencia
                         SET hora_salida = $2,
                             horas_trabajadas = ROUND(EXTRACT(EPOCH FROM ($2::timestamptz - hora_entrada))/3600::numeric, 2)
                         WHERE id = $1
                         RETURNING horas_trabajadas`,
                        [abierto.rows[0].id, fechaHora]
                    );
                    resultado = `salida (${r.rows[0].horas_trabajadas} hrs)`;
                }
            } else {
                const yaCompleto = await client.query(
                    `SELECT id FROM asistencia
                     WHERE usuario_id = $1 AND fecha = TIMEZONE('America/La_Paz', $2::timestamptz)::date LIMIT 1`,
                    [usuario.id, fechaHora]
                );
                if (yaCompleto.rows.length > 0) {
                    resultado = 'ignorada: ya marcó entrada y salida ese día';
                } else {
                    await client.query(
                        `INSERT INTO asistencia (usuario_id, fecha, hora_entrada)
                         VALUES ($1, TIMEZONE('America/La_Paz', $2::timestamptz)::date, $2)`,
                        [usuario.id, fechaHora]
                    );
                    resultado = 'entrada';
                }
            }

            await client.query(
                `UPDATE lector_marcaciones SET usuario_id = $2, resultado = $3 WHERE rec_no = $1`,
                [recNo, usuario.id, resultado]
            );
            await client.query('COMMIT');

            if (resultado === 'entrada' || resultado.startsWith('salida')) {
                registrarBitacora({
                    usuario_id: usuario.id, usuario_nombre: usuario.nombre,
                    accion: resultado === 'entrada' ? 'MARCAR_ASISTENCIA_ENTRADA' : 'MARCAR_ASISTENCIA_SALIDA',
                    entidad_tipo: 'asistencia',
                    detalle: { origen: 'lector', rec_no: recNo, lector_user_id: lectorUserId }
                });
            }
            resultados.push({ rec_no: recNo, empleado: usuario.nombre, resultado });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Error al procesar marcación del lector:', e.message);
            resultados.push({ rec_no: recNo, resultado: 'error: ' + e.message });
        } finally {
            client.release();
        }
    }

    res.json({ procesadas: resultados.length, resultados });
});

module.exports = router;
