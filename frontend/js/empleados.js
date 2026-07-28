let listaUsuariosLocal = [];
const pinsRevelados = {};

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar mes y año actual en la planilla en hora de Bolivia
    const ahora = new Date();
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const horaBolivia = new Date(utc + (3600000 * -4));
    
    const filtroMes = document.getElementById('filtroMes');
    const filtroAnio = document.getElementById('filtroAnio');
    if (filtroMes) filtroMes.value = horaBolivia.getMonth() + 1;
    if (filtroAnio) filtroAnio.value = horaBolivia.getFullYear();

    cargarUsuarios();
});

// --- CAMBIAR ENTRE DIRECTORIO Y PAGO DE SALARIOS ---
function cambiarSeccion(seccion) {
    const btnDirectorio = document.getElementById('tab-btn-directorio');
    const btnPagos = document.getElementById('tab-btn-pagos');
    const secDirectorio = document.getElementById('seccion-directorio');
    const secPagos = document.getElementById('seccion-pagos');

    if (seccion === 'directorio') {
        btnDirectorio.className = "flex-1 md:flex-none py-3 px-6 text-sm font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-100";
        btnPagos.className = "flex-1 md:flex-none py-3 px-6 text-sm font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100";
        secDirectorio.classList.remove('hidden');
        secPagos.classList.add('hidden');
        cargarUsuarios();
    } else {
        btnPagos.className = "flex-1 md:flex-none py-3 px-6 text-sm font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 bg-emerald-600 text-white shadow-md shadow-emerald-100";
        btnDirectorio.className = "flex-1 md:flex-none py-3 px-6 text-sm font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100";
        secDirectorio.classList.add('hidden');
        secPagos.classList.remove('hidden');
        cargarConfiguracionDescuentos();
        cargarPlanillaSalarios();
    }
}

