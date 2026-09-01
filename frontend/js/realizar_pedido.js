// frontend/js/realizar_pedido.js
let productosCatalogo = [];
let mesasEstado = [];
// carritoPedido: producto_id -> { cantidad, notas }
let carritoPedido = {};
let vistaProductos = localStorage.getItem('mesero_vista_productos') || 'lista'; // 'lista' | 'grid'
let categoriaSeleccionada = 'Todas';
let busquedaActual = '';

const usuarioIdActual = () => localStorage.getItem('usuario_id') || '';

document.addEventListener('DOMContentLoaded', () => {
    cargarDatos();
    actualizarIconoVista();

    document.getElementById('buscarProducto').addEventListener('input', (e) => {
        busquedaActual = e.target.value;
        document.getElementById('btn-limpiar-busqueda').classList.toggle('hidden', busquedaActual.length === 0);
        renderizarCatalogo();
    });
});

function limpiarBusqueda() {
    busquedaActual = '';
    document.getElementById('buscarProducto').value = '';
    document.getElementById('btn-limpiar-busqueda').classList.add('hidden');
    renderizarCatalogo();
}

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
        cargarComandasActivas();
    } else {
        vistaControl.classList.add('hidden');
        vistaPedido.classList.remove('hidden');
        btnPedido.classList.add('bg-white', 'text-orange-500', 'shadow-sm');
        btnPedido.classList.remove('text-slate-500');
        btnControl.classList.remove('bg-white', 'text-orange-500', 'shadow-sm');
        btnControl.classList.add('text-slate-500');
    }
}

// --- Vista de productos: lista / mosaicos ---
function toggleVistaProductos() {
    vistaProductos = vistaProductos === 'lista' ? 'grid' : 'lista';
    localStorage.setItem('mesero_vista_productos', vistaProductos);
    actualizarIconoVista();
    renderizarCatalogo();
}

function actualizarIconoVista() {
    const icono = document.querySelector('#btn-vista-toggle i');
    if (!icono) return;
    icono.className = vistaProductos === 'lista' ? 'fa-solid fa-grip' : 'fa-solid fa-table-cells-large';
    document.getElementById('btn-vista-toggle').title = vistaProductos === 'lista' ? 'Cambiar a mosaicos' : 'Cambiar a listado';
}

async function refrescarTodo() {
    const btn = document.getElementById('btn-refrescar');
    btn.classList.add('animate-spin');
    await cargarDatos();
    btn.classList.remove('animate-spin');
}

// --- Carga de datos ---
async function cargarDatos() {
    await Promise.all([cargarProductos(), cargarMesas()]);
}

async function cargarProductos() {
    try {
        const respuesta = await fetch(`/api/ventas/productos?usuario_id=${usuarioIdActual()}`);
        if (!respuesta.ok) throw new Error('Error al cargar productos');
        productosCatalogo = await respuesta.json();
        renderizarCategorias();
        renderizarCatalogo();
    } catch (error) {
        console.error('Error:', error);
    }
}

function renderizarCategorias() {
    const set = new Set(['Todas']);
    productosCatalogo.forEach(p => set.add(p.categoria || 'General'));
    const contenedor = document.getElementById('fila-categorias');
    contenedor.innerHTML = '';
    set.forEach(cat => {
        const seleccionado = cat === categoriaSeleccionada;
        const btn = document.createElement('button');
        btn.className = `shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${seleccionado ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`;
        btn.innerText = cat;
        btn.onclick = () => {
            categoriaSeleccionada = cat;
            renderizarCategorias();
            renderizarCatalogo();
        };
        contenedor.appendChild(btn);
    });
}

// --- Búsqueda tolerante a errores de tecleo (mismo algoritmo que la app móvil) ---
function normalizarTexto(s) {
    const conAcento = 'áéíóúÁÉÍÓÚñÑüÜ';
    const sinAcento = 'aeiouAEIOUnNuU';
    let resultado = s.toLowerCase();
    for (let i = 0; i < conAcento.length; i++) {
        resultado = resultado.split(conAcento[i].toLowerCase()).join(sinAcento[i].toLowerCase());
    }
    return resultado;
}

function distanciaLevenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const costos = [];
    for (let i = 0; i <= b.length; i++) costos.push(i);
    for (let i = 0; i < a.length; i++) {
        let anterior = costos[0];
        costos[0] = i + 1;
        for (let j = 0; j < b.length; j++) {
            const actual = costos[j + 1];
            costos[j + 1] = a[i] === b[j] ? anterior : 1 + Math.min(anterior, actual, costos[j]);
            anterior = actual;
        }
    }
    return costos[b.length];
}

// Puntaje de qué tan bien "busqueda" coincide con "nombreProducto":
// 0 = coincidencia directa, N = errores de tecleo tolerados, null = no coincide.
function puntajeCoincidencia(nombreProducto, busqueda) {
    const nombre = normalizarTexto(nombreProducto);
    const query = normalizarTexto(busqueda).trim();
    if (query.length === 0) return 0;
    if (nombre.includes(query)) return 0;

    const palabrasProducto = nombre.split(' ').filter(w => w.length >= 3);
    const palabrasQuery = query.split(' ').filter(w => w.length > 0);
    if (palabrasProducto.length === 0 || palabrasQuery.length === 0) return null;

    let total = 0;
    for (const qp of palabrasQuery) {
        if (qp.length < 3) {
            if (!palabrasProducto.includes(qp)) return null;
            continue;
        }
        const umbral = Math.min(Math.max(Math.ceil(qp.length / 3), 1), 4);
        let mejor = 999;
        for (const pp of palabrasProducto) {
            const distanciaCompleta = distanciaLevenshtein(pp, qp);
            const prefijo = pp.length > qp.length ? pp.substring(0, qp.length) : pp;
            const distanciaPrefijo = distanciaLevenshtein(prefijo, qp);
            const distancia = Math.min(distanciaCompleta, distanciaPrefijo);
            if (distancia < mejor) mejor = distancia;
        }
        if (mejor > umbral) return null;
        total += mejor;
    }
    return total;
}

function productosFiltrados() {
    if (busquedaActual.trim().length > 0) {
        const coincidencias = [];
        for (const p of productosCatalogo) {
            const puntaje = puntajeCoincidencia(p.nombre, busquedaActual);
            if (puntaje !== null) coincidencias.push({ p, puntaje });
        }
        coincidencias.sort((a, b) => {
            if (a.puntaje !== b.puntaje) return a.puntaje - b.puntaje;
            return (parseFloat(b.p.cantidad_vendida) || 0) - (parseFloat(a.p.cantidad_vendida) || 0);
        });
        return coincidencias.map(c => c.p);
    }
    const filtrados = productosCatalogo.filter(p => categoriaSeleccionada === 'Todas' || (p.categoria || 'General') === categoriaSeleccionada);
    filtrados.sort((a, b) => (parseFloat(b.cantidad_vendida) || 0) - (parseFloat(a.cantidad_vendida) || 0));
    return filtrados;
}

function placeholderImagenHtml() {
    return `<div class="w-full h-full bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100/60 flex items-center justify-center">
                <i class="fa-solid fa-mug-hot text-orange-300 text-2xl"></i>
             </div>`;
}

function renderizarCatalogo() {
    const gridEl = document.getElementById('grid-productos');
    const listaEl = document.getElementById('lista-productos');
    const filtrados = productosFiltrados();

    if (vistaProductos === 'grid') {
        listaEl.classList.add('hidden');
        gridEl.classList.remove('hidden');
        renderizarGrid(filtrados, gridEl);
    } else {
        gridEl.classList.add('hidden');
        listaEl.classList.remove('hidden');
        renderizarLista(filtrados, listaEl);
    }
}

