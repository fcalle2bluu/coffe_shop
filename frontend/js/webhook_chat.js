// frontend/js/webhook_chat.js

let chatContactos = [];
let contactoActivo = null;
let chatInterval = null;

window.iniciarChatConsole = function() {
    cargarContactosChat();
    if (!chatInterval) {
        chatInterval = setInterval(() => {
            cargarContactosChat(true); // Silent reload
            if (contactoActivo) {
                cargarConversacionActiva(true); // Silent reload
            }
        }, 2500);
    }
};

window.detenerRecargaChat = function() {
    if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
    }
};

// Cargar lista de contactos / postulantes
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
                    Error al cargar postulantes.
                </div>
            `;
        }
    }
}

// Renderizar lista de contactos con filtros
function renderContactosChat(silent = false) {
    const listContainer = document.getElementById('chat-contactos-list');
    const badgeCount = document.getElementById('chat-contactos-count');
    if (!listContainer) return;

    const query = document.getElementById('buscar-contacto-chat')?.value.trim().toLowerCase() || '';
    const filtered = chatContactos.filter(c => {
        const tel = String(c.telefono || '').toLowerCase();
        const msg = String(c.mensaje || '').toLowerCase();
        const doc = String(c.archivo_nombre || '').toLowerCase();
        return tel.includes(query) || msg.includes(query) || doc.includes(query);
    });

    if (badgeCount) {
        badgeCount.textContent = `${filtered.length} postulante${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-12 text-slate-400 text-xs italic p-4">
                <i class="fa-regular fa-comment-dots text-2xl mb-2 block opacity-40"></i>
                ${query ? 'No se encontraron postulantes con esa búsqueda.' : 'Aún no hay mensajes de postulantes.'}
            </div>
        `;
        return;
    }

    const scrollPos = listContainer.scrollTop;
    listContainer.innerHTML = '';

    filtered.forEach(c => {
        const isSelected = contactoActivo === c.telefono;
        const activeClass = isSelected 
            ? 'bg-orange-50/80 border-l-4 border-l-orange-500 border-b border-orange-100' 
            : 'hover:bg-slate-50 border-b border-slate-100';

        const fechaStr = formatFechaCorta(c.fecha);

        // Previsualización del tipo de mensaje
        let previewHtml = '';
        if (c.tipo === 'image') {
            previewHtml = `<span class="inline-flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded"><i class="fa-solid fa-image"></i> Foto</span>`;
        } else if (c.tipo === 'document') {
            previewHtml = `<span class="inline-flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded"><i class="fa-solid fa-file-pdf"></i> ${escapeHTML(c.archivo_nombre || 'PDF/CV')}</span>`;
        } else if (c.tipo === 'audio') {
            previewHtml = `<span class="inline-flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded"><i class="fa-solid fa-microphone"></i> Audio</span>`;
        } else if (c.tipo === 'video') {
            previewHtml = `<span class="inline-flex items-center gap-1 text-[10px] text-purple-600 font-bold bg-purple-50 px-1.5 py-0.5 rounded"><i class="fa-solid fa-video"></i> Video</span>`;
        }

        const msgText = c.mensaje ? (c.mensaje.length > 30 ? c.mensaje.substring(0, 30) + '...' : c.mensaje) : '';
        let remitentePrefijo = '';
        if (c.remitente === 'ADMIN') {
            remitentePrefijo = '<span class="text-orange-500 font-bold mr-1">Tú:</span>';
        } else if (c.remitente === 'CLIENTE') {
            remitentePrefijo = '<span class="text-slate-600 font-bold mr-1">Postulante:</span>';
        }

        const item = document.createElement('div');
        item.className = `p-3.5 flex items-center gap-3 cursor-pointer transition-all chat-contact-item ${activeClass}`;
        item.onclick = () => seleccionarContactoChat(c.telefono);
        item.innerHTML = `
            <div class="w-10 h-10 rounded-full ${isSelected ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600'} flex items-center justify-center font-bold text-sm shrink-0">
                <i class="fa-brands fa-whatsapp text-lg"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-baseline mb-1">
                    <span class="text-xs font-bold text-slate-800 truncate select-all">+${c.telefono}</span>
                    <span class="text-[9px] text-slate-400 font-semibold shrink-0">${fechaStr}</span>
                </div>
                <div class="text-[10px] text-slate-500 truncate font-medium flex items-center gap-1">
                    ${remitentePrefijo} ${previewHtml || escapeHTML(msgText)}
                </div>
            </div>
        `;
        listContainer.appendChild(item);
    });

    if (silent) {
        listContainer.scrollTop = scrollPos;
    }
}

// Filtro rápido
window.filtrarContactosChat = function() {
    renderContactosChat(true);
};

// Iniciar nuevo chat manual
window.iniciarNuevoChat = function() {
    const telefono = prompt("Ingresa el número de WhatsApp del postulante (con código de país, sin el '+'. Ej: 59160000000):");
    if (!telefono) return;

    const numLimpio = telefono.trim().replace(/\+/g, '').replace(/\s+/g, '');
    if (!/^\d+$/.test(numLimpio)) {
        alert("Número no válido. Debe contener solo dígitos.");
        return;
    }

    const existe = chatContactos.find(c => String(c.telefono) === numLimpio);
    if (existe) {
        seleccionarContactoChat(numLimpio);
        return;
    }

    chatContactos.unshift({
        telefono: numLimpio,
        mensaje: 'Iniciando conversación...',
        fecha: new Date().toISOString(),
        remitente: 'ADMIN',
        tipo: 'text',
        media_id: null,
        archivo_nombre: null
    });

    renderContactosChat(true);
    seleccionarContactoChat(numLimpio);
};

// Formato de fecha
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

    // Actualizar cabecera
    const headerPhone = document.getElementById('chat-active-phone');
    const headerStatus = document.getElementById('chat-active-status');
    const headerAvatar = document.getElementById('chat-active-avatar');
    const waLink = document.getElementById('chat-active-walink');
    const btnRefresh = document.getElementById('btn-refresh-chat');
    const inputContainer = document.getElementById('chat-input-container');

    if (headerPhone) headerPhone.textContent = `+${telefono}`;
    if (headerStatus) headerStatus.textContent = 'Postulante · Conectado con WhatsApp Oficial';
    if (headerAvatar) {
        headerAvatar.className = "w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-100";
        headerAvatar.innerHTML = `<i class="fa-brands fa-whatsapp text-xl"></i>`;
    }
    if (waLink) {
        waLink.href = `https://wa.me/${telefono}`;
        waLink.classList.remove('hidden');
    }
    if (btnRefresh) btnRefresh.classList.remove('hidden');
    if (inputContainer) inputContainer.classList.remove('hidden');

    renderContactosChat(true);
    cargarConversacionActiva(false);
};

