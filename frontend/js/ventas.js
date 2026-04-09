// frontend/js/ventas.js
let productosCatalogo = [];
let carritoVenta = [];
let totalVenta = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarProductos();
    iniciarReloj();

    // Filtro de búsqueda en vivo
    document.getElementById('buscarProducto').addEventListener('input', (e) => {
        renderizarCatalogo(e.target.value);
    });
});

// --- 1. CATÁLOGO DE PRODUCTOS ---
async function cargarProductos() {
    try {
        const respuesta = await fetch('/api/ventas/productos');
        if (!respuesta.ok) throw new Error('Error al cargar productos');
        
        productosCatalogo = await respuesta.json();
        renderizarCatalogo();
    } catch (error) {
        console.error("Error:", error);
    }
}

function renderizarCatalogo(filtro = '') {
    const contenedor = document.getElementById('grid-productos');
    contenedor.innerHTML = '';

    const filtrados = productosCatalogo.filter(p => 
        p.nombre.toLowerCase().includes(filtro.toLowerCase())
    );

    filtrados.forEach(prod => {
        contenedor.innerHTML += `
            <div onclick="agregarAlCarrito(${prod.id})" class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-orange-500 transition-all transform hover:-translate-y-1 active:translate-y-0 select-none flex flex-col justify-between min-h-[120px]">
                <div>
                    <span class="text-xs font-bold text-orange-600 mb-1 block">${prod.categoria || 'General'}</span>
                    <h3 class="font-bold text-gray-800 leading-tight">${prod.nombre}</h3>
                </div>
                <div class="text-lg font-black text-slate-800 mt-2">
                    S/ ${prod.precio_venta}
                </div>
            </div>
        `;
    });
}

// --- 2. LÓGICA DEL CARRITO (TICKET) ---
function agregarAlCarrito(productoId) {
    const producto = productosCatalogo.find(p => p.id === productoId);
    if (!producto) return;

    const itemExistente = carritoVenta.find(item => item.producto_id === productoId);

    if (itemExistente) {
        itemExistente.cantidad += 1;
        itemExistente.subtotal = itemExistente.cantidad * itemExistente.precio_unitario;
    } else {
        carritoVenta.push({
            producto_id: producto.id,
            nombre: producto.nombre,
            cantidad: 1,
            precio_unitario: parseFloat(producto.precio_venta),
            subtotal: parseFloat(producto.precio_venta)
        });
    }

    actualizarTicket();
}

function modificarCantidad(index, operacion) {
    if (operacion === 'suma') {
        carritoVenta[index].cantidad += 1;
    } else if (operacion === 'resta') {
        carritoVenta[index].cantidad -= 1;
        if (carritoVenta[index].cantidad <= 0) {
            carritoVenta.splice(index, 1);
            return actualizarTicket();
        }
    }
    carritoVenta[index].subtotal = carritoVenta[index].cantidad * carritoVenta[index].precio_unitario;
    actualizarTicket();
}

function actualizarTicket() {
    const contenedor = document.getElementById('ticket-items');
    totalVenta = 0;

    if (carritoVenta.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center text-gray-400 mt-10 text-sm">
                <i class="fa-solid fa-basket-shopping text-4xl mb-3 opacity-20"></i>
                <p>No hay productos en el ticket</p>
            </div>`;
        document.getElementById('btn-cobrar').disabled = true;
    } else {
        document.getElementById('btn-cobrar').disabled = false;
        contenedor.innerHTML = '';
        
        carritoVenta.forEach((item, index) => {
            totalVenta += item.subtotal;
            contenedor.innerHTML += `
                <div class="flex justify-between items-center py-3 border-b border-dashed border-gray-200">
                    <div class="flex-1">
                        <h4 class="font-bold text-gray-800 text-sm">${item.nombre}</h4>
                        <p class="text-xs text-gray-500">S/ ${item.precio_unitario.toFixed(2)}</p>
                    </div>
                    
                    <div class="flex items-center bg-gray-100 rounded-lg mx-2 border">
                        <button onclick="modificarCantidad(${index}, 'resta')" class="px-2 py-1 text-gray-600 hover:text-red-500 font-bold">-</button>
                        <span class="px-2 text-sm font-bold w-6 text-center">${item.cantidad}</span>
                        <button onclick="modificarCantidad(${index}, 'suma')" class="px-2 py-1 text-gray-600 hover:text-green-500 font-bold">+</button>
                    </div>

                    <div class="text-right font-black text-slate-900 w-16">
                        S/ ${item.subtotal.toFixed(2)}
                    </div>
                </div>
            `;
        });
    }

    const totalFormateado = totalVenta.toFixed(2);
    document.getElementById('subtotal-ticket').innerText = `S/ ${totalFormateado}`;
    document.getElementById('total-ticket').innerText = `S/ ${totalFormateado}`;
    document.getElementById('btn-total').innerText = totalFormateado;
}

function limpiarCarrito() {
    if (carritoVenta.length > 0 && confirm("¿Deseas vaciar el ticket actual?")) {
        carritoVenta = [];
        actualizarTicket();
    }
}

// --- 3. PROCESAR EL COBRO ---
async function procesarCobro() {
    if (carritoVenta.length === 0) return;

    const btnCobrar = document.getElementById('btn-cobrar');
    btnCobrar.disabled = true;
    btnCobrar.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Procesando...';

    const payload = {
        total: totalVenta,
        metodo_pago: document.getElementById('metodo-pago').value,
        detalles: carritoVenta
    };

    try {
        const respuesta = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await respuesta.json();

        if (!respuesta.ok) throw new Error(data.error || 'Error al procesar');

        // Mostrar Modal de Éxito
        document.getElementById('info-ticket').innerText = `Ticket #${data.ticket.id} | ${data.ticket.metodo_pago}`;
        document.getElementById('modalExito').classList.remove('hidden');

    } catch (error) {
        alert("Error de Venta: " + error.message);
        btnCobrar.disabled = false;
        btnCobrar.innerHTML = `COBRAR S/ <span id="btn-total">${totalVenta.toFixed(2)}</span>`;
    }
}

function cerrarModalExito() {
    document.getElementById('modalExito').classList.add('hidden');
    carritoVenta = [];
    actualizarTicket();
    document.getElementById('btn-cobrar').innerHTML = `COBRAR S/ <span id="btn-total">0.00</span>`;
}

// Utilidad: Reloj de la barra superior
function iniciarReloj() {
    setInterval(() => {
        const ahora = new Date();
        document.getElementById('reloj').innerText = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
}