function renderizarGrid(filtrados, contenedor) {
    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-medium italic text-sm">No se encontraron productos.</div>`;
        return;
    }
    contenedor.innerHTML = filtrados.map(prod => {
        const enCarrito = carritoPedido[prod.id]?.cantidad || 0;
        return `
            <div onclick="agregarAlCarrito(${prod.id})" class="group bg-white rounded-2xl shadow-sm border ${enCarrito > 0 ? 'border-orange-400 ring-1 ring-orange-400' : 'border-slate-200/80'} cursor-pointer hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5 transition-all duration-200 select-none flex flex-col justify-between overflow-hidden relative min-h-[160px] btn-bounce">
                <div class="h-24 w-full bg-slate-100 flex items-center justify-center shrink-0 relative overflow-hidden">
                    ${prod.imagen_url ? `<img src="${prod.imagen_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${prod.nombre}">` : placeholderImagenHtml()}
                    ${enCarrito > 0 ? `
                        <div class="absolute top-1.5 right-1.5 flex items-center gap-1">
                            <button onclick="event.stopPropagation(); cambiarCantidadCarrito(${prod.id}, -1)" class="w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-xs hover:bg-black">
                                <i class="fa-solid fa-minus text-[10px]"></i>
                            </button>
                            <span class="px-2 py-1 rounded-full bg-orange-500 text-white text-[11px] font-black">+${enCarrito}</span>
                        </div>` : ''}
                </div>
                <div class="p-3 flex-grow flex flex-col justify-between">
                    <h3 class="font-bold text-slate-800 leading-tight text-xs sm:text-sm md:text-base line-clamp-2">${prod.nombre}</h3>
                    <div class="flex items-center justify-between mt-1.5">
                        <span class="text-sm sm:text-base md:text-lg font-black text-slate-900">Bs. ${parseFloat(prod.precio_venta).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarLista(filtrados, contenedor) {
    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div class="py-12 text-center text-slate-400 font-medium italic text-sm">No se encontraron productos.</div>`;
        return;
    }
    contenedor.innerHTML = filtrados.map(prod => {
        const enCarrito = carritoPedido[prod.id]?.cantidad || 0;
        return `
            <div onclick="agregarAlCarrito(${prod.id})" class="flex items-center gap-3 bg-white rounded-2xl border ${enCarrito > 0 ? 'border-orange-400 ring-1 ring-orange-400' : 'border-slate-200/80'} p-2.5 cursor-pointer hover:shadow-md transition-all btn-bounce">
                <div class="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    ${prod.imagen_url ? `<img src="${prod.imagen_url}" class="w-full h-full object-cover" alt="${prod.nombre}">` : placeholderImagenHtml()}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-slate-800 text-sm md:text-base truncate">${prod.nombre}</h3>
                    <span class="text-sm md:text-base font-black text-orange-500">Bs. ${parseFloat(prod.precio_venta).toFixed(2)}</span>
                </div>
                ${enCarrito > 0 ? `
                    <div class="flex items-center gap-2 shrink-0">
                        <button onclick="event.stopPropagation(); cambiarCantidadCarrito(${prod.id}, -1)" class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors">
                            <i class="fa-solid fa-minus text-xs"></i>
                        </button>
                        <span class="px-2.5 py-1 rounded-full bg-orange-500 text-white text-xs font-black">+${enCarrito}</span>
                    </div>` : ''}
            </div>
        `;
    }).join('');
}

// --- Mesas ---
async function cargarMesas() {
    try {
        const res = await fetch(`/api/comandas/mesas-estado?usuario_id=${usuarioIdActual()}`);
        if (!res.ok) throw new Error('Error al cargar mesas');
        mesasEstado = await res.json();
        const select = document.getElementById('select-mesa');
        const valorPrevio = select.value;
        select.innerHTML = '<option value="">-- Elegir mesa --</option>';
        mesasEstado.forEach(m => {
            const ocupada = m.estado === 'ocupada';
            const nombreMesaOpt = m.mesa === 'Para Llevar' ? 'Para Llevar' : `Mesa ${m.mesa}`;
            select.innerHTML += `<option value="${m.mesa}">${nombreMesaOpt}${ocupada ? ' (ocupada, se sumará)' : ''}</option>`;
        });
        if (valorPrevio) select.value = valorPrevio;
        onCambiarMesaSeleccionada();
    } catch (error) {
        console.error('Error al cargar mesas:', error);
        document.getElementById('select-mesa').innerHTML = '<option value="">Error al cargar mesas</option>';
    }
}

function mesaSeleccionadaInfo() {
    const mesa = document.getElementById('select-mesa').value;
    if (!mesa) return null;
    return mesasEstado.find(m => m.mesa.toString() === mesa) || null;
}

