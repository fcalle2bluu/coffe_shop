// frontend/js/almacen_movimientos.js
document.addEventListener('DOMContentLoaded', () => {
    cargarMovimientos();
});

async function cargarMovimientos() {
    try {
        const respuesta = await fetch('/api/almacen/movimientos');
        if (!respuesta.ok) throw new Error('Error al cargar historial');
        const movimientos = await respuesta.json();
        renderizarHistorial(movimientos);
    } catch (error) {
        console.error("Error cargando historial:", error);
    }
}

function renderizarHistorial(movimientos) {
    const tbody = document.getElementById('tabla-movimientos');
    tbody.innerHTML = '';

    movimientos.forEach(mov => {
        const esMerma = mov.tipo === 'MERMA';
        // Colores según el tipo (Compra o Merma)
        const colorBadge = esMerma ? 'bg-red-100 text-red-800 border-red-200' : 'bg-blue-100 text-blue-800 border-blue-200';
        const colorCantidad = esMerma ? 'text-red-600' : 'text-green-600';
        const signo = esMerma ? '-' : '+';

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500"><i class="fa-regular fa-calendar mr-2"></i>${mov.fecha_hora}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">${mov.insumo}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold border ${colorBadge}">${mov.tipo}</span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-black ${colorCantidad}">${signo} ${mov.cantidad}</td>
            </tr>
        `;
    });
}