// backend/routes/parametros.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// 1. Obtener los parámetros actuales
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parametros WHERE id = 1');
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al cargar parámetros:', error);
        res.status(500).json({ error: 'Error al cargar configuración' });
    }
});

// 2. Actualizar los parámetros
router.put('/', async (req, res) => {
    const {
        nombre_empresa, documento_empresa, direccion, telefono,
        moneda, impuesto_nombre, impuesto_porcentaje,
        mensaje_ticket_superior, mensaje_ticket_inferior, impresora_papel,
        hora_entrada_patron, descuento_minuto_retraso, descuento_falta_dia, dias_laborables,
        descuento_retraso_bloque
    } = req.body;

    try {
        await pool.query(`
            UPDATE parametros SET
                nombre_empresa = $1, documento_empresa = $2, direccion = $3, telefono = $4,
                moneda = $5, impuesto_nombre = $6, impuesto_porcentaje = $7,
                mensaje_ticket_superior = $8, mensaje_ticket_inferior = $9, impresora_papel = $10,
                hora_entrada_patron = COALESCE($11, hora_entrada_patron),
                descuento_minuto_retraso = COALESCE($12, descuento_minuto_retraso),
                descuento_falta_dia = COALESCE($13, descuento_falta_dia),
                dias_laborables = COALESCE($14, dias_laborables),
                descuento_retraso_bloque = COALESCE($15, descuento_retraso_bloque)
            WHERE id = 1
        `, [
            nombre_empresa, documento_empresa, direccion, telefono,
            moneda, impuesto_nombre, impuesto_porcentaje,
            mensaje_ticket_superior, mensaje_ticket_inferior, impresora_papel,
            hora_entrada_patron || null,
            descuento_minuto_retraso !== undefined ? parseFloat(descuento_minuto_retraso) : null,
            descuento_falta_dia !== undefined ? parseFloat(descuento_falta_dia) : null,
            dias_laborables !== undefined ? parseInt(dias_laborables) : null,
            descuento_retraso_bloque !== undefined ? parseFloat(descuento_retraso_bloque) : null
        ]);

        res.json({ message: 'Configuración guardada exitosamente' });
    } catch (error) {
        console.error('Error al guardar parámetros:', error);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
});

// --- GESTIÓN DE USUARIOS ---

// Helper para convertir formato HH:MM:SS o HH:MM a minutos desde la medianoche
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return hours * 60 + minutes;
}

// 3. Listar usuarios (empleados)
router.get('/usuarios', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre, username, pin, rol, activo, 
                   perm_stock, perm_compras, perm_proveedores, 
                   perm_auditoria, perm_parametros, perm_informe,
                   telefono, ci, salario, foto_url
            FROM usuarios 
            ORDER BY nombre ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// 3.5. Actualizar permisos de usuario
router.put('/usuarios/:id/permisos', async (req, res) => {
    const { id } = req.params;
    const { perm_stock, perm_compras, perm_proveedores, perm_auditoria, perm_parametros, perm_informe } = req.body;

    try {
        await pool.query(`
            UPDATE usuarios SET 
                perm_stock = $1, 
                perm_compras = $2, 
                perm_proveedores = $3, 
                perm_auditoria = $4, 
                perm_parametros = $5, 
                perm_informe = $6 
            WHERE id = $7
        `, [perm_stock, perm_compras, perm_proveedores, perm_auditoria, perm_parametros, perm_informe, id]);
        res.json({ message: 'Permisos actualizados correctamente' });
    } catch (error) {
        console.error('Error al actualizar permisos:', error);
        res.status(500).json({ error: 'Error al actualizar permisos' });
    }
});

// 4. Crear usuario (empleado)
router.post('/usuarios', async (req, res) => {
    const { nombre, username, pin, rol, telefono, ci, salario, foto_url } = req.body;

    if (!nombre || !username || !pin || !rol) {
        return res.status(400).json({ error: 'Todos los campos obligatorios deben ser llenados' });
    }

    try {
        // Verificar si el username ya existe
        const check = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
        }

        await pool.query(`
            INSERT INTO usuarios (nombre, username, pin, rol, activo, telefono, ci, salario, foto_url)
            VALUES ($1, $2, crypt($3, gen_salt('bf', 6)), $4, true, $5, $6, $7, $8)
        `, [nombre, username, pin, rol, telefono || '', ci || '', salario ? parseFloat(salario) : 0.00, foto_url || '']);

        res.status(201).json({ message: 'Empleado creado exitosamente' });
    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({ error: error.message || 'Error al registrar usuario' });
    }
});

