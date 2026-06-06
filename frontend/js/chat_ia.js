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
        consulta = "¿Cuáles son las ventas totales de hoy?";
    } else if (texto === "Producto Estrella") {
        consulta = "¿Cuáles son los productos más vendidos hoy y cuánto dinero generaron?";
    } else if (texto === "Alerta de Stock Bajo") {
        consulta = "¿Qué insumos están por debajo de su stock mínimo de alerta?";
    } else if (texto === "Gastos del Mes") {
        consulta = "¿Cuáles son los gastos acumulados en el último mes?";
    } else if (texto === "Lista de Cajeros") {
        consulta = "¿Qué cajeros están activos hoy en el sistema?";
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
    
    // Si hay filas de base de datos (por si acaso vinieran en respuestas legadas), construir tabla
    if (filas && filas.length > 0) {
        contentHtml += construirTablaHtml(filas);
    }
    
    // Si viene la consulta SQL (por si acaso viniera de respuestas legadas), mostrarla
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

// Construye una tabla HTML responsiva y estilizada a partir del array de filas (legadas)
function construirTablaHtml(filas) {
    if (!filas || filas.length === 0) return '';
    
    const columnas = Object.keys(filas[0]);
    
    let thead = '';
    columnas.forEach(col => {
        const label = col.replace(/_/g, ' ').toUpperCase();
        thead += `<th class="px-4 py-2 text-left font-bold text-[10px] tracking-widest text-slate-500 uppercase">${label}</th>`;
    });
    
    let tbody = '';
    filas.forEach((fila, index) => {
        let rowHtml = '';
        columnas.forEach(col => {
            let valor = fila[col];
            if (valor === null || valor === undefined) {
                valor = '<span class="text-slate-400 italic">null</span>';
            } else if (typeof valor === 'boolean') {
                valor = valor ? '<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">SÍ</span>' : '<span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold text-[10px]">NO</span>';
            } else if (!isNaN(valor) && (col.toLowerCase().includes('total') || col.toLowerCase().includes('monto') || col.toLowerCase().includes('precio') || col.toLowerCase().includes('saldo') || col.toLowerCase().includes('subtotal') || col.toLowerCase().includes('costo'))) {
                valor = `Bs. ${parseFloat(valor).toFixed(2)}`;
            } else if (typeof valor === 'string' && (valor.includes('T') && valor.includes('Z') && !isNaN(Date.parse(valor)))) {
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

// Formateador robusto de Markdown (Tablas, Negritas y viñetas) para renderizar amigablemente
function formatMarkdown(text) {
    if (!text) return '';
    let formatted = escapeHTML(text);
    
    // 1. Parsear tablas de Markdown (| Col 1 | Col 2 |)
    const lines = formatted.split('\n');
    let inTable = false;
    let tableHeaders = [];
    let tableRows = [];
    let processedLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        // Detectar si la línea es parte de una tabla Markdown
        if (line.startsWith('|') && line.endsWith('|')) {
            // Extraer las celdas removiendo la primera y la última barra vacías
            let cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            
            if (!inTable) {
                inTable = true;
                tableHeaders = cells;
                // Ignorar la línea divisoria (---)
                if (i + 1 < lines.length && lines[i+1].trim().startsWith('|') && lines[i+1].includes('---')) {
                    i++;
                }
            } else {
                tableRows.push(cells);
            }
        } else {
            if (inTable) {
                processedLines.push(construirTablaHtmlDesdeMarkdown(tableHeaders, tableRows));
                inTable = false;
                tableHeaders = [];
                tableRows = [];
            }
            processedLines.push(line);
        }
    }
    if (inTable) {
        processedLines.push(construirTablaHtmlDesdeMarkdown(tableHeaders, tableRows));
    }

    formatted = processedLines.join('\n');

    // 2. Negrita (**texto**)
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 3. Viñetas (* item o - item)
    const linesFinal = formatted.split('\n');
    let inList = false;
    const finalLines = linesFinal.map(line => {
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

// Helper para construir tablas HTML dinámicas a partir del parsing de Markdown
function construirTablaHtmlDesdeMarkdown(headers, rows) {
    if (!headers || headers.length === 0) return '';
    
    let thead = '<tr>';
    headers.forEach(h => {
        thead += `<th class="px-4 py-2 text-left font-bold text-[10px] tracking-widest text-slate-500 uppercase">${h}</th>`;
    });
    thead += '</tr>';

    let tbody = '';
    rows.forEach((row, index) => {
        let tr = '';
        row.forEach(cell => {
            tr += `<td class="px-4 py-2 font-medium">${cell}</td>`;
        });
        const rowClass = index % 2 === 0 ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50 hover:bg-slate-100/50';
        tbody += `<tr class="${rowClass} transition-colors border-b border-slate-100">${tr}</tr>`;
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
