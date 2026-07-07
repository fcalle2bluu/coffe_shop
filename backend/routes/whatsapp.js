// backend/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const { createClient } = require('@supabase/supabase-js');

// El bot de WhatsApp usa Groq (modelos open-source, cuota gratuita mucho más amplia que Gemini)
const groqApiKey = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Reutiliza el mismo bucket de Supabase Storage que ya usa la subida de imágenes de productos
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
let supabaseWhatsapp = null;
if (supabaseUrl && supabaseKey) {
    supabaseWhatsapp = createClient(supabaseUrl, supabaseKey);
}

// Cola de procesamiento por número de teléfono: si el cliente escribe varios mensajes seguidos,
// se procesan uno por uno en orden (leyendo el historial ya actualizado) en vez de en paralelo,
// que causaba respuestas repetidas/ciegas al contexto cuando llegaban mensajes casi simultáneos.
const colasWhatsappPorTelefono = new Map();
function encolarProcesamientoWhatsapp(telefono, tarea) {
    const anterior = colasWhatsappPorTelefono.get(telefono) || Promise.resolve();
    const actual = anterior.then(tarea).catch(err => {
        console.error(`❌ Error en la cola de WhatsApp para +${telefono}:`, err.message);
    });
    colasWhatsappPorTelefono.set(telefono, actual);
    return actual;
}

// Middleware para verificar rol administrador
const checkAdminPermission = async (req, res, next) => {
    // Si es verificación o callback de webhook, saltar
    if (req.path === '/webhook') {
        return next();
    }
    const usuario_id = req.headers['x-usuario-id'] || req.query.usuario_id || req.body.usuario_id;
    if (!usuario_id) {
        return res.status(403).json({ error: 'Acceso denegado: Se requiere ID de usuario en cabecera o query/body.' });
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
        console.error('Error al validar permisos de admin en whatsapp:', err);
        return res.status(500).json({ error: 'Error del servidor al validar permisos.' });
    }
};

router.use(checkAdminPermission);

// Credenciales oficiales de Meta proporcionadas por el usuario
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EABAqZAj7BPkUBR6nPjKPh9D944usZBBAnQj4ezuN3srY7wbxhAdjByTSKMPvkO1ZBRrdeTCnfw9g7Lgfv7UcJmt3dcTROsdeZALSr7boobiVQEPRyVP7rXd5hMFo2KqL7EmOLD0UC2HR02cdNWZCDotyWomx4ZAYl0FkZB1uuty2YyMuXUWcmwEzMZCC6efRXQZDZD";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "1189224787600539";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_secreto_para_webhook_123";

/**
 * Función de servicio para enviar mensajes por la API de WhatsApp de Meta.
 * Utiliza fetch nativo (disponible globalmente en Node.js >= 18).
 */
async function enviarMensajeWhatsApp(to, text, remitente = 'BOT') {
    const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('❌ Error de API de WhatsApp de Meta:', data);
        } else {
            try {
                await pool.query(
                    'INSERT INTO whatsapp_mensajes (telefono, mensaje, remitente) VALUES ($1, $2, $3)',
                    [to, text, remitente]
                );
                console.log(`💾 Mensaje enviado a +${to} guardado en BD (${remitente}): "${text}"`);
            } catch (dbErr) {
                console.error('❌ Error al guardar mensaje enviado en BD:', dbErr.message);
            }
        }
        return data;
    } catch (err) {
        console.error('❌ Error de red al enviar WhatsApp:', err.message);
        return null;
    }
}

// =========================================================================
// 1. CONFIGURACIÓN DEL WEBHOOK DE META (GET y POST)
// =========================================================================

// Endpoint GET: Verificación del Webhook requerido por Meta
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verificado con éxito por Meta.');
            return res.status(200).send(challenge);
        } else {
            console.warn('⚠️ Intento de verificación fallido. Tokens no coinciden.');
            return res.sendStatus(403);
        }
    }
    return res.sendStatus(400);
});

// Helper to get emoji numbers for a clean, premium chat experience
function obtenerEmojiNumero(num) {
    const emojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    if (num >= 0 && num <= 10) return emojis[num];
    return `${num}.`;
}

// Helper para mandar un documento (como el PDF del menú) por WhatsApp
async function enviarDocumentoWhatsApp(to, link, filename, caption, remitente = 'BOT') {
    const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: 'document',
                document: {
                    link: link,
                    filename: filename,
                    caption: caption
                }
            })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('❌ Error de API de WhatsApp de Meta (Documento):', data);
        } else {
            try {
                const msgText = caption || `📄 Documento: ${filename}`;
                await pool.query(
                    'INSERT INTO whatsapp_mensajes (telefono, mensaje, remitente) VALUES ($1, $2, $3)',
                    [to, msgText, remitente]
                );
                console.log(`💾 Documento enviado a +${to} guardado en BD (${remitente}): "${msgText}"`);
            } catch (dbErr) {
                console.error('❌ Error al guardar documento enviado en BD:', dbErr.message);
            }
        }
        return data;
    } catch (err) {
        console.error('❌ Error de red al enviar documento WhatsApp:', err.message);
        return null;
    }
}

