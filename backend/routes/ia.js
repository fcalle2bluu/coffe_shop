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

const systemInstruction = `
Eres un asistente de base de datos PostgreSQL experto para el sistema de gestión de "Café La Paz".
Tu única tarea es tomar una pregunta en lenguaje natural hecha por un administrador y generar una única consulta SQL de tipo SELECT válida para PostgreSQL que recupere la información solicitada.

REGLAS CRÍTICAS:
1. Genera ÚNICAMENTE una consulta SELECT de solo lectura. Bajo ninguna circunstancia generes comandos como INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, GRANT, REVOKE o REPLACE.
2. Devuelve ÚNICAMENTE la consulta SQL en texto plano. No la envuelvas en bloques de código markdown como \`\`\`sql ... \`\`\`. No incluyas explicaciones, comentarios, ni símbolos adicionales.
3. Si la pregunta no se puede responder con una consulta a las tablas disponibles o no tiene sentido, devuelve una cadena vacía.
4. Para fechas:
   - Para hoy, usa DATE(fecha_columna) = CURRENT_DATE (ej. DATE(fecha_venta) = CURRENT_DATE para ventas de hoy).
   - Para este mes, usa EXTRACT(MONTH FROM fecha_columna) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_columna) = EXTRACT(YEAR FROM CURRENT_DATE).

ESQUEMA DE LA BASE DE DATOS (PÚBLICO):
- usuarios (id, nombre, username, pin, rol, activo, perm_stock, perm_compras, perm_proveedores, perm_auditoria, perm_parametros, perm_informe)
- cajas (id, usuario_id, saldo_inicial, saldo_final, fecha_apertura, fecha_cierre)
- gastos_caja (id, caja_id, usuario_id, monto, descripcion, fecha)
- ventas (id, caja_id, total, metodo_pago, fecha_venta, usuario_id) -- metodo_pago: 'EFECTIVO', 'QR', 'TARJETA', 'CONSUME_LO_NUESTRO'
- detalle_ventas (id, venta_id, producto_id, cantidad, precio_unitario, subtotal)
- productos (id, nombre, precio_venta, categoria_id, imagen_url, activo)
- compras (id, proveedor_id, total, foto_url, fecha)
- detalle_compras (compra_id, insumo_id, cantidad, costo_unitario, subtotal)
- insumos (id, nombre, unidad_medida, stock_actual, stock_minimo, activo, imagen_url)
- proveedores (id, nombre, telefono, lugar, otros)
- pedidos_compra (id, usuario_id, insumo_id, insumo_nombre, cantidad, notas, estado, fecha, imagen_url) -- estado: 'PENDIENTE', 'COMPRADO', 'RECHAZADO'
- lotes_insumos (id, compra_id, insumo_id, fecha_vencimiento, stock_lote)
`;

router.post('/consultar', async (req, res) => {
    const { mensaje } = req.body;

    if (!mensaje || mensaje.trim() === '') {
        return res.status(400).json({ error: 'El mensaje de consulta es requerido.' });
    }

    if (!genAI) {
        return res.status(500).json({ error: 'La IA no está configurada en el servidor. Falta la clave GEMINI_API_KEY.' });
    }

    let sql = '';
    try {
        // 1. Generar la consulta SQL con Gemini
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            systemInstruction: systemInstruction
        });

        const prompt = `Pregunta del administrador: ${mensaje}`;
        const sqlResult = await model.generateContent(prompt);
        sql = sqlResult.response.text().trim();

        // Limpieza de posibles tags de Markdown por si acaso la IA ignora las instrucciones
        sql = sql.replace(/^```sql/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

        // Si la IA devolvió vacío
        if (sql === '') {
            return res.json({
                success: true,
                mensajeIa: 'No pude comprender tu pregunta o no está relacionada con la gestión de datos de la cafetería. ¿Podrías reestructurarla?',
                sql: '',
                filas: []
            });
        }

        // 2. Filtro estricto de seguridad anti-vandalismo (Escritura/Modificación)
        const sqlLower = sql.toLowerCase();
        const palabrasClavePeligrosas = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'replace'];
        const esPeligrosa = palabrasClavePeligrosas.some(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            return regex.test(sqlLower);
        });

        if (esPeligrosa || !sqlLower.includes('select')) {
            console.warn(`🚨 Intento de consulta bloqueada por seguridad. SQL generado: "${sql}"`);
            return res.status(400).json({ error: 'Lo siento, no puedo realizar esa consulta por motivos de seguridad.' });
        }

        // 3. Ejecutar la consulta SQL en la Base de Datos
        console.log(`🤖 Ejecutando consulta generada por IA: "${sql}"`);
        const dbRes = await pool.query(sql);
        const filas = dbRes.rows;

        // 4. Redactar una explicación amigable con Gemini
        const modelExplicacion = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const promptExplicacion = `
Un usuario administrador de la cafetería "Café La Paz" hizo la siguiente pregunta: "${mensaje}"
Para responderla, consultamos la base de datos y obtuvimos los siguientes resultados en formato JSON:
${JSON.stringify(filas)}

Por favor, redacta una respuesta conversacional, amigable y clara en español que explique estos datos directamente al administrador. 
Si los datos están vacíos, indícalo de manera amable y profesional.
No menciones tecnicismos de base de datos como "filas", "JSON", "tablas" o "SQL".
Puedes usar formato de texto o viñetas de Markdown para organizar la información.
`;

        const explicacionRes = await modelExplicacion.generateContent(promptExplicacion);
        const mensajeIa = explicacionRes.response.text().trim();

        res.json({
            success: true,
            mensajeIa,
            sql,
            filas
        });

    } catch (error) {
        console.error('Error en el asistente de IA:', error);
        res.status(500).json({ 
            error: 'Ocurrió un error al procesar tu consulta con el Asistente IA.',
            detalles: error.message,
            sql: sql || ''
        });
    }
});

module.exports = router;
