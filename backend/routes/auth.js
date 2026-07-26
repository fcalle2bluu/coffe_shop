const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Importamos el pool de conexiones nativo de Postgres
const pool = require('../config/conexion');

const DURACION_SESION_DIAS = 30;

router.post('/login', async (req, res) => {
    try {
        console.log("=== INICIANDO INTENTO DE LOGIN ===");
        console.log("1. Datos recibidos:", req.body);
        
        const { username, pin } = req.body;

        if (!username || !pin) {
            return res.status(400).json({ error: 'Faltan datos de usuario o PIN' });
        }

        console.log(`2. Consultando BD con SQL para el usuario: ${username}...`);
        
        // Usamos SQL puro con parámetros ($1, $2) para evitar inyecciones SQL (Hackers)
        // El PIN se compara contra su hash bcrypt (columna pin) usando pgcrypto
        const query = `
            SELECT id, nombre, rol, activo,
                   perm_stock, perm_compras, perm_proveedores,
                   perm_auditoria, perm_parametros, perm_informe
            FROM usuarios
            WHERE username = $1 AND pin = crypt($2, pin)
        `;
        const { rows } = await pool.query(query, [username, pin]);

        console.log("3. Filas encontradas:", rows.length);

        // Si rows está vacío, el usuario o pin están mal
        if (rows.length === 0) {
            console.log("❌ Login fallido: Credenciales incorrectas");
            return res.status(401).json({ error: 'Usuario o PIN incorrectos' });
        }

        const usuario = rows[0]; 

        if (!usuario.activo) {
            console.log("❌ Login fallido: Usuario desactivado");
            return res.status(403).json({ error: 'Este usuario está desactivado' });
        }

        console.log(`✅ Login EXITOSO para: ${usuario.nombre} (Rol: ${usuario.rol})`);

        // Registrar en historial de accesos (Auditoría Avanzada)
        try {
            const { lat, lon } = req.body;
            const userAgent = req.headers['user-agent'] || 'Desconocido';
            const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
            const ip = ipRaw.split(',')[0].trim(); // La IP real es la primera en x-forwarded-for
            
            let ubicacion = 'Desconocida';
            
            if (lat && lon) {
                // Reverse geocoding con Nominatim (OSM)
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
                        headers: {
                            'User-Agent': 'CafeLaPazApp/1.0'
                        }
                    });
                    const locData = await response.json();
                    if (locData && locData.address) {
                        const addr = locData.address;
                        const road = addr.road || addr.suburb || addr.neighbourhood || '';
                        const city = addr.city || addr.town || addr.village || 'La Paz';
                        const country = addr.country || 'Bolivia';
                        const placeName = `${road}${road ? ', ' : ''}${city}, ${country}`;
                        ubicacion = `📍 ${placeName} | ${lat},${lon}`;
                    } else {
                        ubicacion = `📍 Lugar de Acceso | ${lat},${lon}`;
                    }
                } catch (geoErr) {
                    console.error('Error al realizar reverse geocoding:', geoErr.message);
                    ubicacion = `📍 Lugar de Acceso | ${lat},${lon}`;
                }
            } else if (ip !== '::1' && ip !== '127.0.0.1' && ip !== '0.0.0.0') {
                // Intentar obtener ubicación por IP (Solo si no es localhost)
                try {
                    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`);
                    const locData = await response.json();
                    if (locData.status === 'success') {
                        ubicacion = `${locData.city}, ${locData.country}`;
                    }
                } catch (apiErr) {
                    console.error('Error al consultar ip-api:', apiErr.message);
                }
            }

            await pool.query(
                'INSERT INTO historial_accesos (usuario_id, dispositivo, ip, ubicacion) VALUES ($1, $2, $3, $4)',
                [usuario.id, userAgent, ip, ubicacion]
            );
        } catch (logErr) {
            console.error('⚠️ No se pudo registrar el historial de acceso:', logErr.message);
        }

        // Generar token de sesión: las rutas de la API ya no confían en el usuario_id
        // que manda el cliente, sino en este token verificado contra la tabla `sesiones`.
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
            `INSERT INTO sesiones (usuario_id, token, expira_en) VALUES ($1, $2, now() + interval '${DURACION_SESION_DIAS} days')`,
            [usuario.id, token]
        );

        res.json({ success: true, usuario, token });

    } catch (err) {
        console.error('🚨 ERROR CRÍTICO EN EL BACKEND:', err);
        res.status(500).json({ 
            error: 'Error interno del servidor', 
            detalle: err.message,
            stack: err.stack
        });
    }
});

// Endpoint para verificar permisos actualizados de un usuario en tiempo real
router.get('/check-permissions', async (req, res) => {
    // El id viene de la sesión verificada (req.usuario), no del query string del cliente
    const usuario_id = req.usuario.id;

    try {
        const query = `
            SELECT perm_stock, perm_compras, perm_proveedores, 
                   perm_auditoria, perm_parametros, perm_informe 
            FROM usuarios 
            WHERE id = $1
        `;
        const { rows } = await pool.query(query, [usuario_id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ success: true, permisos: rows[0] });
    } catch (err) {
        console.error('Error al chequear permisos:', err);
        res.status(500).json({ error: err.message });
    }
});

// Registrar o actualizar token de dispositivo FCM
router.post('/registrar-token', async (req, res) => {
    // El id viene de la sesión verificada (req.usuario), no del body del cliente
    const usuario_id = req.usuario.id;
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Falta token de dispositivo' });
    }

    try {
        // Guardar o actualizar (Upsert) el token para este usuario
        const query = `
            INSERT INTO dispositivo_tokens (usuario_id, token, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (token) DO UPDATE 
            SET usuario_id = EXCLUDED.usuario_id, updated_at = NOW()
        `;
        await pool.query(query, [usuario_id, token]);
        res.json({ success: true, message: 'Token de dispositivo registrado con éxito' });
    } catch (err) {
        console.error('Error al registrar token de dispositivo:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;