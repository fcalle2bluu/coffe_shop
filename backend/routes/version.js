const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ARCHIVO_VERSIONES = path.join(__dirname, '../config/app_versions.json');

// Endpoint público: la app consulta esto al iniciar para saber si hay una
// versión más nueva. appKey identifica cada app ("mesero", "comandas").
router.get('/:appKey', (req, res) => {
    let versiones;
    try {
        versiones = JSON.parse(fs.readFileSync(ARCHIVO_VERSIONES, 'utf8'));
    } catch (err) {
        console.error('Error al leer app_versions.json:', err.message);
        return res.status(500).json({ error: 'No se pudo leer la información de versiones.' });
    }

    const info = versiones[req.params.appKey];
    if (!info) {
        return res.status(404).json({ error: 'App no reconocida.' });
    }

    res.json(info);
});

module.exports = router;
