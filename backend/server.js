// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

// 1. Cargar configuración de variables de entorno
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Guarda en la BD los errores y excepciones no capturadas (Render gratuito
// borra los logs de consola al reiniciar/dormir la instancia).
require('./utils/logger');

const app = express();

// ==========================================
// 2. MIDDLEWARES (TRADUCTORES)
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// 2.1 SEGURIDAD: exigir sesión válida para toda la API
// (excepto login y el webhook público de WhatsApp)
// ==========================================
const verificarSesion = require('./middleware/auth');
app.use(verificarSesion);

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
const rutasAdmin = require('./routes/admin');
const rutasMenuPdf = require('./routes/menu_pdf');
const rutasProveedores = require('./routes/proveedores'); // <--- NUEVA RUTA IMPORTADA
const rutasPedidosInternos = require('./routes/pedidos_internos');
const rutasUpload = require('./routes/upload');
const rutasIa = require('./routes/ia');
const rutasAsistencia = require('./routes/asistencia');
const rutasLibroDiario = require('./routes/libro_diario');
const rutasComandas = require('./routes/comandas');
const rutasMesas = require('./routes/mesas');
const rutasRecetas = require('./routes/recetas');
const rutasProduccion = require('./routes/produccion');
const rutasWhatsapp = require('./routes/whatsapp');
const rutasControlDiario = require('./routes/control_diario');
const rutasVersion = require('./routes/version');
const rutasCajaChica = require('./routes/caja_chica');

// ==========================================
// 4. USAR RUTAS (ENDPOINTS DE LA API)
// ==========================================
app.use('/api/auth', rutasAuth);
app.use('/api/admin', rutasAdmin);
app.use('/api/menu-pdf', rutasMenuPdf);
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
app.use('/api/comandas', rutasComandas);
app.use('/api/mesas', rutasMesas);
app.use('/api/recetas', rutasRecetas);
app.use('/api/produccion', rutasProduccion);
app.use('/api/whatsapp', rutasWhatsapp);
app.use('/api/control-diario', rutasControlDiario);
app.use('/api/version', rutasVersion);
app.use('/api/caja-chica', rutasCajaChica);

// ==========================================
// 4.1 HEALTH CHECK (para monitores externos tipo UptimeRobot)
// No cuelga de /api/ para que quede pública sin sesión. Verifica también la
// conexión a la BD, no solo que el proceso siga vivo.
// ==========================================
const pool = require('./config/conexion');
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(503).json({ status: 'error', db: 'error', error: error.message });
    }
});

// ==========================================
// 4.2 SERVIDOR MCP (HTTP) — feature flag, apagado por defecto
// Expone las herramientas de mcp/tools.js como conector remoto para
// claude.ai y la app móvil. No cuelga de /api/ (así queda fuera del
// middleware de sesión).
//
// Sin autenticación a propósito: el diálogo de "conector personalizado"
// de claude.ai/la app siempre intenta primero un handshake OAuth (para eso
// están los campos de Client ID/Secret) antes de tocar el servidor —  un
// token Bearer o por query param nunca llega a probarse porque ese
// handshake falla antes. Implementar OAuth de verdad es demasiado para
// este caso; la única protección real es que nadie más conoce esta URL,
// aceptable dado que las herramientas ya son limitadas (sin SQL libre, sin
// borrar nada, todo con confirmación humana).
// ==========================================
if (process.env.MCP_HTTP_ENABLED === 'true') {
    const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { crearServidorMcp } = require('./mcp/tools');

    // Límite básico en memoria (sin dependencia nueva): máx. 300 peticiones
    // por IP cada minuto a /mcp. Cada foto con varios insumos genera muchas
    // peticiones seguidas (initialize, tools/list, y buscar/crear/registrar
    // por cada insumo detectado), así que el límite tiene que tolerar un lote
    // grande sin cortar la operación a la mitad.
    const contadorPorIp = new Map();
    function limiteExcedido(ip) {
        const ahora = Date.now();
        const ventana = 60 * 1000;
        const registro = contadorPorIp.get(ip) || { inicio: ahora, cantidad: 0 };
        if (ahora - registro.inicio > ventana) {
            registro.inicio = ahora;
            registro.cantidad = 0;
        }
        registro.cantidad += 1;
        contadorPorIp.set(ip, registro);
        return registro.cantidad > 300;
    }

    app.post('/mcp', async (req, res) => {
        if (limiteExcedido(req.ip)) {
            return res.status(429).json({ error: 'Demasiadas peticiones, esperá un momento.' });
        }

        // Sin estado: un McpServer y transporte nuevos por cada petición, que
        // se cierran solos al terminar. Evita mantener sesiones en memoria.
        const server = crearServidorMcp();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

        res.on('close', () => {
            transport.close();
            server.close();
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('Error en el servidor MCP (HTTP):', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error interno del servidor MCP.' });
            }
        }
    });

    console.log('🔌 Servidor MCP montado en /mcp (MCP_HTTP_ENABLED=true).');
}

// ==========================================
// 5. ARCHIVOS ESTÁTICOS (FRONTEND)
// ==========================================
app.use(express.static(path.join(__dirname, '../frontend')));

// APKs de las apps móviles, para que se puedan descargar y auto-actualizar
// (se reemplazan/versionan vía backend/config/app_versions.json)
app.use('/apks', express.static(path.join(__dirname, 'public/apks')));

// ==========================================
// 6. INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en el puerto ${PORT}`);
});