// --- GESTIÓN DE COLABORADORES (CRUD) ---
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
            container.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-300 italic">No hay colaboradores registrados</td></tr>';
            return;
        }

        data.forEach(u => {
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition-colors group text-sm font-semibold";

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

            const isRevealed = !!pinsRevelados[u.id];
            const pinDisplay = isRevealed ? u.pin : '••••';
            const eyeIconClass = isRevealed ? 'fa-solid fa-eye-slash text-xs' : 'fa-solid fa-eye text-xs';

            // Foto / Avatar
            const fotoHtml = u.foto_url
                ? `<img src="${u.foto_url}" class="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-100 shadow-sm">`
                : `<div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-indigo-600 font-bold text-sm shadow-sm group-hover:bg-white transition-colors">${u.nombre.charAt(0).toUpperCase()}</div>`;

            // Identidad y teléfono
            const identidadHtml = `
                <div class="text-center">
                    <p class="font-bold text-slate-800 leading-none mb-1 text-sm">${u.ci || 'S/N'}</p>
                    <p class="text-[10px] text-slate-400 font-medium">${u.telefono || 'S/N'}</p>
                </div>
            `;

            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        ${fotoHtml}
                        <div>
                            <p class="font-bold text-slate-900 leading-none mb-1 text-sm">${u.nombre}</p>
                            <p class="text-[10px] text-slate-400 font-medium tracking-wide italic">@${u.username}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">
                    ${identidadHtml}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${badgeClass}">${u.rol}</span>
                </td>
                <td class="px-6 py-4 text-center font-mono font-bold text-slate-700">
                    ${parseFloat(u.salario || 0).toFixed(2)} Bs.
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
                    <div class="flex items-center justify-end gap-3">
                        <button onclick="abrirModalUsuario(${u.id})" class="text-slate-300 hover:text-indigo-600 transition-all focus:outline-none" title="Editar Perfil">
                            <i class="fa-solid fa-user-pen text-sm"></i>
                        </button>
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
                    <td colspan="8" class="text-center py-10">
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

function abrirModalUsuario(id = null) {
    const title = document.getElementById('modalUserTitle');
    const sub = document.getElementById('modalUserSub');
    const icon = document.getElementById('modalUserIcon');
    const btn = document.getElementById('btnGuardarUser');
    const idInput = document.getElementById('userId');

    // Limpiar campos
    ['userNombre', 'userUsername', 'userPin', 'userCi', 'userTelefono', 'userSalario', 'userFotoUrl'].forEach(field => {
        document.getElementById(field).value = '';
    });
    document.getElementById('userRol').value = 'CAJERO';

    if (id) {
        // Modo Edición
        const u = listaUsuariosLocal.find(user => user.id === id);
        if (!u) return;

        idInput.value = u.id;
        document.getElementById('userNombre').value = u.nombre || '';
        document.getElementById('userUsername').value = u.username || '';
        // El PIN NUNCA se pre-llena: está hasheado en la BD y no se puede
        // ni se debe mostrar. Se deja vacío; si el admin no escribe uno
        // nuevo, el backend conserva el PIN actual del empleado tal cual.
        document.getElementById('userPin').value = '';
        document.getElementById('userCi').value = u.ci || '';
        document.getElementById('userTelefono').value = u.telefono || '';
        document.getElementById('userSalario').value = parseFloat(u.salario || 0);
        document.getElementById('userRol').value = u.rol || 'CAJERO';
        document.getElementById('userFotoUrl').value = u.foto_url || '';

        title.textContent = 'Editar Colaborador';
        sub.textContent = 'Modifica los datos de perfil y salario del empleado.';
        icon.className = 'fa-solid fa-user-pen text-2xl';
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> Guardar Cambios';
        document.getElementById('userPin').placeholder = 'Dejar en blanco para no cambiar';
    } else {
        // Modo Registro
        idInput.value = '';
        title.textContent = 'Registrar Nuevo Empleado';
        sub.textContent = 'Configura el perfil de un colaborador en Café La Paz.';
        icon.className = 'fa-solid fa-user-plus text-2xl';
        btn.innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i> Autorizar Usuario';
        document.getElementById('userPin').placeholder = '****';
    }

    document.getElementById('modalUsuario').classList.remove('hidden');
}

function cerrarModalUsuario() {
    document.getElementById('modalUsuario').classList.add('hidden');
}

async function guardarNuevoUsuario() {
    const id = document.getElementById('userId').value;
    const nombre = document.getElementById('userNombre').value.trim();
    const username = document.getElementById('userUsername').value.trim();
    const pin = document.getElementById('userPin').value.trim();
    const rol = document.getElementById('userRol').value;
    const ci = document.getElementById('userCi').value.trim();
    const telefono = document.getElementById('userTelefono').value.trim();
    const salario = parseFloat(document.getElementById('userSalario').value || 0);
    const foto_url = document.getElementById('userFotoUrl').value.trim();

    if (!nombre || !username || !rol || (!id && !pin)) {
        return alert(id
            ? "⚠️ Nombre, usuario y rol son obligatorios."
            : "⚠️ Nombre, usuario, PIN y rol son obligatorios.");
    }

    const btn = document.getElementById('btnGuardarUser');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

    const url = id ? `/api/parametros/usuarios/${id}` : '/api/parametros/usuarios';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, username, pin, rol, ci, telefono, salario, foto_url })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Error al procesar la solicitud");
        }

        cerrarModalUsuario();
        cargarUsuarios();
    } catch (error) {
        alert("🚨 " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
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
    if (!confirm("¿Estás seguro de eliminar este usuario? Perderá el acceso de inmediato y se eliminarán sus registros vinculados.")) return;

    try {
        const res = await fetch(`/api/parametros/usuarios/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar usuario');
        cargarUsuarios();
    } catch (error) {
        alert("Error al eliminar usuario");
    }
}

// --- PANEL PAGO DE SALARIOS (PLANILLA & NOMINA) ---

// Config y datos base de la planilla actual, guardados en memoria para poder
// recalcular el salario neto en vivo sin tener que volver a golpear el servidor
// cada vez que el admin edita el salario base o los días trabajados de una fila.
let planillaConfigLocal = { descuento_retraso_bloque: 10, descuento_falta_dia: 200, bloque_retraso_minutos: 5 };
let planillaDatosLocal = {}; // usuario_id -> { asistencias_count, minutos_retraso }

async function cargarConfiguracionDescuentos() {
    try {
        const res = await fetch('/api/parametros');
        if (!res.ok) throw new Error('Error al cargar parámetros');
        const data = await res.json();

        document.getElementById('paramDescuentoRetraso').value = parseFloat(data.descuento_retraso_bloque || 10);
        document.getElementById('paramDescuentoFalta').value = parseFloat(data.descuento_falta_dia || 200);
    } catch (error) {
        console.error('Error al cargar parámetros de descuento:', error);
    }
}

async function guardarParametrosDescuento(event) {
    event.preventDefault();
    const btn = document.getElementById('btnGuardarParamDescuento');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Guardando...';

    const descuento_retraso_bloque = parseFloat(document.getElementById('paramDescuentoRetraso').value);
    const descuento_falta_dia = parseFloat(document.getElementById('paramDescuentoFalta').value);

    try {
        // Se preservan sin cambios el resto de los parámetros generales del sistema
        // (nombre de empresa, moneda, impuestos, etc.) que viven en la misma tabla.
        const getRes = await fetch('/api/parametros');
        const currentParams = await getRes.json();

        const res = await fetch('/api/parametros', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...currentParams,
                descuento_retraso_bloque,
                descuento_falta_dia
            })
        });

        if (!res.ok) throw new Error('Error al guardar configuración');
        alert('✅ Configuración de descuentos guardada con éxito.');
        cargarPlanillaSalarios();
    } catch (error) {
        alert('🚨 ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> Guardar Parámetros de Descuento';
    }
}

async function cargarPlanillaSalarios() {
    const mes = document.getElementById('filtroMes').value;
    const anio = document.getElementById('filtroAnio').value;
    const container = document.getElementById('lista-planilla');
    if (!container) return;

    container.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-20 text-slate-300 italic">
                <i class="fa-solid fa-spinner fa-spin text-2xl mb-4 block text-emerald-500"></i>
                Calculando planilla...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`/api/parametros/usuarios/pagos/calcular?mes=${mes}&anio=${anio}`);
        if (!res.ok) throw new Error('Error al calcular planilla');
        const data = await res.json();

        planillaConfigLocal = data.config;
        planillaDatosLocal = {};

        container.innerHTML = '';
        if (data.payroll.length === 0) {
            container.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-300 italic">No hay empleados registrados para procesar nómina</td></tr>';
            return;
        }

        data.payroll.forEach(p => {
            planillaDatosLocal[p.usuario_id] = {
                asistencias_count: p.asistencias_count,
                minutos_retraso: p.minutos_retraso
            };

            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition-colors group text-sm font-semibold";
            row.id = `fila-planilla-${p.usuario_id}`;

            const fotoHtml = p.foto_url
                ? `<img src="${p.foto_url}" class="w-9 h-9 rounded-xl object-cover ring-2 ring-slate-100 shadow-sm">`
                : `<div class="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs shadow-sm">${p.nombre.charAt(0).toUpperCase()}</div>`;

            const pagoBadge = p.pagado
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600" title="${p.pago_detalles?.glosa || ''}"><i class="fa-solid fa-circle-check"></i> Pagado</span>`
                : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-500/10 text-amber-600"><i class="fa-solid fa-clock"></i> Pendiente</span>`;

            let accionHtml = '';
            if (p.pagado) {
                accionHtml = `<button disabled class="bg-slate-100 text-slate-400 px-3 py-1.5 rounded-xl font-bold text-xs cursor-not-allowed">Procesado</button>`;
            } else {
                accionHtml = `<button id="btn-pagar-${p.usuario_id}" onclick="abrirModalPagoDesdeFila(${p.usuario_id}, '${p.nombre.replace(/'/g, "\\'")}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-md shadow-emerald-100 transition-all flex items-center gap-1">
                    <i class="fa-solid fa-cash-register"></i> Pagar
                </button>`;
            }

            const inputsDisabled = p.pagado ? 'disabled' : '';

            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        ${fotoHtml}
                        <div>
                            <p class="font-bold text-slate-900 leading-none mb-1">${p.nombre}</p>
                            <p class="text-[10px] text-slate-400 font-medium">@${p.username}</p>
                        </div>
                    </div>
                </td>
                <td class="px-3 py-3">
                    <div class="w-52 mx-auto space-y-1.5">
                        <div>
                            <label class="block text-[8px] text-slate-400 font-black uppercase tracking-wide mb-0.5">Salario</label>
                            <div class="flex items-center gap-1">
                                <input type="number" step="0.01" min="0" ${inputsDisabled} value="${p.salario_base}" id="input-salario-${p.usuario_id}"
                                    onchange="actualizarCampoPlanilla(${p.usuario_id})"
                                    class="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 text-center font-mono font-bold text-slate-700 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                                <i id="guardado-${p.usuario_id}" class="fa-solid fa-check text-emerald-500 text-[10px] opacity-0 transition-opacity shrink-0"></i>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-1.5">
                            <div>
                                <label class="block text-[8px] text-slate-400 font-black uppercase tracking-wide mb-0.5">Días</label>
                                <input type="number" min="0" ${inputsDisabled} value="${p.dias_trabajados}" id="input-dias-${p.usuario_id}"
                                    onchange="actualizarCampoPlanilla(${p.usuario_id})"
                                    class="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 text-center font-mono font-bold text-slate-700 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                            </div>
                            <div>
                                <label class="block text-[8px] text-slate-400 font-black uppercase tracking-wide mb-0.5">Horas</label>
                                <input type="number" step="0.5" min="0" ${inputsDisabled} value="${p.horas_laborales}" id="input-horas-${p.usuario_id}"
                                    onchange="actualizarCampoPlanilla(${p.usuario_id})"
                                    class="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 text-center font-mono font-bold text-slate-700 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                            </div>
                        </div>
                        <div>
                            <label class="block text-[8px] text-slate-400 font-black uppercase tracking-wide mb-0.5">Entrada</label>
                            <input type="time" ${inputsDisabled} value="${p.hora_entrada}" id="input-entrada-${p.usuario_id}"
                                onchange="actualizarHoraEntrada(${p.usuario_id})"
                                title="Hora de entrada oficial de este empleado (define desde cuándo cuenta como retraso)"
                                class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-mono font-bold text-slate-700 text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                        </div>
                    </div>
                </td>
                <td class="px-3 py-3 text-center font-medium text-xs" id="txt-asist-${p.usuario_id}">${p.asistencias_count} / ${p.dias_trabajados}<br><span class="text-slate-400">(Faltas: ${p.faltas})</span></td>
                <td class="px-3 py-3 text-center font-mono text-rose-600 font-bold text-xs">
                    <div id="txt-descfaltas-${p.usuario_id}">Faltas: -${p.descuento_faltas.toFixed(2)} Bs.</div>
                    <div id="txt-descretrasos-${p.usuario_id}" class="mt-0.5">Retraso (${p.minutos_retraso}min): -${p.descuento_retrasos.toFixed(2)} Bs.</div>
                </td>
                <td class="px-3 py-3 text-center font-mono font-black text-emerald-600 text-base" id="txt-neto-${p.usuario_id}">${p.salario_neto.toFixed(2)} Bs.</td>
                <td class="px-3 py-3 text-center">${pagoBadge}</td>
                <td class="px-3 py-3 text-right">${accionHtml}</td>
            `;
            container.appendChild(row);
        });
    } catch (error) {
        container.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-rose-500 font-bold">⚠️ Error al cargar planilla de salarios: ${error.message}</td></tr>`;
    }
}

// Recalcula en vivo el salario neto de una fila (sin recargar la planilla completa)
// y persiste el cambio (salario base / días trabajados / horas laborales) en la BD.
function recalcularFilaVisual(usuarioId, salarioBase, diasTrabajados) {
    const datos = planillaDatosLocal[usuarioId];
    if (!datos) return null;

    const faltas = Math.max(0, diasTrabajados - datos.asistencias_count);
    const descuentoFaltas = parseFloat((faltas * (planillaConfigLocal.descuento_falta_dia || 0)).toFixed(2));
    const bloqueMin = planillaConfigLocal.bloque_retraso_minutos || 5;
    const bloquesRetraso = datos.minutos_retraso > 0 ? Math.ceil(datos.minutos_retraso / bloqueMin) : 0;
    const descuentoRetrasos = parseFloat((bloquesRetraso * (planillaConfigLocal.descuento_retraso_bloque || 0)).toFixed(2));
    const salarioNeto = Math.max(0, parseFloat((salarioBase - descuentoFaltas - descuentoRetrasos).toFixed(2)));

    document.getElementById(`txt-asist-${usuarioId}`).innerHTML = `${datos.asistencias_count} / ${diasTrabajados}<br><span class="text-slate-400">(Faltas: ${faltas})</span>`;
    document.getElementById(`txt-descfaltas-${usuarioId}`).textContent = `Faltas: -${descuentoFaltas.toFixed(2)} Bs.`;
    document.getElementById(`txt-descretrasos-${usuarioId}`).textContent = `Retraso (${datos.minutos_retraso}min): -${descuentoRetrasos.toFixed(2)} Bs.`;
    document.getElementById(`txt-neto-${usuarioId}`).textContent = `${salarioNeto.toFixed(2)} Bs.`;

    return { faltas, descuentoFaltas, descuentoRetrasos, salarioNeto };
}

async function actualizarCampoPlanilla(usuarioId) {
    const salarioBase = parseFloat(document.getElementById(`input-salario-${usuarioId}`).value) || 0;
    const diasTrabajados = parseInt(document.getElementById(`input-dias-${usuarioId}`).value) || 0;
    const horasLaborales = parseFloat(document.getElementById(`input-horas-${usuarioId}`).value) || 0;

    recalcularFilaVisual(usuarioId, salarioBase, diasTrabajados);

    try {
        const res = await fetch(`/api/parametros/usuarios/${usuarioId}/payroll`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ salario: salarioBase, dias_trabajados: diasTrabajados, horas_laborales: horasLaborales })
        });
        if (!res.ok) throw new Error('Error al guardar');

        const icono = document.getElementById(`guardado-${usuarioId}`);
        if (icono) {
            icono.classList.remove('opacity-0');
            setTimeout(() => icono.classList.add('opacity-0'), 1500);
        }
    } catch (error) {
        alert('🚨 Error al guardar el dato: ' + error.message);
    }
}

