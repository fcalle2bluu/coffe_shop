// frontend/js/apartados.js (AHORA USADO PARA PEDIDOS INTERNOS)

const usuarioId = localStorage.getItem('usuario_id');
const usuarioRol = localStorage.getItem('usuario_rol');

document.addEventListener('DOMContentLoaded', () => {
    cargarPedidos();
});

// 1. Cargar la lista de pedidos desde el backend
async function cargarPedidos() {
    try {
        // Le pasamos al backend quiénes somos para que nos devuelva lo correcto
        const res = await fetch(`/api/apartados?usuario_id=${usuarioId}&rol=${usuarioRol}`);
        const data = await res.json();
        
        const tbody = document.getElementById('tabla-pedidos');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-500 font-bold">No hay pedidos registrados en este momento.</td></tr>`;
            return;
        }

        data.forEach(pedido => {
            // Colores según el estado
            let colorEstado = 'bg-yellow-100 text-yellow-800 border-yellow-200'; // PENDIENTE
            if (pedido.estado === 'COMPRADO') colorEstado = 'bg-green-100 text-green-800 border-green-200';
            if (pedido.estado === 'RECHAZADO') colorEstado = 'bg-red-100 text-red-800 border-red-200';

            // Lógica de botones de ACCIÓN dependiendo de quién está viendo
            let botonesAccion = '<span class="text-xs text-gray-400">-</span>';
            
            if (usuarioRol === 'ADMIN' && pedido.estado === 'PENDIENTE') {
                botonesAccion = `
                    <div class="flex justify-center gap-2">
                        <button onclick="cambiarEstado(${pedido.id}, 'COMPRADO')" class="bg-green-500 hover:bg-green-600 text-white p-2 rounded shadow transition-colors" title="Marcar como Comprado"><i class="fa-solid fa-check"></i></button>
                        <button onclick="cambiarEstado(${pedido.id}, 'RECHAZADO')" class="bg-red-500 hover:bg-red-600 text-white p-2 rounded shadow transition-colors" title="Rechazar Pedido"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                `;
            } else if (usuarioRol === 'CAJERO' && pedido.estado === 'PENDIENTE') {
                botonesAccion = `
                    <button onclick="eliminarPedido(${pedido.id})" class="text-red-500 hover:text-red-700 font-bold p-1"><i class="fa-solid fa-trash-can"></i> Eliminar</button>
                `;
            }

            // Si es Cajero, no dibujamos la columna del solicitante para no desperdiciar espacio
            const colSolicitante = usuarioRol === 'ADMIN' ? `<td class="px-4 py-3 font-bold text-gray-700">${pedido.solicitante}</td>` : '';

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 text-gray-500 text-xs"><i class="fa-regular fa-clock mr-1"></i>${pedido.fecha_pedido}</td>
                    ${colSolicitante}
                    <td class="px-4 py-3 font-bold text-[#4E342E]">${pedido.insumo_nombre}</td>
                    <td class="px-4 py-3 text-center font-bold text-[#E65100] bg-orange-50">${pedido.cantidad}</td>
                    <td class="px-4 py-3 text-gray-600 text-xs italic">${pedido.notas || 'Ninguna'}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded-full text-[10px] font-black tracking-wide border ${colorEstado}">${pedido.estado}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        ${botonesAccion}
                    </td>
                </tr>
            `;
        });
    } catch (e) { 
        console.error("Error al cargar pedidos:", e); 
    }
}

// 2. Lógica del Modal
function abrirModalNuevo() {
    document.getElementById('inpInsumo').value = '';
    document.getElementById('inpCantidad').value = '';
    document.getElementById('inpNotas').value = '';
    document.getElementById('modalNuevo').classList.remove('hidden');
}

function cerrarModalNuevo() { 
    document.getElementById('modalNuevo').classList.add('hidden'); 
}

// 3. Guardar Solicitud
async function guardarPedido() {
    const insumo = document.getElementById('inpInsumo').value.trim();
    const cantidad = document.getElementById('inpCantidad').value.trim();
    const notas = document.getElementById('inpNotas').value.trim();

    if(!insumo || !cantidad) {
        return alert("Debes escribir qué necesitas y en qué cantidad.");
    }

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.innerHTML = 'Enviando...';

    const data = {
        usuario_id: usuarioId,
        insumo_nombre: insumo,
        cantidad: cantidad,
        notas: notas
    };

    try {
        const res = await fetch('/api/apartados', { 
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

// 4. Cambiar Estado (Solo ADMIN)
async function cambiarEstado(id, nuevoEstado) {
    if(!confirm(`¿Estás seguro de marcar este pedido como ${nuevoEstado}?`)) return;

    try {
        const res = await fetch(`/api/apartados/${id}/estado`, { 
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

// 5. Eliminar Pedido (Solo CAJERO)
async function eliminarPedido(id) {
    if(!confirm("¿Seguro que deseas eliminar esta solicitud de compra?")) return;

    try {
        const res = await fetch(`/api/apartados/${id}`, { method: 'DELETE' });
        if(!res.ok) throw new Error("Error al eliminar");
        cargarPedidos();
    } catch(e) {
        alert("Error al intentar eliminar (Quizá ya fue procesado)");
    }
}