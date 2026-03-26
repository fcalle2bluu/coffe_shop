const express = require('express');
const router = express.Router();

// ⚠️ ATENCIÓN AQUÍ: Si en tu archivo conexion.js exportaste supabase entre llaves ( module.exports = { supabase } )
// entonces aquí también debes importarlo con llaves: const { supabase } = require('../config/conexion');
const supabase = require('../config/conexion'); 

router.post('/login', async (req, res) => {
    try {
        console.log("=== INICIANDO INTENTO DE LOGIN ===");
        console.log("1. Datos recibidos del frontend:", req.body);
        
        const { username, pin } = req.body;

        if (!username || !pin) {
            console.log("Error: Faltan credenciales");
            return res.status(400).json({ error: 'Faltan datos de usuario o PIN' });
        }

        console.log(`2. Consultando BD para el usuario: ${username}...`);
        
        // Usamos el método normal sin .single() para evitar que Supabase crashee si no hay resultados
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, rol, activo')
            .eq('username', username)
            .eq('pin', pin);

        console.log("3. Respuesta cruda de Supabase:", { data, error });

        if (error) {
            console.error("Error de Supabase:", error);
            return res.status(500).json({ error: 'Error interno de base de datos' });
        }

        // Si la data viene vacía (array de longitud 0), el usuario o pin están mal
        if (!data || data.length === 0) {
            console.log("Login fallido: Credenciales incorrectas");
            return res.status(401).json({ error: 'Usuario o PIN incorrectos' });
        }

        const usuario = data[0]; // Tomamos el primer resultado

        if (!usuario.activo) {
            console.log("Login fallido: Usuario desactivado");
            return res.status(403).json({ error: 'Este usuario está desactivado' });
        }

        console.log(`4. Login EXITOSO para: ${usuario.nombre} (Rol: ${usuario.rol})`);
        res.json({ success: true, usuario });

    } catch (err) {
        // Si el código llega aquí, es porque algo crasheó feo (ej: supabase.from no es una función)
        console.error('🚨 ERROR CRÍTICO EN EL BACKEND:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;