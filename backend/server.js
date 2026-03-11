// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const rutasCotizaciones = require('./routes/cotizaciones');
const rutasVentas = require('./routes/ventas');
const rutasCaja = require('./routes/caja');
const rutasApartados = require('./routes/apartados');
const rutasInventario = require('./routes/inventario');
const rutasComprobantes = require('./routes/comprobantes');
// 1. Cargar configuración
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const rutasParametros = require('./routes/parametros');
const rutasCompras = require('./routes/compras');
app.use('/api/compras', rutasCompras);
app.use('/api/parametros', rutasParametros);

app.use(cors());
app.use(express.json());
app.use('/api/comprobantes', rutasComprobantes);
// 2. Archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api/inventario', rutasInventario);
// 3. Importar Rutas
const rutasKpis = require('./routes/kpis');
const rutasAlmacen = require('./routes/almacen'); // Ahora sí lo encontrará
app.use('/api/ventas', rutasVentas);
app.use('/api/caja', rutasCaja);
app.use('/api/apartados', rutasApartados);
// 4. Usar Rutas
app.use('/api/kpis', rutasKpis);
app.use('/api/almacen', rutasAlmacen); 
app.use('/api/cotizaciones', rutasCotizaciones);
// 5. Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});