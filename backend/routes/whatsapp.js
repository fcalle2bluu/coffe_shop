// backend/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');

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
        
        if (about !== undefined) bodyData.about = about;
        if (address !== undefined) bodyData.address = address;
        if (description !== undefined) bodyData.description = description;
        if (email !== undefined) bodyData.email = email;
        if (websites !== undefined) {
            bodyData.websites = Array.isArray(websites) ? websites.slice(0, 2) : [websites].filter(Boolean).slice(0, 2);
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
            return res.status(response.status).json({ error: 'Meta rechazó la actualización del perfil.', detalle: metaData });
        }
        res.json({ success: true, message: 'Perfil de WhatsApp actualizado exitosamente.' });
    } catch (err) {
        console.error('Error al actualizar perfil de WhatsApp:', err.message);
        res.status(500).json({ error: 'Error al actualizar perfil de WhatsApp.' });
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
            return res.status(400).json({ 
                error: 'No se pudo obtener el App ID para la subida de foto. Verifique la validez de su token.', 
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
            return res.status(sessionResponse.status).json({ 
                error: 'Meta rechazó la creación de la sesión de subida para la foto.', 
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
            return res.status(uploadResponse.status).json({ 
                error: 'Meta rechazó la transferencia de la imagen.', 
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
            return res.status(profileResponse.status).json({ 
                error: 'Meta no pudo vincular la nueva foto de perfil utilizando el handle.', 
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
