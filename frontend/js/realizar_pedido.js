// frontend/js/realizar_pedido.js
let productosCatalogo = [];
let carritoPedido = [];
let totalPedido = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarProductos();
    cargarMesas();

    document.getElementById('buscarProducto').addEventListener('input', (e) => {
        renderizarCatalogo(e.target.value);
    });
});

// --- Cambio de vista (Pedido / Control) ---
function cambiarVista(vista) {
    const btnPedido = document.getElementById('tab-btn-pedido');
    const btnControl = document.getElementById('tab-btn-control');
    const vistaPedido = document.getElementById('vista-pedido');
    const vistaControl = document.getElementById('vista-control');

    if (vista === 'control') {
        vistaPedido.classList.add('hidden');
        vistaControl.classList.remove('hidden');
        btnControl.classList.add('bg-white', 'text-orange-500', 'shadow-sm');
        btnControl.classList.remove('text-slate-500');
        btnPedido.classList.remove('bg-white', 'text-orange-500', 'shadow-sm');
        btnPedido.classList.add('text-slate-500');
        cargarMisComandas();
    } else {
        vistaControl.classList.add('hidden');
        vistaPedido.classList.remove('hidden');
        btnPedido.classList.add('bg-white', 'text-orange-500', 'shadow-sm');
        btnPedido.classList.remove('text-slate-500');
        btnControl.classList.remove('bg-white', 'text-orange-500', 'shadow-sm');
        btnControl.classList.add('text-slate-500');
    }
}

// --- Catálogo de productos ---
async function cargarProductos() {
    try {
        const respuesta = await fetch('/api/ventas/productos');
        if (!respuesta.ok) throw new Error('Error al cargar productos');
        productosCatalogo = await respuesta.json();
        renderizarCatalogo();
    } catch (error) {
        console.error('Error:', error);
    }
}

