// backend/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pool = require('../config/conexion');
const { soloAdmin } = require('../middleware/permisos');

// Excepción de permisos para el webhook de Meta y para la visualización de medios (imágenes/PDFs)
const checkAdminPermission = (req, res, next) => {
    if (req.path === '/webhook' || req.path.startsWith('/media/')) {
        return next();
    }
    return soloAdmin(req, res, next);
};

router.use(checkAdminPermission);

// Credenciales oficiales de Meta proporcionadas por el usuario
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "EABAqZAj7BPkUBR6nPjKPh9D944usZBBAnQj4ezuN3srY7wbxhAdjByTSKMPvkO1ZBRrdeTCnfw9g7Lgfv7UcJmt3dcTROsdeZALSr7boobiVQEPRyVP7rXd5hMFo2KqL7EmOLD0UC2HR02cdNWZCDotyWomx4ZAYl0FkZB1uuty2YyMuXUWcmwEzMZCC6efRXQZDZD";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "1189224787600539";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_secreto_para_webhook_123";

/**
 * Función de servicio para enviar mensajes por la API de WhatsApp de Meta.
 */
async function enviarMensajeWhatsApp(to, text, remitente = 'ADMIN') {
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
                    'INSERT INTO whatsapp_mensajes (telefono, mensaje, remitente, tipo) VALUES ($1, $2, $3, $4)',
                    [to, text, remitente, 'text']
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

/**
 * Descarga cualquier medio (imagen, PDF, audio, video) de Meta y lo guarda de forma segura
 * en la base de datos PostgreSQL (tabla whatsapp_archivos).
 * Esto evita cuotas de almacenamiento externo y garantiza que los CVs o fotos nunca se pierdan.
 */
async function descargarYGuardarMedia(mediaId, originalFilename = null) {
    try {
        // 1. Obtener URL temporal de descarga desde Meta
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        const metaData = await metaRes.json();
        if (!metaRes.ok || !metaData.url) {
            console.error('❌ Error al obtener URL de media desde Meta:', metaData);
            return null;
        }

        // 2. Descargar el archivo binario
        const fileRes = await fetch(metaData.url, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        if (!fileRes.ok) {
            console.error('❌ Error al descargar binario desde Meta.');
            return null;
        }

        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const mimeType = metaData.mime_type || 'application/octet-stream';
        
        let nombre = originalFilename;
        if (!nombre) {
            let ext = 'bin';
            if (mimeType.includes('pdf')) ext = 'pdf';
            else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
            else if (mimeType.includes('png')) ext = 'png';
            else if (mimeType.includes('ogg') || mimeType.includes('audio')) ext = 'ogg';
            else if (mimeType.includes('mp4') || mimeType.includes('video')) ext = 'mp4';
            nombre = `archivo_${Date.now()}.${ext}`;
        }

        // 3. Guardar en PostgreSQL
        const ins = await pool.query(
            `INSERT INTO whatsapp_archivos (mime_type, nombre, tamano, datos)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [mimeType, nombre, buffer.length, buffer]
        );

        // 3.1 Guardar también en disco local backend/public/uploads para respaldo y acceso estático ultrarrápido
        try {
            const uploadsDir = path.join(__dirname, '../public/uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            fs.writeFileSync(path.join(uploadsDir, nombre), buffer);
        } catch (diskErr) {
            console.warn('⚠️ No se pudo guardar archivo en disco local:', diskErr.message);
        }

        return {
            id: ins.rows[0].id,
            nombre: nombre,
            mimeType: mimeType,
            tamano: buffer.length
        };
    } catch (err) {
        console.error('❌ Error al descargar/guardar media de WhatsApp:', err.message);
        return null;
    }
}

// =========================================================================
// 1. CONFIGURACIÓN DEL WEBHOOK DE META (GET y POST)
// =========================================================================

// Endpoint GET: Verificación de Webhook para Meta
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verificado correctamente por Meta.');
            res.status(200).send(challenge);
        } else {
            console.warn('❌ Token de verificación inválido en webhook.');
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Endpoint POST: Recepción de mensajes entrantes (Postulantes / Clientes)
router.post('/webhook', async (req, res) => {
    // Retornamos 200 de inmediato a Meta para confirmar recepción y evitar reintentos
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;
        if (body.object !== 'whatsapp_business_account' || !body.entry) return;

        for (const entry of body.entry) {
            for (const change of (entry.changes || [])) {
                const value = change.value;
                if (!value || !value.messages || !Array.isArray(value.messages)) continue;

                // Extraer mapa de nombres de perfil de WhatsApp si Meta los incluye en contacts
                const contactsMap = {};
                let firstProfileName = null;
                if (value.contacts && Array.isArray(value.contacts)) {
                    for (const c of value.contacts) {
                        if (c.profile && c.profile.name) {
                            if (!firstProfileName) firstProfileName = c.profile.name;
                            if (c.wa_id) {
                                contactsMap[c.wa_id] = c.profile.name;
                                contactsMap[String(c.wa_id).replace(/\D/g, '')] = c.profile.name;
                            }
                        }
                    }
                }

                for (const message of value.messages) {
                    const from = message.from; // Teléfono del postulante
                    const msgType = message.type;
                    const cleanFrom = String(from || '').replace(/\D/g, '');
                    const senderName = contactsMap[from] || contactsMap[cleanFrom] || firstProfileName || null;

                    let textBody = '';
                    let tipo = 'text';
                    let mediaIdSaved = null;
                    let archivoNombre = null;

                    if (msgType === 'text' && message.text) {
                        textBody = (message.text.body || '').trim();
                        tipo = 'text';
                    } else if (msgType === 'image' && message.image) {
                        tipo = 'image';
                        const caption = (message.image.caption || '').trim();
                        textBody = caption || '📷 Imagen / Foto enviada';
                        const mediaRes = await descargarYGuardarMedia(message.image.id, null);
                        if (mediaRes) {
                            mediaIdSaved = mediaRes.id;
                            archivoNombre = mediaRes.nombre;
                        }
                    } else if (msgType === 'document' && message.document) {
                        tipo = 'document';
                        archivoNombre = message.document.filename || 'Curriculum_Vitae.pdf';
                        const caption = (message.document.caption || '').trim();
                        textBody = caption ? `${caption} (${archivoNombre})` : `📄 Documento: ${archivoNombre}`;
                        const mediaRes = await descargarYGuardarMedia(message.document.id, archivoNombre);
                        if (mediaRes) {
                            mediaIdSaved = mediaRes.id;
                        }
                    } else if ((msgType === 'audio' || msgType === 'voice') && (message.audio || message.voice)) {
                        tipo = 'audio';
                        textBody = '🎤 Mensaje de voz / audio';
                        const audioObj = message.audio || message.voice;
                        const mediaRes = await descargarYGuardarMedia(audioObj.id, 'audio.ogg');
                        if (mediaRes) {
                            mediaIdSaved = mediaRes.id;
                            archivoNombre = mediaRes.nombre;
                        }
                    } else if (msgType === 'video' && message.video) {
                        tipo = 'video';
                        const caption = (message.video.caption || '').trim();
                        textBody = caption || '🎥 Video enviado';
                        const mediaRes = await descargarYGuardarMedia(message.video.id, 'video.mp4');
                        if (mediaRes) {
                            mediaIdSaved = mediaRes.id;
                            archivoNombre = mediaRes.nombre;
                        }
                    } else if (msgType === 'interactive' && message.interactive) {
                        const ir = message.interactive;
                        textBody = (ir.button_reply && ir.button_reply.title) || (ir.list_reply && ir.list_reply.title) || '[Interactivo]';
                        tipo = 'text';
                    } else if (msgType === 'button' && message.button) {
                        textBody = message.button.text || '[Botón]';
                        tipo = 'text';
                    } else {
                        textBody = `[Mensaje tipo: ${msgType}]`;
                        tipo = msgType || 'text';
                    }

                    // Guardar en la base de datos de manera 100% segura
                    try {
                        await pool.query(
                            `INSERT INTO whatsapp_mensajes (telefono, mensaje, remitente, tipo, media_id, archivo_nombre, nombre)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [from, textBody, 'CLIENTE', tipo, mediaIdSaved, archivoNombre, senderName]
                        );
                        console.log(`📥 [WhatsApp Postulante ${senderName ? senderName + ' ' : ''}+${from}] Recibido ${tipo}: "${textBody}" (media_id: ${mediaIdSaved})`);
                    } catch (dbErr) {
                        console.error('❌ Error al guardar mensaje en BD:', dbErr.message);
                    }

                    // NO SE RESPONDE POR IA NI MENSAJES AUTOMÁTICOS PREGRABADOS.
                    // El mensaje queda guardado en la bandeja del panel para ser atendido manualmente.
                }
            }
        }
    } catch (error) {
        console.error('❌ Error en procesamiento del Webhook de WhatsApp:', error.message);
    }
});