function onCambiarMesaSeleccionada() {
    const info = mesaSeleccionadaInfo();
    const aviso = document.getElementById('aviso-mesa-ocupada');
    aviso.classList.toggle('hidden', !(info && info.estado === 'ocupada'));
}

// --- Carrito ---
function agregarAlCarrito(productoId) {
    const producto = productosCatalogo.find(p => p.id === productoId);
    if (!producto) return;
    if (!carritoPedido[productoId]) {
        carritoPedido[productoId] = { cantidad: 0, notas: null };
    }
    carritoPedido[productoId].cantidad += 1;
    renderizarCatalogo();
    actualizarTicket();
}

function cambiarCantidadCarrito(productoId, delta) {
    if (!carritoPedido[productoId]) return;
    carritoPedido[productoId].cantidad += delta;
    if (carritoPedido[productoId].cantidad <= 0) {
        delete carritoPedido[productoId];
    }
    renderizarCatalogo();
    actualizarTicket();
}

function totalCarrito() {
    let total = 0;
    Object.entries(carritoPedido).forEach(([id, item]) => {
        const prod = productosCatalogo.find(p => p.id === parseInt(id));
        if (prod) total += parseFloat(prod.precio_venta) * item.cantidad;
    });
    return total;
}

function cantidadTotalCarrito() {
    return Object.values(carritoPedido).reduce((acc, it) => acc + it.cantidad, 0);
}