function renderizarCatalogo(filtro = '') {
    const contenedor = document.getElementById('grid-productos');
    contenedor.innerHTML = '';

    const filtrados = productosCatalogo.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase())
    );

    if (filtrados.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-400 font-medium italic text-sm">
                No se encontraron productos.
            </div>
        `;
        return;
    }

    let prodIndex = 0;
    filtrados.forEach(prod => {
        prodIndex++;
        const delayClass = `delay-${Math.min(prodIndex, 12)}`;
        contenedor.innerHTML += `
            <div onclick="agregarAlCarrito(${prod.id})" class="animate-fade-in-up ${delayClass} group bg-white rounded-2xl shadow-sm border border-slate-200/80 cursor-pointer hover:shadow-lg hover:shadow-orange-500/10 hover:border-orange-400 hover:-translate-y-0.5 transition-all duration-200 select-none flex flex-col justify-between overflow-hidden relative min-h-[160px] btn-bounce">
                <div class="h-24 w-full bg-slate-100 flex items-center justify-center shrink-0 relative overflow-hidden">
                    ${prod.imagen_url ?
                        `<img src="${prod.imagen_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${prod.nombre}">` :
                        `<div class="w-full h-full bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100/60 flex items-center justify-center">
                            <i class="fa-solid fa-mug-hot text-orange-300 text-2xl group-hover:scale-110 transition-transform duration-300"></i>
                         </div>`
                    }
                </div>
                <div class="p-3 flex-grow flex flex-col justify-between">
                    <h3 class="font-bold text-slate-800 leading-tight text-xs sm:text-sm line-clamp-2">${prod.nombre}</h3>
                    <div class="flex items-center justify-between mt-1.5">
                        <span class="text-sm sm:text-base font-black text-slate-900">Bs. ${prod.precio_venta}</span>
                        <span class="w-6 h-6 rounded-full bg-orange-500/10 text-orange-500 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fa-solid fa-plus text-[10px]"></i>
                        </span>
                    </div>
                </div>
            </div>
        `;
    });
}

// --- Mesas ---
async function cargarMesas() {
    try {
        const res = await fetch('/api/mesas');
        if (!res.ok) throw new Error('Error al cargar mesas');
        const mesas = await res.json();
        const select = document.getElementById('select-mesa');
        select.innerHTML = '<option value="">-- Elegir mesa --</option>';
        mesas.forEach(m => {
            select.innerHTML += `<option value="${m.numero}">Mesa ${m.numero} (${m.piso.replace('_', ' ')})</option>`;
        });
    } catch (error) {
        console.error('Error al cargar mesas:', error);
        document.getElementById('select-mesa').innerHTML = '<option value="">Error al cargar mesas</option>';
    }
}

// --- Carrito ---
function agregarAlCarrito(productoId) {
    const producto = productosCatalogo.find(p => p.id === productoId);
    if (!producto) return;

    const itemExistente = carritoPedido.find(item => item.producto_id === productoId);
    if (itemExistente) {
        itemExistente.cantidad += 1;
        itemExistente.subtotal = itemExistente.cantidad * itemExistente.precio_unitario;
    } else {
        carritoPedido.push({
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
        carritoPedido[index].cantidad += 1;
    } else if (operacion === 'resta') {
        carritoPedido[index].cantidad -= 1;
        if (carritoPedido[index].cantidad <= 0) {
            carritoPedido.splice(index, 1);
            return actualizarTicket();
        }
    }
    carritoPedido[index].subtotal = carritoPedido[index].cantidad * carritoPedido[index].precio_unitario;
    actualizarTicket();
}

function actualizarTicket() {
    const contenedor = document.getElementById('ticket-items');
    totalPedido = 0;

    const elCount = document.getElementById('ticket-count');
    if (elCount) elCount.innerText = carritoPedido.reduce((acc, it) => acc + it.cantidad, 0);

    if (carritoPedido.length === 0) {
        contenedor.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center text-slate-400 py-8">
                <div class="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center mb-3">
                    <i class="fa-solid fa-basket-shopping text-2xl opacity-30"></i>
                </div>
                <p class="text-sm font-semibold">Pedido vacío</p>
                <p class="text-xs text-slate-300 mt-1">Toca un producto para agregarlo</p>
            </div>`;
    } else {
        contenedor.innerHTML = '';
        carritoPedido.forEach((item, index) => {
            totalPedido += item.subtotal;
            contenedor.innerHTML += `
                <div class="flex justify-between items-center gap-2 py-2.5 px-2.5 mb-1.5 bg-white rounded-xl border border-slate-200/70 shadow-sm hover:border-orange-200 transition-colors">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-slate-800 text-sm truncate">${item.nombre}</h4>
                        <p class="text-[11px] text-slate-400 font-medium">Bs. ${item.precio_unitario.toFixed(2)} c/u</p>
                    </div>
                    <div class="flex items-center bg-slate-100 rounded-full border border-slate-200 overflow-hidden shrink-0">
                        <button onclick="modificarCantidad(${index}, 'resta')" class="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white hover:bg-rose-500 font-bold transition-colors btn-bounce">−</button>
                        <span class="px-1 text-sm font-black w-6 text-center text-slate-800">${item.cantidad}</span>
                        <button onclick="modificarCantidad(${index}, 'suma')" class="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white hover:bg-emerald-500 font-bold transition-colors btn-bounce">+</button>
                    </div>
                    <div class="text-right font-black text-slate-900 w-16 text-sm shrink-0">
                        Bs. ${item.subtotal.toFixed(2)}
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('total-ticket').innerText = `Bs. ${totalPedido.toFixed(2)}`;
}

function limpiarCarrito() {
    if (carritoPedido.length > 0 && confirm('¿Deseas vaciar el pedido actual?')) {
        carritoPedido = [];
        actualizarTicket();
    }
}

// --- Generar comanda ---
async function generarComanda() {
    const mesa = document.getElementById('select-mesa').value;
    if (!mesa) {
        alert('Selecciona una mesa antes de generar la comanda.');
        return;
    }
    if (carritoPedido.length === 0) return;

    const btn = document.getElementById('btn-generar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    const payload = {
        mesa: mesa,
        usuario_id: parseInt(localStorage.getItem('usuario_id')),
        total: totalPedido,
        detalles: carritoPedido
    };

    try {
        const res = await fetch('/api/comandas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al generar comanda');

        alert(`✅ Comanda enviada a cocina para la mesa ${mesa}.`);
        carritoPedido = [];
        actualizarTicket();
        document.getElementById('select-mesa').value = '';
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-bell-concierge mr-1"></i> GENERAR COMANDA';
    }
}

// --- Control de mis comandas ---
async function cargarMisComandas() {
    const contenedor = document.getElementById('lista-control');
    contenedor.innerHTML = '<p class="text-slate-400 text-sm italic col-span-full">Cargando...</p>';

    try {
        const usuarioId = localStorage.getItem('usuario_id');
        const res = await fetch(`/api/comandas/mesero/activas?usuario_id=${usuarioId}`);
        if (!res.ok) throw new Error('Error al cargar comandas');
        const comandas = await res.json();

        if (comandas.length === 0) {
            contenedor.innerHTML = '<p class="text-slate-400 text-sm italic col-span-full">No tienes comandas registradas hoy.</p>';
            return;
        }

        const badgeCocina = {
            'PENDIENTE': 'bg-amber-100 text-amber-700',
            'RECHAZADA': 'bg-rose-100 text-rose-700',
            'COMPLETADA': 'bg-emerald-100 text-emerald-700'
        };
        const badgeEstado = {
            'CREADA': 'bg-blue-100 text-blue-700',
            'ENTREGADA': 'bg-indigo-100 text-indigo-700',
            'PAGADA': 'bg-slate-200 text-slate-600'
        };

        contenedor.innerHTML = comandas.map(c => `
            <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <h3 class="font-black text-slate-800 text-sm">Mesa ${c.mesa}</h3>
                    <span class="text-[10px] font-black px-2 py-1 rounded-full ${badgeCocina[c.estado_cocina] || 'bg-slate-100 text-slate-600'}">
                        ${c.estado_cocina || 'PENDIENTE'}
                    </span>
                </div>
                <p class="text-xs text-slate-400 font-medium">${new Date(c.fecha_creacion).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                <div class="flex items-center justify-between">
                    <span class="text-lg font-black text-slate-900">Bs. ${parseFloat(c.total).toFixed(2)}</span>
                    <span class="text-[10px] font-bold px-2 py-1 rounded-full ${badgeEstado[c.estado] || 'bg-slate-100 text-slate-600'}">${c.estado}</span>
                </div>
                ${c.estado !== 'PAGADA' ? `
                <button onclick="eliminarComanda(${c.id})" class="mt-1 w-full text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl py-2 transition-colors btn-bounce">
                    <i class="fa-solid fa-trash-can mr-1"></i> Eliminar
                </button>` : ''}
            </div>
        `).join('');
    } catch (error) {
        contenedor.innerHTML = `<p class="text-rose-500 text-sm italic col-span-full">Error: ${error.message}</p>`;
    }
}

async function eliminarComanda(id) {
    if (!confirm('¿Eliminar esta comanda? Esta acción no se puede deshacer.')) return;
    try {
        const usuarioId = localStorage.getItem('usuario_id');
        const res = await fetch(`/api/comandas/${id}?usuario_id=${usuarioId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');
        cargarMisComandas();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}
