// backend/routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB MAX

router.post('/', upload.single('imagen'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ninguna imagen' });
    }
    if (!supabase) {
        return res.status(500).json({ error: 'Servidor no configurado para almacenamiento de Supabase' });
    }

    try {
        const nombreArchivo = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const { data, error } = await supabase.storage
            .from('insumos')
            .upload(nombreArchivo, req.file.buffer, {
                contentType: req.file.mimetype,
            });

        if (error) throw error;

        const { data: publicData } = supabase.storage.from('insumos').getPublicUrl(nombreArchivo);
        res.json({ success: true, url: publicData.publicUrl });
    } catch (error) {
        console.error('Error al subir a Supabase:', error);
        res.status(500).json({ error: 'Error al subir la imagen a la nube' });
    }
});

module.exports = router;
