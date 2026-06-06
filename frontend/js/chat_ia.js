// frontend/js/chat_ia.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar datos de usuario del localStorage
    const nombreActual = localStorage.getItem('usuario_nombre');
    const rolActual = localStorage.getItem('usuario_rol');
    
    if (nombreActual) {
        const elem = document.getElementById('nombre-usuario');
        if (elem) elem.innerText = nombreActual;
        const avatar = document.getElementById('avatar-letra');
        if (avatar) avatar.innerText = nombreActual.charAt(0).toUpperCase();
    }
    if (rolActual) {
        const rolIcon = document.getElementById('rol-usuario');
        if (rolIcon) {
            rolIcon.innerHTML = `<i class="fa-solid fa-circle text-[6px] mr-1 align-middle text-emerald-500 animate-pulse"></i> ${rolActual}`;
        }
    }

    // 2. Controladores de Eventos del Formulario de Chat
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mensaje = chatInput.value.trim();
            if (!mensaje) return;
            
            chatInput.value = '';
            await enviarMensaje(mensaje);
        });
    }
});

// Función para cuando se hace click en una sugerencia rápida
async function preguntarSugerencia(btn) {
    const texto = btn.innerText.replace(/^[📈🍔📦💵👥]\s*/, '').trim();
    
    // Mapeo amigable para el backend para que sea más natural y preciso
    let consulta = texto;
    if (texto === "Ventas de Hoy") {
        consulta = "¿Cuáles son las ventas totales y por método de pago de hoy?";
    } else if (texto === "Producto Estrella") {
        consulta = "¿Cuáles son los 3 productos más vendidos con su cantidad y subtotal total?";
    } else if (texto === "Alerta de Stock Bajo") {
        consulta = "¿Qué insumos tienen stock actual menor o igual a su stock mínimo y cuál es el stock faltante?";
    } else if (texto === "Gastos del Mes") {
        consulta = "¿Cuánto se ha gastado en total este mes y cuáles son los gastos registrados?";
    } else if (texto === "Lista de Cajeros") {
        consulta = "¿Qué usuarios tienen rol de CAJERO y están activos actualmente?";
    }

    await enviarMensaje(consulta);
}

// Envía el mensaje al servidor y gestiona la respuesta de la IA
async function enviarMensaje(mensaje) {
    const chatMessages = document.getElementById('chat-messages');
    const loadingDiv = document.getElementById('ia-loading');
    
    // 1. Agregar burbuja del usuario
    agregarBurbujaUsuario(mensaje);
    scrollChatAlFinal();
    
    // 2. Mostrar loader de la IA
    if (loadingDiv) loadingDiv.classList.remove('hidden');
    scrollChatAlFinal();
    
    try {
        const res = await fetch('/api/ia/consultar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mensaje })
        });
        
        const data = await res.json();
        
        if (loadingDiv) loadingDiv.classList.add('hidden');
        
        if (!res.ok) {
            let errorMsg = `Error: ${data.error || 'No se pudo procesar la consulta.'}`;
            if (data.detalles) {
                errorMsg += `\n\nDetalles técnicos: ${data.detalles}`;
            }
            agregarBurbujaIa(errorMsg, null, data.sql || null, true);
        } else if (data.success) {
            agregarBurbujaIa(data.mensajeIa, data.filas, data.sql);
        }
    } catch (error) {
        console.error(error);
        if (loadingDiv) loadingDiv.classList.add('hidden');
        agregarBurbujaIa('Hubo un problema de conexión con el servidor. Por favor intenta de nuevo.', null, null, true);
    }
    
    scrollChatAlFinal();
}

// Inserta la burbuja de texto del Administrador
function agregarBurbujaUsuario(mensaje) {
    const chatMessages = document.getElementById('chat-messages');
    
    const div = document.createElement('div');
    div.className = 'flex gap-3 max-w-[85%] ml-auto justify-end animate-fade-in-up';
    
    div.innerHTML = `
        <div class="bg-orange-600 text-white rounded-2xl rounded-tr-none p-4 text-sm leading-relaxed shadow-sm">
            <p class="font-bold mb-1 text-orange-200 text-xs text-right">Tú (Admin)</p>
            <p class="font-medium whitespace-pre-wrap">${escapeHTML(mensaje)}</p>
        </div>
        <div class="w-8 h-8 rounded-full bg-slate-800 text-orange-500 flex items-center justify-center shrink-0 shadow ring-2 ring-slate-700/30 font-bold text-xs">
            ${(localStorage.getItem('usuario_nombre') || 'A').charAt(0).toUpperCase()}
        </div>
    `;
    
    chatMessages.appendChild(div);
}