// Descarga una imagen recibida por WhatsApp (usando el media ID de Meta) y la sube a Supabase Storage.
// Devuelve la URL pública, o null si algo falla (no debe interrumpir el resto del flujo del bot).
async function descargarYGuardarImagenWhatsApp(mediaId) {
    if (!supabaseWhatsapp) {
        console.error('❌ Supabase no está configurado: no se puede guardar la foto de WhatsApp.');
        return null;
    }
    try {
        // 1. Pedir a Meta la URL temporal firmada del archivo
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        const metaData = await metaRes.json();
        if (!metaRes.ok || !metaData.url) {
            console.error('❌ No se pudo obtener la URL de la imagen de WhatsApp:', metaData);
            return null;
        }

        // 2. Descargar el binario real (requiere el mismo header de autorización)
        const fileRes = await fetch(metaData.url, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        if (!fileRes.ok) {
            console.error('❌ No se pudo descargar el binario de la imagen de WhatsApp.');
            return null;
        }
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const mimeType = metaData.mime_type || 'image/jpeg';
        const extension = mimeType.split('/')[1] || 'jpg';

        // 3. Subir a Supabase Storage (mismo bucket que las fotos de productos)
        const nombreArchivo = `whatsapp/${mediaId}_${Date.now()}.${extension}`;
        const { error } = await supabaseWhatsapp.storage.from('insumos').upload(nombreArchivo, buffer, { contentType: mimeType });
        if (error) throw error;

        const { data: publicData } = supabaseWhatsapp.storage.from('insumos').getPublicUrl(nombreArchivo);
        return publicData.publicUrl;
    } catch (err) {
        console.error('❌ Error al descargar/guardar imagen de WhatsApp:', err.message);
        return null;
    }
}

// Guarda (o actualiza) la foto de referencia asociada a la conversación en curso de un teléfono,
// sin afectar la memoria de la IA que ya esté guardada en whatsapp_estados.
async function guardarFotoReferencia(telefono, url) {
    try {
        await pool.query(
            `INSERT INTO whatsapp_estados (telefono, estado, foto_referencia_url, updated_at)
             VALUES ($1, 'IA_CONVERSACION', $2, CURRENT_TIMESTAMP)
             ON CONFLICT (telefono) DO UPDATE
             SET foto_referencia_url = EXCLUDED.foto_referencia_url, updated_at = CURRENT_TIMESTAMP`,
            [telefono, url]
        );
    } catch (e) {
        console.error('Error al guardar foto de referencia:', e.message);
    }
}

// Obtener el estado actual del cliente
async function obtenerEstadoCliente(telefono) {
    try {
        const res = await pool.query('SELECT * FROM whatsapp_estados WHERE telefono = $1', [telefono]);
        return res.rows.length > 0 ? res.rows[0] : null;
    } catch (e) {
        console.error('Error al obtener estado del cliente:', e.message);
        return null;
    }
}

// Actualizar o crear el estado del cliente
async function actualizarEstadoCliente(telefono, nuevoEstado, productoSeleccionado = null, categoriaSeleccionada = null) {
    try {
        await pool.query(
            `INSERT INTO whatsapp_estados (telefono, estado, producto_seleccionado, categoria_seleccionada, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (telefono) DO UPDATE 
             SET estado = EXCLUDED.estado, 
                 producto_seleccionado = COALESCE(EXCLUDED.producto_seleccionado, whatsapp_estados.producto_seleccionado),
                 categoria_seleccionada = COALESCE(EXCLUDED.categoria_seleccionada, whatsapp_estados.categoria_seleccionada),
                 updated_at = CURRENT_TIMESTAMP`,
            [telefono, nuevoEstado, productoSeleccionado, categoriaSeleccionada]
        );
    } catch (e) {
        console.error('Error al actualizar estado del cliente:', e.message);
    }
}

// Borrar el estado para volver a iniciar el menú principal
async function borrarEstadoCliente(telefono) {
    try {
        await pool.query('DELETE FROM whatsapp_estados WHERE telefono = $1', [telefono]);
    } catch (e) {
        console.error('Error al borrar estado del cliente:', e.message);
    }
}

// Helper para enviar el PDF de menú
async function enviarPdfMenu(from, host) {
    try {
        const pdfUrl = `${host}/api/menu-pdf/generar`;
        console.log(`📤 Enviando PDF de menú al cliente: ${pdfUrl}`);
        await enviarDocumentoWhatsApp(from, pdfUrl, "menu_cafe_la_paz.pdf", "Aquí tienes nuestro Menú en PDF ☕✨");
    } catch (err) {
        console.error('Error al enviar PDF de menú:', err.message);
    }
}

// Llama al endpoint de Groq (compatible con el formato de OpenAI chat completions), con reintentos ante rate limits (429)
async function generarConGroq(systemInstruction, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: 'Responde ahora siguiendo tus instrucciones, en el formato JSON indicado.' }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.6
            })
        });

        if (response.ok) {
            const data = await response.json();
            return data.choices[0].message.content;
        }

        const data = await response.json().catch(() => ({}));
        const esRateLimit = response.status === 429;
        if (esRateLimit && i < retries - 1) {
            console.warn(`⚠️ Rate limit de Groq (WhatsApp IA). Reintentando en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        } else {
            throw new Error(`Groq API error ${response.status}: ${JSON.stringify(data)}`);
        }
    }
}

// Arma un texto legible del catálogo activo, agrupado por categoría, para dar contexto a la IA
async function obtenerCatalogoTextoIA() {
    try {
        const { rows } = await pool.query(`
            SELECT p.nombre, p.precio_venta, COALESCE(c.nombre, 'Otros') as categoria
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.activo = true
            ORDER BY categoria ASC, p.nombre ASC
        `);
        const porCategoria = {};
        rows.forEach(p => {
            if (!porCategoria[p.categoria]) porCategoria[p.categoria] = [];
            porCategoria[p.categoria].push(`- ${p.nombre}: Bs. ${parseFloat(p.precio_venta).toFixed(2)}`);
        });
        return Object.entries(porCategoria)
            .map(([cat, items]) => `*${cat}*\n${items.join('\n')}`)
            .join('\n\n');
    } catch (err) {
        console.error('Error al obtener catálogo para IA de WhatsApp:', err.message);
        return '(No se pudo cargar el catálogo de productos)';
    }
}

// Arma el transcript reciente de la conversación (incluye el mensaje actual, ya guardado) para dar memoria a la IA.
// Solo toma mensajes de las últimas horas: una conversación vieja de días/semanas atrás no debe "contaminar"
// la sesión actual del cliente (evita que el bot imite respuestas rotas de pruebas o chats muy antiguos).
async function obtenerHistorialTextoIA(telefono, limite = 12, horasVentana = 3) {
    try {
        const { rows } = await pool.query(
            `SELECT mensaje, remitente, TO_CHAR(fecha, 'HH24:MI DD/MM') as fecha_fmt
             FROM whatsapp_mensajes
             WHERE telefono = $1 AND fecha >= NOW() - ($2 || ' hours')::INTERVAL
             ORDER BY fecha DESC LIMIT $3`,
            [telefono, horasVentana, limite]
        );
        return rows.reverse().map(m => `[${m.fecha_fmt}] ${m.remitente}: ${m.mensaje}`).join('\n');
    } catch (err) {
        console.error('Error al obtener historial para IA de WhatsApp:', err.message);
        return '';
    }
}

/**
 * Agente de IA que reemplaza el antiguo árbol de decisiones fijo: entiende lenguaje libre,
 * responde dudas sobre el menú, toma pedidos y cotiza tortas personalizadas, registrando
 * todo en las mismas tablas (pedidos_whatsapp, whatsapp_estados) que ya usa el panel admin.
 */
async function procesarFlujoBotIA(from, textBody, host, rawMessage) {
    if (!groqApiKey) {
        await enviarMensajeWhatsApp(from, 'Estamos presentando un inconveniente técnico en este momento. Un asesor de Café La Paz te responderá a la brevedad. ¡Gracias por tu paciencia! 🙏');
        console.error('❌ GROQ_API_KEY no configurada: no se puede procesar el mensaje de WhatsApp con IA.');
        return;
    }

    try {
        const [catalogoTexto, historialTexto, estadoRow] = await Promise.all([
            obtenerCatalogoTextoIA(),
            obtenerHistorialTextoIA(from),
            obtenerEstadoCliente(from),
        ]);

        let memoriaPrevia = {};
        try {
            memoriaPrevia = JSON.parse((estadoRow && estadoRow.producto_seleccionado) || '{}');
        } catch (e) {
            memoriaPrevia = {};
        }

        const fechaHoraActual = new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

        const systemInstruction = `
Eres el asistente virtual de pedidos por WhatsApp de "Café La Paz", una cafetería. Escribes en español, cálido y cercano,
con emojis moderados y formato de WhatsApp (*negrita*, _cursiva_), igual que un mesero atento por chat.

La fecha y hora actual en Bolivia es: ${fechaHoraActual}. Úsala para interpretar fechas relativas ("mañana", "el sábado", etc.) en pedidos de tortas.

MENÚ ACTUAL DE PRODUCTOS (precios reales, es la única fuente de verdad sobre productos y precios):
${catalogoTexto}

MEMORIA DE ESTA CONVERSACIÓN (datos que ya recopilaste en turnos anteriores, puede estar vacía si es la primera vez):
${JSON.stringify(memoriaPrevia)}

HISTORIAL RECIENTE DE LA CONVERSACIÓN (solo de las últimas horas, para darte contexto de la charla en curso):
${historialTexto || '(sin mensajes previos recientes, es el inicio de la conversación)'}

MENSAJE ACTUAL DEL CLIENTE AL QUE DEBES RESPONDER AHORA MISMO (ignora cualquier patrón repetitivo que veas en el historial de arriba; responde específicamente a esto): "${textBody}"

${(estadoRow && estadoRow.foto_referencia_url) ? 'El cliente ya envió y se guardó una foto de referencia para esta cotización. NO se la vuelvas a pedir.' : ''}

TU TRABAJO:
1. Si el cliente saluda o pregunta el menú, salúdalo cordialmente y ofrécele mandarle el menú en PDF (usa "adjuntar_menu_pdf": true) o cuéntale las categorías disponibles.
2. Si el cliente quiere hacer un pedido normal (productos del menú para recoger en el local), confirma producto(s) y cantidad, y cuando el pedido esté claro y confirmado por el cliente, regístralo con "registrar_pedido".
3. Si el cliente quiere una torta personalizada, sigue este embudo de forma conversacional y natural (sin sonar a formulario robótico), pidiendo un dato a la vez si falta: fecha y hora del evento, cantidad de porciones (mínimo 15), diseño/temática/colores (puede incluir foto de referencia), y sabor de bizcocho y relleno (opciones: Bizcochos: Vainilla, Chocolate, Red Velvet o Zanahoria; Rellenos: Dulce de Leche, Fudge de Chocolate, Crema de Queso o Crema con Frutillas). Ve guardando lo que el cliente te vaya diciendo en "memoria" para no volver a preguntarlo.
4. Cuando ya tengas los 4 datos de la torta (fecha, porciones, diseño, sabor), agradece, registra la cotización con "registrar_pedido" (producto describiendo todos los detalles, cantidad 1), y explica que un pastelero enviará el precio exacto y que se requiere una seña del 50% para reservar la fecha; pregúntale si quiere los datos de transferencia bancaria ahora.
5. Si el cliente pide los datos de pago/transferencia, dáselos tú mismo con este formato:
   *DATOS PARA TRANSFERENCIA BANCARIA* 🏦
   • Banco: Banco Nacional de Bolivia (BNB)
   • Tipo de Cuenta: Caja de Ahorros
   • Número de Cuenta: 150-1234567
   • Titular: Café La Paz S.R.L.
   • NIT: 123456789
   Y pídele que envíe la captura del comprobante para confirmar.
6. Si el cliente envía una imagen (verás "[Imagen]" en el historial), agradécele la foto de referencia y continúa el embudo normalmente.
7. Si pide hablar con una persona o algo se sale de tu alcance, dile amablemente que un asesor de Café La Paz le escribirá pronto.
8. Nunca inventes productos ni precios que no estén en el menú de arriba.

FORMATO DE RESPUESTA OBLIGATORIO: responde ÚNICAMENTE con un JSON válido (sin texto fuera del JSON, sin markdown code fences) con esta forma exacta:
{
  "respuesta": "texto que se le enviará al cliente por WhatsApp",
  "adjuntar_menu_pdf": false,
  "registrar_pedido": null,
  "memoria": {}
}
- "registrar_pedido" debe ser null salvo cuando corresponda registrar un pedido/cotización nuevo listo para pasar a cocina/administración; en ese caso usa {"producto": "descripción clara y completa", "cantidad": 1}.
- "memoria" debe llevar TODOS los datos relevantes acumulados hasta ahora de la conversación en curso (por ejemplo el progreso del embudo de torta), para recordarlos en el siguiente turno. Si ya se completó y registró un pedido, reinicia "memoria" a {}.
`;

        const rawText = (await generarConGroq(systemInstruction)).trim();

        let salida;
        try {
            salida = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('⚠️ La IA de WhatsApp no devolvió JSON válido, se envía como texto plano:', rawText);
            await enviarMensajeWhatsApp(from, rawText || 'Disculpa, ¿podrías repetir tu mensaje? 🙏');
            return;
        }

        if (salida.respuesta) {
            await enviarMensajeWhatsApp(from, salida.respuesta);
        }

        if (salida.adjuntar_menu_pdf) {
            await enviarPdfMenu(from, host);
        }

        if (salida.registrar_pedido && salida.registrar_pedido.producto) {
            try {
                const fotoUrl = (estadoRow && estadoRow.foto_referencia_url) || null;
                await pool.query(
                    `INSERT INTO pedidos_whatsapp (telefono_cliente, producto, cantidad, estado, foto_referencia_url) VALUES ($1, $2, $3, 'PENDIENTE', $4)`,
                    [from, salida.registrar_pedido.producto, parseInt(salida.registrar_pedido.cantidad) || 1, fotoUrl]
                );
                console.log(`🧾 Pedido de WhatsApp registrado vía IA para +${from}: ${salida.registrar_pedido.producto}`);
            } catch (dbErr) {
                console.error('Error al guardar pedido generado por IA en pedidos_whatsapp:', dbErr.message);
            }
        }

        const memoriaNueva = salida.memoria && typeof salida.memoria === 'object' ? salida.memoria : {};
        if (Object.keys(memoriaNueva).length === 0) {
            await borrarEstadoCliente(from);
        } else {
            await actualizarEstadoCliente(from, 'IA_CONVERSACION', JSON.stringify(memoriaNueva));
        }
    } catch (err) {
        console.error('❌ Error en el agente de IA de WhatsApp:', err.message);
        await enviarMensajeWhatsApp(from, 'Disculpa, tuvimos un problema procesando tu mensaje. ¿Podrías intentar de nuevo en un momento? 🙏');
    }
}


// Endpoint POST: Recepción de mensajes entrantes
router.post('/webhook', async (req, res) => {
    // Retornamos 200 de inmediato a Meta para confirmar recepción y evitar reenvíos
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;
        console.log('📨 Webhook recibido payload:', JSON.stringify(body, null, 2));

        // Validamos que sea un payload válido de WhatsApp
        if (body.object !== 'whatsapp_business_account') return;

        if (body.entry &&
            body.entry[0] &&
            body.entry[0].changes &&
            body.entry[0].changes[0] &&
            body.entry[0].changes[0].value &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]) {

            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from; // Teléfono del cliente
            let host = req.protocol + '://' + req.get('host');
            if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
                host = host.replace(/^http:/i, 'https:');
            }
            
            // Extraer el texto según el tipo de mensaje para guardarlo en la bitácora
            let textBody = '';
            if (message.type === 'text' && message.text) {
                textBody = message.text.body;
            } else if (message.type === 'interactive' && message.interactive) {
                const ir = message.interactive;
                if (ir.type === 'button_reply' && ir.button_reply) {
                    textBody = ir.button_reply.title;
                } else if (ir.type === 'list_reply' && ir.list_reply) {
                    textBody = ir.list_reply.title;
                } else {
                    textBody = '[Mensaje interactivo]';
                }
            } else if (message.type === 'button' && message.button) {
                textBody = message.button.text;
            } else if (message.type === 'image') {
                textBody = message.image.caption || '[Imagen]';
            } else if (message.type === 'document') {
                textBody = message.document.caption || '[Documento]';
            } else if (message.type === 'video') {
                textBody = message.video.caption || '[Video]';
            } else if (message.type === 'audio') {
                textBody = '[Audio]';
            } else if (message.type === 'voice') {
                textBody = '[Mensaje de voz]';
            } else if (message.type === 'location') {
                textBody = '[Ubicación]';
            } else if (message.type === 'sticker') {
                textBody = '[Sticker]';
            } else {
                textBody = `[Mensaje: ${message.type}]`;
            }
            
            textBody = (textBody || '').trim();

            // Guardar en el historial de mensajes de la BD con rol CLIENTE
            try {
                await pool.query(
                    'INSERT INTO whatsapp_mensajes (telefono, mensaje, remitente) VALUES ($1, $2, $3)',
                    [from, textBody, 'CLIENTE']
                );
                console.log(`💾 Mensaje de +${from} guardado en whatsapp_mensajes: "${textBody}"`);
            } catch (dbErr) {
                console.error('❌ Error al guardar mensaje en whatsapp_mensajes:', dbErr.message);
            }

            // Se encola por teléfono: si el cliente manda varios mensajes seguidos, se procesan
            // uno por uno en orden en vez de en paralelo (evita respuestas ciegas al contexto).
            encolarProcesamientoWhatsapp(from, async () => {
                // Si es una imagen, la descargamos de Meta y la guardamos en Supabase como foto de referencia
                if (message.type === 'image' && message.image && message.image.id) {
                    const fotoUrl = await descargarYGuardarImagenWhatsApp(message.image.id);
                    if (fotoUrl) {
                        await guardarFotoReferencia(from, fotoUrl);
                        console.log(`🖼️ Foto de referencia guardada para +${from}: ${fotoUrl}`);
                    }
                }

                // Procesamos el mensaje con el agente de IA (para mensajes de texto, interactivos o imágenes)
                if (message.type === 'text' || message.type === 'interactive' || message.type === 'button' || message.type === 'image') {
                    await procesarFlujoBotIA(from, textBody, host, message);
                }
            });
        }
    } catch (error) {
        console.error('❌ Error en procesamiento del Webhook de WhatsApp:', error.message);
    }
});

// =========================================================================
// 2. ENDPOINTS DE GESTIÓN PARA EL PANEL ADMINISTRATIVO / CAJEROS
// =========================================================================

// Obtener todas las órdenes de WhatsApp
router.get('/pedidos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos_whatsapp ORDER BY fecha DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener pedidos de WhatsApp:', error.message);
        res.status(500).json({ error: 'Error al obtener los pedidos de WhatsApp' });
    }
});

// Actualizar el estado de un pedido y notificar al cliente vía WhatsApp
router.put('/pedidos/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; // PENDIENTE, PREPARANDO, ENTREGADO, CANCELADO

    if (!['PENDIENTE', 'PREPARANDO', 'ENTREGADO', 'CANCELADO'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no válido' });
    }

    try {
        // Obtenemos los detalles de la orden para el mensaje de WhatsApp
        const orderRes = await pool.query('SELECT * FROM pedidos_whatsapp WHERE id = $1', [id]);
        if (orderRes.rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        
        const pedido = orderRes.rows[0];

        // Actualizamos estado en base de datos
        await pool.query('UPDATE pedidos_whatsapp SET estado = $1 WHERE id = $2', [estado, id]);

        // Enviamos notificación al cliente
        let alertMessage = '';
        if (estado === 'PREPARANDO') {
            alertMessage = `☕ *Actualización de tu pedido (Café La Paz)*:\nTu pedido de *${pedido.producto}* (x${pedido.cantidad}) ya se está preparando en la barra. 👨‍🍳✨`;
        } else if (estado === 'ENTREGADO') {
            alertMessage = `✅ *Tu pedido está listo (Café La Paz)*:\nTu pedido de *${pedido.producto}* (x${pedido.cantidad}) ha sido entregado. ¡Que lo disfrutes! 😊☕`;
        } else if (estado === 'CANCELADO') {
            alertMessage = `❌ *Actualización de tu pedido (Café La Paz)*:\nLo sentimos, tu pedido de *${pedido.producto}* (x${pedido.cantidad}) ha sido cancelado. Si tienes dudas, contáctanos.`;
        }

        if (alertMessage) {
            await enviarMensajeWhatsApp(pedido.telefono_cliente, alertMessage);
        }

        res.json({ success: true, message: 'Estado actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar estado del pedido WhatsApp:', error.message);
        res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
    }
});

// Eliminar un pedido
router.delete('/pedidos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const check = await pool.query('SELECT id FROM pedidos_whatsapp WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        await pool.query('DELETE FROM pedidos_whatsapp WHERE id = $1', [id]);
        res.json({ success: true, message: 'Pedido eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar pedido de WhatsApp:', error.message);
        res.status(500).json({ error: 'Error al eliminar el pedido' });
    }
});

// --- ENDPOINTS DE GESTIÓN DE CHAT MANUAL ---

// 1. Obtener listado de contactos ordenados por fecha del último mensaje
router.get('/chat/contactos', async (req, res) => {
    try {
        const query = `
            WITH ultimos_mensajes AS (
                SELECT telefono, mensaje, fecha, remitente,
                       ROW_NUMBER() OVER (PARTITION BY telefono ORDER BY fecha DESC) as rn
                FROM whatsapp_mensajes
            )
            SELECT telefono, mensaje, fecha, remitente
            FROM ultimos_mensajes
            WHERE rn = 1
            ORDER BY fecha DESC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error al cargar contactos de chat:', err.message);
        res.status(500).json({ error: 'Error al obtener lista de contactos.' });
    }
});

