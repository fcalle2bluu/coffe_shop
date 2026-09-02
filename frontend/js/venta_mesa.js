// frontend/js/venta_mesa.js

let listaProductosGlobal = [];
let mesasGlobal = [];
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
    // Refresco en tiempo real del estado de mesas (ocupada/libre) cada 10s
    setInterval(cargarMesas, 10000);
    // Contador de tiempo de espera (mesas en rojo): se actualiza cada segundo
    // sin re-pedir nada al servidor, solo recalcula contra la hora local.
    setInterval(actualizarContadoresEspera, 1000);

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
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Error en servidor al obtener mesas');
        }
        mesasGlobal = await res.json();
        renderizarMesas();
    } catch (e) {
        console.error("Error mesas:", e);
        const mensajeError = `
            <div class="col-span-full flex flex-col items-center justify-center text-red-400 font-bold text-xs md:text-sm gap-1 py-10">
                <span>Error al cargar el estado de las mesas:</span>
                <span class="text-[10px] md:text-xs opacity-80 font-normal bg-red-500/10 px-2 py-1 rounded border border-red-500/30 mt-1">${e.message}</span>
            </div>
        `;
        const cPb = document.getElementById('lienzo-planta-baja');
        const cPa = document.getElementById('lienzo-primer-piso');
        if (cPb) cPb.innerHTML = mensajeError;
        if (cPa) cPa.innerHTML = mensajeError;
    }
}

// Orden natural: mesas numéricas primero (1, 2, 3...), identificadores especiales
// (ej. "PARA LLEVAR") al final, en orden alfabético.
function compararMesas(a, b) {
    const na = parseInt(a.mesa, 10);
    const nb = parseInt(b.mesa, 10);
    const aEsNum = !isNaN(na);
    const bEsNum = !isNaN(nb);
    if (aEsNum && bEsNum) return na - nb;
    if (aEsNum) return -1;
    if (bEsNum) return 1;
    return String(a.mesa).localeCompare(String(b.mesa));
}

// Identifica mesas "para llevar" (por nombre, no por si son numéricas: códigos
// como "PB1" tampoco son números y son mesas físicas reales) para darles una
// franja propia, separada visualmente de las mesas físicas.
function esParaLlevar(m) {
    return String(m.mesa).toUpperCase().includes('LLEVAR');
}

// Color de la mesa según su estado real: verde si está libre, rojo si tiene
// comanda pendiente en cocina, amarillo si cocina ya la completó (aunque la
// mesa siga ocupada esperando el cobro).
// Desde cuándo contar el cronómetro de una mesa: en rojo cuenta desde que se
// marcó pendiente en cocina; en amarillo se REINICIA y cuenta desde que cocina
// la completó (no arrastra el tiempo que ya estuvo en rojo).
function desdeParaContador(m, color) {
    if (!m.comanda) return null;
    if (color === 'rose') return m.comanda.fecha_pendiente_desde || m.comanda.fecha_actualizacion;
    if (color === 'amber') return m.comanda.fecha_completada_desde || m.comanda.fecha_actualizacion;
    return null;
}

function estadoColorMesa(m) {
    if (m.estado !== 'ocupada') return 'emerald';
    const ec = ((m.comanda && m.comanda.estado_cocina) || '').toUpperCase();
    if (ec === 'COMPLETADA') return 'amber';
    return 'rose';
}

