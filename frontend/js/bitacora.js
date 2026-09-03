// frontend/js/bitacora.js
// Vista de auditoría: lista cronológica de todo lo que registra backend/utils/bitacora.js
// (comandas, cobros, caja, asistencia, gastos, ventas...). Solo accesible para administradores.

let paginaActual = 1;
let totalPaginas = 1;

const META_ACCIONES = {
    CREAR_COMANDA:               { icon: 'fa-plus',            color: 'blue',    label: 'Comanda creada' },
    EDITAR_COMANDA:               { icon: 'fa-pen',              color: 'amber',   label: 'Comanda editada' },
    ELIMINAR_COMANDA:             { icon: 'fa-trash-can',        color: 'rose',    label: 'Comanda eliminada' },
    CAMBIAR_ESTADO_COCINA:        { icon: 'fa-kitchen-set',      color: 'indigo',  label: 'Estado de cocina cambiado' },
    CAMBIAR_ESTADO_COMANDA:       { icon: 'fa-arrows-rotate',    color: 'indigo',  label: 'Estado de comanda cambiado' },
    COBRAR_COMANDA:               { icon: 'fa-cash-register',    color: 'emerald', label: 'Comanda cobrada' },
    VENTA_DIRECTA:                { icon: 'fa-shop',             color: 'emerald', label: 'Venta directa (Punto de Venta)' },
    CREAR_PRODUCTO:               { icon: 'fa-plus',             color: 'blue',    label: 'Producto creado' },
    EDITAR_PRODUCTO:              { icon: 'fa-pen',              color: 'amber',   label: 'Producto editado' },
    ELIMINAR_PRODUCTO:            { icon: 'fa-trash-can',        color: 'rose',    label: 'Producto eliminado' },
    ABRIR_CAJA:                   { icon: 'fa-door-open',        color: 'blue',    label: 'Caja abierta' },
    CERRAR_CAJA:                  { icon: 'fa-door-closed',      color: 'indigo',  label: 'Caja cerrada' },
    REGISTRAR_GASTO_CAJA:         { icon: 'fa-receipt',          color: 'orange',  label: 'Gasto de caja registrado' },
    EDITAR_METODO_PAGO_VENTA:     { icon: 'fa-pen',              color: 'amber',   label: 'Método de pago editado' },
    REGISTRAR_VENTA_HISTORICA:    { icon: 'fa-clock-rotate-left',color: 'blue',    label: 'Venta histórica registrada' },
    EDITAR_ES_HISTORICA_VENTA:    { icon: 'fa-pen',              color: 'amber',   label: 'Venta marcada como histórica' },
    ELIMINAR_TURNO_CAJA:          { icon: 'fa-trash-can',        color: 'rose',    label: 'Turno de caja eliminado' },
    ELIMINAR_GASTO_CAJA:          { icon: 'fa-trash-can',        color: 'rose',    label: 'Gasto de caja eliminado' },
    REGISTRAR_GASTO_CAJA_CHICA:   { icon: 'fa-receipt',          color: 'orange',  label: 'Gasto de caja chica registrado' },
    MARCAR_ASISTENCIA_SALIDA:     { icon: 'fa-user-clock',       color: 'purple',  label: 'Salida marcada (asistencia)' },
    MARCAR_ASISTENCIA_ENTRADA:    { icon: 'fa-user-clock',       color: 'purple',  label: 'Entrada marcada (asistencia)' },
    REGISTRAR_ASISTENCIA_MANUAL:  { icon: 'fa-user-pen',         color: 'purple',  label: 'Asistencia manual registrada' },
    ELIMINAR_ASISTENCIA:          { icon: 'fa-trash-can',        color: 'rose',    label: 'Registro de asistencia eliminado' },
    ELIMINAR_VENTA_LIBRO_DIARIO:  { icon: 'fa-trash-can',        color: 'rose',    label: 'Venta eliminada (Libro Diario)' },
    REGISTRAR_GASTO_GENERAL:      { icon: 'fa-receipt',          color: 'orange',  label: 'Gasto general registrado' },
    ELIMINAR_GASTO_GENERAL:       { icon: 'fa-trash-can',        color: 'rose',    label: 'Gasto general eliminado' },
    EDITAR_CATEGORIA_GASTO_GENERAL:{ icon: 'fa-pen',             color: 'amber',   label: 'Categoría de gasto editada' },
    EDITAR_CATEGORIA_GASTO_CAJA:  { icon: 'fa-pen',              color: 'amber',   label: 'Categoría de gasto de caja editada' },
    ELIMINAR_COMPRA:              { icon: 'fa-trash-can',        color: 'rose',    label: 'Compra eliminada' },
    ANULAR_VENTA:                 { icon: 'fa-ban',              color: 'rose',    label: 'Venta anulada' },
};

