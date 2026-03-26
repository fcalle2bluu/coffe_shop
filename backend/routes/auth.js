// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/conexion'); // Ajusta la ruta si tu archivo de conexión se llama distinto

router.post('/login', async (req, res) => {
    const { username, pin } = req.body;

    try {
        // Consultamos a Supabase si existe el usuario con ese PIN
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, rol, activo')
            .eq('username', username)
            .eq('pin', pin)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Usuario o PIN incorrectos' });
        }

        if (!data.activo) {
            return res.status(403).json({ error: 'Este usuario está desactivado' });
        }

        // Si todo está bien, devolvemos los datos del usuario
        res.json({ success: true, usuario: data });

    } catch (err) {
        console.error('Error en el login:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;