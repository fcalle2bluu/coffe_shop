// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

// 1. Cargar configuración
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json());

// 2. Archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

// 3. Importar Rutas
const rutasKpis = require('./routes/kpis');
const rutasAlmacen = require('./routes/almacen'); // Ahora sí lo encontrará

// 4. Usar Rutas
app.use('/api/kpis', rutasKpis);
app.use('/api/almacen', rutasAlmacen); 

// 5. Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});