// Inserta la burbuja de la IA, con tabla dinámica y query SQL si aplica
function agregarBurbujaIa(mensajeHtml, filas, sql, esError = false) {
    const chatMessages = document.getElementById('chat-messages');
    
    const div = document.createElement('div');
    div.className = 'flex gap-3 max-w-[90%] sm:max-w-[85%] animate-fade-in-up';
    
    let contentHtml = `
        <div class="w-8 h-8 rounded-full ${esError ? 'bg-red-500' : 'bg-orange-500'} text-white flex items-center justify-center shrink-0 shadow shadow-orange-500/25">
            <i class="fa-solid ${esError ? 'fa-triangle-exclamation' : 'fa-brain'} text-sm"></i>
        </div>
        <div class="${esError ? 'bg-red-50 border-red-200' : 'bg-slate-100 border-slate-200/50'} rounded-2xl rounded-tl-none p-4 text-sm leading-relaxed text-slate-800 shadow-sm border w-full overflow-hidden">
            <p class="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <span>Moka Asistente IA</span>
                ${esError ? '<span class="text-[9px] bg-red-200 text-red-700 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">Error</span>' : ''}
            </p>
            <div class="prose text-slate-800 text-sm leading-relaxed whitespace-pre-line font-medium">
                ${formatMarkdown(mensajeHtml)}
            </div>
    `;
    
    // Si hay filas de base de datos, construir tabla interactiva
    if (filas && filas.length > 0) {
        contentHtml += construirTablaHtml(filas);
    } else if (filas && filas.length === 0 && !esError && sql) {
        contentHtml += `
            <div class="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-slate-500 text-xs">
                <i class="fa-solid fa-circle-info text-blue-500"></i>
                <span>La consulta no devolvió ningún registro en este momento.</span>
            </div>
        `;
    }
    
    // Si viene la consulta SQL, mostrarla en un visor colapsable de código
    if (sql) {
        contentHtml += `
            <div class="mt-4 pt-3 border-t border-slate-200/80">
                <details class="group">
                    <summary class="flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 cursor-pointer font-semibold select-none">
                        <span class="flex items-center gap-1.5"><i class="fa-solid fa-code text-orange-500/70"></i> Ver consulta SQL ejecutada</span>
                        <i class="fa-solid fa-chevron-down transition-transform group-open:rotate-180"></i>
                    </summary>
                    <div class="mt-2 p-3 bg-slate-900 text-slate-300 rounded-lg text-[11px] font-mono whitespace-pre-wrap overflow-x-auto border border-slate-950 shadow-inner">
                        ${escapeHTML(sql)}
                    </div>
                </details>
            </div>
        `;
    }
    
    contentHtml += `</div>`;
    div.innerHTML = contentHtml;
    chatMessages.appendChild(div);
}

// Construye una tabla HTML responsiva y estilizada a partir del array de filas
function construirTablaHtml(filas) {
    if (!filas || filas.length === 0) return '';
    
    const columnas = Object.keys(filas[0]);
    
    let thead = '';
    columnas.forEach(col => {
        // Formatear el encabezado: Reemplazar guiones bajos por espacios y capitalizar
        const label = col.replace(/_/g, ' ').toUpperCase();
        thead += `<th class="px-4 py-2 text-left font-bold text-[10px] tracking-widest text-slate-500 uppercase">${label}</th>`;
    });
    
    let tbody = '';
    filas.forEach((fila, index) => {
        let rowHtml = '';
        columnas.forEach(col => {
            let valor = fila[col];
            
            // Formatear valores especiales (fechas, monedas) de forma óptima
            if (valor === null || valor === undefined) {
                valor = '<span class="text-slate-400 italic">null</span>';
            } else if (typeof valor === 'boolean') {
                valor = valor ? '<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">SÍ</span>' : '<span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold text-[10px]">NO</span>';
            } else if (!isNaN(valor) && (col.toLowerCase().includes('total') || col.toLowerCase().includes('monto') || col.toLowerCase().includes('precio') || col.toLowerCase().includes('saldo') || col.toLowerCase().includes('subtotal') || col.toLowerCase().includes('costo'))) {
                valor = `Bs. ${parseFloat(valor).toFixed(2)}`;
            } else if (typeof valor === 'string' && (valor.includes('T') && valor.includes('Z') && !isNaN(Date.parse(valor)))) {
                // Formatear fecha ISO
                valor = new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
            
            rowHtml += `<td class="px-4 py-2 font-medium">${valor}</td>`;
        });
        
        const rowClass = index % 2 === 0 ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50 hover:bg-slate-100/50';
        tbody += `<tr class="${rowClass} transition-colors border-b border-slate-100">${rowHtml}</tr>`;
    });
    
    return `
        <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200/80 shadow-premium bg-white max-w-full">
            <table class="w-full text-xs text-left text-slate-700 border-collapse">
                <thead>
                    <tr class="bg-slate-50/80 border-b border-slate-200/80 text-[10px]">
                        ${thead}
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>
        </div>
    `;
}

// Helper para escapar HTML y evitar XSS
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Formateador simple de Markdown (Negritas y viñetas) para renderizar amigablemente
function formatMarkdown(text) {
    if (!text) return '';
    let formatted = escapeHTML(text);
    
    // 1. Negrita (**texto**)
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 2. Viñetas (* item o - item)
    // Convertir líneas con asterisco en listas ul/li
    const lines = formatted.split('\n');
    let inList = false;
    const finalLines = lines.map(line => {
        const match = line.match(/^(\s*)[*\-]\s+(.*)$/);
        if (match) {
            let res = '';
            if (!inList) {
                inList = true;
                res += '<ul class="list-disc pl-5 my-1.5 space-y-1">';
            }
            res += `<li>${match[2]}</li>`;
            return res;
        } else {
            let res = '';
            if (inList) {
                inList = false;
                res += '</ul>';
            }
            return res + line;
        }
    });
    
    if (inList) {
        finalLines.push('</ul>');
    }
    
    return finalLines.join('\n');
}

// Desplazar el chat suavemente hasta la última línea
function scrollChatAlFinal() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }
}
