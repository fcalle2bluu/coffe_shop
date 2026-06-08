// frontend/js/venta_mesa.js

let listaProductosGlobal = [];
let mesasGlobal = [];
let pisoActualVentas = 'PLANTA_BAJA';
let comandaActivaMesa = null; // Si la mesa elegida tiene comanda activa
let comandaActivaItems = [];  // Items de la comanda activa guardada
let carritoComanda = [];      // Carrito temporal para comandas nuevas o agregados
let mesaSeleccionada = null;  // Mesa actualmente elegida
let modoEdicionActivo = false; // true si estamos editando/añadiendo items a comanda existente

const usuarioId = parseInt(localStorage.getItem('usuario_id')) || 1;
const usuarioRol = localStorage.getItem('usuario_rol') || 'CAJERO';
const usuarioNombre = localStorage.getItem('usuario_nombre') || 'Usuario';

document.addEventListener('DOMContentLoaded', () => {
    // Rellenar cabecera de usuario
    document.getElementById('nombre-usuario').innerText = usuarioNombre;
    document.getElementById('avatar-letra').innerText = usuarioNombre.charAt(0).toUpperCase();
    document.getElementById('rol-usuario').innerHTML = `<i class="fa-solid fa-circle text-[10px] mr-1 text-emerald-500"></i> ${usuarioRol}`;

    // Cargar Catálogo e Inicializar Mesas
    cargarCatalogo();
    cargarMesas();

    // Listener buscador
    document.getElementById('buscarProducto').addEventListener('input', (e) => {
        renderizarCatalogo(e.target.value.trim());
    });

    // Ocultar elementos solo admin
    if (usuarioRol === 'CAJERO' || usuarioRol === 'MESERO') {
        document.querySelectorAll('.solo-admin').forEach(el => el.style.display = 'none');
    }
});

// 1. Cargar productos desde el endpoint de ventas
async function cargarCatalogo() {
    try {
        const res = await fetch('/api/ventas/productos');
        if (!res.ok) throw new Error('Error al cargar catálogo');
        listaProductosGlobal = await res.json();
    } catch (e) {
        console.error("Error catálogo:", e);
    }
}

// 2. Obtener y renderizar la disponibilidad de mesas
async function cargarMesas() {
    try {
        const res = await fetch('/api/comandas/mesas-estado');
        if (!res.ok) throw new Error('Error al cargar mesas');
        mesasGlobal = await res.json();
        renderizarMesas();
    } catch (e) {
        console.error("Error mesas:", e);
        document.getElementById('lienzo-venta-mesas').innerHTML = `
            <div class="absolute inset-0 flex items-center justify-center text-red-500 font-bold text-xs">
                Error al cargar el estado de las mesas.
            </div>
        `;
    }
}

// Cambiar de piso en la visualización
function cambiarPisoVentas(piso) {
    pisoActualVentas = piso;
    
    const btnPb = document.getElementById('btn-piso-pb');
    const btnPa = document.getElementById('btn-piso-pa');
    
    if (piso === 'PLANTA_BAJA') {
        btnPb.className = "px-4 py-2 rounded-lg font-bold text-xs bg-white text-orange-600 shadow-sm transition-all focus:outline-none";
        btnPa.className = "px-4 py-2 rounded-lg font-bold text-xs text-slate-500 hover:text-slate-700 transition-all focus:outline-none";
    } else {
        btnPb.className = "px-4 py-2 rounded-lg font-bold text-xs text-slate-500 hover:text-slate-700 transition-all focus:outline-none";
        btnPa.className = "px-4 py-2 rounded-lg font-bold text-xs bg-white text-orange-600 shadow-sm transition-all focus:outline-none";
    }
    
    renderizarMesas();
}