// La hora de entrada oficial cambia desde qué instante se cuenta el retraso, así
// que a diferencia del salario/días trabajados no se puede recalcular en el
// navegador: hay que volver a comparar cada marcación real contra la nueva hora
// en el servidor. Por eso aquí se guarda y se refresca toda la planilla.
async function actualizarHoraEntrada(usuarioId) {
    const horaEntrada = document.getElementById(`input-entrada-${usuarioId}`).value;
    if (!horaEntrada) return;

    try {
        const res = await fetch(`/api/parametros/usuarios/${usuarioId}/payroll`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hora_entrada: horaEntrada })
        });
        if (!res.ok) throw new Error('Error al guardar');
        await cargarPlanillaSalarios();
    } catch (error) {
        alert('🚨 Error al guardar la hora de entrada: ' + error.message);
    }
}

// Abre el modal de pago leyendo los valores YA recalculados/guardados de la fila,
// para que el pago siempre refleje el salario base/días trabajados vigentes.
function abrirModalPagoDesdeFila(usuarioId, nombre) {
    const salarioBase = parseFloat(document.getElementById(`input-salario-${usuarioId}`).value) || 0;
    const diasTrabajados = parseInt(document.getElementById(`input-dias-${usuarioId}`).value) || 0;
    const resultado = recalcularFilaVisual(usuarioId, salarioBase, diasTrabajados);
    const datos = planillaDatosLocal[usuarioId] || { minutos_retraso: 0 };

    abrirModalPago(
        usuarioId,
        nombre,
        salarioBase,
        resultado.descuentoRetrasos,
        resultado.descuentoFaltas,
        resultado.salarioNeto,
        datos.minutos_retraso,
        resultado.faltas
    );
}

