const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
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

router.post('/consultar', async (req, res) => {
    const { mensaje } = req.body;

    if (!mensaje || mensaje.trim() === '') {
        return res.status(400).json({ error: 'El mensaje de consulta es requerido.' });
    }

    if (!genAI) {
        return res.status(500).json({ error: 'La IA no está configurada en el servidor. Falta la clave GEMINI_API_KEY.' });
    }

    try {
        // 1. Obtener snapshot completo de la Base de Datos en tiempo real
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
            // Nuevas tablas agregadas
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
            parametros
        ] = await Promise.all([
            ejecutarQuerySegura('SELECT id, nombre, username, rol, activo FROM usuarios'),
            ejecutarQuerySegura("SELECT id, usuario_id, saldo_inicial, saldo_final, TO_CHAR(fecha_apertura, 'YYYY-MM-DD HH24:MI') as fecha_apertura, TO_CHAR(fecha_cierre, 'YYYY-MM-DD HH24:MI') as fecha_cierre FROM cajas WHERE fecha_apertura >= NOW() - INTERVAL '30 days' ORDER BY fecha_apertura DESC"),
            ejecutarQuerySegura("SELECT id, caja_id, usuario_id, monto, descripcion, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM gastos_caja WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, caja_id, total, metodo_pago, TO_CHAR(fecha_venta, 'YYYY-MM-DD HH24:MI') as fecha_venta, usuario_id, es_historica FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '30 days' ORDER BY fecha_venta DESC"),
            ejecutarQuerySegura("SELECT dv.id, dv.venta_id, dv.producto_id, dv.cantidad, dv.precio_unitario, dv.subtotal FROM detalle_ventas dv JOIN ventas v ON dv.venta_id = v.id WHERE v.fecha_venta >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura('SELECT id, nombre, precio_venta, categoria_id, activo FROM productos'),
            ejecutarQuerySegura("SELECT id, proveedor_id, total, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM compras WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dc.compra_id, dc.insumo_id, dc.cantidad, dc.costo_unitario, dc.subtotal FROM detalle_compras dc JOIN compras c ON dc.compra_id = c.id WHERE c.fecha >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura('SELECT id, nombre, unidad_medida, stock_actual, stock_minimo, activo FROM insumos'),
            ejecutarQuerySegura('SELECT id, nombre, telefono, lugar, otros FROM proveedores'),
            ejecutarQuerySegura("SELECT id, usuario_id, insumo_id, insumo_nombre, cantidad, notas, estado, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM pedidos_compra WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, compra_id, insumo_id, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento, stock_lote FROM lotes_insumos"),
            ejecutarQuerySegura("SELECT a.id, a.usuario_id, u.nombre as empleado, TO_CHAR(a.fecha, 'YYYY-MM-DD') as fecha, TO_CHAR(a.hora_entrada, 'HH24:MI') as entrada, TO_CHAR(a.hora_salida, 'HH24:MI') as salida, a.horas_trabajadas FROM asistencia a JOIN usuarios u ON a.usuario_id = u.id WHERE a.fecha >= NOW() - INTERVAL '30 days' ORDER BY a.fecha DESC, a.hora_entrada DESC"),
            ejecutarQuerySegura("SELECT h.id, u.nombre as usuario, h.dispositivo, h.ip, h.ubicacion, TO_CHAR(h.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI') as fecha FROM historial_accesos h JOIN usuarios u ON h.usuario_id = u.id ORDER BY h.fecha DESC LIMIT 50"),
            // Nuevas tablas:
            ejecutarQuerySegura('SELECT id, nombre, descripcion, activo FROM categorias'),
            ejecutarQuerySegura("SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha, descripcion, monto, categoria, metodo_pago FROM gastos_generales WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, usuario_id, mes, anio, salario_base, descuento_retrasos, descuento_faltas, salario_neto, TO_CHAR(fecha_pago, 'YYYY-MM-DD HH24:MI') as fecha_pago, glosa FROM pagos_salarios WHERE fecha_pago >= NOW() - INTERVAL '60 days' ORDER BY fecha_pago DESC"),
            ejecutarQuerySegura("SELECT id, mesa, usuario_id, caja_id, estado, total, TO_CHAR(fecha_creacion, 'YYYY-MM-DD HH24:MI') as fecha_creacion FROM comandas WHERE fecha_creacion >= NOW() - INTERVAL '30 days' ORDER BY fecha_creacion DESC"),
            ejecutarQuerySegura("SELECT dc.id, dc.comanda_id, dc.producto_id, dc.cantidad, dc.precio_unitario, dc.subtotal FROM detalle_comandas dc JOIN comandas c ON dc.comanda_id = c.id WHERE c.fecha_creacion >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura('SELECT id, numero, piso, pos_x, pos_y, activo FROM mesas'),
            ejecutarQuerySegura('SELECT id, nombre, descripcion FROM almacenes'),
            ejecutarQuerySegura('SELECT id, almacen_id, insumo_id, stock_actual FROM inventario_almacen'),
            ejecutarQuerySegura("SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha, usuario_id, estado, observaciones FROM ordenes_produccion WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT do.id, do.orden_id, do.receta_id, do.cantidad FROM detalle_orden do JOIN ordenes_produccion o ON do.orden_id = o.id WHERE o.fecha >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura("SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha, usuario_id, observaciones FROM auditorias_pasteleria WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dap.id, dap.auditoria_id, dap.insumo_id, dap.cantidad_teorica, dap.cantidad_real, dap.diferencia FROM detalle_auditoria_pasteleria dap JOIN auditorias_pasteleria ap ON dap.auditoria_id = ap.id WHERE ap.fecha >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura('SELECT id, producto_id, nombre, preparacion, porciones FROM recetas'),
            ejecutarQuerySegura('SELECT id, receta_id, insumo_id, nombre_ingrediente, cantidad, unidad_medida FROM ingrediente_recetas'),
            ejecutarQuerySegura('SELECT * FROM parametros LIMIT 1')
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
            // Nuevas tablas mapeadas:
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
            parametros
        };

        // 2. Construir instrucciones dinámicas inyectando los datos
        const systemInstruction = `
Eres "Moka", el asistente virtual inteligente y analista de negocios experto de la cafetería "Café La Paz".
Tu propósito es ayudar a los administradores a entender el estado de su negocio, resumir información y responder dudas generales.

Tienes acceso completo a los datos actuales del sistema en formato JSON (últimos 30 días para datos históricos):
${JSON.stringify(dbSnapshot)}

REGLAS DE RESPUESTA:
1. Responde de forma clara, profesional y en español.
2. Si te preguntan sobre el negocio (ventas, stock, gastos, compras, proveedores, personal, historial de accesos y ubicaciones geográficas de inicio de sesión), analiza con mucho cuidado los datos JSON proporcionados para calcular totales, promedios, listados o conclusiones con precisión.
3. Si los datos requeridos no existen en el JSON o están vacíos, indícalo de manera amable (ej. "Actualmente no hay ventas registradas en los últimos 30 días").
4. Si el usuario te pregunta sobre cualquier otro tema general no relacionado con la cafetería (ej. cultura general, historia, consejos, recetas o ayuda general), responde amablemente utilizando tus conocimientos generales sin restriction alguna.
5. Puedes formatear tus respuestas usando negritas (**texto**) y viñetas para que la lectura sea atractiva. Si necesitas mostrar datos estructurados, utiliza formato de tablas de Markdown (ej. | Producto | Cantidad | Total |).
`;

        // 3. Consultar a Gemini
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            systemInstruction: systemInstruction
        });

        const prompt = `Pregunta del administrador: ${mensaje}`;
        const responseResult = await model.generateContent(prompt);
        const mensajeIa = responseResult.response.text().trim();

        // 4. Responder al cliente
        res.json({
            success: true,
            mensajeIa,
            sql: null, // Excluido en esta arquitectura
            filas: []   // Excluido en esta arquitectura
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
