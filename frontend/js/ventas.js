// frontend/js/ventas.js
let productosCatalogo = [];
let carritoVenta = [];
let totalVenta = 0;
let ultimaVentaId = null;

document.addEventListener('DOMContentLoaded', () => {
    cargarProductos();
    iniciarReloj();
    verificarEstadoCaja();

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

    let prodIndex = 0;

    // Agrupar por categoría
    const productosPorCategoria = {};
    filtrados.forEach(prod => {
        const cat = prod.categoria || 'General';
        if (!productosPorCategoria[cat]) {
            productosPorCategoria[cat] = [];
        }
        productosPorCategoria[cat].push(prod);
    });

    // Obtener las categorías ordenadas
    const categorias = Object.keys(productosPorCategoria).sort();

    if (categorias.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-400 font-medium italic text-sm">
                No se encontraron productos en el catálogo.
            </div>
        `;
        return;
    }

    categorias.forEach(cat => {
        const catCleanId = cat.replace(/[^a-zA-Z0-9]/g, '_');
        const isCollapsed = (filtro === ''); // Colapsado por defecto si no hay filtro de búsqueda
        
        // Renderizar el encabezado de categoría
        const headerHtml = `
            <div class="col-span-full mt-4 first:mt-1 mb-1 border-b border-gray-100 pb-1">
                <button onclick="toggleCategoriaCollapse('${catCleanId}')" class="w-full text-left focus:outline-none flex items-center justify-between hover:opacity-80 transition-opacity py-1">
                    <h3 class="text-xs font-black text-stone-500 uppercase tracking-widest flex items-center gap-2 select-none">
                        <span class="w-1.5 h-3 bg-orange-500 rounded-full"></span>
                        ${cat}
                        <span class="text-[10px] text-slate-400 font-medium font-mono">(${productosPorCategoria[cat].length})</span>
                    </h3>
                    <i id="icon-cat-${catCleanId}" class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-slate-400 text-xs transition-transform duration-300"></i>
                </button>
            </div>
        `;

        let productsHtml = '';
        productosPorCategoria[cat].forEach(prod => {
            prodIndex++;
            const delayClass = `delay-${Math.min(prodIndex, 12)}`;
            productsHtml += `
                <div onclick="agregarAlCarrito(${prod.id})" class="animate-fade-in-up ${delayClass} bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md hover:border-orange-500 transition-all select-none flex flex-col justify-between overflow-hidden relative min-h-[160px] btn-bounce">
                    <!-- Imagen -->
                    <div class="h-24 w-full bg-slate-100 flex items-center justify-center shrink-0 border-b border-gray-100 relative overflow-hidden">
                        ${prod.imagen_url ? 
                            `<img src="${prod.imagen_url}" class="w-full h-full object-cover" alt="${prod.nombre}">` : 
                            `<div class="w-full h-full bg-gradient-to-br from-orange-50 to-orange-100/50 flex items-center justify-center">
                                <i class="fa-solid fa-mug-hot text-orange-300 text-2xl"></i>
                             </div>`
                        }
                        
                        <!-- Botones de Admin -->
                        <div class="solo-admin absolute top-2 right-2 flex items-center gap-1 bg-white/95 backdrop-blur-sm px-1.5 py-0.5 rounded-lg shadow-sm border border-gray-100">
                            <button onclick="event.stopPropagation(); abrirModalProducto(${prod.id})" class="text-slate-500 hover:text-indigo-600 transition-colors p-1 btn-bounce" title="Editar Producto">
                                <i class="fa-solid fa-pen-to-square text-xs"></i>
                            </button>
                            <button onclick="event.stopPropagation(); eliminarProducto(${prod.id}, '${prod.nombre.replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-rose-600 transition-colors p-1 btn-bounce" title="Borrar Producto">
                                <i class="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Info -->
                    <div class="p-3 flex-grow flex flex-col justify-between">
                        <h3 class="font-bold text-gray-800 leading-tight text-xs sm:text-sm line-clamp-2">${prod.nombre}</h3>
                        <div class="text-sm sm:text-base font-black text-stone-800 mt-1.5">
                            Bs. ${prod.precio_venta}
                        </div>
                    </div>
                </div>
            `;
        });

        const subgridHtml = `
            <div id="grid-cat-${catCleanId}" class="col-span-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 transition-all duration-300 pb-2 ${isCollapsed ? 'hidden' : ''}">
                ${productsHtml}
            </div>
        `;

        contenedor.innerHTML += headerHtml + subgridHtml;
    });
    
    // Ocultar botones '.solo-admin' dentro del catálogo si el rol actual es CAJERO
    const rolActual = localStorage.getItem('usuario_rol');
    if (rolActual === 'CAJERO' || rolActual === 'ALMACEN' || rolActual === 'LOGISTICA') {
        contenedor.querySelectorAll('.solo-admin').forEach(el => el.style.display = 'none');
    }
}

async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Estás seguro de eliminar el producto "${nombre}"? Esta acción borrará también su historial de ventas asociado.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/ventas/productos/${id}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Error al eliminar');
        }

        alert(`✅ Producto "${nombre}" eliminado con éxito.`);
        cargarProductos(); // Recargar catálogo
    } catch (error) {
        alert('🚨 Error: ' + error.message);
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

    const cajaId = localStorage.getItem('caja_id');

    if (carritoVenta.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center text-gray-400 mt-10 text-sm">
                <i class="fa-solid fa-basket-shopping text-4xl mb-3 opacity-20"></i>
                <p>No hay productos en el ticket</p>
            </div>`;
        document.getElementById('btn-cobrar').disabled = true;
        if (!cajaId) {
            document.getElementById('btn-cobrar').innerHTML = '🚫 CAJA CERRADA';
        } else {
            document.getElementById('btn-cobrar').innerHTML = 'COBRAR Bs. <span id="btn-total">0.00</span>';
        }
    } else {
        if (!cajaId) {
            document.getElementById('btn-cobrar').disabled = true;
            document.getElementById('btn-cobrar').innerHTML = '🚫 ABRIR CAJA PRIMERO';
        } else {
            document.getElementById('btn-cobrar').disabled = false;
            document.getElementById('btn-cobrar').innerHTML = `COBRAR Bs. <span id="btn-total">0.00</span>`;
        }
        
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
                        <button onclick="modificarCantidad(${index}, 'resta')" class="px-2 py-1 text-gray-600 hover:text-red-500 font-bold btn-bounce">-</button>
                        <span class="px-2 text-sm font-bold w-6 text-center">${item.cantidad}</span>
                        <button onclick="modificarCantidad(${index}, 'suma')" class="px-2 py-1 text-gray-600 hover:text-green-500 font-bold btn-bounce">+</button>
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
    if (cajaId && carritoVenta.length > 0) {
        document.getElementById('btn-total').innerText = totalFormateado;
    }
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
        ultimaVentaId = vId;

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
    ultimaVentaId = null;
}

async function imprimirUltimoRecibo() {
    if (!ultimaVentaId) {
        alert("No hay ninguna venta reciente para imprimir.");
        return;
    }
    try {
        const res = await fetch(`/api/comprobantes/${ultimaVentaId}`);
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

        // Imprimir
        document.body.classList.add('print-ticket');
        window.print();
        document.body.classList.remove('print-ticket');

    } catch (error) {
        alert("Error al imprimir ticket: " + error.message);
    }
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
    
    const previewImg = document.getElementById('imgPreviewProdFoto');
    const previewIcon = document.getElementById('iconPreviewProdFoto');
    const hiddenUrl = document.getElementById('inpProdFotoUrl');

    if (id) {
        document.getElementById('titulo-modal-producto').innerText = "Editar Producto";
        const prod = productosCatalogo.find(p => p.id === id);
        document.getElementById('inpProdId').value = prod.id;
        document.getElementById('inpProdNombre').value = prod.nombre;
        document.getElementById('inpProdPrecio').value = prod.precio_venta;
        
        // Buscar categoría_id coincidente por nombre
        const cat = categoriasParaModal.find(c => c.nombre === prod.categoria);
        document.getElementById('inpProdCategoria').value = cat ? cat.id : '';

        // Reset and populate photo previews
        if (prod.imagen_url) {
            hiddenUrl.value = prod.imagen_url;
            previewImg.src = prod.imagen_url;
            previewImg.classList.remove('hidden');
            previewIcon.classList.add('hidden');
        } else {
            hiddenUrl.value = '';
            previewImg.src = '';
            previewImg.classList.add('hidden');
            previewIcon.classList.remove('hidden');
        }
    } else {
        document.getElementById('titulo-modal-producto').innerText = "Nuevo Producto";
        document.getElementById('formProducto').reset();
        document.getElementById('inpProdId').value = "";

        // Reset photo preview
        hiddenUrl.value = '';
        previewImg.src = '';
        previewImg.classList.add('hidden');
        previewIcon.classList.remove('hidden');
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
            // Recargar categorías and volver a seleccionar la recién creada
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

async function subirFotoProducto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const previewImg = document.getElementById('imgPreviewProdFoto');
    const previewIcon = document.getElementById('iconPreviewProdFoto');
    const hiddenUrl = document.getElementById('inpProdFotoUrl');
    const btnGuardar = document.getElementById('btnGuardarProd');

    // Show loading state on button
    btnGuardar.disabled = true;
    const oldBtnText = btnGuardar.innerHTML;
    btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Subiendo...';

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

async function guardarProducto() {
    const id = document.getElementById('inpProdId').value;
    const nombre = document.getElementById('inpProdNombre').value.trim();
    const precio_venta = document.getElementById('inpProdPrecio').value;
    const categoria_id = document.getElementById('inpProdCategoria').value || null;
    const imagen_url = document.getElementById('inpProdFotoUrl').value || null;

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
            body: JSON.stringify({ nombre, precio_venta, categoria_id, imagen_url })
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

// Verificar el estado de la caja al cargar la pantalla
async function verificarEstadoCaja() {
    try {
        const usuarioId = localStorage.getItem('usuario_id') || 1;
        const res = await fetch(`/api/caja/estado?usuario_id=${usuarioId}`);
        const data = await res.json();
        
        if (data.abierta) {
            localStorage.setItem('caja_id', data.caja.id);
            actualizarTicket();
        } else {
            localStorage.removeItem('caja_id');
            actualizarTicket();
        }
    } catch (e) {
        console.error("Error al verificar estado de caja:", e);
    }
}

// Alternar la visibilidad de los productos de una categoría en el POS
function toggleCategoriaCollapse(catId) {
    const el = document.getElementById(`grid-cat-${catId}`);
    const icon = document.getElementById(`icon-cat-${catId}`);
    if (el && icon) {
        if (el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            el.classList.add('hidden');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
}

window.imprimirUltimoRecibo = imprimirUltimoRecibo;