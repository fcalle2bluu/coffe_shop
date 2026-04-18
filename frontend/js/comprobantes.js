// frontend/js/comprobantes.js
let comprobantesGlobales = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarComprobantes();

    // Filtro de búsqueda por ID
    document.getElementById('buscador').addEventListener('input', (e) => {
        const busqueda = e.target.value.trim();
        const filtrados = comprobantesGlobales.filter(c => 
            c.id.toString().includes(busqueda)
        );
        renderizarTabla(filtrados);
    });
});

async function cargarComprobantes() {
    try {
        const res = await fetch('/api/comprobantes');
        if (!res.ok) throw new Error('Error al conectar al servidor');
        comprobantesGlobales = await res.json();
        renderizarTabla(comprobantesGlobales);
    } catch (error) {
        console.error("Error al cargar comprobantes:", error);
    }
}

function renderizarTabla(lista) {
    const tbody = document.getElementById('tabla-comprobantes');
    tbody.innerHTML = '';

    lista.forEach(comp => {
        const esAnulada = comp.estado === 'ANULADA';
        const colorEstado = esAnulada ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800';
        
        // Formatear Ticket ID con ceros (ej: TKT-0015)
        const ticketFmt = `TKT-${comp.id.toString().padStart(4, '0')}`;

        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50 transition-colors ${esAnulada ? 'opacity-75' : ''}">
                <td class="px-4 py-3 font-black text-gray-700">${ticketFmt}</td>
                <td class="px-4 py-3 text-gray-600"><i class="fa-regular fa-calendar mr-2"></i>${comp.fecha}</td>
                <td class="px-4 py-3 text-center font-medium">${comp.metodo_pago}</td>
                <td class="px-4 py-3 text-right font-bold text-stone-800">Bs. ${comp.total}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 rounded text-xs font-bold border ${colorEstado}">${comp.estado}</span>
                </td>
                <td class="px-4 py-3 text-center space-x-2">
                    <button onclick="abrirTicket(${comp.id})" class="text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded" title="Ver / Imprimir">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    ${!esAnulada ? `
                    <button onclick="anularVenta(${comp.id})" class="text-red-600 hover:text-red-800 bg-red-50 px-2 py-1 rounded" title="Anular Venta">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
}

// --- VISUALIZACIÓN E IMPRESIÓN DEL TICKET ---

async function abrirTicket(id) {
    try {
        const res = await fetch(`/api/comprobantes/${id}`);
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error);

        // Llenar datos de cabecera
        document.getElementById('t-id').innerText = data.ticket.id.toString().padStart(4, '0');
        document.getElementById('t-fecha').innerText = data.ticket.fecha;
        document.getElementById('t-total').innerText = `Bs. ${data.ticket.total}`;
        document.getElementById('t-pago').innerText = data.ticket.metodo_pago;

        // Llenar productos
        const tbodyItems = document.getElementById('t-items');
        tbodyItems.innerHTML = '';
        data.items.forEach(item => {
            tbodyItems.innerHTML += `
                <tr class="border-b border-gray-100">
                    <td class="py-2 text-center">${item.cantidad}</td>
                    <td class="py-2">${item.nombre}</td>
                    <td class="py-2 text-right">Bs. ${item.subtotal}</td>
                </tr>
            `;
        });

        // Mostrar el modal
        document.getElementById('modalTicket').classList.remove('hidden');

    } catch (error) {
        alert("Error al abrir ticket: " + error.message);
    }
}

function cerrarModalTicket() {
    document.getElementById('modalTicket').classList.add('hidden');
}

function imprimirTicket() {
    // La magia pasa gracias al @media print del CSS en el HTML
    // que oculta todo lo demás y solo muestra el div #zona-impresion
    window.print();
}

// --- ANULACIÓN DE VENTAS ---

async function anularVenta(id) {
    const confirmacion = confirm(`⚠️ CUIDADO:\n¿Estás completamente seguro de anular el TICKET #${id}?\nEsta acción no se puede deshacer y el monto será restado del reporte.`);
    
    if (!confirmacion) return;

    try {
        const res = await fetch(`/api/comprobantes/${id}/anular`, {
            method: 'PUT'
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        alert("✅ Venta anulada exitosamente.");
        cargarComprobantes(); // Recargar la tabla
    } catch (error) {
        alert("Error: " + error.message);
    }
}