// frontend/js/produccion.js

let recetasGlobal = [];
let carritoProduccion = []; // Array de { receta_id, nombre, cantidad }
let insumosAuditoria = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarRecetas();
    cargarOrdenes();
    cargarInsumosAuditoria();
    cargarAuditorias();
});

// === TABS SYSTEM ===
function switchTab(tabId) {
    const tabs = ['plan', 'vales', 'auditoria'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const sec = document.getElementById(`sec-${t}`);
        
        if (t === tabId) {
            btn.classList.remove('text-slate-600', 'hover:bg-slate-50');
            btn.classList.add('text-orange-600', 'bg-orange-50');
            sec.classList.remove('hidden');
        } else {
            btn.classList.remove('text-orange-600', 'bg-orange-50');
            btn.classList.add('text-slate-600', 'hover:bg-slate-50');
            sec.classList.add('hidden');
        }
    });

    if (tabId === 'vales') {
        cargarOrdenes();
    } else if (tabId === 'auditoria') {
        cargarInsumosAuditoria();
        cargarAuditorias();
    }
}

// === PLAN DE PRODUCCIÓN ===
async function cargarRecetas() {
    try {
        const res = await fetch('/api/produccion/recetas');
        if (!res.ok) throw new Error('Error al cargar recetas');
        recetasGlobal = await res.json();
        
        const select = document.getElementById('selRecetas');
        select.innerHTML = '<option value="">-- Selecciona una receta --</option>';
        recetasGlobal.forEach(r => {
            select.innerHTML += `<option value="${r.id}">${r.nombre} (${r.producto_nombre})</option>`;
        });
    } catch (error) {
        console.error(error);
        alert('No se pudieron cargar las recetas: ' + error.message);
    }
}

function agregarAlCarritoProduccion() {
    const select = document.getElementById('selRecetas');
    const cantidadInput = document.getElementById('inpCantidadReceta');
    
    const recetaId = parseInt(select.value);
    const cantidad = parseFloat(cantidadInput.value);

    if (!recetaId || isNaN(cantidad) || cantidad <= 0) {
        alert('Por favor, selecciona una receta y especifica una cantidad válida.');
        return;
    }

    const receta = recetasGlobal.find(r => r.id === recetaId);
    
    // Verificar si ya existe en el carrito
    const existe = carritoProduccion.find(item => item.receta_id === recetaId);
    if (existe) {
        existe.cantidad += cantidad;
    } else {
        carritoProduccion.push({
            receta_id: recetaId,
            nombre: receta.nombre,
            cantidad: cantidad
        });
    }

    select.value = '';
    cantidadInput.value = '1';
    
    renderizarCarrito();
    calcularExplosion();
}

function removerDelCarrito(recetaId) {
    carritoProduccion = carritoProduccion.filter(item => item.receta_id !== recetaId);
    renderizarCarrito();
    calcularExplosion();
}

