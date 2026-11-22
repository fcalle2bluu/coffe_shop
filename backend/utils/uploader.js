// backend/utils/uploader.js
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

function guardarArchivoLocal(buffer, originalname) {
    const ext = path.extname(originalname) || '.jpg';
    const cleanBase = path.basename(originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${Date.now()}_${cleanBase}${ext}`;
    const fullPath = path.join(uploadsDir, filename);
    fs.writeFileSync(fullPath, buffer);
    return `/uploads/${filename}`;
}

module.exports = { guardarArchivoLocal, uploadsDir };