const COLOR_CLASSES = {
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-600',    dot: 'bg-blue-500' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-600',   dot: 'bg-amber-500' },
    rose:    { bg: 'bg-rose-500/10',    text: 'text-rose-600',    dot: 'bg-rose-500' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', dot: 'bg-emerald-500' },
    indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-600',  dot: 'bg-indigo-500' },
    purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-600',  dot: 'bg-purple-500' },
    orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-600',  dot: 'bg-orange-500' },
    slate:   { bg: 'bg-slate-500/10',   text: 'text-slate-600',   dot: 'bg-slate-400' },
};

function metaDeAccion(accion) {
    if (META_ACCIONES[accion]) return META_ACCIONES[accion];
    // Heurística por prefijo para acciones futuras que no estén en el diccionario
    if (/^(CREAR|REGISTRAR|ABRIR)_/.test(accion)) return { icon: 'fa-plus', color: 'blue', label: humanizarAccion(accion) };
    if (/^(EDITAR|CAMBIAR|MARCAR)_/.test(accion)) return { icon: 'fa-pen', color: 'amber', label: humanizarAccion(accion) };
    if (/^(ELIMINAR|ANULAR|CERRAR)_/.test(accion)) return { icon: 'fa-trash-can', color: 'rose', label: humanizarAccion(accion) };
    return { icon: 'fa-circle-info', color: 'slate', label: humanizarAccion(accion) };
}

function humanizarAccion(accion) {
    return (accion || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function formatDetalle(detalleTexto) {
    if (!detalleTexto) return '';
    let obj;
    try { obj = JSON.parse(detalleTexto); } catch (e) { return `<span class="text-slate-500">${escapeHtml(detalleTexto)}</span>`; }
    if (obj === null || typeof obj !== 'object') return `<span class="text-slate-500">${escapeHtml(String(obj))}</span>`;

    const ETIQUETAS = {
        mesa: 'Mesa', total: 'Total', cantidad_items: 'Ítems', estado_previo: 'Estado previo',
        saldo_final: 'Saldo final', creador_id: 'Creador', pagos: 'Pagos', venta_id_principal: 'Venta',
        monto: 'Monto', descripcion: 'Descripción', caja_id: 'Caja', horas_trabajadas: 'Horas',
        empleado_id: 'Empleado', fecha: 'Fecha', hora_entrada: 'Entrada', hora_salida: 'Salida',
        categoria: 'Categoría'
    };

    return Object.entries(obj).map(([k, v]) => {
        const label = ETIQUETAS[k] || humanizarAccion(k);
        let valor = v;
        if (typeof v === 'number' && /total|monto|saldo/i.test(k)) {
            valor = `Bs. ${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(v)}`;
        } else if (typeof v === 'object' && v !== null) {
            valor = JSON.stringify(v);
        }
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
            <span class="text-slate-400">${escapeHtml(label)}:</span> ${escapeHtml(String(valor))}
        </span>`;
    }).join(' ');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function inicializarBitacora() {
    await cargarCatalogo();
    await cargarResumen();
    await cargarBitacora();
}

async function cargarCatalogo() {
    try {
        const res = await fetch('/api/bitacora/catalogo');
        if (!res.ok) return;
        const data = await res.json();

        const selUsuario = document.getElementById('f-usuario');
        data.usuarios.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.usuario_id;
            opt.textContent = u.nombre || `Usuario #${u.usuario_id}`;
            selUsuario.appendChild(opt);
        });

        const selAccion = document.getElementById('f-accion');
        data.acciones.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a;
            opt.textContent = metaDeAccion(a).label;
            selAccion.appendChild(opt);
        });
    } catch (e) {
        console.error('Error al cargar catálogo de bitácora:', e);
    }
}

async function cargarResumen() {
    try {
        const res = await fetch('/api/bitacora/resumen');
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('kpi-total-hoy').innerText = data.totalHoy;

        const cobros = data.porAccionHoy.filter(a => /COBRAR|VENTA/.test(a.accion)).reduce((s, a) => s + parseInt(a.total), 0);
        const eliminaciones = data.porAccionHoy.filter(a => /ELIMINAR|ANULAR/.test(a.accion)).reduce((s, a) => s + parseInt(a.total), 0);
        document.getElementById('kpi-cobros-hoy').innerText = cobros;
        document.getElementById('kpi-eliminaciones-hoy').innerText = eliminaciones;

        const contUsuarios = document.getElementById('kpi-usuarios-activos');
        if (data.usuariosMasActivos7d.length === 0) {
            contUsuarios.innerHTML = '<span class="text-xs text-slate-400 italic">Sin actividad reciente</span>';
        } else {
            contUsuarios.innerHTML = data.usuariosMasActivos7d.map(u => `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                    ${escapeHtml(u.usuario_nombre)} <span class="text-slate-400 font-semibold">${u.total}</span>
                </span>
            `).join('');
        }
    } catch (e) {
        console.error('Error al cargar resumen de bitácora:', e);
    }
}