function actualizarTicket() {
    const contenedor = document.getElementById('ticket-items');
    const total = totalCarrito();

    document.getElementById('ticket-count').innerText = cantidadTotalCarrito();

    const entradas = Object.entries(carritoPedido);
    if (entradas.length === 0) {
        contenedor.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center text-slate-400 py-8">
                <div class="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center mb-3">
                    <i class="fa-solid fa-basket-shopping text-2xl opacity-30"></i>
                </div>
                <p class="text-sm md:text-base font-semibold">Pedido vacío</p>
                <p class="text-xs md:text-sm text-slate-300 mt-1">Toca un producto para agregarlo</p>
            </div>`;
    } else {
        contenedor.innerHTML = entradas.map(([id, item]) => {
            const prod = productosCatalogo.find(p => p.id === parseInt(id));
            if (!prod) return '';
            const subtotal = parseFloat(prod.precio_venta) * item.cantidad;
            const nota = item.notas || '';
            return `
                <div class="mb-2 bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
                    <div class="flex justify-between items-center gap-2 py-2.5 px-2.5">
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-slate-800 text-sm md:text-base truncate">${prod.nombre}</h4>
                            <p class="text-[11px] md:text-xs text-slate-400 font-medium">Bs. ${parseFloat(prod.precio_venta).toFixed(2)} c/u</p>
                        </div>
                        <div class="flex items-center bg-slate-100 rounded-full border border-slate-200 overflow-hidden shrink-0">
                            <button onclick="cambiarCantidadCarrito(${id}, -1)" class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-rose-500 font-bold transition-colors btn-bounce">−</button>
                            <span class="px-1 text-sm md:text-base font-black w-6 text-center text-slate-800">${item.cantidad}</span>
                            <button onclick="cambiarCantidadCarrito(${id}, 1)" class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-emerald-500 font-bold transition-colors btn-bounce">+</button>
                        </div>
                        <div class="text-right font-black text-slate-900 w-16 text-sm md:text-base shrink-0">Bs. ${subtotal.toFixed(2)}</div>
                    </div>
                    <button onclick="abrirModalNota('carrito', ${id}, '${prod.nombre.replace(/'/g, "\\'")}')" class="w-full flex items-center gap-1.5 px-2.5 pb-2 text-left">
                        <span class="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs md:text-sm font-semibold truncate ${nota ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}">
                            <i class="fa-solid ${nota ? 'fa-note-sticky' : 'fa-circle-plus'}"></i>
                            <span class="truncate">${nota ? nota.replace(/</g, '&lt;') : 'Agregar nota a este producto'}</span>
                        </span>
                    </button>
                </div>
            `;
        }).join('');
    }

    document.getElementById('total-ticket').innerText = `Bs. ${total.toFixed(2)}`;
}

function limpiarCarrito() {
    if (Object.keys(carritoPedido).length > 0 && confirm('¿Deseas vaciar el pedido actual?')) {
        carritoPedido = {};
        document.getElementById('nota-general-pedido').value = '';
        renderizarCatalogo();
        actualizarTicket();
    }
}

// --- Modal de nota por producto (reutilizado por el carrito y por la edición) ---
let notaModalContexto = null; // { tipo: 'carrito' | 'edicion', id }

function abrirModalNota(tipo, id, nombre) {
    notaModalContexto = { tipo, id };
    document.getElementById('modal-nota-titulo').innerText = `Nota para ${nombre}`;
    const notaActual = tipo === 'carrito'
        ? (carritoPedido[id]?.notas || '')
        : (edicionItems[id]?.notas || '');
    document.getElementById('modal-nota-input').value = notaActual;
    document.getElementById('modal-nota').classList.remove('hidden');
    document.getElementById('modal-nota-input').focus();
}

function cerrarModalNota() {
    document.getElementById('modal-nota').classList.add('hidden');
    notaModalContexto = null;
}

function guardarModalNota() {
    if (!notaModalContexto) return;
    const texto = document.getElementById('modal-nota-input').value.trim();
    if (notaModalContexto.tipo === 'carrito') {
        if (carritoPedido[notaModalContexto.id]) {
            carritoPedido[notaModalContexto.id].notas = texto || null;
        }
        actualizarTicket();
    } else {
        edicionItems[notaModalContexto.id].notas = texto || null;
        renderizarEdicionItems();
    }
    cerrarModalNota();
}

// --- Generar comanda ---
async function generarComanda() {
    const mesa = document.getElementById('select-mesa').value;
    if (!mesa) {
        alert('Selecciona una mesa antes de generar la comanda.');
        return;
    }
    if (Object.keys(carritoPedido).length === 0) return;

    const btn = document.getElementById('btn-generar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';

    const notaGeneral = document.getElementById('nota-general-pedido').value.trim();
    const detallesNuevos = Object.entries(carritoPedido).map(([id, item]) => {
        const prod = productosCatalogo.find(p => p.id === parseInt(id));
        return {
            producto_id: prod.id,
            cantidad: item.cantidad,
            precio_unitario: parseFloat(prod.precio_venta),
            subtotal: parseFloat(prod.precio_venta) * item.cantidad,
            notas: item.notas || null
        };
    });

    const mesaInfo = mesaSeleccionadaInfo();
    const mesaOcupada = mesaInfo && mesaInfo.estado === 'ocupada';

    try {
        let error;
        if (mesaOcupada) {
            error = await sumarAComandaExistente(mesaInfo.comanda, detallesNuevos, notaGeneral);
        } else {
            error = await crearComandaNueva(mesa, detallesNuevos, notaGeneral);
        }

        if (error) {
            alert('❌ Error: ' + error);
        } else {
            const mensaje = mesaOcupada
                ? `✅ Productos sumados al pedido de la mesa ${mesa}`
                : `✅ Comanda enviada a cocina para la mesa ${mesa}`;
            alert(mensaje);
            carritoPedido = {};
            document.getElementById('nota-general-pedido').value = '';
            document.getElementById('select-mesa').value = '';
            renderizarCatalogo();
            actualizarTicket();
            await cargarMesas();
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-bell-concierge mr-1"></i> GENERAR COMANDA';
    }
}

async function crearComandaNueva(mesa, detalles, notaGeneral) {
    try {
        const total = detalles.reduce((acc, d) => acc + d.subtotal, 0);
        const res = await fetch('/api/comandas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mesa,
                usuario_id: parseInt(usuarioIdActual()),
                total,
                detalles,
                fecha_hora: new Date().toISOString(),
                notas: notaGeneral || null
            })
        });
        const data = await res.json();
        if (!res.ok) return data.error || 'Error al generar la comanda';
        return null;
    } catch (e) {
        return 'Error de conexión: ' + e.message;
    }
}

// Suma los productos del carrito a una comanda ya existente en la mesa elegida
// (de cualquier mesero), en vez de crear una comanda duplicada para esa mesa.
async function sumarAComandaExistente(comandaExistente, detallesNuevos, notaGeneral) {
    try {
        const itemsActuales = comandaExistente.items || [];
        const detallesFinales = itemsActuales.map(it => ({
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal: it.subtotal,
            notas: it.notas
        }));

        detallesNuevos.forEach(nuevo => {
            const indiceExistente = detallesFinales.findIndex(it => it.producto_id === nuevo.producto_id);
            if (indiceExistente !== -1) {
                const cantidadSumada = parseFloat(detallesFinales[indiceExistente].cantidad) + parseFloat(nuevo.cantidad);
                const precio = parseFloat(detallesFinales[indiceExistente].precio_unitario) || 0;
                detallesFinales[indiceExistente].cantidad = cantidadSumada;
                detallesFinales[indiceExistente].subtotal = precio * cantidadSumada;
                if (nuevo.notas) detallesFinales[indiceExistente].notas = nuevo.notas;
            } else {
                detallesFinales.push(nuevo);
            }
        });

        const totalFinal = detallesFinales.reduce((acc, it) => acc + (parseFloat(it.subtotal) || 0), 0);
        const notaPrevia = comandaExistente.notas || '';
        const notasCombinadas = [notaPrevia, notaGeneral || ''].filter(n => n).join(' | ');

        const res = await fetch(`/api/comandas/mesero/${comandaExistente.id}?usuario_id=${usuarioIdActual()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                detalles: detallesFinales,
                total: totalFinal,
                notas: notasCombinadas || null
            })
        });
        const data = await res.json();
        if (!res.ok) return data.error || 'Error al sumar productos a la mesa';
        return null;
    } catch (e) {
        return 'Error de conexión: ' + e.message;
    }
}