function abrirModalPago(userId, nombre, salarioBase, descRetrasos, descFaltas, salarioNeto, minutos, faltas) {
    document.getElementById('pagoUserId').value = userId;
    document.getElementById('pagoNombreEmpleado').value = nombre;
    document.getElementById('pagoEmpleadoNombre').textContent = nombre;
    
    const mes = document.getElementById('filtroMes').value;
    const anio = document.getElementById('filtroAnio').value;
    document.getElementById('pagoMes').value = mes;
    document.getElementById('pagoAnio').value = anio;
    
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    document.getElementById('pagoPeriodo').textContent = `${meses[parseInt(mes) - 1]} / ${anio}`;
    
    document.getElementById('pagoSalarioBase').value = salarioBase;
    document.getElementById('pagoDescuentoRetrasos').value = descRetrasos;
    document.getElementById('pagoDescuentoFaltas').value = descFaltas;
    document.getElementById('pagoSalarioNeto').value = salarioNeto;
    
    document.getElementById('txtPagoBase').textContent = `${salarioBase.toFixed(2)} Bs.`;
    document.getElementById('txtPagoRetrasos').textContent = `-${descRetrasos.toFixed(2)} Bs. (${minutos} min)`;
    document.getElementById('txtPagoFaltas').textContent = `-${descFaltas.toFixed(2)} Bs. (${faltas} faltas)`;
    document.getElementById('txtPagoNeto').textContent = `${salarioNeto.toFixed(2)} Bs.`;
    
    const periodoStr = `${meses[parseInt(mes) - 1].toUpperCase()} ${anio}`;
    document.getElementById('pagoGlosa').value = `PAGO DE SALARIO A ${nombre.toUpperCase()} - PERIODO ${periodoStr} (SUELDO NETO CON DESCUENTOS)`;
    
    document.getElementById('modalPago').classList.remove('hidden');
}