function renderizarMesas() {
    const contenedor = document.getElementById('lienzo-venta-mesas');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    // Filtrar mesas por piso activo
    const mesasFiltradas = mesasGlobal.filter(m => m.piso === pisoActualVentas);

    if (mesasFiltradas.length === 0) {
        contenedor.innerHTML = `
            <div class="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-xs">
                No hay mesas registradas en este piso.
            </div>
        `;
        return;
    }

    mesasFiltradas.forEach(m => {
        const esOcupada = m.estado === 'ocupada';
        
        // Colores premium
        const colorBg = esOcupada ? 'bg-rose-50 border-rose-300 hover:bg-rose-100/90' : 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100/90';
        const colorText = esOcupada ? 'text-rose-800' : 'text-emerald-800';
        const badgeColor = esOcupada ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white';
        const ringPulse = esOcupada ? 'ring-4 ring-rose-400/20' : 'hover:ring-4 hover:ring-emerald-400/20';

        const totalComanda = esOcupada ? `<span class="text-[10px] text-rose-600 font-black leading-none mt-1">Bs. ${parseFloat(m.comanda.total).toFixed(2)}</span>` : '';
        const estadoLabel = esOcupada ? m.comanda.estado : 'Libre';

        const cardHtml = `
            <div onclick="seleccionarMesa('${m.mesa}')" class="absolute w-20 h-20 rounded-2xl border-2 flex flex-col items-center justify-center shadow-md cursor-pointer select-none transition-all duration-300 transform hover:scale-105 hover:-translate-y-0.5 ${colorBg} ${ringPulse}"
                 style="left: ${m.pos_x}%; top: ${m.pos_y}%; transform: translate(-50%, -50%);">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black leading-none ${badgeColor}">
                    ${m.mesa}
                </span>
                <span class="text-[9px] font-bold uppercase tracking-wider ${colorText} mt-1 leading-none">
                    Mesa ${m.mesa}
                </span>
                <span class="text-[7px] text-slate-500 font-black uppercase mt-0.5 tracking-tight leading-none">
                    ${estadoLabel}
                </span>
                ${totalComanda}
            </div>
        `;
        contenedor.innerHTML += cardHtml;
    });
}

// 3. Seleccionar una mesa y cargar sus datos
async function seleccionarMesa(numero) {
    mesaSeleccionada = numero;
    modoEdicionActivo = false;
    carritoComanda = [];
    comandaActivaMesa = null;
    comandaActivaItems = [];

    // Marcar mesa activa en UI
    document.getElementById('ticket-titulo').innerText = `Mesa #${numero}`;
    
    // Consultar estado de la mesa en el backend
    try {
        const res = await fetch(`/api/comandas/mesa/${numero}`);
        const data = await res.json();

        if (data.activa) {
            comandaActivaMesa = data.comanda;
            comandaActivaItems = data.items;
            renderizarDetalleComandaActiva();
        } else {
            renderizarComandaVacia();
        }
    } catch (e) {
        console.error("Error al seleccionar mesa:", e);
    }
}

// 4. Renderizar comanda vacía (Mesa libre)
function renderizarComandaVacia() {
    document.getElementById('ticket-estado').classList.add('hidden');
    document.getElementById('btn-limpiar-pedido').classList.add('hidden');
    
    const itemsCont = document.getElementById('ticket-items');
    itemsCont.innerHTML = `
        <div class="text-center text-slate-400 mt-10 text-sm">
            <i class="fa-solid fa-mug-hot text-4xl mb-3 opacity-20 text-orange-600"></i>
            <p class="font-bold text-slate-700">Mesa Disponible</p>
            <p class="text-xs mt-1">La mesa está vacía y lista para recibir clientes.</p>
        </div>
    `;

    document.getElementById('subtotal-ticket').innerText = 'Bs. 0.00';
    document.getElementById('total-ticket').innerText = 'Bs. 0.00';

    const accionesCont = document.getElementById('seccion-acciones-mesa');
    accionesCont.innerHTML = `
        <button onclick="iniciarPedidoMesa()" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors btn-bounce flex items-center justify-center gap-2">
            <i class="fa-solid fa-plus"></i> Abrir Pedido / Comanda
        </button>
    `;
}

