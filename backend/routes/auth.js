const express = require('express');
const router = express.Router();

// Importamos el pool de conexiones nativo de Postgres
const pool = require('../config/conexion'); 

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
        const query = `
            SELECT id, nombre, rol, activo, 
                   perm_stock, perm_compras, perm_proveedores, 
                   perm_auditoria, perm_parametros, perm_informe 
            FROM usuarios 
            WHERE username = $1 AND pin = $2
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
            const userAgent = req.headers['user-agent'] || 'Desconocido';
            const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
            const ip = ipRaw.split(',')[0].trim(); // La IP real es la primera en x-forwarded-for
            
            let ubicacion = 'Desconocida';
            
            // Intentar obtener ubicación por IP (Solo si no es localhost)
            if (ip !== '::1' && ip !== '127.0.0.1' && ip !== '0.0.0.0') {
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

        res.json({ success: true, usuario });

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
    const { usuario_id } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'Falta ID de usuario' });
    }

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

module.exports = router;