// 2. Obtener historial de conversación con un número
router.get('/chat/historial', async (req, res) => {
    const { telefono } = req.query;
    if (!telefono) {
        return res.status(400).json({ error: 'Falta parámetro teléfono.' });
    }

    try {
        const query = `
            SELECT id, mensaje, remitente, 
                   TO_CHAR(fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz', 'HH24:MI DD/MM') as fecha_formateada
            FROM whatsapp_mensajes
            WHERE telefono = $1
            ORDER BY fecha ASC
        `;
        const { rows } = await pool.query(query, [telefono]);
        res.json(rows);
    } catch (err) {
        console.error('Error al cargar historial de chat:', err.message);
        res.status(500).json({ error: 'Error al obtener historial de conversación.' });
    }
});

// 3. Enviar mensaje manual y guardarlo en el historial
router.post('/chat/enviar', async (req, res) => {
    const { telefono, mensaje } = req.body;
    if (!telefono || !mensaje) {
        return res.status(400).json({ error: 'Falta teléfono o mensaje.' });
    }

    try {
        const result = await enviarMensajeWhatsApp(telefono, mensaje, 'ADMIN');
        if (result && !result.error) {
            res.json({ success: true, message: 'Mensaje transmitido con éxito.' });
        } else {
            console.error('Meta API Error:', result);
            res.status(500).json({ error: 'Error al transmitir mensaje mediante WhatsApp API.', detalle: result });
        }
    } catch (err) {
        console.error('Error al enviar mensaje manual:', err.message);
        res.status(500).json({ error: 'Error al enviar mensaje.' });
    }
});