// 5. Renderizar detalles de comanda activa
function renderizarDetalleComandaActiva() {
    const estado = comandaActivaMesa.estado;
    const estElem = document.getElementById('ticket-estado');
    estElem.classList.remove('hidden');
    estElem.innerText = estado;

    // Colorear badge de estado
    if (estado === 'CREADA') {
        estElem.className = 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border mt-1 bg-amber-50 text-amber-700 border-amber-200';
    } else {
        estElem.className = 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border mt-1 bg-indigo-50 text-indigo-700 border-indigo-200';
    }

    document.getElementById('btn-limpiar-pedido').classList.add('hidden');

    const itemsCont = document.getElementById('ticket-items');
    itemsCont.innerHTML = '';

    comandaActivaItems.forEach(item => {
        itemsCont.innerHTML += `
            <div class="flex items-center justify-between py-2 border-b border-slate-100">
                <div class="flex-grow pr-2">
                    <h4 class="text-xs font-bold text-slate-800 leading-tight">${item.producto_nombre}</h4>
                    <span class="text-[10px] text-slate-400">Cant: ${item.cantidad} x Bs. ${item.precio_unitario}</span>
                </div>
                <div class="text-xs font-black text-slate-800 text-right shrink-0">
                    Bs. ${parseFloat(item.subtotal).toFixed(2)}
                </div>
            </div>
        `;
    });

    document.getElementById('subtotal-ticket').innerText = `Bs. ${parseFloat(comandaActivaMesa.total).toFixed(2)}`;
    document.getElementById('total-ticket').innerText = `Bs. ${parseFloat(comandaActivaMesa.total).toFixed(2)}`;

    // Acciones según Rol y Estado
    const accionesCont = document.getElementById('seccion-acciones-mesa');
    accionesCont.innerHTML = '';

    // A. Botón de Imprimir Comanda (Siempre visible para ver o llevar a cocina)
    accionesCont.innerHTML += `
        <button onclick="abrirModalImpresionComanda()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl border transition-colors btn-bounce flex items-center justify-center gap-2 text-xs">
            <i class="fa-solid fa-print"></i> Imprimir Comanda (Cocina)
        </button>
    `;

    // B. Botón de Modificar Pedido (Solo para mesero o admin, y estado CREADA)
    if (estado === 'CREADA' && (usuarioRol === 'MESERO' || usuarioRol === 'ADMIN')) {
        accionesCont.innerHTML += `
            <button onclick="modificarComandaActiva()" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl transition-colors btn-bounce flex items-center justify-center gap-2 text-xs">
                <i class="fa-solid fa-pen-to-square"></i> Modificar Pedido
            </button>
        `;
    }

    // C. Botón "Entregar Comida" (Para mesero o admin, si está en estado CREADA)
    if (estado === 'CREADA' && (usuarioRol === 'MESERO' || usuarioRol === 'ADMIN')) {
        accionesCont.innerHTML += `
            <button onclick="marcarComandaEntregada()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors btn-bounce flex items-center justify-center gap-2 text-sm mt-1">
                <i class="fa-solid fa-hand-holding-hand"></i> Marcar como Entregado
            </button>
        `;
    }

    // D. Botón "Cobrar Comanda" (Para cajero o admin)
    if (usuarioRol === 'CAJERO' || usuarioRol === 'ADMIN') {
        accionesCont.innerHTML += `
            <button onclick="abrirModalCobroComanda()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors btn-bounce flex items-center justify-center gap-2 text-sm mt-1">
                <i class="fa-solid fa-cash-register"></i> COBRAR COMANDA
            </button>
        `;
    }

    // E. Botón de Cancelar Comanda (Solo Admin)
    if (usuarioRol === 'ADMIN') {
        accionesCont.innerHTML += `
            <button onclick="cancelarComandaActiva()" class="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-2 rounded-xl transition-colors btn-bounce text-xs mt-2 border border-rose-200">
                <i class="fa-solid fa-ban mr-1"></i> Cancelar / Desocupar Mesa
            </button>
        `;
    }
}

// 6. Iniciar flujo de agregar pedido
function iniciarPedidoMesa() {
    carritoComanda = [];
    modoEdicionActivo = false;
    document.getElementById('lbl-mesa-activa').innerText = `Mesa #${mesaSeleccionada}`;
    mostrarVistaCatalogo();
    actualizarTicketEdicion();
}