// 4.5. Actualizar información de empleado (perfil y salario)
router.put('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, username, pin, rol, telefono, ci, salario, foto_url } = req.body;

    if (!nombre || !username || !rol) {
        return res.status(400).json({ error: 'Nombre, usuario y rol son obligatorios' });
    }

    try {
        // Verificar si el username ya lo tiene otro usuario
        const check = await pool.query('SELECT id FROM usuarios WHERE username = $1 AND id <> $2', [username, id]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
        }

        // El PIN es opcional al editar: si se manda uno nuevo se hashea y
        // reemplaza; si se deja vacío, el PIN actual del empleado no se toca
        // (el frontend ya no lo pre-llena para evitar re-hashear el hash existente).
        if (pin && pin.trim()) {
            await pool.query(`
                UPDATE usuarios SET
                    nombre = $1,
                    username = $2,
                    pin = crypt($3, gen_salt('bf', 6)),
                    rol = $4,
                    telefono = $5,
                    ci = $6,
                    salario = $7,
                    foto_url = $8
                WHERE id = $9
            `, [nombre, username, pin, rol, telefono || '', ci || '', salario ? parseFloat(salario) : 0.00, foto_url || '', id]);
        } else {
            await pool.query(`
                UPDATE usuarios SET
                    nombre = $1,
                    username = $2,
                    rol = $3,
                    telefono = $4,
                    ci = $5,
                    salario = $6,
                    foto_url = $7
                WHERE id = $8
            `, [nombre, username, rol, telefono || '', ci || '', salario ? parseFloat(salario) : 0.00, foto_url || '', id]);
        }

        res.json({ message: 'Empleado actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar empleado:', error);
        res.status(500).json({ error: error.message || 'Error al actualizar empleado' });
    }
});

// 4.55. Actualizar datos de nómina de un empleado (salario base, días trabajados,
// horas laborales, hora de entrada). Endpoint liviano usado por los inputs
// editables de la sección "Pago de Salarios", separado de PUT /usuarios/:id
// porque ese requiere nombre/username/rol y se usa desde el modal del Directorio.
router.put('/usuarios/:id/payroll', async (req, res) => {
    const { id } = req.params;
    const { salario, dias_trabajados, horas_laborales, hora_entrada } = req.body;

    try {
        await pool.query(`
            UPDATE usuarios SET
                salario = COALESCE($1, salario),
                dias_trabajados = COALESCE($2, dias_trabajados),
                horas_laborales = COALESCE($3, horas_laborales),
                hora_entrada = COALESCE($4, hora_entrada)
            WHERE id = $5
        `, [
            salario !== undefined && salario !== null ? parseFloat(salario) : null,
            dias_trabajados !== undefined && dias_trabajados !== null ? parseInt(dias_trabajados) : null,
            horas_laborales !== undefined && horas_laborales !== null ? parseFloat(horas_laborales) : null,
            hora_entrada || null,
            id
        ]);
        res.json({ message: 'Datos de nómina actualizados correctamente' });
    } catch (error) {
        console.error('Error al actualizar datos de nómina:', error);
        res.status(500).json({ error: 'Error al actualizar datos de nómina' });
    }
});

