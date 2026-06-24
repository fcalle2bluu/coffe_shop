// backend/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

// Credenciales oficiales de Meta proporcionadas por el usuario
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EABAqZAj7BPkUBRoh8iZAJnzL1eEZAq8R22oZCLhjHCbGwROGudHjSIvVnOtBZClISZAK2ZANyLhnGwGsfDjsUHSA8FZCLnRBiAPJMq658toaG6opALfOPyySukXaHkXNpLZCRWGLd90h2v5mevjh5tlBNkfvYyBpzyzT014fh5Efc7i1klXi76j2ZBT0kxR0egZBAZDZD";
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

// Helper para enviar el menú inicial con la opción 1. Productos
async function enviarMenuInicial(from) {
    try {
        const welcomeText = `¡Bienvenido a *Café La Paz*! ☕\n\nPor favor, responde con el número de la opción que deseas:\n\n1️⃣ Productos`;
        await enviarMensajeWhatsApp(from, welcomeText);
    } catch (err) {
        console.error('Error al enviar menú inicial:', err.message);
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

            // Procesamos la lógica de flujo del bot (para mensajes de texto o interactivos)
            if (message.type === 'text' || message.type === 'interactive' || message.type === 'button') {
                const textClean = textBody.toLowerCase().trim();

                // Si envían "1", "productos", "1. productos", etc., enviamos el PDF
                if (textClean === '1' || textClean.includes('producto') || textClean === '1️⃣') {
                    await enviarPdfMenu(from, host);
                } else {
                    await enviarMenuInicial(from);
                }
            }
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

module.exports = router;