function cerrarModalPago() {
    document.getElementById('modalPago').classList.add('hidden');
}

async function confirmarRegistrarPago() {
    const btn = document.getElementById('btnConfirmarPago');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

    const usuario_id = parseInt(document.getElementById('pagoUserId').value);
    const mes = parseInt(document.getElementById('pagoMes').value);
    const anio = parseInt(document.getElementById('pagoAnio').value);
    const salario_base = parseFloat(document.getElementById('pagoSalarioBase').value);
    const descuento_retrasos = parseFloat(document.getElementById('pagoDescuentoRetrasos').value);
    const descuento_faltas = parseFloat(document.getElementById('pagoDescuentoFaltas').value);
    const salario_neto = parseFloat(document.getElementById('pagoSalarioNeto').value);
    const glosa = document.getElementById('pagoGlosa').value.trim();
    const metodo_pago = document.getElementById('pagoMetodo').value;

    if (!glosa) {
        alert('⚠️ Debes ingresar una glosa/descripción contable.');
        btn.disabled = false;
        btn.innerHTML = 'Realizar Pago';
        return;
    }

    try {
        const res = await fetch('/api/parametros/usuarios/pagos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id,
                mes,
                anio,
                salario_base,
                descuento_retrasos,
                descuento_faltas,
                salario_neto,
                glosa,
                metodo_pago
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Error al registrar el pago');
        }

        alert('✅ Salario pagado con éxito y registrado en el Libro Diario.');
        cerrarModalPago();
        cargarPlanillaSalarios();
    } catch (error) {
        alert('🚨 ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Realizar Pago';
    }
}
