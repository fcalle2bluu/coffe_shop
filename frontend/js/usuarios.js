let listaUsuariosLocal = [];
const pinsRevelados = {};

document.addEventListener('DOMContentLoaded', () => {
    cargarUsuarios();
});

async function cargarUsuarios() {
    try {
        const res = await fetch('/api/parametros/usuarios');
        if (!res.ok) throw new Error('Error al conectar con el servidor');
        const data = await res.json();
        
        listaUsuariosLocal = data;
        const container = document.getElementById('lista-usuarios');
        if (!container) return;

        container.innerHTML = '';

        if (data.length === 0) {
            container.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-300 italic">No hay colaboradores registrados</td></tr>';
            return;
        }

        data.forEach(u => {
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition-colors group";

            const badgeClass = u.rol === 'ADMIN' || u.rol === 'ADMINISTRADOR'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                : u.rol === 'ALMACEN' 
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100';

            const statusColor = u.activo ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600';
            const statusLabel = u.activo ? 'Activo' : 'Suspendido';
            const toggleIcon = u.activo ? 'fa-toggle-on text-emerald-500' : 'fa-toggle-off text-slate-300 hover:text-slate-400';

            let permisosHtml = '';
            if (u.rol === 'ADMIN' || u.rol === 'ADMINISTRADOR') {
                permisosHtml = '<span class="text-xs text-indigo-500 font-bold italic"><i class="fa-solid fa-shield-halved mr-1"></i> Acceso Total</span>';
            } else {
                permisosHtml = `
                    <div class="flex flex-wrap items-center justify-center gap-1.5 max-w-md mx-auto">
                        <button onclick="togglePermiso(${u.id}, 'stock')" class="px-2 py-0.5 rounded-lg flex items-center gap-1 border transition-all text-[8px] font-black uppercase tracking-wider ${u.perm_stock ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}" title="Stock">
                            <i class="fa-solid fa-boxes-stacked"></i> Stock
                        </button>
                        <button onclick="togglePermiso(${u.id}, 'compras')" class="px-2 py-0.5 rounded-lg flex items-center gap-1 border transition-all text-[8px] font-black uppercase tracking-wider ${u.perm_compras ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}" title="Compras">
                            <i class="fa-solid fa-cart-flatbed"></i> Compras
                        </button>
                        <button onclick="togglePermiso(${u.id}, 'proveedores')" class="px-2 py-0.5 rounded-lg flex items-center gap-1 border transition-all text-[8px] font-black uppercase tracking-wider ${u.perm_proveedores ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}" title="Proveedores">
                            <i class="fa-solid fa-truck"></i> Prov.
                        </button>
                        <button onclick="togglePermiso(${u.id}, 'auditoria')" class="px-2 py-0.5 rounded-lg flex items-center gap-1 border transition-all text-[8px] font-black uppercase tracking-wider ${u.perm_auditoria ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}" title="Auditoría">
                            <i class="fa-solid fa-clipboard-check"></i> Audit.
                        </button>
                        <button onclick="togglePermiso(${u.id}, 'parametros')" class="px-2 py-0.5 rounded-lg flex items-center gap-1 border transition-all text-[8px] font-black uppercase tracking-wider ${u.perm_parametros ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}" title="Parámetros">
                            <i class="fa-solid fa-gears"></i> Param.
                        </button>
                        <button onclick="togglePermiso(${u.id}, 'informe')" class="px-2 py-0.5 rounded-lg flex items-center gap-1 border transition-all text-[8px] font-black uppercase tracking-wider ${u.perm_informe ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}" title="Informe General">
                            <i class="fa-solid fa-mug-hot"></i> Informes
                        </button>
                    </div>
                `;
            }

            // Conservar el estado revelado anterior si existe
            const isRevealed = !!pinsRevelados[u.id];
            const pinDisplay = isRevealed ? u.pin : '••••';
            const eyeIconClass = isRevealed ? 'fa-solid fa-eye-slash text-xs' : 'fa-solid fa-eye text-xs';

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
                    <div class="inline-flex items-center justify-center bg-slate-50 border border-slate-200/50 rounded-xl px-3 py-1.5">
                        <span id="pin-${u.id}" class="font-mono text-xs text-slate-600 font-bold tracking-widest select-all">${pinDisplay}</span>
                        <button onclick="togglePin(${u.id}, '${u.pin}')" class="text-slate-400 hover:text-indigo-600 transition-colors ml-2.5 focus:outline-none" title="Mostrar/Ocultar PIN">
                            <i id="eye-${u.id}" class="${eyeIconClass}"></i>
                        </button>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    ${permisosHtml}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold ${statusColor}">
                        <i class="fa-solid fa-circle text-[6px]"></i>
                        ${statusLabel}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-4">
                        <button onclick="toggleEstadoUser(${u.id}, ${u.activo})" class="text-2xl transition-all hover:scale-110 active:scale-95 focus:outline-none" title="Cambiar Estado">
                            <i class="fa-solid ${toggleIcon}"></i>
                        </button>
                        <button onclick="eliminarUser(${u.id})" class="text-slate-300 hover:text-rose-500 transition-all hover:rotate-12 focus:outline-none" title="Eliminar Acceso">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                </td>
            `;
            container.appendChild(row);
        });
    } catch (error) {
        console.error("Error cargando usuarios:", error);
        const container = document.getElementById('lista-usuarios');
        if (container) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-10">
                        <p class="text-rose-500 font-bold mb-2">⚠️ Error de conexión al cargar personal</p>
                        <button onclick="cargarUsuarios()" class="text-xs bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200 transition-colors tracking-tight font-black uppercase">Reintentar</button>
                    </td>
                </tr>
            `;
        }
    }
}

function togglePin(userId, pin) {
    const pinSpan = document.getElementById(`pin-${userId}`);
    const eyeIcon = document.getElementById(`eye-${userId}`);
    if (!pinSpan || !eyeIcon) return;
    
    if (pinsRevelados[userId]) {
        pinSpan.textContent = '••••';
        eyeIcon.className = 'fa-solid fa-eye text-xs';
        pinsRevelados[userId] = false;
    } else {
        pinSpan.textContent = pin;
        eyeIcon.className = 'fa-solid fa-eye-slash text-xs';
        pinsRevelados[userId] = true;
    }
}

async function togglePermiso(userId, tipo) {
    const usuario = listaUsuariosLocal.find(u => u.id === userId);
    if (!usuario) return;

    // Alternar el permiso correspondiente
    const campo = 'perm_' + tipo;
    usuario[campo] = !usuario[campo];

    try {
        const res = await fetch(`/api/parametros/usuarios/${userId}/permisos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                perm_stock: usuario.perm_stock,
                perm_compras: usuario.perm_compras,
                perm_proveedores: usuario.perm_proveedores,
                perm_auditoria: usuario.perm_auditoria,
                perm_parametros: usuario.perm_parametros,
                perm_informe: usuario.perm_informe
            })
        });

        if (!res.ok) throw new Error('Error al actualizar permisos');
        
        cargarUsuarios();
    } catch (error) {
        alert("🚨 " + error.message);
    }
}

function abrirModalUsuario() {
    document.getElementById('modalUsuario').classList.remove('hidden');
}

function cerrarModalUsuario() {
    document.getElementById('modalUsuario').classList.add('hidden');
    // Limpiar campos
    ['userNombre', 'userUsername', 'userPin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

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
        btn.innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i> Autorizar Usuario';
    }
}

async function toggleEstadoUser(id, estadoActual) {
    try {
        const res = await fetch(`/api/parametros/usuarios/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: !estadoActual })
        });
        if (!res.ok) throw new Error('Error al alternar estado');
        cargarUsuarios();
    } catch (error) {
        alert("Error al cambiar estado");
    }
}

async function eliminarUser(id) {
    if (!confirm("¿Estás seguro de eliminar este usuario? Perderá el acceso de inmediato.")) return;

    try {
        const res = await fetch(`/api/parametros/usuarios/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar usuario');
        cargarUsuarios();
    } catch (error) {
        alert("Error al eliminar usuario");
    }
}
