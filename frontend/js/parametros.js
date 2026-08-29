document.addEventListener('DOMContentLoaded', () => {
    // La bitácora ya no se carga sola al entrar a la página (queda plegada
    // detrás de un botón, ver toggleBitacora) — solo se pide al servidor
    // cuando alguien realmente la abre.
    cargarParametros().then(() => {
        console.log("🚀 Carga de parámetros completada.");
    });

    // Añadir listeners para que el ticket en vivo se actualice al escribir
    const inputsLive = [
        { id: 'inpEmpresa', prevId: 'prev-empresa' },
        { id: 'inpDoc', prevId: 'prev-doc' },
        { id: 'inpDir', prevId: 'prev-dir' },
        { id: 'inpTel', prevId: 'prev-tel' },
        { id: 'inpMsgSup', prevId: 'prev-msg-sup' },
        { id: 'inpMsgInf', prevId: 'prev-msg-inf' }
    ];

    inputsLive.forEach(map => {
        const el = document.getElementById(map.id);
        if (el) {
            el.addEventListener('input', (e) => {
                const prev = document.getElementById(map.prevId);
                if (prev) prev.innerText = e.target.value;
            });
        }
    });

    // Listener especial para el símbolo de moneda
    const inpMoneda = document.getElementById('inpMoneda');
    if (inpMoneda) {
        inpMoneda.addEventListener('input', (e) => {
            const monedaTags = document.querySelectorAll('.prev-moneda');
            monedaTags.forEach(tag => tag.innerText = e.target.value);
        });
    }
});

async function cargarParametros() {
    try {
        const res = await fetch('/api/parametros');
        const data = await res.json();

        if (data) {
            // Llenar formularios
            document.getElementById('inpEmpresa').value = data.nombre_empresa;
            document.getElementById('inpDoc').value = data.documento_empresa;
            document.getElementById('inpDir').value = data.direccion;
            document.getElementById('inpTel').value = data.telefono;
            document.getElementById('inpMoneda').value = data.moneda;
            document.getElementById('inpImpNombre').value = data.impuesto_nombre;
            document.getElementById('inpImpPorcentaje').value = data.impuesto_porcentaje;
            document.getElementById('inpMsgSup').value = data.mensaje_ticket_superior;
            document.getElementById('inpMsgInf').value = data.mensaje_ticket_inferior;
            document.getElementById('selPapel').value = data.impresora_papel;

            // Disparar evento 'input' para que se actualice el Ticket en Vivo al inicio
            document.getElementById('inpEmpresa').dispatchEvent(new Event('input'));
            document.getElementById('inpDoc').dispatchEvent(new Event('input'));
            document.getElementById('inpDir').dispatchEvent(new Event('input'));
            document.getElementById('inpTel').dispatchEvent(new Event('input'));
            document.getElementById('inpMsgSup').dispatchEvent(new Event('input'));
            document.getElementById('inpMsgInf').dispatchEvent(new Event('input'));
            document.getElementById('inpMoneda').dispatchEvent(new Event('input'));
        }
    } catch (error) {
        console.error("Error al cargar parámetros:", error);
    }
}

