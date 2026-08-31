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

    // Mesas listas para cobrar: primera carga + sondeo periódico (tiempo casi real)
    cargarMesasParaCobrar();
    setInterval(cargarMesasParaCobrar, 8000);

    // Si esta pantalla se queda abierta y en otro lado se cierra la caja y se abre
    // una nueva (cambio de turno), antes el botón de cobrar seguía "activo" con el
    // caja_id viejo guardado en localStorage. El backend ya no confía en ese valor,
    // pero igual se revisa el estado periódicamente para que el botón refleje la
    // realidad (ej. mostrar "CAJA CERRADA" si corresponde) sin esperar un recargo manual.
    setInterval(() => {
        if (document.hidden) return;
        verificarEstadoCaja();
    }, 20000);
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
        
        // Renderizar el encabezado de categoría (pegajoso al hacer scroll)
        const headerHtml = `
            <div class="col-span-full sticky top-0 z-10 bg-mainBg/95 backdrop-blur-sm mt-3 first:mt-0 mb-1 border-b border-slate-200/70 pb-1">
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
                <div onclick="agregarAlCarrito(${prod.id})" class="animate-fade-in-up ${delayClass} group bg-white rounded-2xl shadow-sm border border-slate-200/80 cursor-pointer hover:shadow-lg hover:shadow-orange-500/10 hover:border-orange-400 hover:-translate-y-0.5 transition-all duration-200 select-none flex flex-col justify-between overflow-hidden relative min-h-[160px] btn-bounce">
                    <!-- Imagen -->
                    <div class="h-24 w-full bg-slate-100 flex items-center justify-center shrink-0 relative overflow-hidden">
                        ${prod.imagen_url ?
                            `<img src="${prod.imagen_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${prod.nombre}">` :
                            `<div class="w-full h-full bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100/60 flex items-center justify-center">
                                <i class="fa-solid fa-mug-hot text-orange-300 text-2xl group-hover:scale-110 transition-transform duration-300"></i>
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

    // Actualizar contador de artículos del encabezado del ticket
    const elCount = document.getElementById('ticket-count');
    if (elCount) elCount.innerText = carritoVenta.reduce((acc, it) => acc + it.cantidad, 0);

    if (carritoVenta.length === 0) {
        contenedor.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center text-slate-400 py-8">
                <div class="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center mb-3">
                    <i class="fa-solid fa-basket-shopping text-2xl opacity-30"></i>
                </div>
                <p class="text-sm font-semibold">Ticket vacío</p>
                <p class="text-xs text-slate-300 mt-1">Toca un producto para agregarlo</p>
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
        document.getElementById('t-titulo').innerText = 'TICKET #';
        document.getElementById('t-id').innerText = data.ticket.id.toString().padStart(4, '0');
        document.getElementById('t-fecha').innerText = data.ticket.fecha;
        document.getElementById('t-total').innerText = `Bs. ${data.ticket.total}`;
        document.getElementById('lbl-pago').innerText = 'PAGO:';
        document.getElementById('t-pago').innerText = data.ticket.metodo_pago;
        document.getElementById('t-pie').innerHTML = '<p>¡Gracias por tu compra!</p><p>Vuelve pronto a Café La Paz</p>';

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

// === 5. PEDIDOS DE MESA EN VIVO: estado y cobro (Cajero y Admin) ===
// Muestra TODOS los pedidos que el mesero envía a una mesa, con su estado de
// cocina y de entrega. El botón "Cobrar" solo se habilita cuando cocina marcó
// COMPLETADA o el mesero ya ENTREGÓ el pedido.
let mesasActivasTodas = [];
let mesasListasCobro = [];
let comandaSeleccionadaCobro = null;
let primeraCargaMesasCobroHecha = false;

async function cargarMesasParaCobrar() {
    try {
        const res = await fetch('/api/comandas/mesas-estado');
        if (!res.ok) return;
        const data = await res.json();

        const activas = data.filter(m => m.estado === 'ocupada' && m.comanda);
        const listas = activas.filter(m => {
            const c = m.comanda;
            return c.estado === 'ENTREGADA' || c.estado_cocina === 'COMPLETADA';
        });

        // Avisar de inmediato cuando una mesa pasa a estar lista (no en la primera carga)
        if (primeraCargaMesasCobroHecha) {
            const idsAnteriores = new Set(mesasListasCobro.map(m => m.comanda.id));
            listas.filter(m => !idsAnteriores.has(m.comanda.id)).forEach(m => {
                mostrarToast(`🔔 Mesa ${m.mesa} está lista para cobrar`);
            });
        }
        primeraCargaMesasCobroHecha = true;

        mesasActivasTodas = activas;
        mesasListasCobro = listas;
        actualizarBadgeMesasCobro();

        // Si el panel de lista está abierto, refrescarlo también
        const modal = document.getElementById('modalMesasCobro');
        if (modal && !modal.classList.contains('hidden')) {
            renderizarListaMesasCobro();
        }
    } catch (e) {
        console.error('Error al cargar mesas para cobrar:', e);
    }
}

function actualizarBadgeMesasCobro() {
    const badge = document.getElementById('badge-mesas-cobro');
    if (!badge) return;
    if (mesasListasCobro.length > 0) {
        badge.innerText = mesasListasCobro.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function abrirModalMesasCobro() {
    renderizarListaMesasCobro();
    document.getElementById('modalMesasCobro').classList.remove('hidden');
    cargarMesasParaCobrar();
}

function cerrarModalMesasCobro() {
    document.getElementById('modalMesasCobro').classList.add('hidden');
}

function chipEstadoPedido(estado, estadoCocina) {
    let chips = '';
    if (estadoCocina === 'PENDIENTE') {
        chips += `<span class="text-[9px] md:text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-700">🕐 En cocina</span>`;
    } else if (estadoCocina === 'COMPLETADA') {
        chips += `<span class="text-[9px] md:text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">✅ Cocina lista</span>`;
    } else if (estadoCocina === 'RECHAZADA') {
        chips += `<span class="text-[9px] md:text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-rose-100 text-rose-700">✖ Rechazado en cocina</span>`;
    }

    if (estado === 'ENTREGADA') {
        chips += `<span class="text-[9px] md:text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-sky-100 text-sky-700">🍽️ Entregado</span>`;
    } else if (estado === 'CREADA') {
        chips += `<span class="text-[9px] md:text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-slate-100 text-slate-600">📋 Pedido abierto</span>`;
    }

    return chips;
}

function renderizarListaMesasCobro() {
    const cont = document.getElementById('lista-mesas-cobro');
    if (!cont) return;

    if (mesasActivasTodas.length === 0) {
        cont.innerHTML = `<div class="text-center text-slate-400 text-sm md:text-base py-10 italic">No hay pedidos activos de mesero por ahora.</div>`;
        return;
    }

    cont.innerHTML = mesasActivasTodas.map(m => {
        const c = m.comanda;
        const total = parseFloat(c.total).toFixed(2);
        const listaParaCobrar = c.estado === 'ENTREGADA' || c.estado_cocina === 'COMPLETADA';

        const itemsHtml = (c.items || []).map(it => `
            <div class="flex justify-between text-xs md:text-sm text-slate-500 py-0.5">
                <span>${it.cantidad}x ${it.nombre}${it.notas ? ` <span class="italic text-slate-400">(${it.notas})</span>` : ''}</span>
                <span class="shrink-0 pl-2">Bs. ${parseFloat(it.subtotal).toFixed(2)}</span>
            </div>
        `).join('');

        return `
            <div class="rounded-xl border ${listaParaCobrar ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'} p-3 md:p-4">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-black shrink-0 md:text-lg">${m.mesa}</div>
                        <div>
                            <p class="font-bold text-stone-800 text-sm md:text-base">Mesa ${m.mesa}</p>
                            <p class="text-xs md:text-sm text-slate-500">Mesero: ${c.mesero_nombre || '-'}</p>
                        </div>
                    </div>
                    <p class="font-black text-orange-600 shrink-0 md:text-lg">Bs. ${total}</p>
                </div>
                <div class="flex flex-wrap items-center gap-1.5 mb-2">
                    ${chipEstadoPedido(c.estado, c.estado_cocina)}
                </div>
                <div class="border-t border-dashed border-gray-200 pt-1.5 mb-2">
                    ${itemsHtml}
                </div>
                ${c.notas ? `<p class="text-xs md:text-sm italic text-slate-500 mb-2">📝 ${c.notas}</p>` : ''}
                <button onclick="imprimirPreCuentaMesa(${c.id})" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs md:text-sm font-bold py-2 md:py-2.5 rounded-lg transition-colors btn-bounce mb-1.5">
                    <i class="fa-solid fa-receipt mr-1"></i> Imprimir Pre-cuenta
                </button>
                ${listaParaCobrar
                    ? `<button onclick="abrirModalPagoMesa(${c.id}, '${m.mesa}', ${c.total})" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-bold py-2 md:py-2.5 rounded-lg transition-colors btn-bounce">
                        <i class="fa-solid fa-cash-register mr-1"></i> Cobrar Mesa
                    </button>`
                    : `<div class="w-full bg-gray-100 text-gray-400 text-xs md:text-sm font-bold py-2 md:py-2.5 rounded-lg text-center">
                        <i class="fa-solid fa-hourglass-half mr-1"></i> Todavía preparándose
                    </div>`
                }
            </div>
        `;
    }).join('');
}

function imprimirPreCuentaMesa(comandaId) {
    const m = mesasActivasTodas.find(m => m.comanda.id === comandaId);
    if (!m) {
        alert('No se encontró el pedido de esa mesa.');
        return;
    }
    const c = m.comanda;

    document.getElementById('t-titulo').innerText = 'PRE-CUENTA - PEDIDO #';
    document.getElementById('t-id').innerText = c.id;
    document.getElementById('t-fecha').innerText = new Date().toLocaleString('es-BO');
    document.getElementById('t-total').innerText = `Bs. ${parseFloat(c.total).toFixed(2)}`;
    document.getElementById('lbl-pago').innerText = 'MESA:';
    document.getElementById('t-pago').innerText = m.mesa;
    document.getElementById('t-pie').innerHTML = '<p>Documento sin validez fiscal</p>';

    const tbodyItems = document.getElementById('t-items');
    tbodyItems.innerHTML = '';
    (c.items || []).forEach(item => {
        tbodyItems.innerHTML += `
            <tr class="border-b border-gray-100">
                <td class="py-2 text-center">${item.cantidad}</td>
                <td class="py-2">${item.nombre}</td>
                <td class="py-2 text-right">Bs. ${parseFloat(item.subtotal).toFixed(2)}</td>
            </tr>
        `;
    });

    document.body.classList.add('print-ticket');
    window.print();
    document.body.classList.remove('print-ticket');
}

function abrirModalPagoMesa(comandaId, numMesa, total) {
    comandaSeleccionadaCobro = { id: comandaId, mesa: numMesa, total: total };
    document.getElementById('lbl-mesa-pago').innerText = numMesa;
    document.getElementById('lbl-monto-pago-mesa').innerText = `Bs. ${parseFloat(total).toFixed(2)}`;
    cerrarModalMesasCobro();
    document.getElementById('modalPagoMesa').classList.remove('hidden');
}

function cerrarModalPagoMesa() {
    document.getElementById('modalPagoMesa').classList.add('hidden');
    comandaSeleccionadaCobro = null;
}

async function confirmarPagoMesa() {
    if (!comandaSeleccionadaCobro) return;
    const btn = document.getElementById('btn-confirmar-pago-mesa');
    const metodoPago = document.getElementById('sel-metodo-pago-mesa').value;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

    try {
        const res = await fetch(`/api/comandas/${comandaSeleccionadaCobro.id}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                metodo_pago: metodoPago,
                usuario_id: parseInt(localStorage.getItem('usuario_id')) || 1
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cobrar la mesa');

        const numMesa = comandaSeleccionadaCobro.mesa;
        ultimaVentaId = data.venta_id;

        cerrarModalPagoMesa();
        cargarMesasParaCobrar();

        // Reutiliza el modal de éxito / impresión que ya usa el Punto de Venta directo
        document.getElementById('info-ticket').innerText = `Mesa ${numMesa} cobrada | Ticket #${ultimaVentaId}`;
        document.getElementById('modalExito').classList.remove('hidden');
    } catch (e) {
        alert('❌ Error al cobrar: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Cobrar';
    }
}

function mostrarToast(mensaje) {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const toast = document.createElement('div');
    toast.className = 'animate-fade-in-up bg-slate-900 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg max-w-xs';
    toast.innerText = mensaje;
    cont.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

window.abrirModalMesasCobro = abrirModalMesasCobro;
window.cerrarModalMesasCobro = cerrarModalMesasCobro;
window.abrirModalPagoMesa = abrirModalPagoMesa;
window.cerrarModalPagoMesa = cerrarModalPagoMesa;
window.confirmarPagoMesa = confirmarPagoMesa;