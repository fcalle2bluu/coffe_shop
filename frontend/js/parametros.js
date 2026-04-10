document.addEventListener('DOMContentLoaded', () => {
    cargarParametros();
    cargarUsuarios(); // <--- Cargar lista de usuarios al inicio

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
            row.className = "hover:bg-gray-50 transition-colors";
            
            const badgeClass = u.rol === 'ADMINISTRADOR' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
            const statusClass = u.activo ? 'text-green-500' : 'text-gray-300';
            const statusIcon = u.activo ? 'fa-toggle-on' : 'fa-toggle-off';

            row.innerHTML = `
                <td class="px-2 py-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">${u.nombre.charAt(0)}</div>
                        <div>
                            <p class="font-bold text-gray-800">${u.nombre}</p>
                            <p class="text-[10px] text-gray-400">@${u.username}</p>
                        </div>
                    </div>
                </td>
                <td class="px-2 py-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${badgeClass}">${u.rol}</span>
                </td>
                <td class="px-2 py-3 text-right">
                    <div class="flex items-center justify-end gap-3 text-lg">
                        <button onclick="toggleEstadoUser(${u.id}, ${u.activo})" class="${statusClass} hover:opacity-80 transition-opacity" title="Ajustar estado">
                            <i class="fa-solid ${statusIcon}"></i>
                        </button>
                        <button onclick="eliminarUser(${u.id})" class="text-gray-300 hover:text-red-500 transition-colors" title="Eliminar">
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