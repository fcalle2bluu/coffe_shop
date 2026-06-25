const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Middleware para verificar rol administrador (Solo admins acceden al Asistente IA)
const checkAdminPermission = async (req, res, next) => {
    const usuario_id = req.headers['x-usuario-id'] || req.query.usuario_id || req.body.usuario_id;
    if (!usuario_id) {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere ID de usuario.' });
    }
    try {
        const userRes = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(403).json({ error: 'Acceso denegado: Usuario no encontrado.' });
        }
        const rol = userRes.rows[0].rol.toUpperCase();
        if (rol !== 'ADMIN' && rol !== 'ADMINISTRADOR') {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos de administrador.' });
        }
        next();
    } catch (err) {
        console.error('Error al validar permisos de admin en IA:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

router.use(checkAdminPermission);

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar el SDK de Gemini
const apiKey = process.env.GEMINI_API_KEY || '';
let genAI = null;
if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
}

// Helper para ejecutar consultas seguras y tolerar fallas de tablas/columnas
const ejecutarQuerySegura = async (sql, params = []) => {
    try {
        const res = await pool.query(sql, params);
        return res.rows;
    } catch (err) {
        console.error(`🚨 Error al ejecutar consulta segura [${sql}]:`, err.message);
        return []; // Retorna un array vacío para no quebrar la petición global
    }
};

// Helper para reintentar consultas en caso de rate limits (429) de Gemini
const generarContenidoConRetry = async (model, prompt, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result;
        } catch (error) {
            const errorMsg = error.message || '';
            const esRateLimit = errorMsg.includes('429') || 
                                errorMsg.toLowerCase().includes('quota') || 
                                errorMsg.toLowerCase().includes('limit') ||
                                errorMsg.toLowerCase().includes('exhausted');
            if (esRateLimit && i < retries - 1) {
                console.warn(`⚠️ Rate limit de Gemini alcanzado. Reintentando en ${delay}ms... (Intento ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Backoff exponencial
            } else {
                throw error;
            }
        }
    }
};

router.post('/consultar', async (req, res) => {
    const { mensaje } = req.body;

    if (!mensaje || mensaje.trim() === '') {
        return res.status(400).json({ error: 'El mensaje de consulta es requerido.' });
    }

    if (!genAI) {
        return res.status(500).json({ error: 'La IA no está configurada en el servidor. Falta la clave GEMINI_API_KEY.' });
    }

    try {
        // 1. Obtener snapshot optimizado de la Base de Datos en tiempo real
        console.log(`🤖 Recopilando snapshot de la base de datos para responder a: "${mensaje}"`);
        
        const [
            usuarios,
            cajas,
            gastos,
            ventas,
            detalleVentas,
            productos,
            compras,
            detalleCompras,
            insumos,
            proveedores,
            pedidos,
            lotes,
            asistencia,
            historial_accesos,
            categorias,
            gastosGenerales,
            pagosSalarios,
            comandas,
            detalleComandas,
            mesas,
            almacenes,
            inventarioAlmacen,
            ordenesProduccion,
            detalleOrden,
            auditoriasPasteleria,
            detalleAuditoriaPasteleria,
            recetas,
            ingredienteRecetas,
            parametros,
            // Resúmenes históricos agregados de 30 días
            ventasResumen30Dias,
            ventasPorProducto30Dias,
            comprasResumen30Dias,
            comprasPorInsumo30Dias
        ] = await Promise.all([
            ejecutarQuerySegura('SELECT id, nombre, username, rol, activo FROM usuarios'),
            ejecutarQuerySegura("SELECT id, usuario_id, saldo_inicial, saldo_final, TO_CHAR(fecha_apertura, 'YYYY-MM-DD HH24:MI') as fecha_apertura, TO_CHAR(fecha_cierre, 'YYYY-MM-DD HH24:MI') as fecha_cierre FROM cajas WHERE fecha_apertura >= NOW() - INTERVAL '7 days' ORDER BY fecha_apertura DESC"),
            ejecutarQuerySegura("SELECT id, caja_id, usuario_id, monto, descripcion, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM gastos_caja WHERE fecha >= NOW() - INTERVAL '7 days' ORDER BY fecha DESC"),
            // Ventas detalladas de los últimos 3 días (captura hoy, ayer y antier de forma ultra liviana)
            ejecutarQuerySegura("SELECT id, caja_id, total, metodo_pago, TO_CHAR(fecha_venta, 'YYYY-MM-DD HH24:MI') as fecha_venta, usuario_id, es_historica FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '3 days' ORDER BY fecha_venta DESC"),
            ejecutarQuerySegura("SELECT dv.id, dv.venta_id, dv.producto_id, dv.cantidad, dv.precio_unitario, dv.subtotal FROM detalle_ventas dv JOIN ventas v ON dv.venta_id = v.id WHERE v.fecha_venta >= NOW() - INTERVAL '3 days'"),
            ejecutarQuerySegura('SELECT id, nombre, precio_venta, categoria_id, activo FROM productos'),
            // Compras detalladas de los últimos 3 días
            ejecutarQuerySegura("SELECT id, proveedor_id, total, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM compras WHERE fecha >= NOW() - INTERVAL '3 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dc.compra_id, dc.insumo_id, dc.cantidad, dc.costo_unitario, dc.subtotal FROM detalle_compras dc JOIN compras c ON dc.compra_id = c.id WHERE c.fecha >= NOW() - INTERVAL '3 days'"),
            ejecutarQuerySegura('SELECT id, nombre, unidad_medida, stock_actual, stock_minimo, activo FROM insumos'),
            ejecutarQuerySegura('SELECT id, nombre, telefono, lugar, otros FROM proveedores'),
            ejecutarQuerySegura("SELECT id, usuario_id, insumo_id, insumo_nombre, cantidad, notas, estado, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM pedidos_compra WHERE fecha >= NOW() - INTERVAL '7 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, compra_id, insumo_id, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento, stock_lote FROM lotes_insumos"),
            ejecutarQuerySegura("SELECT a.id, a.usuario_id, u.nombre as empleado, TO_CHAR(a.fecha, 'YYYY-MM-DD') as fecha, TO_CHAR(a.hora_entrada, 'HH24:MI') as entrada, TO_CHAR(a.hora_salida, 'HH24:MI') as salida, a.horas_trabajadas FROM asistencia a JOIN usuarios u ON a.usuario_id = u.id WHERE a.fecha >= NOW() - INTERVAL '7 days' ORDER BY a.fecha DESC, a.hora_entrada DESC"),
            ejecutarQuerySegura("SELECT h.id, u.nombre as usuario, h.dispositivo, h.ip, h.ubicacion, TO_CHAR(h.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI') as fecha FROM historial_accesos h JOIN usuarios u ON h.usuario_id = u.id ORDER BY h.fecha DESC LIMIT 15"),
            ejecutarQuerySegura('SELECT id, nombre, descripcion, activo FROM categorias'),
            ejecutarQuerySegura("SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha, descripcion, monto, categoria, metodo_pago FROM gastos_generales WHERE fecha >= NOW() - INTERVAL '7 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, usuario_id, mes, anio, salario_base, descuento_retrasos, descuento_faltas, salario_neto, TO_CHAR(fecha_pago, 'YYYY-MM-DD HH24:MI') as fecha_pago, glosa FROM pagos_salarios WHERE fecha_pago >= NOW() - INTERVAL '30 days' ORDER BY fecha_pago DESC"),
            // Comandas detalladas de los últimos 3 días
            ejecutarQuerySegura("SELECT id, mesa, usuario_id, caja_id, estado, total, TO_CHAR(fecha_creacion, 'YYYY-MM-DD HH24:MI') as fecha_creacion FROM comandas WHERE fecha_creacion >= NOW() - INTERVAL '3 days' ORDER BY fecha_creacion DESC"),
            ejecutarQuerySegura("SELECT dc.id, dc.comanda_id, dc.producto_id, dc.cantidad, dc.precio_unitario, dc.subtotal FROM detalle_comandas dc JOIN comandas c ON dc.comanda_id = c.id WHERE c.fecha_creacion >= NOW() - INTERVAL '3 days'"),
            ejecutarQuerySegura('SELECT id, numero, piso, pos_x, pos_y, activo FROM mesas'),
            ejecutarQuerySegura('SELECT id, nombre, descripcion FROM almacenes'),
            ejecutarQuerySegura('SELECT id, almacen_id, insumo_id, stock_actual FROM inventario_almacen'),
            ejecutarQuerySegura("SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha, usuario_id, estado, observaciones FROM ordenes_produccion WHERE fecha >= NOW() - INTERVAL '7 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT do.id, do.orden_id, do.receta_id, do.cantidad FROM detalle_orden do JOIN ordenes_produccion o ON do.orden_id = o.id WHERE o.fecha >= NOW() - INTERVAL '7 days'"),
            ejecutarQuerySegura("SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha, usuario_id, observaciones FROM auditorias_pasteleria WHERE fecha >= NOW() - INTERVAL '7 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dap.id, dap.auditoria_id, dap.insumo_id, dap.cantidad_teorica, dap.cantidad_real, dap.diferencia FROM detalle_auditoria_pasteleria dap JOIN auditorias_pasteleria ap ON dap.auditoria_id = ap.id WHERE ap.fecha >= NOW() - INTERVAL '7 days'"),
            ejecutarQuerySegura('SELECT id, producto_id, nombre, preparacion, porciones FROM recetas'),
            ejecutarQuerySegura('SELECT id, receta_id, insumo_id, nombre_ingrediente, cantidad, unidad_medida FROM ingrediente_recetas'),
            ejecutarQuerySegura('SELECT * FROM parametros LIMIT 1'),
            // Nuevas consultas históricas agregadas (extremadamente livianas y con resúmenes de 30 días)
            ejecutarQuerySegura("SELECT TO_CHAR(fecha_venta, 'YYYY-MM-DD') as fecha, COUNT(id)::integer as total_tickets, SUM(total)::numeric as total_dinero FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '30 days' GROUP BY TO_CHAR(fecha_venta, 'YYYY-MM-DD') ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dv.producto_id, p.nombre as producto, SUM(dv.cantidad)::integer as cantidad_total, SUM(dv.subtotal)::numeric as ingresos_totales FROM detalle_ventas dv JOIN productos p ON dv.producto_id = p.id JOIN ventas v ON dv.venta_id = v.id WHERE v.fecha_venta >= NOW() - INTERVAL '30 days' GROUP BY dv.producto_id, p.nombre ORDER BY ingresos_totales DESC"),
            ejecutarQuerySegura("SELECT TO_CHAR(fecha, 'YYYY-MM-DD') as fecha, COUNT(id)::integer as total_compras, SUM(total)::numeric as total_dinero FROM compras WHERE fecha >= NOW() - INTERVAL '30 days' GROUP BY TO_CHAR(fecha, 'YYYY-MM-DD') ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dc.insumo_id, i.nombre as insumo, SUM(dc.cantidad)::numeric as cantidad_total, SUM(dc.subtotal)::numeric as costo_total FROM detalle_compras dc JOIN insumos i ON dc.insumo_id = i.id JOIN compras c ON dc.compra_id = c.id WHERE c.fecha >= NOW() - INTERVAL '30 days' GROUP BY dc.insumo_id, i.nombre ORDER BY costo_total DESC")
        ]);

        const dbSnapshot = {
            usuarios,
            cajas,
            gastos_caja: gastos,
            ventas,
            detalle_ventas: detalleVentas,
            productos,
            compras,
            detalle_compras: detalleCompras,
            insumos,
            proveedores,
            pedidos_compra: pedidos,
            lotes_insumos: lotes,
            asistencia,
            historial_accesos,
            categorias,
            gastos_generales: gastosGenerales,
            pagos_salarios: pagosSalarios,
            comandas,
            detalle_comandas: detalleComandas,
            mesas,
            almacenes,
            inventario_almacen: inventarioAlmacen,
            ordenes_produccion: ordenesProduccion,
            detalle_orden: detalleOrden,
            auditorias_pasteleria: auditoriasPasteleria,
            detalle_auditoria_pasteleria: detalleAuditoriaPasteleria,
            recetas,
            ingrediente_recetas: ingredienteRecetas,
            parametros,
            // Nuevos datos históricos resumidos
            resumen_ventas_diarias_30_dias: ventasResumen30Dias,
            resumen_ventas_por_producto_30_dias: ventasPorProducto30Dias,
            resumen_compras_diarias_30_dias: comprasResumen30Dias,
            resumen_compras_por_insumo_30_dias: comprasPorInsumo30Dias
        };

        // Obtener fecha y hora en la zona horaria de Bolivia
        const fechaHoraActual = new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

        // 2. Construir instrucciones dinámicas inyectando los datos y la fecha actual de Bolivia
        const systemInstruction = `
Eres "Moka", el asistente virtual inteligente y analista de negocios experto de la cafetería "Café La Paz".
Tu propósito es ayudar a los administradores a entender el estado de su negocio, resumir información y responder dudas generales.

La fecha y hora actual en Bolivia (Café La Paz) es: ${fechaHoraActual}.
Usa estrictamente esta fecha como referencia para responder preguntas sobre "hoy", "ayer", "mañana", "esta semana" o "este mes".
Por ejemplo, si te preguntan por las ventas de hoy, busca en el listado 'ventas' (que contiene el detalle de los últimos 3 días en tiempo real) las filas donde la fecha en 'fecha_venta' coincida exactamente con la fecha de hoy.

Tienes acceso completo a los datos actuales del sistema en formato JSON:
- Detalle en tiempo real de los últimos 3 días para ventas, comandas y compras (en las tablas 'ventas', 'detalle_ventas', 'compras', 'detalle_compras', 'comandas', 'detalle_comandas').
- Resúmenes agregados históricos de los últimos 30 días para análisis de tendencias de mediano plazo (en 'resumen_ventas_diarias_30_dias', 'resumen_ventas_por_producto_30_dias', 'resumen_compras_diarias_30_dias', 'resumen_compras_por_insumo_30_dias').
- Datos completos de inventario, stock actual, recetas, insumos, proveedores, mesas y asistencia del personal.

Datos del negocio en JSON:
${JSON.stringify(dbSnapshot)}

REGLAS DE RESPUESTA:
1. Responde de forma clara, profesional y en español.
2. Si te preguntan sobre el negocio, analiza con mucho cuidado los datos JSON proporcionados para calcular totales, promedios, listados o conclusiones con precisión en base a la fecha actual (${fechaHoraActual}).
3. Si los datos requeridos no existen en el JSON o están vacíos, indícalo de manera amable.
4. Si el usuario te pregunta sobre cualquier otro tema general no relacionado con la cafetería, responde amablemente utilizando tus conocimientos generales sin restricción alguna.
5. Puedes formatear tus respuestas usando negritas (**texto**) y viñetas para que la lectura sea atractiva. Si necesitas mostrar datos estructurados, utiliza formato de tablas de Markdown (ej. | Producto | Cantidad | Total |).
`;

        // 3. Consultar a Gemini
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            systemInstruction: systemInstruction
        });

        const prompt = `Pregunta del administrador: ${mensaje}`;
        const responseResult = await generarContenidoConRetry(model, prompt);
        const mensajeIa = responseResult.response.text().trim();

        // 4. Responder al cliente
        res.json({
            success: true,
            mensajeIa,
            sql: null, // Excluido en esta arquitectura
            // Mantener compatibilidad de interfaz
            filas: []
        });

    } catch (error) {
        console.error('Error en el asistente de IA:', error);
        res.status(500).json({ 
            error: 'Ocurrió un error al procesar tu consulta con el Asistente IA.',
            detalles: error.message
        });
    }
});

module.exports = router;