function construirQuery() {
    const params = new URLSearchParams();
    params.set('page', paginaActual);
    params.set('limit', 30);

    const busqueda = document.getElementById('f-busqueda').value.trim();
    const usuario = document.getElementById('f-usuario').value;
    const accion = document.getElementById('f-accion').value;
    const fechaInicio = document.getElementById('f-fecha-inicio').value;
    const fechaFin = document.getElementById('f-fecha-fin').value;

    if (busqueda) params.set('busqueda', busqueda);
    if (usuario) params.set('usuario_id', usuario);
    if (accion) params.set('accion', accion);
    if (fechaInicio) params.set('fecha_inicio', fechaInicio);
    if (fechaFin) params.set('fecha_fin', fechaFin);

    return params.toString();
}

async function cargarBitacora() {
    const icono = document.getElementById('icono-refrescar');
    icono.classList.add('fa-spin');
    const contenedor = document.getElementById('lista-bitacora');

    try {
        const res = await fetch(`/api/bitacora?${construirQuery()}`);
        if (!res.ok) throw new Error('Error al cargar bitácora');
        const data = await res.json();

        totalPaginas = data.totalPages;
        document.getElementById('contador-resultados').innerText = `${data.total} evento${data.total === 1 ? '' : 's'}`;
        document.getElementById('lbl-pagina').innerText = `Página ${data.page} de ${data.totalPages}`;
        document.getElementById('btn-pag-prev').disabled = data.page <= 1;
        document.getElementById('btn-pag-next').disabled = data.page >= data.totalPages;

        if (data.data.length === 0) {
            contenedor.innerHTML = `
                <div class="text-center py-16 text-slate-400">
                    <i class="fa-solid fa-clipboard-list text-3xl mb-3"></i>
                    <p class="text-sm font-medium">No hay eventos con estos filtros</p>
                </div>
            `;
            return;
        }

        contenedor.innerHTML = data.data.map(ev => {
            const meta = metaDeAccion(ev.accion);
            const c = COLOR_CLASSES[meta.color];
            const detalleHtml = formatDetalle(ev.detalle);
            const refEntidad = ev.entidad_tipo
                ? `<span class="text-slate-400">· ${escapeHtml(humanizarAccion(ev.entidad_tipo))}${ev.entidad_id ? ' #' + ev.entidad_id : ''}</span>`
                : '';

            return `
                <div class="evento-fila flex gap-4 pb-4">
                    <div class="relative z-10 shrink-0">
                        <div class="w-11 h-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center text-base border-4 border-white shadow-sm">
                            <i class="fa-solid ${meta.icon}"></i>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0 pt-1">
                        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p class="text-sm font-bold text-slate-800">
                                ${escapeHtml(meta.label)} ${refEntidad}
                            </p>
                            <span class="text-xs font-mono text-slate-400 shrink-0">${ev.fecha}</span>
                        </div>
                        <p class="text-xs text-slate-500 font-semibold mt-0.5">
                            <i class="fa-solid fa-user text-[10px] mr-1 text-slate-400"></i>${escapeHtml(ev.usuario_nombre || 'Sistema')}
                        </p>
                        ${detalleHtml ? `<div class="flex flex-wrap gap-1.5 mt-2">${detalleHtml}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error al cargar bitácora:', e);
        contenedor.innerHTML = `
            <div class="text-center py-16 text-rose-400">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="text-sm font-medium">No se pudo cargar la bitácora</p>
            </div>
        `;
    } finally {
        icono.classList.remove('fa-spin');
    }
}

function aplicarFiltros() {
    paginaActual = 1;
    cargarBitacora();
}

function limpiarFiltros() {
    document.getElementById('f-busqueda').value = '';
    document.getElementById('f-usuario').value = '';
    document.getElementById('f-accion').value = '';
    document.getElementById('f-fecha-inicio').value = '';
    document.getElementById('f-fecha-fin').value = '';
    paginaActual = 1;
    cargarBitacora();
}

function cambiarPagina(delta) {
    const nueva = paginaActual + delta;
    if (nueva < 1 || nueva > totalPaginas) return;
    paginaActual = nueva;
    cargarBitacora();
    document.getElementById('lista-bitacora').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