async function guardarParametros() {
    const btn = document.getElementById('btnGuardar');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Guardando...';
    btn.disabled = true;

    const payload = {
        nombre_empresa: document.getElementById('inpEmpresa').value,
        documento_empresa: document.getElementById('inpDoc').value,
        direccion: document.getElementById('inpDir').value,
        telefono: document.getElementById('inpTel').value,
        moneda: document.getElementById('inpMoneda').value,
        impuesto_nombre: document.getElementById('inpImpNombre').value,
        impuesto_porcentaje: parseFloat(document.getElementById('inpImpPorcentaje').value) || 0,
        mensaje_ticket_superior: document.getElementById('inpMsgSup').value,
        mensaje_ticket_inferior: document.getElementById('inpMsgInf').value,
        impresora_papel: document.getElementById('selPapel').value
    };

    try {
        const res = await fetch('/api/parametros', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Error al guardar');
        
        alert('✅ ¡Configuración guardada exitosamente!');
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Guardar Cambios';
        btn.disabled = false;
    }
}

// (Gestión de usuarios extraída a usuarios.js)

function toggleBitacora() {
    const panel = document.getElementById('panel-bitacora');
    const icono = document.getElementById('icono-toggle-bitacora');
    if (!panel || !icono) return;

    const seAbre = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    icono.classList.toggle('rotate-180', seAbre);

    if (seAbre) {
        cargarHistorial();
    }
}

async function cargarHistorial() {
    try {
        const res = await fetch('/api/parametros/historial');
        const data = await res.json();
        const container = document.getElementById('lista-historial');
        
        if (!container) return; // Seguridad si el elemento no existe

        container.innerHTML = '';

        if (data.length === 0) {
            container.innerHTML = '<tr><td colspan="3" class="text-center py-10 text-slate-300 italic">No hay registros aún</td></tr>';
            return;
        }

        data.forEach(h => {
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition-colors";
            
            const deviceName = detectarDispositivo(h.dispositivo);
            
            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[10px]">
                            ${h.usuario.charAt(0).toUpperCase()}
                        </div>
                        <span class="font-bold text-slate-700 text-sm">${h.usuario}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-slate-500 text-xs font-semibold italic">
                    <i class="fa-regular fa-clock mr-1 opacity-50"></i> ${h.fecha_formateada}
                </td>
                <td class="px-6 py-4 text-xs">
                    ${(() => {
                        if (!h.ubicacion) {
                            return `
                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 text-slate-400 font-bold border border-slate-100">
                                    <i class="fa-solid fa-location-dot text-[10px]"></i>
                                    Desconocida
                                </span>
                            `;
                        }
                        
                        let text = h.ubicacion;
                        let coords = '';
                        if (h.ubicacion.includes('|')) {
                            const parts = h.ubicacion.split('|');
                            text = parts[0].trim();
                            coords = parts[1].trim();
                        } else {
                            // Check if it's the old coordinates format like "📍 Lat: -16.4948, Lon: -68.1528"
                            const match = h.ubicacion.match(/Lat:\s*([-\d.]+),\s*Lon:\s*([-\d.]+)/i);
                            if (match) {
                                coords = `${match[1]},${match[2]}`;
                                text = "Lugar de Acceso (GPS)";
                            }
                        }
                        
                        if (text.startsWith('📍')) {
                            text = text.substring(2).trim();
                        }
                        
                        const query = coords ? coords : text;
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                        
                        return `
                            <a href="${mapsUrl}" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 font-bold border border-orange-100 hover:bg-orange-100 hover:text-orange-800 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm">
                                <i class="fa-solid fa-map-location-dot text-[11px]"></i>
                                <span>${text}</span>
                            </a>
                        `;
                    })()}
                </td>
                <td class="px-6 py-4 text-xs font-mono text-slate-400">
                    <div class="flex flex-col">
                        <span class="text-slate-600 font-bold"><i class="fa-solid fa-desktop mr-1 text-[10px] text-indigo-400"></i> ${deviceName}</span>
                        ${h.modelo_dispositivo ? `<span class="text-[9px] opacity-70">${h.modelo_dispositivo}${h.so_dispositivo ? ' · ' + h.so_dispositivo : ''}</span>` : ''}
                        ${h.version_app ? `<span class="text-[9px] opacity-70">App v${h.version_app}</span>` : ''}
                        <span class="text-[9px] opacity-70">CONEXIÓN IP: ${h.ip}</span>
                    </div>
                </td>
            `;
            container.appendChild(row);
        });
    } catch (error) {
        console.error("Error cargando historial:", error);
        const container = document.getElementById('lista-historial');
        if (container) {
            container.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-10">
                        <p class="text-rose-500 font-bold mb-2 text-xs">⚠️ No se pudo obtener la bitácora</p>
                        <button onclick="cargarHistorial()" class="text-[10px] bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200 transition-colors font-black uppercase tracking-widest">Reintentar</button>
                    </td>
                </tr>
            `;
        }
    }
}

function detectarDispositivo(ua) {
    if (!ua) return 'Desconocido';
    if (ua.includes('CafeLaPazApp') || ua.includes('CafeLaPazCocinaApp')) return 'Aplicación Móvil';
    
    let browser = 'Web';
    let os = 'Sistema';

    // Detectar Navegador
    if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('Brave')) browser = 'Chrome';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Brave')) browser = 'Brave';

    // Detectar S.O.
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone')) os = 'iOS (iPhone)';
    else if (ua.includes('iPad')) os = 'iOS (iPad)';
    else if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';

    return `${browser} en ${os}`;
}

async function descargarBackupExcel() {
    const btn = document.getElementById('btnDescargarBackup');
    const textEl = document.getElementById('textBackup');
    const spinner = document.getElementById('spinnerBackup');
    
    if (!btn || !textEl || !spinner) return;
    
    btn.disabled = true;
    spinner.classList.remove('hidden');
    textEl.textContent = 'Generando Backup...';
    
    const usuarioId = localStorage.getItem('usuario_id');
    
    try {
        const response = await fetch(`/api/admin/backup/excel?usuario_id=${usuarioId}`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            let errorText = 'Error en el servidor al generar la copia de seguridad.';
            try {
                const errJson = await response.json();
                if (errJson && errJson.error) {
                    errorText = errJson.error;
                }
            } catch (e) {}
            throw new Error(errorText);
        }
        
        const blob = await response.blob();
        
        // Obtenemos el nombre del archivo del header o generamos uno por defecto
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `backup_cafelapaz_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match && match[1]) {
                filename = match[1];
            }
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.removeAttribute('href');
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Error al descargar backup:', error);
        alert('❌ Error al generar la copia de seguridad:\n' + error.message);
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
        textEl.textContent = 'Descargar Backup Completo';
    }
}