function modificarComandaActiva() {
    modoEdicionActivo = true;
    
    // Clonar items guardados al carrito local
    carritoComanda = comandaActivaItems.map(item => ({
        producto_id: item.producto_id,
        nombre: item.producto_name,
        precio_unitario: parseFloat(item.precio_unitario),
        cantidad: item.cantidad,
        subtotal: parseFloat(item.subtotal)
    }));

    document.getElementById('lbl-mesa-activa').innerText = `Editando Mesa #${mesaSeleccionada}`;
    mostrarVistaCatalogo();
    actualizarTicketEdicion();
}

// 7. Navegación entre paneles del catálogo y las mesas
function mostrarVistaMesas() {
    document.getElementById('vista-catalogo').classList.add('hidden');
    document.getElementById('vista-mesas').classList.remove('hidden');
    
    // Si teníamos seleccionada una mesa, volver a mostrar su estado
    if (mesaSeleccionada) {
        seleccionarMesa(mesaSeleccionada);
    }
}

function mostrarVistaCatalogo() {
    document.getElementById('vista-mesas').classList.add('hidden');
    document.getElementById('vista-catalogo').classList.remove('hidden');
    renderizarCatalogo();
}

// 8. Renderizar catálogo de productos
function renderizarCatalogo(filtro = '') {
    const contenedor = document.getElementById('grid-productos');
    contenedor.innerHTML = '';

    // Agrupar productos por categoría
    const prodPorCat = {};
    listaProductosGlobal.forEach(p => {
        if (filtro && !p.nombre.toLowerCase().includes(filtro.toLowerCase())) return;
        const cat = p.categoria || 'Sin Categoría';
        if (!prodPorCat[cat]) prodPorCat[cat] = [];
        prodPorCat[cat].push(p);
    });

    const categorias = Object.keys(prodPorCat).sort();
    if (categorias.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-8 text-center text-slate-400 font-medium italic text-xs">
                No se encontraron productos coincidentes.
            </div>
        `;
        return;
    }

    categorias.forEach(cat => {
        const catCleanId = cat.replace(/[^a-zA-Z0-9]/g, '_');
        
        const headerHtml = `
            <div class="col-span-full mt-4 first:mt-1 mb-1 border-b pb-1">
                <div class="w-full text-left flex items-center justify-between py-1">
                    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <span class="w-1.5 h-3 bg-orange-500 rounded-full"></span>
                        ${cat}
                        <span class="text-[9px] text-slate-400 font-bold font-mono">(${prodPorCat[cat].length})</span>
                    </h3>
                </div>
            </div>
        `;

        let productsHtml = '';
        prodPorCat[cat].forEach(prod => {
            productsHtml += `
                <div onclick="agregarAlCarritoComanda(${prod.id})" class="bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md hover:border-orange-500 transition-all select-none flex flex-col justify-between overflow-hidden relative min-h-[140px] btn-bounce">
                    <div class="h-20 w-full bg-slate-100 flex items-center justify-center shrink-0 border-b relative overflow-hidden">
                        ${prod.imagen_url ? 
                            `<img src="${prod.imagen_url}" class="w-full h-full object-cover" alt="${prod.nombre}">` : 
                            `<div class="w-full h-full bg-gradient-to-br from-orange-50 to-orange-100/50 flex items-center justify-center">
                                <i class="fa-solid fa-mug-hot text-orange-300 text-lg"></i>
                             </div>`
                        }
                    </div>
                    <div class="p-2.5 flex-grow flex flex-col justify-between">
                        <h4 class="font-bold text-gray-800 leading-tight text-[11px] line-clamp-2">${prod.nombre}</h4>
                        <div class="text-xs font-black text-slate-800 mt-1">
                            Bs. ${parseFloat(prod.precio_venta).toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
        });

        const subgridHtml = `
            <div id="grid-cat-${catCleanId}" class="col-span-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pb-2">
                ${productsHtml}
            </div>
        `;

        contenedor.innerHTML += headerHtml + subgridHtml;
    });
}

