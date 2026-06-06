// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

// 1. Cargar configuración de variables de entorno
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();

// ==========================================
// 2. MIDDLEWARES (TRADUCTORES)
// ==========================================
app.use(cors());
app.use(express.json()); 

// ==========================================
// 3. IMPORTAR RUTAS
// ==========================================
const rutasKpis = require('./routes/kpis');
const rutasAlmacen = require('./routes/almacen');
const rutasCotizaciones = require('./routes/cotizaciones');
const rutasVentas = require('./routes/ventas');
const rutasCaja = require('./routes/caja');
const rutasInventario = require('./routes/inventario');
const rutasComprobantes = require('./routes/comprobantes');
const rutasParametros = require('./routes/parametros');
const rutasCompras = require('./routes/compras');
const rutasAuth = require('./routes/auth');
const rutasProveedores = require('./routes/proveedores'); // <--- NUEVA RUTA IMPORTADA
const rutasPedidosInternos = require('./routes/pedidos_internos');
const rutasUpload = require('./routes/upload');
const rutasIa = require('./routes/ia');
const rutasAsistencia = require('./routes/asistencia');
const rutasLibroDiario = require('./routes/libro_diario');

// ==========================================
// 4. USAR RUTAS (ENDPOINTS DE LA API)
// ==========================================
app.use('/api/auth', rutasAuth);
app.use('/api/kpis', rutasKpis);
app.use('/api/almacen', rutasAlmacen); 
app.use('/api/cotizaciones', rutasCotizaciones);
app.use('/api/ventas', rutasVentas);
app.use('/api/caja', rutasCaja);
app.use('/api/inventario', rutasInventario);
app.use('/api/comprobantes', rutasComprobantes);
app.use('/api/parametros', rutasParametros);
app.use('/api/compras', rutasCompras);
app.use('/api/proveedores', rutasProveedores); // <--- NUEVA RUTA ACTIVADA
app.use('/api/pedidos_internos', rutasPedidosInternos);
app.use('/api/upload', rutasUpload);
app.use('/api/ia', rutasIa);
app.use('/api/asistencia', rutasAsistencia);
app.use('/api/libro-diario', rutasLibroDiario);

// ==========================================
// 5. ARCHIVOS ESTÁTICOS (FRONTEND)
// ==========================================
app.use(express.static(path.join(__dirname, '../frontend')));

// ==========================================
// 6. INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en el puerto ${PORT}`);
});