// =========================================================================
// SECTION A: PERFIL DE NEGOCIO EN WHATSAPP
// =========================================================================

// Configurar Multer en memoria para subida de fotos
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // límite 5MB
});

// A.1 Obtener Perfil de WhatsApp
router.get('/perfil', async (req, res) => {
    try {
        const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        const metaData = await response.json();
        
        // Obtener parámetros locales como sugerencia/fallback
        const dbResult = await pool.query('SELECT * FROM parametros WHERE id = 1');
        const dbParams = dbResult.rows[0] || {};
        
        if (!response.ok) {
            console.error('❌ Error al obtener perfil desde Meta:', metaData);
            return res.json({
                error_meta: metaData,
                about: '',
                address: dbParams.direccion || '',
                description: '',
                email: dbParams.correo || '',
                profile_picture_url: '',
                websites: [],
                vertical: 'OTHER',
                sugerencias: {
                    address: dbParams.direccion || '',
                    email: dbParams.correo || '',
                    nombre_empresa: dbParams.nombre_empresa || ''
                }
            });
        }

        const profile = metaData.data ? metaData.data[0] : {};
        
        // Prellenar si viene vacío pero existe en local
        const resultData = {
            about: profile.about || '',
            address: profile.address || dbParams.direccion || '',
            description: profile.description || '',
            email: profile.email || dbParams.correo || '',
            profile_picture_url: profile.profile_picture_url || '',
            websites: profile.websites || [],
            vertical: profile.vertical || 'OTHER',
            sugerencias: {
                address: dbParams.direccion || '',
                email: dbParams.correo || '',
                nombre_empresa: dbParams.nombre_empresa || ''
            }
        };
        res.json(resultData);
    } catch (err) {
        console.error('Error al consultar perfil de WhatsApp:', err.message);
        res.status(500).json({ error: 'Error al consultar perfil de WhatsApp.' });
    }
});

