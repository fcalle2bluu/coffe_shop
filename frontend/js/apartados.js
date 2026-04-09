// frontend/js/apartados.js

document.addEventListener('DOMContentLoaded', () => {
    cargarApartados();
});

// 1. Cargar lista de Apartados Reales (Reservas)
async function cargarApartados() {
    try {
        const res = await fetch('/api/apartados');
        const data = await res.json();
        
        const tbody = document.getElementById('tabla-apartados');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-500 font-bold">No hay reservas registradas.</td></tr>`;
            return;
        }

        data.forEach(apt => {
            let colorEstado = 'bg-yellow-100 text-yellow-800 border-yellow-200'; // PENDIENTE
            if (apt.estado === 'PAGADO') colorEstado = 'bg-blue-100 text-blue-800 border-blue-200';
            if (apt.estado === 'ENTREGADO') colorEstado = 'bg-green-100 text-green-800 border-green-200';
            if (apt.estado === 'CANCELADO') colorEstado = 'bg-red-100 text-red-800 border-red-200';

            let btnEntregar = '';
            if (apt.estado !== 'ENTREGADO' && apt.estado !== 'CANCELADO') {
                btnEntregar = `<button onclick="abrirModalEntregar(${apt.id}, '${apt.nombre_cliente}')" class="bg-blue-500 hover:bg-blue-600 text-white p-1 px-3 rounded shadow text-xs font-bold transition-colors"><i class="fa-solid fa-box-open mr-1"></i> Entregar</button>`;
            }

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 font-bold text-slate-800">${apt.nombre_cliente}</td>
                    <td class="px-4 py-3 text-gray-500 text-xs">${apt.telefono_cliente || '-'}</td>
                    <td class="px-4 py-3 text-red-500 text-xs font-bold">${apt.fecha_limite}</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-700">Bs. ${Number(apt.total).toFixed(2)}</td>
                    <td class="px-4 py-3 text-right font-bold ${apt.saldo_pendiente > 0 ? 'text-red-500' : 'text-green-600'}">Bs. ${Number(apt.saldo_pendiente).toFixed(2)}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded-full text-[10px] font-black tracking-wide border ${colorEstado}">${apt.estado}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        ${btnEntregar}
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error al cargar apartados:", e);
    }
}

// 2. Lógica del Modal de Entregas Parciales
async function abrirModalEntregar(apartado_id, cliente_nombre) {
    document.getElementById('apartadoIdActivo').value = apartado_id;
    document.getElementById('nombreClienteModal').innerText = cliente_nombre;
    
    const tbody = document.getElementById('tabla-modal-detalles');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Cargando detalles...</td></tr>';
    
    document.getElementById('modalEntregas').classList.remove('hidden');

    try {
        const res = await fetch(`/api/apartados/${apartado_id}/detalles`);
        const data = await res.json();
        
        tbody.innerHTML = '';
        
        let pendientesExist = false;

        data.forEach(det => {
            const pendiente = det.cantidad - det.cantidad_entregada;
            const tienePendiente = pendiente > 0;
            if(tienePendiente) pendientesExist = true;

            const inputEntregar = tienePendiente 
                ? `<input type="number" min="0" max="${pendiente}" value="0" data-detalle-id="${det.id}" data-producto-id="${det.producto_id}" class="w-16 border rounded text-center py-1 bg-white font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-400 input-entrega">`
                : `<span class="text-green-600 font-bold text-xs"><i class="fa-solid fa-check"></i> Listo</span>`;

            tbody.innerHTML += `
                <tr class="border-b ${tienePendiente ? 'hover:bg-blue-50' : 'bg-gray-100 grayscale'}">
                    <td class="px-2 py-3 font-bold text-gray-700">${det.producto_nombre}</td>
                    <td class="px-2 py-3 text-center font-bold">${det.cantidad}</td>
                    <td class="px-2 py-3 text-center text-green-600 font-bold">${det.cantidad_entregada}</td>
                    <td class="px-2 py-3 text-center text-red-500 font-bold">${pendiente}</td>
                    <td class="px-2 py-3 text-center bg-blue-50 border-l border-blue-100">${inputEntregar}</td>
                </tr>
            `;
        });

        document.getElementById('btnProcesarEntrega').disabled = !pendientesExist;
        if(!pendientesExist) document.getElementById('btnProcesarEntrega').className = "w-2/3 px-4 py-2 bg-gray-400 text-white font-bold rounded shadow cursor-not-allowed";

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500 font-bold">Error al cargar datos.</td></tr>`;
    }
}

function cerrarModalEntregas() {
    document.getElementById('modalEntregas').classList.add('hidden');
}

// 3. Enviar la entrega al backend
async function procesarEntrega() {
    const inputs = document.querySelectorAll('.input-entrega');
    let itemsEntrega = [];
    let cantidadTotalAEntregar = 0;

    inputs.forEach(inp => {
        const val = parseInt(inp.value) || 0;
        if (val > 0) {
            itemsEntrega.push({
                detalle_id: inp.getAttribute('data-detalle-id'),
                producto_id: inp.getAttribute('data-producto-id'),
                entregado_ahora: val
            });
            cantidadTotalAEntregar += val;
        }
    });

    if (cantidadTotalAEntregar === 0) {
        return alert("Debes ingresar al menos una cantidad mayor a 0 para entregar.");
    }

    if (!confirm("¿Confirma aplicar esta entrega parcial? Se descontarán insumos del inventario según receta de las cantidades indicadas.")) return;

    const btn = document.getElementById('btnProcesarEntrega');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Procesando...';

    const apartadoId = document.getElementById('apartadoIdActivo').value;

    try {
        const res = await fetch(`/api/apartados/${apartadoId}/entregar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items_entrega: itemsEntrega })
        });
        
        const resData = await res.json();
        
        if (!res.ok) throw new Error(resData.error || "Error desconocido");

        cerrarModalEntregas();
        cargarApartados();
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Procesar Entrega y Descontar Inventario';
    }
}
