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
            asistencia
        ] = await Promise.all([
            ejecutarQuerySegura('SELECT id, nombre, username, rol, activo FROM usuarios'),
            ejecutarQuerySegura("SELECT id, usuario_id, saldo_inicial, saldo_final, TO_CHAR(fecha_apertura, 'YYYY-MM-DD HH24:MI') as fecha_apertura, TO_CHAR(fecha_cierre, 'YYYY-MM-DD HH24:MI') as fecha_cierre FROM cajas WHERE fecha_apertura >= NOW() - INTERVAL '30 days' ORDER BY fecha_apertura DESC"),
            ejecutarQuerySegura("SELECT id, caja_id, usuario_id, monto, descripcion, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM gastos_caja WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, caja_id, total, metodo_pago, TO_CHAR(fecha_venta, 'YYYY-MM-DD HH24:MI') as fecha_venta, usuario_id FROM ventas WHERE fecha_venta >= NOW() - INTERVAL '30 days' ORDER BY fecha_venta DESC"),
            ejecutarQuerySegura("SELECT dv.id, dv.venta_id, dv.producto_id, dv.cantidad, dv.precio_unitario, dv.subtotal FROM detalle_ventas dv JOIN ventas v ON dv.venta_id = v.id WHERE v.fecha_venta >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura('SELECT id, nombre, precio_venta, categoria_id, activo FROM productos'),
            ejecutarQuerySegura("SELECT id, proveedor_id, total, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM compras WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT dc.compra_id, dc.insumo_id, dc.cantidad, dc.costo_unitario, dc.subtotal FROM detalle_compras dc JOIN compras c ON dc.compra_id = c.id WHERE c.fecha >= NOW() - INTERVAL '30 days'"),
            ejecutarQuerySegura('SELECT id, nombre, unidad_medida, stock_actual, stock_minimo, activo FROM insumos'),
            ejecutarQuerySegura('SELECT id, nombre, telefono, lugar, otros FROM proveedores'),
            ejecutarQuerySegura("SELECT id, usuario_id, insumo_id, insumo_nombre, cantidad, notas, estado, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha FROM pedidos_compra WHERE fecha >= NOW() - INTERVAL '30 days' ORDER BY fecha DESC"),
            ejecutarQuerySegura("SELECT id, compra_id, insumo_id, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento, stock_lote FROM lotes_insumos"),
            ejecutarQuerySegura("SELECT a.id, a.usuario_id, u.nombre as empleado, TO_CHAR(a.fecha, 'YYYY-MM-DD') as fecha, TO_CHAR(a.hora_entrada, 'HH24:MI') as entrada, TO_CHAR(a.hora_salida, 'HH24:MI') as salida, a.horas_trabajadas FROM asistencia a JOIN usuarios u ON a.usuario_id = u.id WHERE a.fecha >= NOW() - INTERVAL '30 days' ORDER BY a.fecha DESC, a.hora_entrada DESC")
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
            asistencia
        };

        // 2. Construir instrucciones dinámicas inyectando los datos
        const systemInstruction = `
Eres "Moka", el asistente virtual inteligente y analista de negocios experto de la cafetería "Café La Paz".
Tu propósito es ayudar a los administradores a entender el estado de su negocio, resumir información y responder dudas generales.

Tienes acceso completo a los datos actuales del sistema en formato JSON (últimos 30 días para datos históricos):
${JSON.stringify(dbSnapshot)}

REGLAS DE RESPUESTA:
1. Responde de forma clara, profesional y en español.
2. Si te preguntan sobre el negocio (ventas, stock, gastos, compras, proveedores, personal), analiza con mucho cuidado los datos JSON proporcionados para calcular totales, promedios, listados o conclusiones con precisión.
3. Si los datos requeridos no existen en el JSON o están vacíos, indícalo de manera amable (ej. "Actualmente no hay ventas registradas en los últimos 30 días").
4. Si el usuario te pregunta sobre cualquier otro tema general no relacionado con la cafetería (ej. cultura general, historia, consejos, recetas o ayuda general), responde amablemente utilizando tus conocimientos generales sin restricción alguna.
5. Puedes formatear tus respuestas usando negritas (**texto**) y viñetas para que la lectura sea atractiva. Si necesitas mostrar datos estructurados, utiliza formato de tablas de Markdown (ej. | Producto | Cantidad | Total |).
`;

        // 3. Consultar a Gemini
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-flash-latest',
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