// Texto "Xm Ys" / "Xh Ym" a partir de milisegundos transcurridos.
function formatearTiempoEspera(ms) {
    const segundosTotales = Math.max(0, Math.floor(ms / 1000));
    const horas = Math.floor(segundosTotales / 3600);
    const minutos = Math.floor((segundosTotales % 3600) / 60);
    const segundos = segundosTotales % 60;
    if (horas > 0) return `${horas}h ${String(minutos).padStart(2, '0')}m`;
    return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

// Recalcula, cada segundo, cuánto lleva esperando cada mesa con comanda
// pendiente en cocina (tarjetas en rojo), sin volver a pedir nada al backend.
function actualizarContadoresEspera() {
    document.querySelectorAll('.contador-espera').forEach(el => {
        const desde = el.dataset.desde;
        if (!desde) return;
        const ms = Date.now() - new Date(desde).getTime();
        el.innerText = formatearTiempoEspera(ms);
    });
}

const PALETA_FRANJA_LLEVAR = {
    rose: { bg: 'bg-rose-500/10 border-rose-400/60 hover:bg-rose-500/20', text: 'text-rose-300', badge: 'bg-rose-500 text-white', dot: 'bg-rose-400' },
    amber: { bg: 'bg-amber-500/10 border-amber-400/60 hover:bg-amber-500/20', text: 'text-amber-300', badge: 'bg-amber-500 text-white', dot: 'bg-amber-400' },
    emerald: { bg: 'bg-violet-500/10 border-violet-400/50 hover:bg-violet-500/20', text: 'text-violet-300', badge: 'bg-violet-500 text-white', dot: '' },
};

const PALETA_GRID_MESAS = {
    rose: { bg: 'bg-rose-500/10 border-rose-400/60 hover:bg-rose-500/20', text: 'text-rose-300', badge: 'bg-rose-500 text-white', ring: 'ring-4 ring-rose-400/25', dot: 'bg-rose-400' },
    amber: { bg: 'bg-amber-500/10 border-amber-400/60 hover:bg-amber-500/20', text: 'text-amber-300', badge: 'bg-amber-500 text-white', ring: 'ring-4 ring-amber-400/25', dot: 'bg-amber-400' },
    emerald: { bg: 'bg-emerald-500/10 border-emerald-400/60 hover:bg-emerald-500/20', text: 'text-emerald-300', badge: 'bg-emerald-500 text-white', ring: 'hover:ring-4 hover:ring-emerald-400/25', dot: '' },
};

// Barra horizontal con el estado de cocina (pendiente/completado) de las
// comandas actualmente activas (mesas ocupadas), sin importar el piso.
function renderizarEstadoCocina() {
    const barra = document.getElementById('estado-cocina-barra');
    const resumenTexto = document.getElementById('estado-cocina-resumen-texto');
    if (!barra || !resumenTexto) return;

    const activas = mesasGlobal.filter(m => m.estado === 'ocupada' && m.comanda);
    if (activas.length === 0) {
        barra.innerHTML = '';
        resumenTexto.innerText = 'Sin mesas activas';
        return;
    }

    let pendientes = 0, completados = 0, rechazados = 0;
    activas.forEach(m => {
        const ec = (m.comanda.estado_cocina || '').toUpperCase();
        if (ec === 'COMPLETADA') completados++;
        else if (ec === 'RECHAZADA') rechazados++;
        else pendientes++;
    });

    const total = activas.length;
    const segmentos = [
        { cantidad: pendientes, color: 'bg-amber-400' },
        { cantidad: completados, color: 'bg-emerald-500' },
        { cantidad: rechazados, color: 'bg-rose-500' },
    ].filter(s => s.cantidad > 0);

    barra.innerHTML = segmentos.map(s => `<div class="${s.color} h-full" style="width:${(s.cantidad / total * 100).toFixed(1)}%"></div>`).join('');

    const partes = [];
    if (pendientes > 0) partes.push(`🟠 ${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`);
    if (completados > 0) partes.push(`🟢 ${completados} completado${completados !== 1 ? 's' : ''}`);
    if (rechazados > 0) partes.push(`🔴 ${rechazados} rechazado${rechazados !== 1 ? 's' : ''}`);
    resumenTexto.innerText = partes.join('  ·  ');
}

function renderizarMesas() {
    renderizarEstadoCocina();
    const contenedores = {
        'PLANTA_BAJA': document.getElementById('lienzo-planta-baja'),
        'PLANTA_ALTA': document.getElementById('lienzo-primer-piso')
    };
    const contenedoresLlevar = {
        'PLANTA_BAJA': document.getElementById('lienzo-planta-baja-llevar'),
        'PLANTA_ALTA': document.getElementById('lienzo-primer-piso-llevar')
    };
    const resumenes = {
        'PLANTA_BAJA': document.getElementById('resumen-planta-baja'),
        'PLANTA_ALTA': document.getElementById('resumen-primer-piso')
    };

    Object.keys(contenedores).forEach(piso => {
        const contenedor = contenedores[piso];
        const contenedorLlevar = contenedoresLlevar[piso];
        const resumen = resumenes[piso];
        if (!contenedor) return;

        const todasPiso = mesasGlobal.filter(m => m.piso === piso).sort(compararMesas);
        const mesasLlevar = todasPiso.filter(esParaLlevar);
        const mesasPiso = todasPiso.filter(m => !esParaLlevar(m));

        if (resumen) {
            const ocupadas = todasPiso.filter(m => m.estado === 'ocupada').length;
            resumen.innerText = todasPiso.length === 0 ? 'Sin mesas' : `${ocupadas} ocupadas · ${todasPiso.length - ocupadas} libres`;
        }

        // Franja "Para Llevar": separada, con su propio color e ícono de bolsa
        if (contenedorLlevar) {
            contenedorLlevar.innerHTML = mesasLlevar.map(m => {
                const esOcupada = m.estado === 'ocupada';
                const colorMesa = estadoColorMesa(m);
                const paleta = PALETA_FRANJA_LLEVAR[colorMesa];
                const colorBg = paleta.bg;
                const colorText = paleta.text;
                const badgeColor = paleta.badge;
                const dotPulse = (esOcupada && paleta.dot) ? `<span class="w-2 h-2 rounded-full ${paleta.dot} animate-pulse shrink-0"></span>` : '';
                const totalComanda = esOcupada ? `<span class="text-xs md:text-sm font-black ${colorText} shrink-0">Bs. ${parseFloat(m.comanda.total).toFixed(2)}</span>` : '';
                const estadoLabel = esOcupada ? m.comanda.estado : '';
                const desdeContador = esOcupada ? desdeParaContador(m, colorMesa) : null;
                const contadorEspera = desdeContador
                    ? `<span class="contador-espera text-[10px] md:text-xs font-black ${colorText} font-mono shrink-0" data-desde="${desdeContador}">${formatearTiempoEspera(Date.now() - new Date(desdeContador).getTime())}</span>`
                    : '';

                return `
                <div onclick="seleccionarMesa('${m.mesa}')" class="flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-2.5 cursor-pointer transition-all duration-300 ${colorBg}">
                    <span class="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0 ${badgeColor}">
                        <i class="fa-solid fa-bag-shopping"></i>
                    </span>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs md:text-sm font-black uppercase tracking-wide ${colorText} truncate">${m.mesa}</p>
                        ${estadoLabel ? `<p class="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-tight">${estadoLabel}</p>` : ''}
                    </div>
                    ${dotPulse}
                    ${contadorEspera}
                    ${totalComanda}
                </div>
            `;
            }).join('');
        }

        if (mesasPiso.length === 0) {
            contenedor.innerHTML = `
                <div class="col-span-full flex items-center justify-center text-slate-500 font-medium text-xs md:text-sm py-10">
                    No hay mesas registradas en este piso.
                </div>
            `;
            return;
        }

        contenedor.innerHTML = mesasPiso.map(m => {
            const esOcupada = m.estado === 'ocupada';

            // Colores según estado: verde libre, rojo pendiente en cocina, amarillo ya completada por cocina
            const colorMesa = estadoColorMesa(m);
            const paleta = PALETA_GRID_MESAS[colorMesa];
            const colorBg = paleta.bg;
            const colorText = paleta.text;
            const badgeColor = paleta.badge;
            const ringPulse = paleta.ring;
            const dotPulse = (esOcupada && paleta.dot) ? `<span class="absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${paleta.dot} animate-pulse"></span>` : '';

            const totalComanda = esOcupada ? `<span class="text-[10px] md:text-xs ${colorText} font-black leading-none">Bs. ${parseFloat(m.comanda.total).toFixed(2)}</span>` : '';
            const estadoLabel = esOcupada ? m.comanda.estado : 'Libre';
            const desdeContador = esOcupada ? desdeParaContador(m, colorMesa) : null;
            const contadorEspera = desdeContador
                ? `<span class="contador-espera text-[10px] md:text-xs font-black ${colorText} font-mono leading-none" data-desde="${desdeContador}">${formatearTiempoEspera(Date.now() - new Date(desdeContador).getTime())}</span>`
                : '';

            return `
            <div onclick="seleccionarMesa('${m.mesa}')" class="relative aspect-square w-full rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 shadow-md cursor-pointer transition-all duration-300 transform hover:scale-105 hover:-translate-y-0.5 ${colorBg} ${ringPulse}">
                ${dotPulse}
                <span class="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs font-black leading-none ${badgeColor}">
                    ${m.mesa}
                </span>
                <span class="text-[10px] md:text-xs font-bold uppercase tracking-wider ${colorText} leading-none text-center px-1">
                    ${m.mesa === 'Para Llevar' ? 'Para Llevar' : `Mesa ${m.mesa}`}
                </span>
                <span class="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-tight leading-none">
                    ${estadoLabel}
                </span>
                ${contadorEspera}
                ${totalComanda}
            </div>
        `;
        }).join('');
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
    document.getElementById('ticket-titulo').innerText = numero === 'Para Llevar' ? 'Para Llevar' : `Mesa #${numero}`;
    document.getElementById('btn-cerrar-panel-mesa').classList.remove('hidden');

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
        <div class="text-center text-slate-400 mt-10 text-sm md:text-base">
            <i class="fa-solid fa-mug-hot text-4xl mb-3 opacity-20 text-orange-600"></i>
            <p class="font-bold text-slate-700">Mesa Disponible</p>
            <p class="text-xs md:text-sm mt-1">La mesa está vacía y lista para recibir clientes.</p>
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
        estElem.className = 'text-[10px] md:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded border mt-1 bg-amber-50 text-amber-700 border-amber-200';
    } else {
        estElem.className = 'text-[10px] md:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded border mt-1 bg-indigo-50 text-indigo-700 border-indigo-200';
    }

    document.getElementById('btn-limpiar-pedido').classList.add('hidden');

    const itemsCont = document.getElementById('ticket-items');
    itemsCont.innerHTML = '';

    comandaActivaItems.forEach(item => {
        itemsCont.innerHTML += `
            <div class="flex items-center justify-between py-2 border-b border-slate-100">
                <div class="flex-grow pr-2">
                    <h4 class="text-xs md:text-sm font-bold text-slate-800 leading-tight">${item.producto_nombre}</h4>
                    <span class="text-[10px] md:text-xs text-slate-400">Cant: ${item.cantidad} x Bs. ${item.precio_unitario}</span>
                </div>
                <div class="text-xs md:text-sm font-black text-slate-800 text-right shrink-0">
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
        <button onclick="abrirModalImpresionComanda()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl border transition-colors btn-bounce flex items-center justify-center gap-2 text-xs md:text-sm">
            <i class="fa-solid fa-print"></i> Imprimir Comanda (Cocina)
        </button>
    `;

    // A.2 Botón de Pre-cuenta (con precios, para el cliente antes de cobrar)
    accionesCont.innerHTML += `
        <button onclick="imprimirPreCuentaComanda()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl border transition-colors btn-bounce flex items-center justify-center gap-2 text-xs md:text-sm mt-1.5">
            <i class="fa-solid fa-receipt"></i> Imprimir Pre-cuenta
        </button>
    `;

    // B. Botón de Modificar Pedido (Solo para mesero, cajero o admin, y estado CREADA)
    if (estado === 'CREADA' && (usuarioRol === 'MESERO' || usuarioRol === 'CAJERO' || usuarioRol === 'ADMIN')) {
        accionesCont.innerHTML += `
            <button onclick="modificarComandaActiva()" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl transition-colors btn-bounce flex items-center justify-center gap-2 text-xs md:text-sm">
                <i class="fa-solid fa-pen-to-square"></i> Modificar Pedido
            </button>
        `;
    }

    // C. Botón "Entregar Comida" (Para mesero, cajero o admin, si está en estado CREADA)
    if (estado === 'CREADA' && (usuarioRol === 'MESERO' || usuarioRol === 'CAJERO' || usuarioRol === 'ADMIN')) {
        accionesCont.innerHTML += `
            <button onclick="marcarComandaEntregada()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors btn-bounce flex items-center justify-center gap-2 text-sm md:text-base mt-1">
                <i class="fa-solid fa-hand-holding-hand"></i> Marcar como Entregado
            </button>
        `;
    }

    // D. Botones de cobro (Para cajero o admin): total en un solo método, o dividido
    // entre varios métodos de pago (ej. una parte en efectivo y otra con QR).
    if (usuarioRol === 'CAJERO' || usuarioRol === 'ADMIN') {
        accionesCont.innerHTML += `
            <div class="flex gap-2 mt-1">
                <button onclick="abrirModalCobroComanda()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors btn-bounce flex items-center justify-center gap-2 text-xs md:text-sm">
                    <i class="fa-solid fa-cash-register"></i> Cobrar Total
                </button>
                <button onclick="abrirModalCobroDividido()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors btn-bounce flex items-center justify-center gap-2 text-xs md:text-sm">
                    <i class="fa-solid fa-layer-group"></i> Cobrar Dividido
                </button>
            </div>
        `;
    }

    // E. Botón de Cancelar Comanda (Solo Admin)
    if (usuarioRol === 'ADMIN') {
        accionesCont.innerHTML += `
            <button onclick="cancelarComandaActiva()" class="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-2 rounded-xl transition-colors btn-bounce text-xs md:text-sm mt-2 border border-rose-200">
                <i class="fa-solid fa-ban mr-1"></i> Cancelar / Desocupar Mesa
            </button>
        `;
    }
}

// 6. Iniciar flujo de agregar pedido
function iniciarPedidoMesa() {
    carritoComanda = [];
    modoEdicionActivo = false;
    document.getElementById('lbl-mesa-activa').innerText = mesaSeleccionada === 'Para Llevar' ? 'Para Llevar' : `Mesa #${mesaSeleccionada}`;
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
            <div class="col-span-full py-8 text-center text-slate-400 font-medium italic text-xs md:text-sm">
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
                    <h3 class="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <span class="w-1.5 h-3 bg-orange-500 rounded-full"></span>
                        ${cat}
                        <span class="text-[9px] md:text-[10px] text-slate-400 font-bold font-mono">(${prodPorCat[cat].length})</span>
                    </h3>
                </div>
            </div>
        `;

        let productsHtml = '';
        prodPorCat[cat].forEach(prod => {
            productsHtml += `
                <div onclick="agregarAlCarritoComanda(${prod.id})" class="bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md hover:border-orange-500 transition-all select-none flex flex-col justify-between overflow-hidden relative min-h-[140px] md:min-h-[160px] btn-bounce">
                    <div class="h-20 md:h-24 w-full bg-slate-100 flex items-center justify-center shrink-0 border-b relative overflow-hidden">
                        ${prod.imagen_url ? 
                            `<img src="${prod.imagen_url}" class="w-full h-full object-cover" alt="${prod.nombre}">` : 
                            `<div class="w-full h-full bg-gradient-to-br from-orange-50 to-orange-100/50 flex items-center justify-center">
                                <i class="fa-solid fa-mug-hot text-orange-300 text-lg"></i>
                             </div>`
                        }
                    </div>
                    <div class="p-2.5 flex-grow flex flex-col justify-between">
                        <h4 class="font-bold text-gray-800 leading-tight text-[11px] md:text-sm line-clamp-2">${prod.nombre}</h4>
                        <div class="text-xs md:text-sm font-black text-slate-800 mt-1">
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

// Cierra el panel de detalle de la mesa y vuelve al estado inicial (ninguna mesa seleccionada)
function cerrarPanelMesa() {
    mesaSeleccionada = null;
    modoEdicionActivo = false;
    carritoComanda = [];
    comandaActivaMesa = null;
    comandaActivaItems = [];

    mostrarVistaMesas();

    document.getElementById('ticket-titulo').innerText = 'Mesa No Seleccionada';
    document.getElementById('ticket-estado').classList.add('hidden');
    document.getElementById('btn-limpiar-pedido').classList.add('hidden');
    document.getElementById('btn-cerrar-panel-mesa').classList.add('hidden');

    document.getElementById('ticket-items').innerHTML = `
        <div class="text-center text-gray-400 mt-10 text-sm md:text-base">
            <i class="fa-solid fa-utensils text-4xl mb-3 opacity-20 text-orange-900"></i>
            <p class="font-bold">Selecciona una mesa para ver o crear su comanda.</p>
        </div>
    `;

    document.getElementById('subtotal-ticket').innerText = 'Bs. 0.00';
    document.getElementById('total-ticket').innerText = 'Bs. 0.00';
    document.getElementById('seccion-acciones-mesa').innerHTML = '';
}

// 10. Renderizar UI del carrito activo de comanda
function actualizarTicketEdicion() {
    document.getElementById('btn-limpiar-pedido').classList.remove('hidden');
    document.getElementById('ticket-estado').classList.add('hidden');

    const itemsCont = document.getElementById('ticket-items');
    itemsCont.innerHTML = '';

    if (carritoComanda.length === 0) {
        itemsCont.innerHTML = `
            <div class="text-center text-gray-400 mt-10 text-xs md:text-sm">
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
                    <h4 class="text-xs md:text-sm font-bold text-slate-800 leading-tight">${item.nombre}</h4>
                    <span class="text-[10px] md:text-xs text-slate-400">Bs. ${item.precio_unitario}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 select-none">
                    <button onclick="cambiarCantidadItem(${idx}, -1)" class="w-5 h-5 md:w-6 md:h-6 bg-slate-100 text-slate-600 rounded flex items-center justify-center font-bold text-xs md:text-sm hover:bg-orange-100 hover:text-orange-600 transition-colors btn-bounce">-</button>
                    <span class="text-xs md:text-sm font-bold text-slate-800 w-4 text-center">${item.cantidad}</span>
                    <button onclick="cambiarCantidadItem(${idx}, 1)" class="w-5 h-5 md:w-6 md:h-6 bg-slate-100 text-slate-600 rounded flex items-center justify-center font-bold text-xs md:text-sm hover:bg-orange-100 hover:text-orange-600 transition-colors btn-bounce">+</button>
                    <button onclick="eliminarItemCarrito(${idx})" class="text-slate-300 hover:text-red-500 ml-1.5 transition-colors btn-bounce" title="Quitar"><i class="fa-solid fa-trash-can text-[10px] md:text-xs"></i></button>
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
            <button onclick="mostrarVistaMesas()" class="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-colors btn-bounce text-xs md:text-sm">
                Atrás
            </button>
            <button onclick="guardarComandaServidor()" ${carritoComanda.length === 0 ? 'disabled' : ''} class="w-2/3 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl shadow-md transition-colors btn-bounce disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs md:text-sm">
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
    const nombreMesaActiva = mesaSeleccionada === 'Para Llevar' ? 'Para Llevar' : `la Mesa ${mesaSeleccionada}`;
    const confirmacion = confirm(`⚠️ CUIDADO: ¿Estás seguro de cancelar el pedido de ${nombreMesaActiva}?\nEsta acción no se puede deshacer.`);
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

    document.getElementById('titulo-modal-impresion').innerText = 'Vista Previa de Comanda';
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

// Pre-cuenta: detalle completo con precios, para que el cliente revise antes
// de cobrar. No registra ninguna venta, solo imprime lo que ya está en el pedido.
function imprimirPreCuentaComanda() {
    if (!comandaActivaMesa) return;

    const zona = document.getElementById('zona-impresion');
    let itemsHtml = '';
    comandaActivaItems.forEach(item => {
        itemsHtml += `
            <tr class="border-b border-gray-100">
                <td class="py-1 text-center">${item.cantidad}</td>
                <td class="py-1">${item.producto_nombre}</td>
                <td class="py-1 text-right">Bs. ${parseFloat(item.subtotal).toFixed(2)}</td>
            </tr>
        `;
    });

    document.getElementById('titulo-modal-impresion').innerText = 'Vista Previa de Pre-cuenta';
    zona.innerHTML = `
        <div class="text-center font-bold mb-3">
            <h2 class="text-sm uppercase tracking-wide">Café La Paz</h2>
            <h1 class="text-lg font-black my-1.5">PRE-CUENTA (no es factura)</h1>
            <p class="text-[10px]">Mesa # ${comandaActivaMesa.mesa}</p>
            <p class="text-[9px] text-gray-500 font-mono">Pedido #${comandaActivaMesa.id}</p>
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
            <tbody>${itemsHtml}</tbody>
        </table>
        <hr class="border-t border-dashed border-gray-400 my-2">
        <div class="flex justify-between font-bold text-xs">
            <span>TOTAL</span>
            <span>Bs. ${parseFloat(comandaActivaMesa.total).toFixed(2)}</span>
        </div>
        <div class="text-center font-bold text-[9px] leading-tight mt-3">
            <p class="text-gray-500 font-normal">Documento sin validez fiscal</p>
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

// 15.b Cobro dividido: el mismo total, repartido entre 2 o más métodos de pago
// (ej. una parte en efectivo y otra con QR), cada uno queda como una venta
// separada en el backend para que el cuadre de caja por método sea exacto.
let montoTotalCobroDividido = 0;

const OPCIONES_METODO_PAGO_HTML = `
    <option value="EFECTIVO">💵 Efectivo</option>
    <option value="QR">📱 QR Transferencia</option>
    <option value="TARJETA">💳 Tarjeta POS</option>
    <option value="BILLETERA MOVIL">🇧🇴 Billetera Móvil</option>
`;

function abrirModalCobroDividido() {
    if (!comandaActivaMesa) return;
    montoTotalCobroDividido = parseFloat(comandaActivaMesa.total);
    document.getElementById('lbl-monto-cobro-dividido').innerText = `Bs. ${montoTotalCobroDividido.toFixed(2)}`;
    document.getElementById('lista-pagos-divididos').innerHTML = '';
    // Arranca con 2 filas: "dividido" implica al menos dos métodos de pago.
    agregarFilaPagoDividido();
    agregarFilaPagoDividido();
    actualizarResumenCobroDividido();
    document.getElementById('modalCobroDividido').classList.remove('hidden');
}

function cerrarModalCobroDividido() {
    document.getElementById('modalCobroDividido').classList.add('hidden');
}

function agregarFilaPagoDividido() {
    const cont = document.getElementById('lista-pagos-divididos');
    const fila = document.createElement('div');
    fila.className = 'flex gap-2 items-center pago-dividido-fila';
    fila.innerHTML = `
        <select class="pago-dividido-metodo flex-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
            ${OPCIONES_METODO_PAGO_HTML}
        </select>
        <input type="number" step="0.01" min="0" class="pago-dividido-monto w-28 border border-slate-200 rounded-xl p-2.5 text-sm font-bold text-right focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="0.00">
        <button type="button" class="pago-dividido-quitar text-gray-300 hover:text-rose-500 w-8 h-8 flex items-center justify-center transition-colors shrink-0">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    fila.querySelector('.pago-dividido-monto').addEventListener('input', actualizarResumenCobroDividido);
    fila.querySelector('.pago-dividido-quitar').addEventListener('click', () => {
        // Siempre debe quedar al menos una fila para poder seguir cobrando.
        if (cont.querySelectorAll('.pago-dividido-fila').length > 1) {
            fila.remove();
            actualizarResumenCobroDividido();
        }
    });
    cont.appendChild(fila);
}

function actualizarResumenCobroDividido() {
    const filas = document.querySelectorAll('#lista-pagos-divididos .pago-dividido-fila');
    let suma = 0;
    filas.forEach(f => {
        const val = parseFloat(f.querySelector('.pago-dividido-monto').value);
        if (!isNaN(val)) suma += val;
    });

    document.getElementById('lbl-suma-dividido').innerText = `Bs. ${suma.toFixed(2)}`;

    const resumen = document.getElementById('resumen-suma-dividido');
    const coincide = Math.abs(suma - montoTotalCobroDividido) < 0.01 && suma > 0;
    resumen.classList.toggle('bg-emerald-50', coincide);
    resumen.classList.toggle('text-emerald-700', coincide);
    resumen.classList.toggle('bg-rose-50', !coincide);
    resumen.classList.toggle('text-rose-600', !coincide);

    document.getElementById('btn-confirmar-cobro-dividido').disabled = !coincide;
}

async function confirmarCobroDividido() {
    if (!comandaActivaMesa) return;
    const filas = document.querySelectorAll('#lista-pagos-divididos .pago-dividido-fila');
    const pagos = Array.from(filas)
        .map(f => ({
            metodo_pago: f.querySelector('.pago-dividido-metodo').value,
            monto: parseFloat(f.querySelector('.pago-dividido-monto').value) || 0
        }))
        .filter(p => p.monto > 0);

    try {
        const res = await fetch(`/api/comandas/${comandaActivaMesa.id}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pagos, usuario_id: usuarioId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        ultimaVentaRegistradaId = data.venta_id;

        cerrarModalCobroDividido();
        document.getElementById('lbl-ticket-exito').innerText = `Ticket # ${ultimaVentaRegistradaId.toString().padStart(4, '0')}`;
        document.getElementById('modalExitoCobro').classList.remove('hidden');

        cargarMesas();
        seleccionarMesa(mesaSeleccionada);
    } catch (e) {
        alert('❌ Error al procesar cobro dividido: ' + e.message);
    }
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

        document.getElementById('titulo-modal-impresion').innerText = 'Vista Previa de Factura';
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

// === GASTO DE CAJA CHICA (solo registrar: no hay forma de ver el total ni el historial desde acá) ===
function abrirModalCajaChica() {
    document.getElementById('input-monto-caja-chica').value = '';
    document.getElementById('input-descripcion-caja-chica').value = '';
    document.getElementById('modalCajaChica').classList.remove('hidden');
}

function cerrarModalCajaChica() {
    document.getElementById('modalCajaChica').classList.add('hidden');
}

async function confirmarGastoCajaChica() {
    const monto = parseFloat(document.getElementById('input-monto-caja-chica').value);
    const descripcion = document.getElementById('input-descripcion-caja-chica').value.trim();

    if (!monto || monto <= 0) {
        alert('❌ Ingresa un monto válido.');
        return;
    }
    if (!descripcion) {
        alert('❌ Ingresa una descripción del gasto.');
        return;
    }

    try {
        const res = await fetch('/api/caja-chica/gastos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto, descripcion })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'No se pudo registrar el gasto');
        }
        cerrarModalCajaChica();
        alert('✅ Gasto de caja chica registrado.');
    } catch (e) {
        alert('❌ Error: ' + e.message);
    }
}
