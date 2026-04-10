document.addEventListener('DOMContentLoaded', () => {
    cargarParametros();
    cargarUsuarios(); 
    cargarHistorial(); // <--- NUEVO: Cargar bitácora de accesos
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
        document.getElementById(map.id).addEventListener('input', (e) => {
            document.getElementById(map.prevId).innerText = e.target.value;
        });
    });

    // Listener especial para el símbolo de moneda (se repite en varios lados)
    document.getElementById('inpMoneda').addEventListener('input', (e) => {
        const monedaTags = document.querySelectorAll('.prev-moneda');
        monedaTags.forEach(tag => tag.innerText = e.target.value);
    });
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

// ==========================================
// GESTIÓN DE USUARIOS
// ==========================================

async function cargarUsuarios() {
    try {
        const res = await fetch('/api/parametros/usuarios');
        const data = await res.json();
        const container = document.getElementById('lista-usuarios');
        container.innerHTML = '';

        data.forEach(u => {
            const row = document.createElement('tr');
            row.className = "group hover:bg-slate-50/80 transition-all duration-200 cursor-default";
            
            // Colores por Rol
            let badgeClass = 'bg-slate-100 text-slate-600';
            if (u.rol === 'ADMIN') badgeClass = 'bg-indigo-50 text-indigo-600 border border-indigo-100';
            if (u.rol === 'CAJERO') badgeClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
            if (u.rol === 'ALMACEN') badgeClass = 'bg-amber-50 text-amber-600 border border-amber-100';

            const statusLabel = u.activo ? 'Operativo' : 'Suspendido';
            const statusColor = u.activo ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 bg-slate-50';
            const toggleIcon = u.activo ? 'fa-toggle-on text-indigo-600' : 'fa-toggle-off text-slate-300';

            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm shadow-sm group-hover:bg-white transition-colors">
                            ${u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p class="font-bold text-slate-900 leading-none mb-1 text-sm">${u.nombre}</p>
                            <p class="text-[10px] text-slate-400 font-medium tracking-wide italic">@${u.username}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${badgeClass}">${u.rol}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold ${statusColor}">
                        <i class="fa-solid fa-circle text-[6px]"></i>
                        ${statusLabel}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-4">
                        <button onclick="toggleEstadoUser(${u.id}, ${u.activo})" class="text-2xl transition-all hover:scale-110 active:scale-95" title="Cambiar Estado">
                            <i class="fa-solid ${toggleIcon}"></i>
                        </button>
                        <button onclick="eliminarUser(${u.id})" class="text-slate-300 hover:text-rose-500 transition-all hover:rotate-12" title="Eliminar Acceso">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                </td>
            `;
            container.appendChild(row);
        });
    } catch (error) {
        console.error("Error cargando usuarios:", error);
    }
}

function abrirModalUsuario() {
    document.getElementById('modalUsuario').classList.remove('hidden');
}

function cerrarModalUsuario() {
    document.getElementById('modalUsuario').classList.add('hidden');
    // Limpiar campos
    ['userNombre', 'userUsername', 'userPin'].forEach(id => document.getElementById(id).value = '');
}

async function guardarNuevoUsuario() {
    const nombre = document.getElementById('userNombre').value.trim();
    const username = document.getElementById('userUsername').value.trim();
    const pin = document.getElementById('userPin').value.trim();
    const rol = document.getElementById('userRol').value;

    if (!nombre || !username || !pin || !rol) {
        return alert("⚠️ Todos los campos son obligatorios.");
    }

    const btn = document.getElementById('btnGuardarUser');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const res = await fetch('/api/parametros/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, username, pin, rol })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Error al crear usuario");
        }

        cerrarModalUsuario();
        cargarUsuarios();
    } catch (error) {
        alert("🚨 " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Crear Usuario';
    }
}

async function toggleEstadoUser(id, estadoActual) {
    try {
        await fetch(`/api/parametros/usuarios/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: !estadoActual })
        });
        cargarUsuarios();
    } catch (error) {
        alert("Error al cambiar estado");
    }
}

async function eliminarUser(id) {
    if (!confirm("¿Estás seguro de eliminar este usuario? Perderá el acceso de inmediato.")) return;

    try {
        await fetch(`/api/parametros/usuarios/${id}`, { method: 'DELETE' });
        cargarUsuarios();
    } catch (error) {
        alert("Error al eliminar usuario");
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
                        <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px]">
                            ${h.usuario.charAt(0).toUpperCase()}
                        </div>
                        <span class="font-bold text-slate-700 text-sm">${h.usuario}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-slate-500 text-xs font-medium">
                    <i class="fa-regular fa-calendar-check mr-1 opacity-50"></i> ${h.fecha_formateada}
                </td>
                <td class="px-6 py-4 text-xs font-mono text-slate-400">
                    <div class="flex flex-col">
                        <span class="text-slate-600 font-bold"><i class="fa-solid fa-mobile-screen-button mr-1 text-[10px]"></i> ${deviceName}</span>
                        <span class="text-[9px] opacity-70">IP: ${h.ip}</span>
                    </div>
                </td>
            `;
            container.appendChild(row);
        });
    } catch (error) {
        console.error("Error cargando historial:", error);
    }
}

function detectarDispositivo(ua) {
    if (!ua) return 'Desconocido';
    if (ua.includes('Windows')) return 'PC (Windows)';
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Móvil (Android)';
    if (ua.includes('Macintosh')) return 'MacBook / iMac';
    if (ua.includes('Linux')) return 'PC (Linux)';
    return 'Navegador Web';
}