// 9. Lógica del Carrito / Edición de la comanda
function agregarAlCarritoComanda(prodId) {
    const prod = listaProductosGlobal.find(p => p.id === prodId);
    if (!prod) return;

    const itemExistente = carritoComanda.find(item => item.producto_id === prodId);
    if (itemExistente) {
        itemExistente.cantidad++;
        itemExistente.subtotal = itemExistente.cantidad * itemExistente.precio_unitario;
    } else {
        carritoComanda.push({
            producto_id: prod.id,
            nombre: prod.nombre,
            precio_unitario: parseFloat(prod.precio_venta),
            cantidad: 1,
            subtotal: parseFloat(prod.precio_venta)
        });
    }

    actualizarTicketEdicion();
}

function cambiarCantidadItem(idx, delta) {
    const item = carritoComanda[idx];
    if (!item) return;

    item.cantidad += delta;
    if (item.cantidad <= 0) {
        carritoComanda.splice(idx, 1);
    } else {
        item.subtotal = item.cantidad * item.precio_unitario;
    }
    actualizarTicketEdicion();
}

function eliminarItemCarrito(idx) {
    carritoComanda.splice(idx, 1);
    actualizarTicketEdicion();
}

function limpiarPedidoActual() {
    carritoComanda = [];
    actualizarTicketEdicion();
}

// 10. Renderizar UI del carrito activo de comanda
function actualizarTicketEdicion() {
    document.getElementById('btn-limpiar-pedido').classList.remove('hidden');
    document.getElementById('ticket-estado').classList.add('hidden');

    const itemsCont = document.getElementById('ticket-items');
    itemsCont.innerHTML = '';

    if (carritoComanda.length === 0) {
        itemsCont.innerHTML = `
            <div class="text-center text-gray-400 mt-10 text-xs">
                <i class="fa-solid fa-basket-shopping text-3xl mb-2 opacity-25"></i>
                <p>El pedido está vacío.<br>Agrega productos desde el catálogo.</p>
            </div>
        `;
    }

    let subtotal = 0;
    carritoComanda.forEach((item, idx) => {
        subtotal += item.subtotal;
        itemsCont.innerHTML += `
            <div class="flex items-center justify-between py-2 border-b border-slate-100">
                <div class="flex-grow pr-2">
                    <h4 class="text-xs font-bold text-slate-800 leading-tight">${item.nombre}</h4>
                    <span class="text-[10px] text-slate-400">Bs. ${item.precio_unitario}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 select-none">
                    <button onclick="cambiarCantidadItem(${idx}, -1)" class="w-5 h-5 bg-slate-100 text-slate-600 rounded flex items-center justify-center font-bold text-xs hover:bg-orange-100 hover:text-orange-600 transition-colors btn-bounce">-</button>
                    <span class="text-xs font-bold text-slate-800 w-4 text-center">${item.cantidad}</span>
                    <button onclick="cambiarCantidadItem(${idx}, 1)" class="w-5 h-5 bg-slate-100 text-slate-600 rounded flex items-center justify-center font-bold text-xs hover:bg-orange-100 hover:text-orange-600 transition-colors btn-bounce">+</button>
                    <button onclick="eliminarItemCarrito(${idx})" class="text-slate-300 hover:text-red-500 ml-1.5 transition-colors btn-bounce" title="Quitar"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
                </div>
            </div>
        `;
    });

    document.getElementById('subtotal-ticket').innerText = `Bs. ${subtotal.toFixed(2)}`;
    document.getElementById('total-ticket').innerText = `Bs. ${subtotal.toFixed(2)}`;

    // Botón de confirmación/guardar
    const accionesCont = document.getElementById('seccion-acciones-mesa');
    accionesCont.innerHTML = `
        <div class="flex gap-2">
            <button onclick="mostrarVistaMesas()" class="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-colors btn-bounce text-xs">
                Atrás
            </button>
            <button onclick="guardarComandaServidor()" ${carritoComanda.length === 0 ? 'disabled' : ''} class="w-2/3 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl shadow-md transition-colors btn-bounce disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs">
                <i class="fa-solid fa-floppy-disk"></i> ${modoEdicionActivo ? 'Guardar Cambios' : 'Confirmar Pedido'}
            </button>
        </div>
    `;
}

