// backend/routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${Date.now()}_${cleanBase}${ext}`);
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB MAX

// Subida de imagen local (100% libre de cuota de Supabase)
router.post('/', upload.single('imagen'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ninguna imagen' });
    }
    const publicUrl = `/uploads/${req.file.filename}`;
    console.log(`📸 Imagen subida localmente con éxito: ${publicUrl}`);
    res.json({ success: true, url: publicUrl });
});

module.exports = router;