// 4.6. Calcular pagos y descuentos por asistencia
router.get('/usuarios/pagos/calcular', async (req, res) => {
    const mes = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);

    const ahora = new Date();
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const horaBolivia = new Date(utc + (3600000 * -4));
    const targetMes = !isNaN(mes) ? mes : (horaBolivia.getMonth() + 1);
    const targetAnio = !isNaN(anio) ? anio : horaBolivia.getFullYear();

    try {
        // Obtener configuración de descuentos (solo 2 parámetros editables: retraso y falta)
        const paramRes = await pool.query('SELECT descuento_falta_dia, descuento_retraso_bloque FROM parametros WHERE id = 1');
        const config = paramRes.rows[0] || {
            descuento_falta_dia: 200.00,
            descuento_retraso_bloque: 10.00
        };

        // Obtener empleados (se excluye Administradores: la planilla es solo para el personal operativo)
        // La hora de entrada, días trabajados y horas laborales son por empleado:
        // no todos tienen el mismo horario ni la misma carga laboral.
        const usersRes = await pool.query(`
            SELECT id, nombre, username, rol, activo, telefono, ci, salario, foto_url,
                   COALESCE(dias_trabajados, 27) as dias_trabajados,
                   COALESCE(horas_laborales, 8.00) as horas_laborales,
                   COALESCE(hora_entrada, '08:30:00') as hora_entrada
            FROM usuarios
            WHERE rol NOT IN ('ADMIN', 'ADMINISTRADOR')
            ORDER BY nombre ASC
        `);
        const users = usersRes.rows;

        // Obtener asistencias del mes/año especificado
        // asistencia.hora_entrada es "timestamp sin zona" pero guarda el valor en
        // UTC (ver el mismo patrón, ya correcto, en asistencia.js).
        const asistenciaRes = await pool.query(`
            SELECT
                usuario_id,
                TO_CHAR(hora_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI:SS') as hora_entrada_bolivia,
                fecha
            FROM asistencia
            WHERE EXTRACT(YEAR FROM fecha) = $1 AND EXTRACT(MONTH FROM fecha) = $2
        `, [targetAnio, targetMes]);
        const asistencias = asistenciaRes.rows;

        // Obtener pagos ya registrados para este mes/año
        const pagosRes = await pool.query(`
            SELECT usuario_id, salario_base, descuento_retrasos, descuento_faltas, salario_neto, fecha_pago, glosa
            FROM pagos_salarios
            WHERE mes = $1 AND anio = $2
        `, [targetMes, targetAnio]);
        const pagosMap = {};
        pagosRes.rows.forEach(p => {
            pagosMap[p.usuario_id] = p;
        });

        const BLOQUE_RETRASO_MINUTOS = 5;

        const payroll = users.map(user => {
            const userAsistencias = asistencias.filter(a => a.usuario_id === user.id);
            const asistenciasCount = userAsistencias.length;
            const diasTrabajados = parseInt(user.dias_trabajados) || 27;
            const faltas = Math.max(0, diasTrabajados - asistenciasCount);

            let minutosRetraso = 0;
            const limiteMinutos = timeToMinutes(user.hora_entrada || '08:30:00');

            userAsistencias.forEach(a => {
                const entradaMinutos = timeToMinutes(a.hora_entrada_bolivia);
                if (entradaMinutos > limiteMinutos) {
                    minutosRetraso += (entradaMinutos - limiteMinutos);
                }
            });

            const salarioBase = parseFloat(user.salario || 0);
            // Descuento por retraso: se cobra por cada bloque de 5 minutos (o fracción) de tardanza
            const bloquesRetraso = minutosRetraso > 0 ? Math.ceil(minutosRetraso / BLOQUE_RETRASO_MINUTOS) : 0;
            const descuentoRetrasos = parseFloat((bloquesRetraso * (config.descuento_retraso_bloque || 0)).toFixed(2));
            const descuentoFaltas = parseFloat((faltas * (config.descuento_falta_dia || 0)).toFixed(2));
            const salarioNeto = Math.max(0, parseFloat((salarioBase - descuentoRetrasos - descuentoFaltas).toFixed(2)));

            const pagoExistente = pagosMap[user.id];

            return {
                usuario_id: user.id,
                nombre: user.nombre,
                username: user.username,
                rol: user.rol,
                activo: user.activo,
                ci: user.ci,
                telefono: user.telefono,
                foto_url: user.foto_url,
                salario_base: salarioBase,
                dias_trabajados: diasTrabajados,
                horas_laborales: parseFloat(user.horas_laborales) || 8,
                hora_entrada: (user.hora_entrada || '08:30:00').toString().substring(0, 5),
                asistencias_count: asistenciasCount,
                minutos_retraso: minutosRetraso,
                faltas: faltas,
                descuento_retrasos: descuentoRetrasos,
                descuento_faltas: descuentoFaltas,
                salario_neto: salarioNeto,
                pagado: !!pagoExistente,
                pago_detalles: pagoExistente || null
            };
        });

        res.json({
            mes: targetMes,
            anio: targetAnio,
            config: {
                descuento_retraso_bloque: parseFloat(config.descuento_retraso_bloque),
                descuento_falta_dia: parseFloat(config.descuento_falta_dia),
                bloque_retraso_minutos: BLOQUE_RETRASO_MINUTOS
            },
            payroll: payroll
        });
    } catch (error) {
        console.error('Error al calcular nómina:', error);
        res.status(500).json({ error: 'Error al calcular nómina: ' + error.message });
    }
});