// --- Control: comandas activas de TODO el sistema (cualquier mesero) ---
async function cargarComandasActivas() {
    const contenedor = document.getElementById('lista-control');
    contenedor.innerHTML = '<p class="text-slate-400 text-sm italic col-span-full">Cargando...</p>';

    try {
        const res = await fetch(`/api/comandas/mesero/activas?usuario_id=${usuarioIdActual()}`);
        if (!res.ok) throw new Error('Error al cargar comandas');
        const comandas = await res.json();

        if (comandas.length === 0) {
            contenedor.innerHTML = '<p class="text-slate-400 text-sm italic col-span-full">No hay comandas activas en este momento.</p>';
            return;
        }

        const colorCocina = {
            'PENDIENTE': 'bg-amber-100 text-amber-700',
            'RECHAZADA': 'bg-rose-100 text-rose-700',
            'COMPLETADA': 'bg-emerald-100 text-emerald-700'
        };

        contenedor.innerHTML = comandas.map(c => {
            const items = c.items || [];
            const editado = ((c.version || 1) > 1);
            const raw = c.fecha_hora_cliente || c.fecha_creacion;
            const hora = raw ? new Date(raw).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

            return `
            <div class="bg-white rounded-2xl border ${editado ? 'border-amber-300' : 'border-slate-200/80'} shadow-sm p-4 flex flex-col gap-2">
                <div class="flex items-start justify-between">
                    <div>
                        <h3 class="font-black text-slate-800 text-sm md:text-base">${c.mesa === 'Para Llevar' ? 'Para Llevar' : `Mesa ${c.mesa}`}</h3>
                        ${c.mesero_nombre ? `<p class="text-[11px] md:text-xs text-slate-400 font-medium">${c.mesero_nombre}</p>` : ''}
                        ${hora ? `<p class="text-[11px] md:text-xs text-slate-400 font-medium">${hora}</p>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${editado ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700">EDITADO</span>` : ''}
                        <span class="text-[10px] font-black px-2 py-1 rounded-full ${colorCocina[c.estado_cocina] || 'bg-slate-100 text-slate-600'}">${c.estado_cocina || 'PENDIENTE'}</span>
                    </div>
                </div>
                ${items.length > 0 ? `
                <div class="bg-slate-50 rounded-xl p-2.5 text-xs md:text-sm">
                    ${items.map(it => `
                        <div class="py-0.5">
                            <span class="font-semibold text-slate-700">${it.cantidad}x ${it.nombre}</span>
                            ${it.notas ? `<div class="text-orange-600 italic">📝 ${it.notas.replace(/</g, '&lt;')}</div>` : ''}
                        </div>
                    `).join('')}
                </div>` : ''}
                ${c.notas ? `<p class="text-[11px] md:text-xs text-slate-400 italic">Nota del pedido: ${c.notas.replace(/</g, '&lt;')}</p>` : ''}
                <div class="flex items-center justify-between">
                    <span class="text-lg md:text-xl font-black text-slate-900">Bs. ${parseFloat(c.total).toFixed(2)}</span>
                    <span class="text-[10px] md:text-xs font-bold text-slate-400">${c.estado}</span>
                </div>
                ${c.estado !== 'PAGADA' ? `
                <div class="grid grid-cols-3 gap-1.5 mt-1">
                    <button onclick="abrirModalEditar(${c.id})" class="text-xs md:text-sm font-bold text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-xl py-2 md:py-2.5 transition-colors btn-bounce">
                        <i class="fa-solid fa-pen mr-1"></i> Editar
                    </button>
                    <button onclick="solicitarImpresion(${c.id})" class="text-xs md:text-sm font-bold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-xl py-2 md:py-2.5 transition-colors btn-bounce">
                        <i class="fa-solid fa-print mr-1"></i> Imprimir
                    </button>
                    <button onclick="eliminarComanda(${c.id})" class="text-xs md:text-sm font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl py-2 md:py-2.5 transition-colors btn-bounce">
                        <i class="fa-solid fa-trash-can mr-1"></i> Eliminar
                    </button>
                </div>` : ''}
            </div>
            `;
        }).join('');
    } catch (error) {
        contenedor.innerHTML = `<p class="text-rose-500 text-sm italic col-span-full">Error: ${error.message}</p>`;
    }
}

async function solicitarImpresion(id) {
    try {
        const res = await fetch(`/api/comandas/mesero/${id}/imprimir?usuario_id=${usuarioIdActual()}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al solicitar impresión');
        alert('🖨️ Se envió a imprimir en cocina');
        cargarComandasActivas();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

async function eliminarComanda(id) {
    if (!confirm('¿Eliminar esta comanda? Esta acción no se puede deshacer.')) return;
    try {
        const res = await fetch(`/api/comandas/${id}?usuario_id=${usuarioIdActual()}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');
        cargarComandasActivas();
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

// --- Edición de comanda ---
let edicionComandaId = null;
let edicionItems = []; // [{producto_id, nombre, cantidad, precio_unitario, notas}]
let comandasActivasCache = [];

async function abrirModalEditar(id) {
    try {
        const res = await fetch(`/api/comandas/mesero/activas?usuario_id=${usuarioIdActual()}`);
        if (!res.ok) throw new Error('Error al cargar la comanda');
        comandasActivasCache = await res.json();
        const comanda = comandasActivasCache.find(c => c.id === id);
        if (!comanda) throw new Error('Comanda no encontrada');

        edicionComandaId = id;
        edicionItems = (comanda.items || []).map(it => ({
            producto_id: it.producto_id,
            nombre: it.nombre,
            cantidad: it.cantidad,
            precio_unitario: parseFloat(it.precio_unitario) || 0,
            notas: it.notas || null
        }));

        const nombreMesaEditar = comanda.mesa === 'Para Llevar' ? 'Para Llevar' : `Mesa ${comanda.mesa}`;
        document.getElementById('modal-editar-titulo').innerText = `Editar comanda · ${nombreMesaEditar}`;
        document.getElementById('modal-editar-nota-general').value = comanda.notas || '';
        document.getElementById('modal-editar-error').classList.add('hidden');
        renderizarEdicionItems();
        document.getElementById('modal-editar').classList.remove('hidden');
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

function cerrarModalEditar() {
    document.getElementById('modal-editar').classList.add('hidden');
    edicionComandaId = null;
    edicionItems = [];
}

function totalEdicion() {
    return edicionItems.reduce((acc, it) => acc + (it.precio_unitario * it.cantidad), 0);
}

function cambiarCantidadEdicion(index, delta) {
    edicionItems[index].cantidad += delta;
    if (edicionItems[index].cantidad <= 0) {
        edicionItems.splice(index, 1);
    }
    renderizarEdicionItems();
}

function renderizarEdicionItems() {
    const contenedor = document.getElementById('modal-editar-items');
    contenedor.innerHTML = edicionItems.map((it, index) => `
        <div class="mb-3.5">
            <div class="flex items-center gap-2">
                <span class="flex-1 font-semibold text-slate-800 text-sm truncate">${it.nombre}</span>
                <button onclick="cambiarCantidadEdicion(${index}, -1)" class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-minus text-xs"></i>
                </button>
                <span class="w-6 text-center font-black text-slate-800">${it.cantidad}</span>
                <button onclick="cambiarCantidadEdicion(${index}, 1)" class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 hover:bg-orange-500 hover:text-white flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-plus text-xs"></i>
                </button>
            </div>
            <button onclick="abrirModalNota('edicion', ${index}, '${(it.nombre || '').replace(/'/g, "\\'")}')" class="mt-1.5 w-full text-left">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold max-w-full truncate ${it.notas ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}">
                    <i class="fa-solid ${it.notas ? 'fa-note-sticky' : 'fa-circle-plus'}"></i>
                    <span class="truncate">${it.notas ? it.notas.replace(/</g, '&lt;') : 'Agregar nota a este producto'}</span>
                </span>
            </button>
        </div>
    `).join('');
    document.getElementById('modal-editar-total').innerText = `Bs. ${totalEdicion().toFixed(2)}`;
}

async function guardarEdicionComanda() {
    const errorEl = document.getElementById('modal-editar-error');
    errorEl.classList.add('hidden');

    if (edicionItems.length === 0) {
        errorEl.innerText = 'La comanda debe tener al menos un producto.';
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('btn-guardar-edicion');
    btn.disabled = true;
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';

    const detalles = edicionItems.map(it => ({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.precio_unitario * it.cantidad,
        notas: it.notas || null
    }));
    const notaGeneral = document.getElementById('modal-editar-nota-general').value.trim();

    try {
        const res = await fetch(`/api/comandas/mesero/${edicionComandaId}?usuario_id=${usuarioIdActual()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                detalles,
                total: totalEdicion(),
                notas: notaGeneral || null
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al editar la comanda');

        cerrarModalEditar();
        alert('✅ Comanda actualizada, cocina verá los cambios');
        cargarComandasActivas();
    } catch (error) {
        errorEl.innerText = error.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

// --- Selector de producto para agregar dentro de la edición ---
function abrirSelectorProductoEdicion() {
    document.getElementById('selector-producto-buscar').value = '';
    renderizarSelectorProducto();
    document.getElementById('modal-selector-producto').classList.remove('hidden');
}

function cerrarSelectorProductoEdicion() {
    document.getElementById('modal-selector-producto').classList.add('hidden');
}

function renderizarSelectorProducto() {
    const busqueda = document.getElementById('selector-producto-buscar').value.toLowerCase();
    const filtrados = productosCatalogo.filter(p => p.nombre.toLowerCase().includes(busqueda));
    const contenedor = document.getElementById('selector-producto-lista');
    if (filtrados.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-400 text-sm italic text-center py-8">No se encontraron productos.</p>';
        return;
    }
    contenedor.innerHTML = filtrados.map(p => `
        <div onclick="agregarProductoAEdicion(${p.id})" class="flex items-center justify-between py-2.5 px-2 border-b border-slate-100 cursor-pointer hover:bg-orange-50 rounded-lg transition-colors">
            <span class="font-semibold text-slate-700 text-sm">${p.nombre}</span>
            <span class="font-black text-orange-500 text-sm">Bs. ${parseFloat(p.precio_venta).toFixed(2)}</span>
        </div>
    `).join('');
}

function agregarProductoAEdicion(productoId) {
    const producto = productosCatalogo.find(p => p.id === productoId);
    if (!producto) return;

    const indiceExistente = edicionItems.findIndex(it => it.producto_id === productoId);
    if (indiceExistente !== -1) {
        edicionItems[indiceExistente].cantidad += 1;
    } else {
        edicionItems.push({
            producto_id: producto.id,
            nombre: producto.nombre,
            cantidad: 1,
            precio_unitario: parseFloat(producto.precio_venta),
            notas: null
        });
    }
    cerrarSelectorProductoEdicion();
    renderizarEdicionItems();
}