// A.2 Guardar Perfil de WhatsApp
router.post('/perfil', async (req, res) => {
    const { about, address, description, email, websites, vertical } = req.body;
    
    // Validaciones básicas de límites oficiales de Meta
    if (about !== undefined && about.trim() === "") {
        return res.status(400).json({ error: 'El estado (About) no puede estar vacío.' });
    }
    if (about && about.length > 139) {
        return res.status(400).json({ error: 'El estado (About) no puede superar los 139 caracteres.' });
    }
    if (description && description.length > 512) {
        return res.status(400).json({ error: 'La descripción no puede superar los 512 caracteres.' });
    }
    if (address && address.length > 256) {
        return res.status(400).json({ error: 'La dirección no puede superar los 256 caracteres.' });
    }
    if (email && email.length > 128) {
        return res.status(400).json({ error: 'El correo no puede superar los 128 caracteres.' });
    }

    try {
        const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/whatsapp_business_profile`;
        
        const bodyData = {
            messaging_product: 'whatsapp',
            vertical: vertical || 'OTHER'
        };
        
        if (about !== undefined) bodyData.about = about.trim();
        if (address !== undefined) bodyData.address = address.trim();
        if (description !== undefined) bodyData.description = description.trim();
        if (email !== undefined) bodyData.email = email.trim();
        if (websites !== undefined) {
            bodyData.websites = (Array.isArray(websites) ? websites : [websites])
                .map(w => (w || '').trim())
                .filter(Boolean)
                .slice(0, 2);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify(bodyData)
        });
        const metaData = await response.json();

        if (!response.ok) {
            console.error('❌ Error al actualizar perfil en Meta:', metaData);
            const errMsg = (metaData && metaData.error && metaData.error.message) || 'Meta rechazó la actualización del perfil.';
            return res.status(response.status).json({ error: errMsg, detalle: metaData });
        }
        res.json({ success: true, message: 'Perfil de WhatsApp actualizado exitosamente.' });
    } catch (err) {
        console.error('Error al actualizar perfil de WhatsApp:', err.message);
        res.status(500).json({ error: 'Error al actualizar perfil de WhatsApp: ' + err.message });
    }
});

// A.3 Actualizar Foto de Perfil
router.post('/perfil/foto', upload.single('foto'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo de imagen.' });
    }

    try {
        // 1. Obtener dinámicamente el App ID asociado al Access Token
        const appUrl = `https://graph.facebook.com/v18.0/app?access_token=${WHATSAPP_TOKEN}`;
        const appRes = await fetch(appUrl);
        const appData = await appRes.json();
        
        if (!appRes.ok || !appData.id) {
            console.error('❌ Error al obtener App ID desde Meta:', appData);
            const errMsg = (appData && appData.error && appData.error.message) || 'No se pudo obtener el App ID para la subida de foto. Verifique la validez de su token.';
            return res.status(400).json({ 
                error: errMsg, 
                detalle: appData 
            });
        }
        
        const appId = appData.id;
        console.log(`📌 App ID obtenido para la subida de foto: ${appId}`);

        // 2. Crear una sesión de subida resumible en Meta
        const fileName = req.file.originalname || 'foto_perfil.jpg';
        const fileLength = req.file.buffer.length;
        const fileType = req.file.mimetype || 'image/jpeg';
        
        const uploadSessionUrl = `https://graph.facebook.com/v18.0/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${fileLength}&file_type=${encodeURIComponent(fileType)}`;
        
        const sessionResponse = await fetch(uploadSessionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            }
        });
        const sessionData = await sessionResponse.json();

        if (!sessionResponse.ok || !sessionData.id) {
            console.error('❌ Error al crear sesión de subida en Meta:', sessionData);
            const errMsg = (sessionData && sessionData.error && sessionData.error.message) || 'Meta rechazó la creación de la sesión de subida para la foto.';
            return res.status(sessionResponse.status).json({ 
                error: errMsg, 
                detalle: sessionData 
            });
        }

        const sessionId = sessionData.id;
        console.log(`📌 Sesión de subida creada con ID: ${sessionId}`);

        // 3. Subir la data binaria del archivo a la sesión de subida
        const uploadUrl = `https://graph.facebook.com/v18.0/${sessionId}`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'file_offset': '0',
                'Content-Type': 'application/octet-stream'
            },
            body: req.file.buffer
        });
        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadData.h) {
            console.error('❌ Error al subir data binaria a Meta:', uploadData);
            const errMsg = (uploadData && uploadData.error && uploadData.error.message) || 'Meta rechazó la transferencia de la imagen.';
            return res.status(uploadResponse.status).json({ 
                error: errMsg, 
                detalle: uploadData 
            });
        }

        const profilePictureHandle = uploadData.h;
        console.log(`📌 Handle de imagen obtenido exitosamente: ${profilePictureHandle}`);

        // 4. Vincular el handle de imagen al perfil de negocio
        const profileUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/whatsapp_business_profile`;
        const profileResponse = await fetch(profileUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                profile_picture_handle: profilePictureHandle
            })
        });
        const profileData = await profileResponse.json();

        if (!profileResponse.ok) {
            console.error('❌ Error al vincular foto de perfil:', profileData);
            const errMsg = (profileData && profileData.error && profileData.error.message) || 'Meta no pudo vincular la nueva foto de perfil utilizando el handle.';
            return res.status(profileResponse.status).json({ 
                error: errMsg, 
                detalle: profileData 
            });
        }

        res.json({ success: true, message: 'Foto de perfil de WhatsApp actualizada exitosamente.' });
    } catch (err) {
        console.error('Error al subir foto de perfil de WhatsApp:', err.message);
        res.status(500).json({ error: 'Error interno al actualizar la foto de perfil: ' + err.message });
    }
});

// =========================================================================
// SECTION B: CATÁLOGO DE PRODUCTOS EN WHATSAPP
// =========================================================================

const CATALOG_ID = "1491023345613664";

// B.1 Obtener estado del catálogo y lista de productos
router.get('/catalogo/estado', async (req, res) => {
    try {
        const totalResult = await pool.query('SELECT COUNT(*)::integer FROM productos WHERE activo = TRUE');
        const totalActivos = totalResult.rows[0].count;

        const syncedResult = await pool.query('SELECT COUNT(*)::integer FROM productos WHERE meta_catalog_synced_at IS NOT NULL AND activo = TRUE');
        const totalSincronizados = syncedResult.rows[0].count;

        const paramResult = await pool.query('SELECT ultima_sincronizacion_catalogo FROM parametros WHERE id = 1');
        const ultimaSinc = paramResult.rows[0]?.ultima_sincronizacion_catalogo || null;

        const prodQuery = `
            SELECT p.id, p.nombre, p.precio_venta, p.imagen_url, p.activo, 
                   p.meta_catalog_synced_at, p.meta_catalog_error, p.meta_catalog_id,
                   c.nombre as categoria_nombre
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            ORDER BY p.nombre ASC
        `;
        const prodResult = await pool.query(prodQuery);

        res.json({
            total_activos: totalActivos,
            total_sincronizados: totalSincronizados,
            ultima_sincronizacion_global: ultimaSinc,
            productos: prodResult.rows
        });
    } catch (err) {
        console.error('Error al cargar estado del catálogo:', err.message);
        res.status(500).json({ error: 'Error al consultar estado de sincronización.' });
    }
});

// Helper para sincronizar productos por lote a Meta y actualizar la BD local
async function ejecutarSincronizacionLote(productos) {
    if (productos.length === 0) return { success: true, count: 0 };

    const url = `https://graph.facebook.com/v18.0/${CATALOG_ID}/items_batch`;
    
    const requests = productos.map(prod => {
        const fallbackImg = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500";
        const cleanPrice = parseFloat(prod.precio_venta).toFixed(2);
        const availability = prod.activo ? "in stock" : "out of stock";

        return {
            method: prod.meta_catalog_synced_at ? "UPDATE" : "CREATE",
            data: {
                id: String(prod.id),
                title: prod.nombre,
                description: `Delicioso producto ${prod.nombre} de Café La Paz`,
                price: `${cleanPrice} BOB`,
                image_link: prod.imagen_url || fallbackImg,
                link: "https://coffe-shop-4ffg.onrender.com/",
                brand: "Café La Paz",
                condition: "new",
                availability: availability
            }
        };
    });

    const bodyData = {
        item_type: "PRODUCT_ITEM",
        requests: requests
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify(bodyData)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('❌ Error de lote en Meta:', data);
            throw new Error(data.error?.message || 'Error en petición de lote a Meta.');
        }

        const handle = data.handles ? data.handles[0] : null;
        if (!handle) {
            throw new Error('No se recibió handle de procesamiento de Meta.');
        }

        // Hacer un polling rápido (máximo 5 segundos) para comprobar el estado final
        let finalStatus = null;
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const statusUrl = `https://graph.facebook.com/v18.0/${CATALOG_ID}/check_batch_request_status?handle=${handle}`;
            const statusRes = await fetch(statusUrl, {
                headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
            });
            const statusData = await statusRes.json();
            
            if (statusRes.ok && statusData.status === 'FINISHED') {
                finalStatus = statusData;
                break;
            }
        }

        if (finalStatus && finalStatus.errors && finalStatus.errors.length > 0) {
            const errorMap = {};
            finalStatus.errors.forEach(errItem => {
                if (errItem.retailer_id) {
                    errorMap[errItem.retailer_id] = errItem.message;
                }
            });

            for (const prod of productos) {
                const prodIdStr = String(prod.id);
                if (errorMap[prodIdStr]) {
                    await pool.query(
                        'UPDATE productos SET meta_catalog_synced_at = NULL, meta_catalog_error = $1 WHERE id = $2',
                        [errorMap[prodIdStr], prod.id]
                    );
                } else {
                    await pool.query(
                        'UPDATE productos SET meta_catalog_synced_at = NOW(), meta_catalog_error = NULL, meta_catalog_id = $1 WHERE id = $2',
                        [`meta_${prod.id}`, prod.id]
                    );
                }
            }
        } else {
            for (const prod of productos) {
                await pool.query(
                    'UPDATE productos SET meta_catalog_synced_at = NOW(), meta_catalog_error = NULL, meta_catalog_id = $1 WHERE id = $2',
                    [`meta_${prod.id}`, prod.id]
                );
            }
        }

        await pool.query('UPDATE parametros SET ultima_sincronizacion_catalogo = NOW() WHERE id = 1');
        return { success: true, count: productos.length };

    } catch (err) {
        console.error('Error procesando lote de catálogo:', err.message);
        for (const prod of productos) {
            await pool.query(
                'UPDATE productos SET meta_catalog_error = $1 WHERE id = $2',
                [err.message, prod.id]
            );
        }
        throw err;
    }
}

