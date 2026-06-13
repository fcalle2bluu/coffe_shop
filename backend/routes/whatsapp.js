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
async function enviarMensajeWhatsApp(to, text) {
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

// Helper para mandar el menú de categorías activo
async function enviarMenuCategorias(from) {
    try {
        const catRes = await pool.query(`
            SELECT DISTINCT c.id, c.nombre 
            FROM categorias c 
            INNER JOIN productos p ON p.categoria_id = c.id 
            WHERE p.activo = TRUE 
            ORDER BY c.nombre ASC
        `);
        const categorias = catRes.rows;
        
        if (categorias.length === 0) {
            await enviarMensajeWhatsApp(from, "¡Bienvenido a *Café La Paz*! ☕\n\nLo sentimos, no tenemos productos disponibles en este momento. Por favor, intenta de nuevo más tarde.");
            return;
        }

        let menuText = `¡Bienvenido a *Café La Paz*! ☕\n\n¿Qué te gustaría pedir hoy? Por favor, selecciona una categoría enviando el número correspondiente:\n\n`;
        categorias.forEach((cat, index) => {
            menuText += `${obtenerEmojiNumero(index + 1)} ${cat.nombre}\n`;
        });
        
        await pool.query(`
            INSERT INTO whatsapp_estados (telefono, estado, producto_seleccionado, categoria_seleccionada) 
            VALUES ($1, 'WAITING_CATEGORY', NULL, NULL)
            ON CONFLICT (telefono) DO UPDATE SET estado = 'WAITING_CATEGORY', producto_seleccionado = NULL, categoria_seleccionada = NULL
        `, [from]);

        await enviarMensajeWhatsApp(from, menuText);
    } catch (err) {
        console.error('Error al enviar menú de categorías:', err.message);
    }
}

// Endpoint POST: Recepción de mensajes entrantes
router.post('/webhook', async (req, res) => {
    // Retornamos 200 de inmediato a Meta para confirmar recepción y evitar reenvíos
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;

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
            
            // Solo procesamos mensajes de texto
            if (message.type === 'text') {
                const textBody = message.text.body.trim();
                const textLower = textBody.toLowerCase();

                // Consultamos el estado actual del cliente en la base de datos
                const stateRes = await pool.query('SELECT estado, producto_seleccionado, categoria_seleccionada FROM whatsapp_estados WHERE telefono = $1', [from]);
                const userState = stateRes.rows[0];

                // Comandos para reiniciar o inicio de chat
                if (!userState || ['hola', 'buen', 'tardes', 'noches', 'reset', 'menu', 'menú', 'cancelar'].some(cmd => textLower.includes(cmd))) {
                    await enviarMenuCategorias(from);
                    return;
                }

                // Paso 1: Esperando la selección de la categoría
                if (userState.estado === 'WAITING_CATEGORY') {
                    const catRes = await pool.query(`
                        SELECT DISTINCT c.id, c.nombre 
                        FROM categorias c 
                        INNER JOIN productos p ON p.categoria_id = c.id 
                        WHERE p.activo = TRUE 
                        ORDER BY c.nombre ASC
                    `);
                    const categorias = catRes.rows;
                    const opcion = parseInt(textBody);

                    if (!isNaN(opcion) && opcion >= 1 && opcion <= categorias.length) {
                        const catSeleccionada = categorias[opcion - 1];

                        // Obtener productos de esa categoría
                        const prodRes = await pool.query(`
                            SELECT id, nombre, precio_venta 
                            FROM productos 
                            WHERE categoria_id = $1 AND activo = TRUE 
                            ORDER BY nombre ASC
                        `, [catSeleccionada.id]);
                        const productos = prodRes.rows;

                        if (productos.length === 0) {
                            await enviarMensajeWhatsApp(from, `La categoría *${catSeleccionada.nombre}* no tiene productos disponibles. Por favor, elige otra.`);
                            await enviarMenuCategorias(from);
                            return;
                        }

                        // Guardar la categoría seleccionada en base de datos y avanzar de estado
                        await pool.query(`
                            UPDATE whatsapp_estados 
                            SET estado = 'WAITING_PRODUCT', categoria_seleccionada = $1, producto_seleccionado = NULL 
                            WHERE telefono = $2
                        `, [catSeleccionada.nombre, from]);

                        let prodText = `📂 Categoría: *${catSeleccionada.nombre}*\n\nPor favor, responde enviando el número del producto que deseas pedir:\n\n`;
                        productos.forEach((prod, index) => {
                            prodText += `${obtenerEmojiNumero(index + 1)} ${prod.nombre} (Bs. ${parseFloat(prod.precio_venta).toFixed(2)})\n`;
                        });
                        prodText += `\n✍️ O escribe *cancelar* para volver a la selección de categorías.`;

                        await enviarMensajeWhatsApp(from, prodText);
                    } else {
                        await enviarMensajeWhatsApp(from, `Opción no válida. ⚠️`);
                        await enviarMenuCategorias(from);
                    }
                    return;
                }

                // Paso 2: Esperando la selección del producto
                if (userState.estado === 'WAITING_PRODUCT') {
                    // Cargar productos de la categoría actual
                    const prodRes = await pool.query(`
                        SELECT p.id, p.nombre, p.precio_venta 
                        FROM productos p 
                        INNER JOIN categorias c ON p.categoria_id = c.id 
                        WHERE c.nombre = $1 AND p.activo = TRUE 
                        ORDER BY p.nombre ASC
                    `, [userState.categoria_seleccionada]);
                    const productos = prodRes.rows;
                    const opcion = parseInt(textBody);

                    if (!isNaN(opcion) && opcion >= 1 && opcion <= productos.length) {
                        const prodSeleccionado = productos[opcion - 1];

                        // Guardar producto seleccionado y avanzar estado
                        await pool.query(`
                            UPDATE whatsapp_estados 
                            SET estado = 'WAITING_QUANTITY', producto_seleccionado = $1 
                            WHERE telefono = $2
                        `, [prodSeleccionado.nombre, from]);

                        const qtyText = `Excelente, has seleccionado *${prodSeleccionado.nombre}* (Bs. ${parseFloat(prodSeleccionado.precio_venta).toFixed(2)} c/u).\n\n¿Qué cantidad deseas pedir? 🔢\nPor favor responde con un número entero (ej. 1, 2, 5).`;
                        await enviarMensajeWhatsApp(from, qtyText);
                    } else {
                        await enviarMensajeWhatsApp(from, `Opción no válida. ⚠️ Por favor responde con el número del producto de la lista.`);

                        let prodText = `📂 Categoría: *${userState.categoria_seleccionada}*\n\nPor favor, responde enviando el número del producto que deseas pedir:\n\n`;
                        productos.forEach((prod, index) => {
                            prodText += `${obtenerEmojiNumero(index + 1)} ${prod.nombre} (Bs. ${parseFloat(prod.precio_venta).toFixed(2)})\n`;
                        });
                        prodText += `\n✍️ O escribe *cancelar* para volver a la selección de categorías.`;
                        await enviarMensajeWhatsApp(from, prodText);
                    }
                    return;
                }

                // Paso 3: Esperando la cantidad
                if (userState.estado === 'WAITING_QUANTITY') {
                    const cantidad = parseInt(textBody);
                    if (isNaN(cantidad) || cantidad <= 0) {
                        const errorText = `Cantidad no válida. ⚠️\n\nPor favor responde con un número entero mayor a 0 (ej. 1, 2, 5).\nO escribe *cancelar* para reiniciar tu pedido.`;
                        await enviarMensajeWhatsApp(from, errorText);
                    } else {
                        const producto = userState.producto_seleccionado;

                        // 1. Guardar orden en pedidos_whatsapp
                        await pool.query(`
                            INSERT INTO pedidos_whatsapp (telefono_cliente, producto, cantidad, estado)
                            VALUES ($1, $2, $3, 'PENDIENTE')
                        `, [from, producto, cantidad]);

                        // 2. Limpiar el estado de WhatsApp del cliente
                        await pool.query('DELETE FROM whatsapp_estados WHERE telefono = $1', [from]);

                        // 3. Enviar confirmación al cliente
                        const confirmText = `¡Orden recibida con éxito! 🚀\n\n*Detalle del pedido:*\n📦 Producto: ${producto}\n🔢 Cantidad: ${cantidad}\n\nTu pedido está siendo preparado por nuestro personal en Café La Paz. ¡Muchas gracias! ☕✨`;
                        await enviarMensajeWhatsApp(from, confirmText);
                    }
                    return;
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

module.exports = router;
