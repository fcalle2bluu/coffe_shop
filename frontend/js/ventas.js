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
    
    // Cargar categorias para el modal
    cargarCategoriasSelect();
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
            <div onclick="agregarAlCarrito(${prod.id})" class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-orange-500 transition-all transform hover:-translate-y-1 active:translate-y-0 select-none flex flex-col justify-between min-h-[120px] relative">
                
                <button onclick="event.stopPropagation(); abrirModalProducto(${prod.id})" class="solo-admin absolute top-2 right-2 text-gray-300 hover:text-orange-600 transition-colors p-1" title="Editar Producto">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                
                <div class="flex-1 pt-1 pr-6">
                    <span class="text-xs font-bold text-orange-600 mb-1 block">${prod.categoria || 'General'}</span>
                    <h3 class="font-bold text-gray-800 leading-tight">${prod.nombre}</h3>
                </div>
                <div class="text-lg font-black text-stone-800 mt-2">
                    Bs. ${prod.precio_venta}
                </div>
            </div>
        `;
    });
    
    // Ocultar botones '.solo-admin' si el rol actual es CAJERO
    const rolActual = localStorage.getItem('usuario_rol');
    if (rolActual === 'CAJERO' || rolActual === 'ALMACEN' || rolActual === 'LOGISTICA') {
        document.querySelectorAll('.solo-admin').forEach(el => el.style.display = 'none');
    }
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
                        <p class="text-xs text-gray-500">Bs. ${item.precio_unitario.toFixed(2)}</p>
                    </div>
                    
                    <div class="flex items-center bg-gray-100 rounded-lg mx-2 border">
                        <button onclick="modificarCantidad(${index}, 'resta')" class="px-2 py-1 text-gray-600 hover:text-red-500 font-bold">-</button>
                        <span class="px-2 text-sm font-bold w-6 text-center">${item.cantidad}</span>
                        <button onclick="modificarCantidad(${index}, 'suma')" class="px-2 py-1 text-gray-600 hover:text-green-500 font-bold">+</button>
                    </div>

                    <div class="text-right font-black text-stone-900 w-16">
                        Bs. ${item.subtotal.toFixed(2)}
                    </div>
                </div>
            `;
        });
    }

    const totalFormateado = totalVenta.toFixed(2);
    document.getElementById('subtotal-ticket').innerText = `Bs. ${totalFormateado}`;
    document.getElementById('total-ticket').innerText = `Bs. ${totalFormateado}`;
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
        usuario_id: parseInt(localStorage.getItem('usuario_id')) || 1,
        caja_id: localStorage.getItem('caja_id') ? parseInt(localStorage.getItem('caja_id')) : null,
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
        const vId = data.venta_id || (data.ticket && data.ticket.id); // <--- CORRECCIÓN DE ACCESO

        // Mostrar Modal de Éxito
        document.getElementById('info-ticket').innerText = `Ticket #${vId} | ${payload.metodo_pago}`;
        document.getElementById('modalExito').classList.remove('hidden');

    } catch (error) {
        alert("Error de Venta: " + error.message);
        btnCobrar.disabled = false;
        btnCobrar.innerHTML = `COBRAR Bs. <span id="btn-total">${totalVenta.toFixed(2)}</span>`;
    }
}

function cerrarModalExito() {
    document.getElementById('modalExito').classList.add('hidden');
    carritoVenta = [];
    actualizarTicket();
    document.getElementById('btn-cobrar').innerHTML = `COBRAR Bs. <span id="btn-total">0.00</span>`;
}

// --- 4. ADMINISTRACIÓN DE PRODUCTOS (SOLO ADMIN) ---
let categoriasParaModal = [];

async function cargarCategoriasSelect() {
    try {
        const res = await fetch('/api/ventas/categorias');
        if (res.ok) {
            categoriasParaModal = await res.json();
            const select = document.getElementById('inpProdCategoria');
            select.innerHTML = '<option value="">-- Sin categoría --</option>';
            categoriasParaModal.forEach(c => {
                select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
            });
        }
    } catch (e) {
        console.error("Error al cargar categorías", e);
    }
}

function abrirModalProducto(id = null) {
    document.getElementById('modalProductoAdmin').classList.remove('hidden');
    
    if (id) {
        document.getElementById('titulo-modal-producto').innerText = "Editar Producto";
        const prod = productosCatalogo.find(p => p.id === id);
        document.getElementById('inpProdId').value = prod.id;
        document.getElementById('inpProdNombre').value = prod.nombre;
        document.getElementById('inpProdPrecio').value = prod.precio_venta;
        
        // Buscar categoría_id coincidente por nombre
        const cat = categoriasParaModal.find(c => c.nombre === prod.categoria);
        document.getElementById('inpProdCategoria').value = cat ? cat.id : '';
    } else {
        document.getElementById('titulo-modal-producto').innerText = "Nuevo Producto";
        document.getElementById('formProducto').reset();
        document.getElementById('inpProdId').value = "";
    }
}

async function agregarNuevaCategoria() {
    const nombreCat = prompt("Ingrese el nombre de la nueva categoría:");
    if (!nombreCat || nombreCat.trim() === '') return;

    try {
        const res = await fetch('/api/ventas/categorias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombreCat.trim() })
        });
        
        if (res.ok) {
            const nuevaCat = await res.json();
            // Recargar categorías y volver a seleccionar la recién creada
            await cargarCategoriasSelect();
            document.getElementById('inpProdCategoria').value = nuevaCat.id;
        } else {
            const errorData = await res.json();
            alert(errorData.error || "Error al crear la categoría");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión al crear categoría.");
    }
}

function cerrarModalProducto() {
    document.getElementById('modalProductoAdmin').classList.add('hidden');
}

async function guardarProducto() {
    const id = document.getElementById('inpProdId').value;
    const nombre = document.getElementById('inpProdNombre').value.trim();
    const precio_venta = document.getElementById('inpProdPrecio').value;
    const categoria_id = document.getElementById('inpProdCategoria').value || null;

    const btn = document.getElementById('btnGuardarProd');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        let url = '/api/ventas/productos';
        let method = 'POST';

        if (id) {
            url += `/${id}`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, precio_venta, categoria_id })
        });

        if (!res.ok) throw new Error("Error al guardar");

        cerrarModalProducto();
        await cargarProductos(); // Refresh catalogo
    } catch (error) {
        alert(error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Guardar';
    }
}

// Utilidad: Reloj de la barra superior
function iniciarReloj() {
    setInterval(() => {
        const ahora = new Date();
        document.getElementById('reloj').innerText = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
}