// Cargar conversación activa
window.cargarConversacionActiva = async function(silent = false) {
    if (!contactoActivo) return;

    const container = document.getElementById('chat-mensajes-container');
    if (!container) return;

    if (!silent) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <i class="fa-solid fa-spinner fa-spin text-2xl text-orange-500 mb-2 block"></i>
                Cargando mensajes del postulante...
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
                    No se pudo cargar el historial del postulante.
                </div>
            `;
        }
    }
};

// Renderizar burbujas de mensajes (con soporte para texto, imágenes, PDFs y audios)
function renderMensajes(mensajes, silent = false) {
    const container = document.getElementById('chat-mensajes-container');
    if (!container) return;

    const wasAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 80;

    container.innerHTML = '';

    if (mensajes.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs italic p-4 text-center">
                <i class="fa-regular fa-comment-dots text-3xl mb-2 block opacity-40"></i>
                No hay mensajes en esta conversación. ¡Escribe un mensaje abajo para responder al postulante!
            </div>
        `;
        return;
    }

    mensajes.forEach(m => {
        const isClient = m.remitente === 'CLIENTE';

        const outerDiv = document.createElement('div');
        outerDiv.className = `flex w-full mb-3.5 ${isClient ? 'justify-start' : 'justify-end'}`;

        const bubble = document.createElement('div');
        if (isClient) {
            bubble.className = "max-w-[85%] md:max-w-[70%] bg-white border border-slate-200/80 text-slate-800 rounded-2xl rounded-tl-none p-3.5 shadow-sm relative";
        } else {
            bubble.className = "max-w-[85%] md:max-w-[70%] bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl rounded-tr-none p-3.5 shadow-md shadow-orange-500/10 relative";
        }

        let mediaHtml = '';

        // Si tiene archivo multimedia adjunto
        if (m.media_id) {
            const mediaUrl = `/api/whatsapp/media/${m.media_id}`;
            const tipo = m.tipo || 'text';

            if (tipo === 'image') {
                mediaHtml = `
                    <div class="mb-2 rounded-xl overflow-hidden border border-slate-200/70 bg-slate-50">
                        <a href="${mediaUrl}" target="_blank" title="Clic para ver en pantalla completa">
                            <img src="${mediaUrl}" alt="Foto enviada" class="max-h-72 w-full object-contain hover:opacity-95 transition cursor-pointer" loading="lazy" />
                        </a>
                        <div class="px-2 py-1 bg-slate-100 text-[10px] text-slate-500 font-semibold flex items-center justify-between">
                            <span><i class="fa-solid fa-image text-blue-500"></i> Imagen recibida</span>
                            <a href="${mediaUrl}" target="_blank" class="text-blue-600 hover:underline">Ver tamaño completo ↗</a>
                        </div>
                    </div>
                `;
            } else if (tipo === 'document') {
                const nombreDoc = m.archivo_nombre || 'Curriculum_Vitae.pdf';
                const esPdf = nombreDoc.toLowerCase().endsWith('.pdf');
                mediaHtml = `
                    <div class="mb-2">
                        <a href="${mediaUrl}" target="_blank" class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-sm group">
                            <div class="w-10 h-10 rounded-lg ${esPdf ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'} flex items-center justify-center shrink-0">
                                <i class="fa-solid ${esPdf ? 'fa-file-pdf' : 'fa-file-lines'} text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0 pr-2">
                                <p class="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600 transition">${escapeHTML(nombreDoc)}</p>
                                <span class="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                                    <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> Clic para Abrir / Descargar Documento
                                </span>
                            </div>
                        </a>
                    </div>
                `;
            } else if (tipo === 'audio') {
                mediaHtml = `
                    <div class="mb-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-500 block mb-1"><i class="fa-solid fa-microphone text-amber-500"></i> Mensaje de voz</span>
                        <audio controls src="${mediaUrl}" class="w-full h-8"></audio>
                    </div>
                `;
            } else if (tipo === 'video') {
                mediaHtml = `
                    <div class="mb-2 rounded-xl overflow-hidden border border-slate-200">
                        <video controls src="${mediaUrl}" class="max-h-72 w-full"></video>
                    </div>
                `;
            }
        }

        // Texto del mensaje
        let textHtml = '';
        if (m.mensaje && (!m.media_id || (m.mensaje !== '📷 Imagen / Foto enviada' && !m.mensaje.startsWith('📄 Documento:')))) {
            const escaped = escapeHTML(m.mensaje).replace(/\n/g, '<br>');
            textHtml = `<p class="text-xs leading-relaxed break-words font-medium select-all ${isClient ? 'text-slate-800' : 'text-white'}">${escaped}</p>`;
        }

        const horaColor = isClient ? 'text-slate-400' : 'text-orange-100';

        bubble.innerHTML = `
            ${mediaHtml}
            ${textHtml}
            <div class="flex items-center justify-end gap-1 mt-1 text-[9px] ${horaColor} font-semibold">
                <span>${m.fecha_formateada || ''}</span>
                ${!isClient ? '<i class="fa-solid fa-check-double text-[8px]"></i>' : ''}
            </div>
        `;

        outerDiv.appendChild(bubble);
        container.appendChild(outerDiv);
    });

    if (!silent || wasAtBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// Enviar mensaje manual al postulante
window.enviarMensajeChatManual = async function(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('chat-mensaje-texto');
    if (!input || !contactoActivo) return;

    const mensaje = input.value.trim();
    if (!mensaje) return;

    input.disabled = true;
    input.placeholder = "Enviando respuesta por WhatsApp...";

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

        // Recargar al instante
        await cargarConversacionActiva(true);
        cargarContactosChat(true);

    } catch (err) {
        alert('❌ Error al enviar mensaje: ' + err.message);
    } finally {
        input.disabled = false;
        input.placeholder = "Escribe una respuesta para el postulante... (Enter para enviar)";
        input.focus();
    }
};

// Evitar XSS
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
