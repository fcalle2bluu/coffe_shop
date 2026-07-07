// frontend/js/webhook.js

document.addEventListener('DOMContentLoaded', () => {
    cargarPedidosWhatsApp();
    
    // Configurar recarga automática cada 10 segundos
    setInterval(cargarPedidosWhatsApp, 10000);
});

async function cargarPedidosWhatsApp() {
    const tbody = document.getElementById('tabla-pedidos-body');
    const refreshIcon = document.getElementById('btn-refresh-icon');
    
    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    
    try {
        const response = await fetch('/api/whatsapp/pedidos');
        if (!response.ok) throw new Error('Error de conexión');
        const pedidos = await response.json();
        
        // Calcular estadísticas
        let pendientes = 0;
        let preparando = 0;
        let entregados = 0;
        let total = pedidos.length;
        
        tbody.innerHTML = '';
        
        if (pedidos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center p-8 text-slate-400 font-semibold">
                        <i class="fa-regular fa-comment-dots text-3xl mb-2 block text-slate-350"></i>
                        No se han recibido pedidos por WhatsApp todavía.
                    </td>
                </tr>
            `;
            actualizarMétricas(0, 0, 0, 0);
            return;
        }
        
        pedidos.forEach(p => {
            if (p.estado === 'PENDIENTE') pendientes++;
            else if (p.estado === 'PREPARANDO') preparando++;
            else if (p.estado === 'ENTREGADO') entregados++;
            
            // Badge del estado
            let badgeClass = '';
            if (p.estado === 'PENDIENTE') badgeClass = 'bg-amber-100 text-amber-700';
            else if (p.estado === 'PREPARANDO') badgeClass = 'bg-blue-100 text-blue-700';
            else if (p.estado === 'ENTREGADO') badgeClass = 'bg-emerald-100 text-emerald-700';
            else if (p.estado === 'CANCELADO') badgeClass = 'bg-red-100 text-red-700';
            
            const badge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${badgeClass}">${p.estado}</span>`;
            
            // Acciones disponibles
            let btnAcciones = '';
            if (p.estado === 'PENDIENTE') {
                btnAcciones = `
                    <button onclick="actualizarEstado(${p.id}, 'PREPARANDO')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] px-2 py-1 rounded shadow-sm mr-1 transition-colors">
                        <i class="fa-solid fa-mug-hot"></i> Preparar
                    </button>
                    <button onclick="actualizarEstado(${p.id}, 'CANCELADO')" class="bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 font-bold text-[10px] px-2 py-1 rounded border border-slate-200 transition-colors">
                        Cancelar
                    </button>
                `;
            } else if (p.estado === 'PREPARANDO') {
                btnAcciones = `
                    <button onclick="actualizarEstado(${p.id}, 'ENTREGADO')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2 py-1 rounded shadow-sm mr-1 transition-colors">
                        <i class="fa-solid fa-circle-check"></i> Entregar
                    </button>
                    <button onclick="actualizarEstado(${p.id}, 'CANCELADO')" class="bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 font-bold text-[10px] px-2 py-1 rounded border border-slate-200 transition-colors">
                        Cancelar
                    </button>
                `;
            } else {
                // Si ya está entregado o cancelado, solo permitimos eliminarlo de vista
                btnAcciones = `
                    <button onclick="eliminarPedido(${p.id})" class="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] px-2 py-1 rounded border border-red-100 transition-colors">
                        <i class="fa-solid fa-trash-can"></i> Eliminar
                    </button>
                `;
            }
            
            // Formatear fecha
            const fechaStr = new Date(p.fecha).toLocaleString('es-BO', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            // Miniatura de la foto de referencia (si el cliente mandó una para su torta)
            const fotoCelda = p.foto_referencia_url
                ? `<a href="${p.foto_referencia_url}" target="_blank" rel="noopener noreferrer">
                       <img src="${p.foto_referencia_url}" alt="Foto de referencia" class="w-10 h-10 object-cover rounded-lg border border-slate-200 hover:scale-150 transition-transform" />
                   </a>`
                : `<span class="text-slate-300">—</span>`;

            tbody.innerHTML += `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td class="px-4 py-3 font-mono font-bold text-slate-500">#${p.id}</td>
                    <td class="px-4 py-3 font-semibold text-slate-700 select-all">${p.telefono_cliente}</td>
                    <td class="px-4 py-3 font-bold text-slate-800">${p.producto}</td>
                    <td class="px-4 py-3 text-center font-black text-slate-900">${p.cantidad}</td>
                    <td class="px-4 py-3 text-center">${fotoCelda}</td>
                    <td class="px-4 py-3">${badge}</td>
                    <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${fechaStr}</td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">${btnAcciones}</td>
                </tr>
            `;
        });
        
        actualizarMétricas(pendientes, preparando, entregados, total);
        
    } catch (error) {
        console.error('Error al cargar pedidos:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-6 text-red-500 font-bold">
                    ⚠️ Error al conectar con el servidor de pedidos.
                </td>
            </tr>
        `;
    } finally {
        if (refreshIcon) {
            setTimeout(() => refreshIcon.classList.remove('fa-spin'), 600);
        }
    }
}

function actualizarMétricas(pend, prep, entr, tot) {
    const statPend = document.getElementById('stat-pendientes');
    const statPrep = document.getElementById('stat-preparando');
    const statEntr = document.getElementById('stat-entregados');
    const statTot  = document.getElementById('stat-total');
    
    if (statPend) statPend.textContent = pend;
    if (statPrep) statPrep.textContent = prep;
    if (statEntr) statEntr.textContent = entr;
    if (statTot)  statTot.textContent  = tot;
}

async function actualizarEstado(id, nuevoEstado) {
    try {
        const res = await fetch(`/api/whatsapp/pedidos/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Error al actualizar el estado');
        }
        
        cargarPedidosWhatsApp();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

async function eliminarPedido(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro del listado?')) return;
    
    try {
        const res = await fetch(`/api/whatsapp/pedidos/${id}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Error al eliminar el pedido');
        }
        
        cargarPedidosWhatsApp();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}