function renderizarCarrito() {
    const tbody = document.getElementById('tabla-carrito-body');
    tbody.innerHTML = '';

    if (carritoProduccion.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">No hay productos agregados al plan de producción.</td></tr>`;
        return;
    }

    carritoProduccion.forEach(item => {
        tbody.innerHTML += `
            <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="py-3 px-4 text-slate-800 font-bold text-sm">${item.nombre}</td>
                <td class="py-3 px-4 text-center text-slate-900 font-black text-sm">${item.cantidad} unidad(es)</td>
                <td class="py-3 px-4 text-right">
                    <button onclick="removerDelCarrito(${item.receta_id})" class="text-slate-400 hover:text-red-500 hover:bg-red-55 w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

async function calcularExplosion() {
    const contenedor = document.getElementById('contenedor-explosion');
    
    if (carritoProduccion.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-12 text-slate-400 italic">
                <i class="fa-solid fa-wand-magic-sparkles text-3xl text-slate-300 mb-2 block"></i>
                Agrega productos al plan para ver la explosión de ingredientes en tiempo real.
            </div>
        `;
        return;
    }

    contenedor.innerHTML = `
        <div class="text-center py-12 text-slate-400">
            <i class="fa-solid fa-spinner fa-spin text-2xl text-orange-500 mb-2 block"></i>
            Calculando explosión de ingredientes...
        </div>
    `;

    try {
        const res = await fetch('/api/produccion/explosion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recetas: carritoProduccion })
        });
        if (!res.ok) throw new Error('Error al calcular explosión');
        const data = await res.json();

        contenedor.innerHTML = '';
        if (data.length === 0) {
            contenedor.innerHTML = `<p class="text-center py-6 text-slate-400 italic">Las recetas seleccionadas no tienen ingredientes declarados.</p>`;
            return;
        }

        data.forEach(item => {
            const req = parseFloat(item.cantidad_requerida);
            const central = parseFloat(item.stock_central);
            const pasteleria = parseFloat(item.stock_pasteleria);
            const faltante = central < req;
            
            const badgeCls = faltante ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-600 border-slate-100';
            
            contenedor.innerHTML += `
                <div class="p-3 border rounded-xl shadow-sm flex flex-col gap-2 transition-all hover:border-orange-200 ${faltante ? 'border-red-200 bg-red-50/10' : 'border-slate-200 bg-white'}">
                    <div class="flex justify-between items-start">
                        <span class="font-bold text-slate-800 text-sm truncate max-w-[180px]">${item.nombre}</span>
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-black border uppercase ${badgeCls}">
                            ${faltante ? '<i class="fa-solid fa-triangle-exclamation mr-1 text-red-500"></i> Central Insuficiente' : 'Stock OK'}
                        </span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center text-[10px] mt-1 pt-1.5 border-t border-slate-100">
                        <div>
                            <span class="text-slate-400 block font-semibold">Requerido</span>
                            <span class="font-black text-slate-800 font-mono text-[11px]">${req.toFixed(2)} ${item.unidad_medida}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block font-semibold">En Central</span>
                            <span class="font-bold font-mono text-[11px] ${faltante ? 'text-red-600 font-black' : 'text-slate-700'}">${central.toFixed(2)} ${item.unidad_medida}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block font-semibold">En Pastelería</span>
                            <span class="font-bold font-mono text-[11px] text-slate-700">${pasteleria.toFixed(2)} ${item.unidad_medida}</span>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        contenedor.innerHTML = `<div class="p-4 text-center text-red-500 font-bold text-xs">Error al cargar explosión: ${error.message}</div>`;
    }
}

async function guardarOrdenProduccion() {
    if (carritoProduccion.length === 0) {
        alert('El plan de producción está vacío. Añade productos antes de guardar.');
        return;
    }

    const obs = document.getElementById('txtObservacionesPlan').value.trim();
    const usuarioId = localStorage.getItem('usuario_id');

    try {
        const res = await fetch('/api/produccion/orden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: usuarioId,
                observaciones: obs,
                detalles: carritoProduccion
            })
        });

        if (!res.ok) throw new Error((await res.json()).error);
        
        alert('¡Orden de producción registrada con éxito! Pendiente de aprobación de transferencia.');
        
        // Limpiar
        carritoProduccion = [];
        document.getElementById('txtObservacionesPlan').value = '';
        renderizarCarrito();
        calcularExplosion();
        
        // Cambiar a la pestaña de vales
        switchTab('vales');
    } catch (error) {
        alert('Error al guardar orden: ' + error.message);
    }
}

// === VALES DE TRANSFERENCIA ===
async function cargarOrdenes() {
    const tbody = document.getElementById('tabla-ordenes-body');
    try {
        const res = await fetch('/api/produccion/ordenes');
        if (!res.ok) throw new Error('Error al cargar órdenes');
        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic">No hay órdenes de producción registradas.</td></tr>`;
            return;
        }

        data.forEach(ord => {
            const detallesList = ord.detalles.map(d => `<span class="inline-block bg-slate-100 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded mr-1">${d.receta_nombre} (x${d.cantidad})</span>`).join(' ');
            
            let statusCls = 'bg-slate-100 text-slate-700 border-slate-200';
            if (ord.estado === 'APROBADA') statusCls = 'bg-green-100 text-green-700 border-green-200';
            else if (ord.estado === 'RECHAZADA') statusCls = 'bg-red-100 text-red-700 border-red-200';

            let actions = '';
            if (ord.estado === 'PENDIENTE') {
                actions = `
                    <div class="flex gap-1.5 justify-end solo-admin">
                        <button onclick="aprobarOrden(${ord.id}, false)" class="bg-green-600 hover:bg-green-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1">
                            <i class="fa-solid fa-circle-check"></i> Transferir
                        </button>
                        <button onclick="rechazarOrden(${ord.id})" class="bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[10px] px-2 py-1.5 rounded-lg transition-all">
                            <i class="fa-solid fa-circle-xmark"></i> Rechazar
                        </button>
                    </div>
                `;
            } else {
                actions = `<span class="text-slate-400 font-semibold italic text-[11px]">Procesado</span>`;
            }

            tbody.innerHTML += `
                <tr class="border-b border-slate-100 hover:bg-slate-50/30 transition-colors">
                    <td class="py-3 px-4 font-mono font-bold text-slate-500">#${ord.id.toString().padStart(5, '0')}</td>
                    <td class="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">${ord.fecha_formateada}</td>
                    <td class="py-3 px-4 text-slate-700 text-xs font-semibold">${ord.solicitante || 'Pastelería'}</td>
                    <td class="py-3 px-4 max-w-xs break-words">${detallesList}</td>
                    <td class="py-3 px-4 text-slate-500 text-xs max-w-xs truncate" title="${ord.observaciones || ''}">${ord.observaciones || '-'}</td>
                    <td class="py-3 px-4">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-black border uppercase ${statusCls}">${ord.estado}</span>
                    </td>
                    <td class="py-3 px-4 text-right">${actions}</td>
                </tr>
            `;
        });
        
        // Re-ejecutar el ocultado del security guard si el usuario no es admin
        if (typeof window.reapplySecurityGuardStyles === 'function') {
            window.reapplySecurityGuardStyles();
        } else {
            const rol = localStorage.getItem('usuario_rol') ? localStorage.getItem('usuario_rol').toUpperCase() : '';
            const isAdmin = rol === 'ADMINISTRADOR' || rol === 'ADMIN';
            if (!isAdmin) {
                document.querySelectorAll('.solo-admin').forEach(el => el.style.display = 'none');
            }
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-500 font-bold">Error al cargar historial: ${error.message}</td></tr>`;
    }
}

async function aprobarOrden(id, force) {
    const confirmacion = confirm(`¿Estás seguro de que deseas aprobar el vale de producción #${id.toString().padStart(5, '0')} y transferir los insumos del Almacén Central a Pastelería?`);
    if (!confirmacion) return;

    try {
        const res = await fetch(`/api/produccion/ordenes/${id}/aprobar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: force })
        });

        const data = await res.json();
        if (!res.ok) {
            // Si el error es de stock insuficiente, ofrecer la opción de forzar transferencia
            if (data.error && data.error.includes('Stock insuficiente') && !force) {
                const forzar = confirm(`⚠️ ${data.error}\n\n¿Deseas FORZAR la transferencia a pesar del stock insuficiente del Central? (El stock en Central podría quedar negativo).`);
                if (forzar) {
                    await aprobarOrden(id, true);
                }
                return;
            }
            throw new Error(data.error || 'No se pudo aprobar');
        }

        alert('¡Vale de transferencia aprobado exitosamente!');
        cargarOrdenes();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function rechazarOrden(id) {
    const confirmacion = confirm(`¿Estás seguro de que deseas RECHAZAR la orden de producción #${id.toString().padStart(5, '0')}?`);
    if (!confirmacion) return;

    try {
        const res = await fetch(`/api/produccion/ordenes/${id}/rechazar`, {
            method: 'PUT'
        });
        if (!res.ok) throw new Error('Error al rechazar la orden');
        
        alert('Orden rechazada.');
        cargarOrdenes();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// === AUDITORÍA DE MASAS ===
async function cargarInsumosAuditoria() {
    const tbody = document.getElementById('tabla-auditoria-body');
    try {
        const res = await fetch('/api/produccion/auditoria/insumos');
        if (!res.ok) throw new Error('Error al cargar insumos');
        insumosAuditoria = await res.json();

        tbody.innerHTML = '';
        if (insumosAuditoria.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 italic">No hay insumos registrados en el Almacén Pastelería.</td></tr>`;
            return;
        }

        insumosAuditoria.forEach(item => {
            const teorico = parseFloat(item.stock_teorico);
            tbody.innerHTML += `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td class="px-4 py-3 text-slate-800 font-bold text-sm">${item.nombre}</td>
                    <td class="px-4 py-3 text-center font-bold text-slate-600 font-mono">${teorico.toFixed(2)} ${item.unidad_medida}</td>
                    <td class="px-4 py-3 text-center">
                        <div class="inline-flex items-center rounded-lg border border-slate-200 overflow-hidden shadow-sm bg-white">
                            <input type="number" id="real-${item.id}" value="${teorico.toFixed(2)}" min="0" step="0.01" 
                                oninput="calcularDiferenciaAuditoria(${item.id}, ${teorico})"
                                class="w-24 text-center text-sm outline-none bg-white font-bold h-8 text-slate-800">
                            <span class="bg-slate-50 text-slate-400 font-semibold px-2 py-1 text-xs border-l border-slate-100">${item.unidad_medida}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right font-black font-mono text-sm" id="diff-${item.id}">0.00</td>
                </tr>
            `;
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-red-500 font-bold">Error al cargar insumos: ${error.message}</td></tr>`;
    }
}

function calcularDiferenciaAuditoria(id, teorico) {
    const realInput = document.getElementById(`real-${id}`);
    const diffCell = document.getElementById(`diff-${id}`);
    
    const real = parseFloat(realInput.value) || 0;
    const diff = real - teorico;

    diffCell.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;

    if (diff < 0) {
        diffCell.className = "px-4 py-3 text-right font-black font-mono text-sm text-red-600";
    } else if (diff > 0) {
        diffCell.className = "px-4 py-3 text-right font-black font-mono text-sm text-green-600";
    } else {
        diffCell.className = "px-4 py-3 text-right font-black font-mono text-sm text-slate-400";
    }
}

async function guardarAuditoriaPasteleria() {
    const ajustes = [];
    
    insumosAuditoria.forEach(item => {
        const inputReal = document.getElementById(`real-${item.id}`);
        const realVal = parseFloat(inputReal.value);
        
        if (!isNaN(realVal)) {
            ajustes.push({
                insumo_id: item.id,
                cantidad_real: realVal
            });
        }
    });

    if (ajustes.length === 0) {
        alert('No hay insumos para auditar.');
        return;
    }

    const obs = document.getElementById('txtObservacionesAuditoria').value.trim();
    const usuarioId = localStorage.getItem('usuario_id');

    const confirmacion = confirm(`¿Deseas guardar la auditoría física del Almacén Pastelería? Se reajustarán los stocks teóricos con el valor de la balanza.`);
    if (!confirmacion) return;

    try {
        const res = await fetch('/api/produccion/auditoria', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: usuarioId,
                observaciones: obs,
                ajustes: ajustes
            })
        });

        if (!res.ok) throw new Error('Error en el servidor al guardar auditoría');

        alert('¡Auditoría física registrada con éxito! Los stocks teóricos en Pastelería han sido ajustados.');
        
        document.getElementById('txtObservacionesAuditoria').value = '';
        cargarInsumosAuditoria();
        cargarAuditorias();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function cargarAuditorias() {
    const listContainer = document.getElementById('auditorias-historial-lista');
    try {
        const res = await fetch('/api/produccion/auditorias');
        if (!res.ok) throw new Error('Error al cargar historial de auditorías');
        const data = await res.json();

        listContainer.innerHTML = '';
        if (data.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-12 text-slate-400 italic">No hay auditorías registradas.</div>`;
            return;
        }

        data.forEach(aud => {
            const mermasList = aud.detalles
                .filter(d => parseFloat(d.diferencia) !== 0)
                .map(d => {
                    const diff = parseFloat(d.diferencia);
                    const color = diff < 0 ? 'text-red-600' : 'text-green-600';
                    const sign = diff > 0 ? '+' : '';
                    return `<div class="flex justify-between text-[11px] font-semibold py-0.5 border-b border-slate-50">
                        <span class="text-slate-600">${d.insumo_name || d.insumo_nombre}</span>
                        <span class="${color}">${sign}${diff.toFixed(2)} ${d.unidad_medida}</span>
                    </div>`;
                }).join('');

            listContainer.innerHTML += `
                <div class="p-4 border border-slate-200 rounded-xl bg-white shadow-sm space-y-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-slate-800 text-xs font-black block">Auditoría #${aud.id.toString().padStart(5, '0')}</span>
                            <span class="text-slate-400 text-[10px] font-bold block">${aud.fecha_formateada}</span>
                        </div>
                        <span class="text-slate-600 text-[11px] font-bold bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">${aud.auditor || 'Administrador'}</span>
                    </div>
                    ${aud.observaciones ? `<p class="text-[11px] text-slate-500 italic bg-slate-50/50 p-2 rounded-lg border border-dashed border-slate-200">${aud.observaciones}</p>` : ''}
                    <div class="space-y-1">
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Desviaciones y Mermas</span>
                        ${mermasList || '<div class="text-[10px] text-slate-400 italic py-1">Sin desviaciones (Stock Perfecto)</div>'}
                    </div>
                </div>
            `;
        });
    } catch (error) {
        listContainer.innerHTML = `<div class="p-4 text-center text-red-500 font-bold text-xs">Error al cargar historial: ${error.message}</div>`;
    }
}