// 4.7. Registrar pago de salario e impactar Libro Diario
router.post('/usuarios/pagos', async (req, res) => {
    const { usuario_id, mes, anio, salario_base, descuento_retrasos, descuento_faltas, salario_neto, glosa, metodo_pago } = req.body;

    if (!usuario_id || !mes || !anio || salario_base === undefined || salario_neto === undefined || !glosa) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insertar en pagos_salarios
        await client.query(`
            INSERT INTO pagos_salarios (usuario_id, mes, anio, salario_base, descuento_retrasos, descuento_faltas, salario_neto, glosa)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            usuario_id, 
            parseInt(mes), 
            parseInt(anio), 
            parseFloat(salario_base), 
            parseFloat(descuento_retrasos || 0), 
            parseFloat(descuento_faltas || 0), 
            parseFloat(salario_neto), 
            glosa
        ]);

        // 2. Insertar en gastos_generales para Libro Diario
        await client.query(`
            INSERT INTO gastos_generales (descripcion, monto, categoria, metodo_pago)
            VALUES ($1, $2, 'GASTOS OPERATIVOS', $3)
        `, [
            glosa,
            parseFloat(salario_neto),
            metodo_pago || 'BANCO BISA'
        ]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Pago registrado exitosamente e insertado en el Libro Diario.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al registrar pago:', error);
        res.status(500).json({ 
            error: 'Error al registrar el pago: ' + 
                (error.constraint === 'pagos_salarios_usuario_id_mes_anio_key' 
                    ? 'El salario de este empleado ya ha sido pagado para este mes/año.' 
                    : error.message) 
        });
    } finally {
        client.release();
    }
});

// 5. Alternar estado activo/inactivo
router.put('/usuarios/:id/status', async (req, res) => {
    const { id } = req.params;
    const { activo } = req.body;

    try {
        await pool.query('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, id]);
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// 6. Eliminar usuario
router.delete('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

// 4. Obtener Historial de Accesos
router.get('/historial', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.id, u.nombre as usuario, h.dispositivo, h.ip, h.ubicacion,
                TO_CHAR(h.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY HH24:MI') as fecha_formateada
            FROM historial_accesos h
            JOIN usuarios u ON h.usuario_id = u.id
            ORDER BY h.fecha DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ error: 'Error al obtener historial de accesos' });
    }
});

module.exports = router;