// 11. Enviar la comanda al backend
async function guardarComandaServidor() {
    if (carritoComanda.length === 0 || !mesaSeleccionada) return;

    let subtotal = 0;
    carritoComanda.forEach(item => subtotal += item.subtotal);

    // Formatear detalles
    const detalles = carritoComanda.map(item => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal
    }));

    try {
        let url = '/api/comandas';
        let method = 'POST';
        let body = {
            mesa: mesaSeleccionada,
            usuario_id: usuarioId,
            total: subtotal,
            detalles: detalles
        };

        if (modoEdicionActivo && comandaActivaMesa) {
            // Si es edición, primero cancelamos/eliminamos la comanda anterior o bien podemos crear una nueva.
            // Para mantener consistencia simple: Cancelamos la anterior y guardamos la nueva como activa.
            const cancelRes = await fetch(`/api/comandas/${comandaActivaMesa.id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'CANCELADA' })
            });
            if (!cancelRes.ok) throw new Error('Error al reemplazar pedido anterior');
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar');

        alert(modoEdicionActivo ? '✅ Pedido modificado con éxito.' : '✅ Pedido abierto correctamente.');
        
        // Retornar a la vista de mesas y recargar
        mostrarVistaMesas();
        cargarMesas();
    } catch (e) {
        alert('❌ Error: ' + e.message);
    }
}

// 12. Marcar comanda como entregada (Mesero -> Cocina lista)
async function marcarComandaEntregada() {
    if (!comandaActivaMesa) return;
    try {
        const res = await fetch(`/api/comandas/${comandaActivaMesa.id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'ENTREGADA' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        alert('✅ Comanda marcada como ENTREGADA. Lista para ser cobrada por el cajero.');
        cargarMesas();
        seleccionarMesa(mesaSeleccionada);
    } catch (e) {
        alert('❌ Error: ' + e.message);
    }
}

// 13. Cancelar comanda (Solo Admin)
async function cancelarComandaActiva() {
    if (!comandaActivaMesa) return;
    const confirmacion = confirm(`⚠️ CUIDADO: ¿Estás seguro de cancelar el pedido de la Mesa ${mesaSeleccionada}?\nEsta acción no se puede deshacer.`);
    if (!confirmacion) return;

    try {
        const res = await fetch(`/api/comandas/${comandaActivaMesa.id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'CANCELADA' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        alert('✅ Comanda cancelada y mesa liberada.');
        cargarMesas();
        seleccionarMesa(mesaSeleccionada);
    } catch (e) {
        alert('❌ Error: ' + e.message);
    }
}

// 14. Ventana de impresión de la comanda (Cocina)
function abrirModalImpresionComanda() {
    if (!comandaActivaMesa) return;

    const zona = document.getElementById('zona-impresion');
    const d = new Date(comandaActivaMesa.fecha_creacion);
    const fechaFmt = d.toLocaleString('es-BO');

    let itemsHtml = '';
    comandaActivaItems.forEach(item => {
        itemsHtml += `
            <div class="flex justify-between border-b border-gray-150 py-1.5 font-bold">
                <span>[ ] ${item.cantidad} x ${item.producto_nombre}</span>
            </div>
        `;
    });

    zona.innerHTML = `
        <div class="text-center font-bold mb-4">
            <h2 class="text-sm">*** COMANDA DE COCINA ***</h2>
            <h1 class="text-xl my-1">MESA # ${comandaActivaMesa.mesa}</h1>
            <p class="text-[10px]">Atendido por: ${comandaActivaMesa.mesero_nombre || 'Mesero'}</p>
            <p class="text-[10px]">F. Pedido: ${fechaFmt}</p>
        </div>
        <hr class="border-t border-dashed border-gray-500 my-2">
        <div class="space-y-1">
            ${itemsHtml}
        </div>
        <hr class="border-t border-dashed border-gray-500 my-3">
        <div class="text-center text-[9px] mt-4">
            <p>Café La Paz - Cocina y Barra</p>
        </div>
    `;

    document.getElementById('modalImpresion').classList.remove('hidden');
}

function cerrarModalImpresion() {
    document.getElementById('modalImpresion').classList.add('hidden');
}

function triggerPrint() {
    window.print();
}

// 15. Cobrar comanda (Flujo Cajero)
function abrirModalCobroComanda() {
    if (!comandaActivaMesa) return;
    document.getElementById('lbl-monto-cobro').innerText = `Bs. ${parseFloat(comandaActivaMesa.total).toFixed(2)}`;
    document.getElementById('modalCobroComanda').classList.remove('hidden');
}

function cerrarModalCobro() {
    document.getElementById('modalCobroComanda').classList.add('hidden');
}

let ultimaVentaRegistradaId = null;

async function confirmarCobro() {
    if (!comandaActivaMesa) return;
    const metodoPago = document.getElementById('sel-metodo-pago').value;

    try {
        const res = await fetch(`/api/comandas/${comandaActivaMesa.id}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                metodo_pago: metodoPago,
                usuario_id: usuarioId
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        ultimaVentaRegistradaId = data.venta_id;

        // Mostrar Éxito
        cerrarModalCobro();
        document.getElementById('lbl-ticket-exito').innerText = `Ticket # ${ultimaVentaRegistradaId.toString().padStart(4, '0')}`;
        document.getElementById('modalExitoCobro').classList.remove('hidden');

        // Recargar mesas
        cargarMesas();
        seleccionarMesa(mesaSeleccionada);
    } catch (e) {
        alert('❌ Error al procesar cobro: ' + e.message);
    }
}

function cerrarModalExitoCobro() {
    document.getElementById('modalExitoCobro').classList.add('hidden');
}

// 16. Imprimir recibo final de la venta
async function imprimirVentaFinal() {
    if (!ultimaVentaRegistradaId) return;
    cerrarModalExitoCobro();

    try {
        const res = await fetch(`/api/comprobantes/${ultimaVentaRegistradaId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const zona = document.getElementById('zona-impresion');
        let itemsHtml = '';
        data.items.forEach(item => {
            itemsHtml += `
                <tr class="border-b border-gray-100">
                    <td class="py-1 text-center">${item.cantidad}</td>
                    <td class="py-1">${item.nombre}</td>
                    <td class="py-1 text-right">Bs. ${item.subtotal}</td>
                </tr>
            `;
        });

        zona.innerHTML = `
            <div class="text-center font-bold mb-3">
                <h2 class="text-sm uppercase tracking-wide">Café La Paz</h2>
                <p class="text-[9px] text-gray-500 font-medium">NIT: 1029384756 | Teléfono: 78777010</p>
                <p class="text-[9px] text-gray-500 font-medium">Calle La Paz, La Paz - Bolivia</p>
                <h1 class="text-lg font-black my-1.5">FACTURA DE VENTA</h1>
                <p class="text-[9px] font-mono">TKT-${data.ticket.id.toString().padStart(4, '0')}</p>
                <p class="text-[8px] text-gray-500 font-mono">Fecha: ${data.ticket.fecha}</p>
            </div>
            <hr class="border-t border-dashed border-gray-400 my-2">
            <table class="w-full text-left font-mono text-[10px]">
                <thead>
                    <tr class="border-b border-gray-300">
                        <th class="py-1 w-8 text-center">Cant</th>
                        <th class="py-1">Detalle</th>
                        <th class="py-1 text-right w-16">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            <hr class="border-t border-dashed border-gray-400 my-2">
            <div class="font-mono text-[10px] space-y-1">
                <div class="flex justify-between font-bold">
                    <span>TOTAL</span>
                    <span>Bs. ${parseFloat(data.ticket.total).toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-[9px] text-slate-500">
                    <span>Pago:</span>
                    <span>${data.ticket.metodo_pago}</span>
                </div>
            </div>
            <hr class="border-t border-dashed border-gray-400 my-3">
            <div class="text-center font-bold text-[9px] leading-tight mt-3">
                <p>¡Gracias por tu visita a Café La Paz!</p>
                <p class="text-[8px] text-gray-500 font-normal mt-1">Este documento sirve como comprobante de pago.</p>
            </div>
        `;

        document.getElementById('modalImpresion').classList.remove('hidden');
    } catch (e) {
        alert("Error al cargar ticket: " + e.message);
    }
}