// B.2 Sincronización Manual Completa
router.post('/catalogo/sincronizar', async (req, res) => {
    try {
        const query = 'SELECT id, nombre, precio_venta, imagen_url, activo, meta_catalog_synced_at FROM productos WHERE activo = TRUE';
        const { rows } = await pool.query(query);
        
        if (rows.length === 0) {
            return res.json({ success: true, message: 'No hay productos activos para sincronizar.' });
        }

        const result = await ejecutarSincronizacionLote(rows);
        res.json({ success: true, message: `Sincronización finalizada. ${result.count} productos procesados.` });
    } catch (err) {
        console.error('Error en sincronización manual:', err.message);
        res.status(500).json({ error: 'Error durante la sincronización.', detalle: err.message });
    }
});

// --- HOOKS EXPORTADOS PARA REAL-TIME SYNC ---

async function syncProductToMeta(productId) {
    try {
        const query = 'SELECT id, nombre, precio_venta, imagen_url, activo, meta_catalog_synced_at FROM productos WHERE id = $1';
        const { rows } = await pool.query(query, [productId]);
        if (rows.length === 0) return;
        
        await ejecutarSincronizacionLote(rows);
        console.log(`📡 Sincronización individual completada para producto ID ${productId}`);
    } catch (err) {
        console.error(`❌ Sincronización automática falló para producto ID ${productId}:`, err.message);
    }
}

async function deleteProductFromMeta(productId) {
    const url = `https://graph.facebook.com/v18.0/${CATALOG_ID}/items_batch`;
    const bodyData = {
        item_type: "PRODUCT_ITEM",
        requests: [
            {
                method: "DELETE",
                data: {
                    id: String(productId)
                }
            }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            body: JSON.stringify(bodyData)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error(`❌ Error al eliminar producto ID ${productId} de Meta:`, data);
        } else {
            console.log(`📡 Producto ID ${productId} eliminado del catálogo de Meta exitosamente.`);
        }
    } catch (err) {
        console.error(`❌ Error de red al eliminar producto ID ${productId} de Meta:`, err.message);
    }
}

// Exportar hooks de sincronización en el router
router.syncProductToMeta = syncProductToMeta;
router.deleteProductFromMeta = deleteProductFromMeta;

module.exports = router;
