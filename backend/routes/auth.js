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
        const query = 'SELECT id, nombre, rol, activo FROM usuarios WHERE username = $1 AND pin = $2';
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

        // NUEVO: Registrar en historial de accesos (Auditoría)
        try {
            const dispositivo = req.headers['user-agent'] || 'Desconocido';
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
            
            await pool.query(
                'INSERT INTO historial_accesos (usuario_id, dispositivo, ip) VALUES ($1, $2, $3)',
                [usuario.id, dispositivo, ip]
            );
        } catch (logErr) {
            console.error('⚠️ No se pudo registrar el historial de acceso:', logErr.message);
            // No detenemos el login si falla el log
        }

        res.json({ success: true, usuario });

    } catch (err) {
        console.error('🚨 ERROR CRÍTICO EN EL BACKEND:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;