// frontend/js/cotizaciones.js
let productosDisponibles = [];
let carritoCotizacion = [];
let totalActual = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarListaCotizaciones();
    cargarProductosSelect();
});

// --- CARGA DE DATOS ---

async function cargarListaCotizaciones() {
    try {
        const res = await fetch('/api/cotizaciones');
        const cotizaciones = await res.json();
        const tbody = document.getElementById('tabla-cotizaciones');
        tbody.innerHTML = '';

        cotizaciones.forEach(cot => {
            const colorEstado = cot.estado === 'APROBADA' ? 'bg-green-100 text-green-800' : 
                                cot.estado === 'RECHAZADA' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';

            tbody.innerHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 font-medium text-gray-900">#${cot.id.toString().padStart(4, '0')}</td>
                    <td class="px-4 py-3 text-gray-500">${cot.fecha_emision}</td>
                    <td class="px-4 py-3 text-gray-700 font-semibold">${cot.nombre_cliente}</td>
                    <td class="px-4 py-3 text-right font-bold text-[#4E342E]">S/ ${cot.total}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 text-xs font-semibold rounded-full border ${colorEstado}">${cot.estado}</span>
                    </td>
                    <td class="px-4 py-3 text-center space-x-2">
                        ${cot.estado === 'PENDIENTE' ? `
                            <button onclick="cambiarEstado(${cot.id}, 'APROBADA')" class="text-green-600 hover:text-green-800" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                            <button onclick="cambiarEstado(${cot.id}, 'RECHAZADA')" class="text-red-600 hover:text-red-800" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                        ` : ''}
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error al cargar lista:", error);
    }
}

async function cargarProductosSelect() {
    try {
        const res = await fetch('/api/cotizaciones/productos');
        productosDisponibles = await res.json();
        const select = document.getElementById('selectProducto');
        
        select.innerHTML = '<option value="">-- Seleccione un producto --</option>';
        productosDisponibles.forEach(prod => {
            select.innerHTML += `<option value="${prod.id}">${prod.nombre} - S/ ${prod.precio_venta}</option>`;
        });
    } catch (error) {
        console.error("Error al cargar productos:", error);
    }
}

// --- LÓGICA DEL CARRITO (MODAL) ---

function abrirModalNuevaCotizacion() {
    carritoCotizacion = []; // Limpiar carrito
    actualizarTablaCarrito();
    document.getElementById('inputCliente').value = '';
    document.getElementById('inputTelefono').value = '';
    document.getElementById('modalCotizacion').classList.remove('hidden');
}

function cerrarModal() {
    document.getElementById('modalCotizacion').classList.add('hidden');
}

function agregarAlCarrito() {
    const select = document.getElementById('selectProducto');
    const cantidadInput = document.getElementById('inputCantidad');
    
    const productoId = select.value;
    const cantidad = parseInt(cantidadInput.value);

    if (!productoId || cantidad <= 0) return alert("Selecciona un producto y una cantidad válida.");

    const productoData = productosDisponibles.find(p => p.id == productoId);
    
    // Verificar si ya existe en el carrito
    const itemExistente = carritoCotizacion.find(item => item.producto_id == productoId);
    
    if (itemExistente) {
        itemExistente.cantidad += cantidad;
        itemExistente.subtotal = itemExistente.cantidad * itemExistente.precio_unitario;
    } else {
        carritoCotizacion.push({
            producto_id: productoId,
            nombre: productoData.nombre,
            cantidad: cantidad,
            precio_unitario: productoData.precio_venta,
            subtotal: cantidad * productoData.precio_venta
        });
    }

    cantidadInput.value = 1; // Resetear input
    actualizarTablaCarrito();
}

function quitarDelCarrito(index) {
    carritoCotizacion.splice(index, 1);
    actualizarTablaCarrito();
}

function actualizarTablaCarrito() {
    const tbody = document.getElementById('tabla-carrito');
    tbody.innerHTML = '';
    totalActual = 0;

    carritoCotizacion.forEach((item, index) => {
        totalActual += item.subtotal;
        tbody.innerHTML += `
            <tr class="border-b border-gray-100">
                <td class="px-4 py-2 font-medium text-gray-800">${item.nombre}</td>
                <td class="px-4 py-2 text-center">${item.cantidad}</td>
                <td class="px-4 py-2 text-right text-gray-500">S/ ${item.precio_unitario}</td>
                <td class="px-4 py-2 text-right font-bold text-[#4E342E]">S/ ${item.subtotal.toFixed(2)}</td>
                <td class="px-4 py-2 text-center">
                    <button onclick="quitarDelCarrito(${index})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });

    document.getElementById('totalCotizacion').innerText = totalActual.toFixed(2);
}

// --- GUARDAR Y ACTUALIZAR BD ---

async function guardarCotizacion() {
    const cliente = document.getElementById('inputCliente').value;
    const telefono = document.getElementById('inputTelefono').value;

    if (!cliente) return alert("El nombre del cliente es obligatorio.");
    if (carritoCotizacion.length === 0) return alert("Agrega al menos un producto a la cotización.");

    const payload = {
        nombre_cliente: cliente,
        telefono_cliente: telefono,
        total: totalActual,
        detalles: carritoCotizacion
    };

    try {
        const res = await fetch('/api/cotizaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Error al guardar");
        
        cerrarModal();
        cargarListaCotizaciones();
        alert("Cotización guardada exitosamente.");
    } catch (error) {
        alert("Error al guardar la cotización.");
    }
}

async function cambiarEstado(id, nuevoEstado) {
    if (!confirm(`¿Estás seguro de marcar esta cotización como ${nuevoEstado}?`)) return;

    try {
        await fetch(`/api/cotizaciones/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        cargarListaCotizaciones();
    } catch (error) {
        alert("Error al actualizar estado.");
    }
}