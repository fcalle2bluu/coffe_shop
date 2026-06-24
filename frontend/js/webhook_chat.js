// frontend/js/webhook_chat.js

let chatContactos = [];
let contactoActivo = null;
let chatInterval = null;

window.iniciarChatConsole = function() {
    cargarContactosChat();
    // Recarga automática de contactos y conversación activa cada 2 segundos
    if (!chatInterval) {
        chatInterval = setInterval(() => {
            cargarContactosChat(true); // Carga silenciosa para no parpadear
            if (contactoActivo) {
                cargarConversacionActiva(true);
            }
        }, 2000);
    }
};

window.detenerRecargaChat = function() {
    if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
    }
};

// Cargar contactos de chat
async function cargarContactosChat(silent = false) {
    const listContainer = document.getElementById('chat-contactos-list');
    if (!listContainer) return;

    try {
        const res = await fetch('/api/whatsapp/chat/contactos');
        if (!res.ok) throw new Error('Error al cargar contactos');
        chatContactos = await res.json();
        renderContactosChat(silent);
    } catch (err) {
        console.error(err);
        if (!silent) {
            listContainer.innerHTML = `
                <div class="text-center py-8 text-rose-500 font-bold text-xs p-4">
                    <i class="fa-solid fa-triangle-exclamation text-xl mb-1 block"></i>
                    Error de conexión al cargar contactos.
                </div>
            `;
        }
    }
}

