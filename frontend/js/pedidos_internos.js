// frontend/js/pedidos_internos.js

const usuarioId = localStorage.getItem('usuario_id');
const usuarioRol = localStorage.getItem('usuario_rol');
let listadoInsumosGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarPedidos();
    cargarInsumosCatalogo();
});

// 1. Cargar la lista de insumos reales para el select del nuevo Pedido
async function cargarInsumosCatalogo() {
    try {
        const res = await fetch('/api/almacen/insumos');
        listadoInsumosGlobal = await res.json();
    } catch(e) {
        console.error("Error al cargar insumos del almacén:", e);
    }
}

// 2. Cargar la lista de pedidos desde el backend
async function cargarPedidos() {
    try {
        const res = await fetch(`/api/pedidos_internos?usuario_id=${usuarioId}&rol=${usuarioRol}`);
        const data = await res.json();
        
        const tbody = document.getElementById('tabla-pedidos');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-500 font-bold">No hay pedidos registrados en este momento.</td></tr>`;
            return;
        }

        let pIdx = 0;
        data.forEach(pedido => {
            pIdx++;
            const delayClass = `delay-${Math.min(pIdx, 12)}`;
            let colorEstado = 'bg-yellow-100 text-yellow-800 border-yellow-200';
            if (pedido.estado === 'COMPRADO') colorEstado = 'bg-green-100 text-green-800 border-green-200';
            if (pedido.estado === 'RECHAZADO') colorEstado = 'bg-red-100 text-red-800 border-red-200';

            let botonesAccion = '<span class="text-xs text-gray-400">-</span>';
            
            if (usuarioRol === 'ADMIN' && pedido.estado === 'PENDIENTE') {
                // Nuevo botón de "Entregar a caja"
                botonesAccion = `
                    <div class="flex justify-center gap-2">
                        <button onclick="abrirModalDespacho(${pedido.id}, '${pedido.insumo_id}', '${pedido.insumo_nombre}', '${pedido.cantidad}', '${pedido.solicitante}', '${pedido.stock_actual}', '${pedido.unidad_medida}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded shadow transition-colors font-bold text-xs btn-bounce" title="Despachar a Caja"><i class="fa-solid fa-people-carry-box mr-1"></i> Despachar</button>
                        <button onclick="cambiarEstado(${pedido.id}, 'RECHAZADO')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded shadow transition-colors text-xs btn-bounce" title="Rechazar Pedido"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                `;
            } else if (usuarioRol === 'CAJERO' && pedido.estado === 'PENDIENTE') {
                botonesAccion = `
                    <button onclick="eliminarPedido(${pedido.id})" class="text-red-500 hover:text-red-700 font-bold p-1 btn-bounce"><i class="fa-solid fa-trash-can"></i> Eliminar</button>
                `;
            }

            const colSolicitante = usuarioRol === 'ADMIN' ? `<p class="text-xs text-gray-400 mb-1">Cajero: <span class="font-bold text-gray-700">${pedido.solicitante}</span></p>` : '';
            const cantidadVisual = `${pedido.cantidad} <span class="text-xs text-gray-500">${pedido.unidad_medida || 'unid'}</span>`;

            let imgSeccion = '';
            if (pedido.imagen_url && pedido.imagen_url.trim() !== '') {
                imgSeccion = `
                    <div class="mb-3 relative rounded-lg overflow-hidden border border-gray-100 h-24 bg-slate-50">
                        <img src="${pedido.imagen_url}" class="w-full h-full object-cover" alt="Foto de respaldo">
                        <a href="${pedido.imagen_url}" target="_blank" class="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] px-2 py-1 rounded-md transition-colors flex items-center gap-1 font-bold btn-bounce">
                            <i class="fa-solid fa-up-right-from-square"></i> Ampliar
                        </a>
                    </div>
                `;
            }

            tbody.innerHTML += `
                <div class="animate-fade-in-up ${delayClass} bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            ${colSolicitante}
                            <h3 class="font-bold text-gray-950 text-lg leading-tight mb-1">${pedido.insumo_nombre}</h3>
                            <div class="text-2xl font-black text-orange-600">${cantidadVisual}</div>
                        </div>
                        <span class="px-2 py-1 rounded-md text-[10px] font-black tracking-wide border ${colorEstado} uppercase shadow-sm">
                            ${pedido.estado}
                        </span>
                    </div>
                    
                    ${imgSeccion}
                    
                    <div class="bg-gray-50 rounded p-2 text-sm italic text-gray-600 mb-3 border border-gray-100 flex items-start">
                        <i class="fa-solid fa-note-sticky text-orange-400 mt-1 mr-2"></i>
                        <span>${pedido.notas || 'Sin notas especiales'}</span>
                    </div>
                    
                    <div class="flex justify-between items-center pt-3 border-t border-gray-100">
                        <span class="text-xs text-gray-400"><i class="fa-regular fa-clock mr-1"></i>${pedido.fecha_pedido}</span>
                        <div class="flex gap-2">
                            ${botonesAccion}
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) { 
        console.error("Error al cargar pedidos:", e); 
    }
}

// 3. UI del Cajero: Solicitud
function abrirModalNuevo() {
    const select = document.getElementById('inpInsumo');
    select.innerHTML = '<option value="">-- Selecciona el insumo --</option>';
    
    listadoInsumosGlobal.forEach(ins => {
        select.innerHTML += `<option value="${ins.id}" data-unidad="${ins.unidad_medida}">${ins.nombre}</option>`;
    });

    document.getElementById('inpCantidad').value = '';
    document.getElementById('inpNotas').value = '';
    document.getElementById('lblUnidadNuevo').innerText = 'Unidad';

    // Reset photo preview and hidden input
    const previewImg = document.getElementById('imgPreviewPedidoFoto');
    const previewIcon = document.getElementById('iconPreviewPedidoFoto');
    const hiddenUrl = document.getElementById('inpPedidoFotoUrl');
    if (previewImg && previewIcon && hiddenUrl) {
        hiddenUrl.value = '';
        previewImg.src = '';
        previewImg.classList.add('hidden');
        previewIcon.classList.remove('hidden');
    }

    document.getElementById('modalNuevo').classList.remove('hidden');
}

function actualizarUnidadNuevoPedido() {
    const select = document.getElementById('inpInsumo');
    const option = select.options[select.selectedIndex];
    if(option && option.value) {
        document.getElementById('lblUnidadNuevo').innerText = option.getAttribute('data-unidad');
    } else {
        document.getElementById('lblUnidadNuevo').innerText = 'Unidad';
    }
}

function cerrarModalNuevo() { 
    document.getElementById('modalNuevo').classList.add('hidden'); 
}

async function subirFotoPedido(event) {
    const file = event.target.files[0];
    if (!file) return;

    const previewImg = document.getElementById('imgPreviewPedidoFoto');
    const previewIcon = document.getElementById('iconPreviewPedidoFoto');
    const hiddenUrl = document.getElementById('inpPedidoFotoUrl');
    const btnGuardar = document.getElementById('btnGuardar');

    // Show loading state on button
    btnGuardar.disabled = true;
    const oldBtnText = btnGuardar.innerHTML;
    btnGuardar.innerHTML = 'Subiendo...';

    try {
        const formData = new FormData();
        formData.append('imagen', file);

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error("Error al subir archivo");
        const data = await res.json();

        if (data.url) {
            hiddenUrl.value = data.url;
            previewImg.src = data.url;
            previewImg.classList.remove('hidden');
            previewIcon.classList.add('hidden');
        } else {
            alert("No se recibió la URL de la imagen");
        }
    } catch (e) {
        console.error(e);
        alert("Error al subir la imagen al servidor: " + e.message);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = oldBtnText;
    }
}

async function guardarPedido() {
    const selectInsumo = document.getElementById('inpInsumo');
    const insumo_id = selectInsumo.value;
    const insumo_nombre = insumo_id ? selectInsumo.options[selectInsumo.selectedIndex].text : '';
    const cantidad = parseFloat(document.getElementById('inpCantidad').value);
    const notas = document.getElementById('inpNotas').value.trim();
    const imagen_url = document.getElementById('inpPedidoFotoUrl').value || null;

    if(!insumo_id || !cantidad || cantidad <= 0) {
        return alert("Debes seleccionar el insumo y una cantidad válida mayor a 0.");
    }

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.innerHTML = 'Enviando...';

    const data = {
        usuario_id: usuarioId,
        insumo_id: insumo_id,
        insumo_nombre: insumo_nombre,
        cantidad: cantidad,
        notas: notas,
        imagen_url: imagen_url
    };

    try {
        const res = await fetch('/api/pedidos_internos', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        });
        
        if(!res.ok) throw new Error("Error al guardar");
        
        cerrarModalNuevo(); 
        cargarPedidos(); 
    } catch(e) {
        alert("Error de conexión al servidor");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Enviar Solicitud';
    }
}

// 4. UI del Admin: Despacho a Caja (Desconta Stock)
function abrirModalDespacho(pedidoId, insumoId, insumoNombre, cantidadPedida, solicitante, stockActual, unidad) {
    if(!insumoId || insumoId === 'null') {
        alert("Este pedido es antiguo y no tiene vinculación estricta con el catálogo de insumos. Usa el botón 'Rechazar' y pide al cajero que lo envíe de nuevo.");
        return;
    }

    document.getElementById('hdnDespachoPedidoId').value = pedidoId;
    document.getElementById('hdnDespachoInsumoId').value = insumoId;
    
    document.getElementById('lblDespachoSolicitante').innerText = solicitante;
    document.getElementById('lblDespachoInsumo').innerText = insumoNombre;
    document.getElementById('lblDespachoSol').innerText = `${cantidadPedida} ${unidad}`;
    document.getElementById('lblDespachoStock').innerText = `${stockActual} ${unidad}`;
    
    document.getElementById('lblDespachoUnidad').innerText = unidad;
    document.getElementById('inpCantidadDespacho').value = cantidadPedida;

    document.getElementById('modalDespacho').classList.remove('hidden');
}

function cerrarModalDespacho() {
    document.getElementById('modalDespacho').classList.add('hidden');
}

async function confirmarDespacho() {
    const pedidoId = document.getElementById('hdnDespachoPedidoId').value;
    const insumoId = document.getElementById('hdnDespachoInsumoId').value;
    const cantEntregar = parseFloat(document.getElementById('inpCantidadDespacho').value);

    if(!cantEntregar || cantEntregar <= 0) {
        return alert("Debes ingresar una cantidad válida mayor a 0 para despachar.");
    }

    const btn = document.getElementById('btnDespachar');
    btn.disabled = true;
    btn.innerHTML = 'Procesando...';

    try {
        const res = await fetch(`/api/pedidos_internos/${pedidoId}/despachar`, { 
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ cantidad_entregada: cantEntregar, insumo_id: insumoId }) 
        });
        
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || "Error al despachar");
        
        cerrarModalDespacho();
        cargarPedidos();
        cargarInsumosCatalogo(); // Recargar stock en memoria
    } catch(e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Entregar Stock';
    }
}

// 5. Rechazos y Eliminaciones Simples
async function cambiarEstado(id, nuevoEstado) {
    if(!confirm(`¿Estás seguro de marcar este pedido como ${nuevoEstado}? (No moverá stock)`)) return;

    try {
        const res = await fetch(`/api/pedidos_internos/${id}/estado`, { 
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ estado: nuevoEstado }) 
        });
        
        if(!res.ok) throw new Error("Error al actualizar");
        cargarPedidos();
    } catch(e) {
        alert("Error al actualizar estado");
    }
}

async function eliminarPedido(id) {
    if(!confirm("¿Seguro que deseas eliminar esta solicitud de compra?")) return;

    try {
        const res = await fetch(`/api/pedidos_internos/${id}`, { method: 'DELETE' });
        if(!res.ok) throw new Error("Error al eliminar");
        cargarPedidos();
    } catch(e) {
        alert("Error al intentar eliminar (Quizá ya fue procesado)");
    }
}