// Endpoint GET: Servir archivos multimedia (fotos, CVs en PDF, audios) directamente
router.get('/media/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = 'SELECT mime_type, nombre, datos FROM whatsapp_archivos WHERE id = $1';
        const { rows } = await pool.query(query, [id]);
        if (rows.length === 0) {
            return res.status(404).send('Archivo no encontrado');
        }
        const file = rows[0];

        // 1. Si existe en disco local, servirlo desde disco para máxima velocidad
        const localPath = path.join(__dirname, '../public/uploads', file.nombre);
        if (fs.existsSync(localPath)) {
            return res.sendFile(localPath);
        }

        // 2. Servir directamente desde la BD (BYTEA)
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.nombre)}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (file.datos) {
            res.setHeader('Content-Length', file.datos.length);
            res.end(file.datos);
        } else {
            res.status(404).send('Contenido de archivo vacío');
        }
    } catch (err) {
        console.error('Error al servir media de WhatsApp:', err.message);
        res.status(500).send('Error al obtener archivo');
    }
});

// =========================================================================
// 2. ENDPOINTS DE GESTIÓN PARA EL PANEL ADMINISTRATIVO (POSTULANTES / CHAT)
// =========================================================================

// 1. Obtener listado de contactos/postulantes ordenados por fecha del último mensaje
router.get('/chat/contactos', async (req, res) => {
    try {
        const query = `
            WITH ultimos_mensajes AS (
                SELECT telefono, mensaje, fecha, remitente, tipo, media_id, archivo_nombre,
                       COALESCE(nombre, (SELECT m2.nombre FROM whatsapp_mensajes m2 WHERE m2.telefono = whatsapp_mensajes.telefono AND m2.nombre IS NOT NULL ORDER BY m2.fecha DESC LIMIT 1)) as nombre,
                       ROW_NUMBER() OVER (PARTITION BY telefono ORDER BY fecha DESC) as rn
                FROM whatsapp_mensajes
            )
            SELECT telefono, mensaje, fecha, remitente, tipo, media_id, archivo_nombre, nombre
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
            SELECT id, telefono, mensaje, remitente, tipo, media_id, archivo_nombre,
                   COALESCE(nombre, (SELECT m2.nombre FROM whatsapp_mensajes m2 WHERE m2.telefono = whatsapp_mensajes.telefono AND m2.nombre IS NOT NULL ORDER BY m2.fecha DESC LIMIT 1)) as nombre,
                   TO_CHAR(fecha, 'HH24:MI DD/MM') as fecha_formateada,
                   fecha
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

// 2.1 Actualizar o asignar nombre manual al postulante
router.post('/chat/actualizar-nombre', async (req, res) => {
    const { telefono, nombre } = req.body;
    if (!telefono || !nombre) {
        return res.status(400).json({ error: 'Faltan parámetros teléfono y nombre.' });
    }

    try {
        await pool.query(
            'UPDATE whatsapp_mensajes SET nombre = $1 WHERE telefono = $2',
            [nombre.trim(), telefono]
        );
        res.json({ success: true, telefono, nombre: nombre.trim() });
    } catch (err) {
        console.error('Error al actualizar nombre del postulante:', err.message);
        res.status(500).json({ error: 'Error al actualizar nombre.' });
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
            const errorMsg = (result && result.error && result.error.message) || 'Error en API de WhatsApp de Meta';
            res.status(500).json({ error: errorMsg, detalle: result });
        }
    } catch (err) {
        console.error('Error al enviar mensaje manual:', err.message);
        res.status(500).json({ error: 'Error al enviar mensaje.' });
    }
});

// Obtener todas las órdenes antiguas de WhatsApp (compatibilidad)
router.get('/pedidos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos_whatsapp ORDER BY fecha DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener pedidos de WhatsApp:', error.message);
        res.status(500).json({ error: 'Error al obtener los pedidos de WhatsApp' });
    }
});

// Actualizar el estado de un pedido
router.put('/pedidos/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    if (!['PENDIENTE', 'PREPARANDO', 'ENTREGADO', 'CANCELADO'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no válido' });
    }
    try {
        await pool.query('UPDATE pedidos_whatsapp SET estado = $1 WHERE id = $2', [estado, id]);
        res.json({ success: true, message: 'Estado actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
    }
});

// Eliminar un pedido
router.delete('/pedidos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM pedidos_whatsapp WHERE id = $1', [id]);
        res.json({ success: true, message: 'Pedido eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el pedido' });
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