// Renderizar lista de contactos con buscador integrado
function renderContactosChat(silent = false) {
    const listContainer = document.getElementById('chat-contactos-list');
    if (!listContainer) return;

    const query = document.getElementById('buscar-contacto-chat')?.value.trim().toLowerCase() || '';
    const filtered = chatContactos.filter(c => {
        const tel = String(c.telefono || '').toLowerCase();
        const msg = String(c.mensaje || '').toLowerCase();
        return tel.includes(query) || msg.includes(query);
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-12 text-slate-400 text-xs italic">
                <i class="fa-regular fa-comment-dots text-xl mb-1 block"></i>
                No se encontraron contactos.
            </div>
        `;
        return;
    }

    // Mantener la posición de scroll
    const scrollPos = listContainer.scrollTop;

    listContainer.innerHTML = '';
    filtered.forEach(c => {
        const isSelected = contactoActivo === c.telefono;
        const activeClass = isSelected ? 'active-contact' : 'hover:bg-slate-50';
        
        // Formatear fecha corta
        const fechaStr = formatFechaCorta(c.fecha);
        const lastMsg = c.mensaje ? (c.mensaje.length > 25 ? c.mensaje.substring(0, 25) + '...' : c.mensaje) : '';
        let remitentePrefijo = '';
        if (c.remitente === 'ADMIN') remitentePrefijo = '<span class="text-emerald-600 font-bold mr-1">Tú:</span>';
        else if (c.remitente === 'BOT') remitentePrefijo = '<span class="text-indigo-500 font-bold mr-1">Bot:</span>';

        const item = document.createElement('div');
        item.className = `p-3 flex items-center gap-3 cursor-pointer transition-all border-b border-slate-100 chat-contact-item ${activeClass}`;
        item.onclick = () => seleccionarContactoChat(c.telefono);
        item.innerHTML = `
            <div class="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0">
                <i class="fa-solid fa-phone"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-baseline mb-0.5">
                    <span class="text-xs font-bold text-slate-800 truncate select-all">+${c.telefono}</span>
                    <span class="text-[9px] text-slate-400 font-semibold shrink-0">${fechaStr}</span>
                </div>
                <p class="text-[10px] text-slate-500 truncate font-semibold flex items-center">
                    ${remitentePrefijo} ${lastMsg}
                </p>
            </div>
        `;
        listContainer.appendChild(item);
    });

    if (silent) {
        listContainer.scrollTop = scrollPos;
    }
}

// Filtro rápido de buscador
window.filtrarContactosChat = function() {
    renderContactosChat(true);
};

// Iniciar nuevo chat manual con un cliente no registrado
window.iniciarNuevoChat = function() {
    const telefono = prompt("Ingresa el número de teléfono del cliente (incluyendo código de país, sin el signo '+'. Ej: 59170000000):");
    if (!telefono) return;
    
    const numLimpio = telefono.trim().replace(/\+/g, '').replace(/\s+/g, '');
    if (!/^\d+$/.test(numLimpio)) {
        alert("Número no válido. Debe contener solo dígitos.");
        return;
    }
    
    // Si ya existe en la lista local, lo seleccionamos directamente
    const existe = chatContactos.find(c => String(c.telefono) === numLimpio);
    if (existe) {
        seleccionarContactoChat(numLimpio);
        return;
    }
    
    // Si no existe, lo agregamos artificialmente al inicio de la lista
    chatContactos.unshift({
        telefono: numLimpio,
        mensaje: 'Iniciando conversación...',
        fecha: new Date().toISOString(),
        remitente: 'ADMIN'
    });
    
    renderContactosChat(true);
    seleccionarContactoChat(numLimpio);
};

// Formatear fecha
function formatFechaCorta(fechaRaw) {
    if (!fechaRaw) return '';
    try {
        const d = new Date(fechaRaw);
        const hoy = new Date();
        const esHoy = d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
        if (esHoy) {
            return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });
    } catch {
        return '';
    }
}

// Seleccionar contacto
window.seleccionarContactoChat = function(telefono) {
    contactoActivo = telefono;
    
    // Configurar cabecera
    document.getElementById('chat-active-phone').textContent = `+${telefono}`;
    document.getElementById('chat-active-status').textContent = 'Cliente de WhatsApp API';
    document.getElementById('chat-active-avatar').innerHTML = `<i class="fa-brands fa-whatsapp text-lg text-emerald-600"></i>`;
    
    // Mostrar controles de chat
    document.getElementById('btn-refresh-chat').classList.remove('hidden');
    document.getElementById('chat-input-container').classList.remove('hidden');
    
    renderContactosChat(true);
    cargarConversacionActiva(false);
};

// Cargar conversación
window.cargarConversacionActiva = async function(silent = false) {
    if (!contactoActivo) return;
    
    const container = document.getElementById('chat-mensajes-container');
    if (!container) return;

    if (!silent) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <i class="fa-solid fa-spinner fa-spin text-2xl text-orange-500 mb-2 block"></i>
                Cargando historial de chat...
            </div>
        `;
    }

    try {
        const res = await fetch(`/api/whatsapp/chat/historial?telefono=${contactoActivo}`);
        if (!res.ok) throw new Error('Error al cargar historial');
        const mensajes = await res.json();
        
        renderMensajes(mensajes, silent);
    } catch (err) {
        console.error(err);
        if (!silent) {
            container.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-rose-500 font-bold text-xs p-4 text-center">
                    <i class="fa-solid fa-triangle-exclamation text-2xl mb-2 block"></i>
                    No se pudo cargar el historial de mensajes.
                </div>
            `;
        }
    }
};

// Renderizar mensajes en burbujas
function renderMensajes(mensajes, silent = false) {
    const container = document.getElementById('chat-mensajes-container');
    if (!container) return;

    const wasAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 60;

    container.innerHTML = '';
    
    if (mensajes.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs italic p-4 text-center">
                No hay mensajes en esta conversación. ¡Empieza enviando uno!
            </div>
        `;
        return;
    }

    mensajes.forEach(m => {
        const isClient = m.remitente === 'CLIENTE';
        
        const outerDiv = document.createElement('div');
        outerDiv.className = `flex w-full mb-3 ${isClient ? 'justify-start' : 'justify-end'}`;
        
        const bubble = document.createElement('div');
        if (isClient) {
            bubble.className = "max-w-[75%] bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none px-4 py-2 shadow-sm relative chat-bubble-client";
        } else {
            if (m.remitente === 'BOT') {
                bubble.className = "max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-2 shadow-md shadow-indigo-600/10 relative";
            } else {
                bubble.className = "max-w-[75%] bg-orange-500 text-white rounded-2xl rounded-tr-none px-4 py-2 shadow-md shadow-orange-500/10 relative";
            }
        }
        
        const escapedText = escapeHTML(m.mensaje).replace(/\n/g, '<br>');
        
        bubble.innerHTML = `
            <p class="text-xs leading-relaxed break-words font-medium select-all">${escapedText}</p>
            <span class="text-[9px] block text-right mt-1.5 opacity-60 font-semibold tracking-tight">${m.fecha_formateada || ''}</span>
        `;
        
        outerDiv.appendChild(bubble);
        container.appendChild(outerDiv);
    });

    if (!silent || wasAtBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// Enviar mensaje manual
window.enviarMensajeChatManual = async function(event) {
    if (event) event.preventDefault();
    
    const input = document.getElementById('chat-mensaje-texto');
    if (!input || !contactoActivo) return;
    
    const mensaje = input.value.trim();
    if (!mensaje) return;
    
    // Bloquear el input
    input.disabled = true;
    input.placeholder = "Enviando...";
    
    try {
        const res = await fetch('/api/whatsapp/chat/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telefono: contactoActivo,
                mensaje: mensaje
            })
        });
        
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Error al enviar');
        }
        
        input.value = '';
        
        // Recarga instantánea
        await cargarConversacionActiva(true);
        cargarContactosChat(true);
        
    } catch (err) {
        alert('❌ Error al enviar mensaje: ' + err.message);
    } finally {
        input.disabled = false;
        input.placeholder = "Escribe un mensaje aquí...";
        input.focus();
    }
};

// Evitar XSS sanitizando texto
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
