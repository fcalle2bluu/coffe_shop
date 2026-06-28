// === ESTADO GLOBAL DEL LIBRO DIARIO ===
let _asientosData = [];       // Todos los asientos del mes cargado
let _ordenActual = 'DESC';    // Orden activo: DESC = reciente primero

document.addEventListener('DOMContentLoaded', () => {
    const fecha = new Date();
    const filtroMes = document.getElementById('filtroMes');
    const filtroAnio = document.getElementById('filtroAnio');
    if (filtroMes) filtroMes.value = fecha.getMonth() + 1;
    if (filtroAnio) filtroAnio.value = fecha.getFullYear();

    cargarEmpresa();
    cargarLibroDiario();
});

// Cambia el orden y re-renderiza sin recargar del servidor
function setOrden(nuevoOrden) {
    _ordenActual = nuevoOrden;
    // Actualizar estilos de botones
    const btnDesc = document.getElementById('btnOrdenDesc');
    const btnAsc  = document.getElementById('btnOrdenAsc');
    if (btnDesc && btnAsc) {
        if (nuevoOrden === 'DESC') {
            btnDesc.className = 'px-3 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm transition-all flex items-center gap-1';
            btnAsc.className  = 'px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-1';
        } else {
            btnAsc.className  = 'px-3 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm transition-all flex items-center gap-1';
            btnDesc.className = 'px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-1';
        }
    }
    filtrarYRenderizar();
}

// Limpia todos los filtros de búsqueda
function limpiarFiltros() {
    const buscador = document.getElementById('buscadorDiario');
    const tipo     = document.getElementById('filtroTipo');
    const montoMin = document.getElementById('filtroMontoMin');
    const montoMax = document.getElementById('filtroMontoMax');
    const fechaEspecifica = document.getElementById('filtroFechaEspecifica');
    if (buscador) buscador.value = '';
    if (tipo)     tipo.value = '';
    if (montoMin) montoMin.value = '';
    if (montoMax) montoMax.value = '';
    if (fechaEspecifica) fechaEspecifica.value = '';
    filtrarYRenderizar();
}

let chartCostosGastosInstance = null;

function actualizarGraficoCostosGastos(asientosFiltrados) {
    let totalCostos = 0;
    let totalGastos = 0;
    
    asientosFiltrados.forEach(asiento => {
        asiento.cuentas.forEach(c => {
            if (c.tipo === 'DEBE') {
                const nombreCuenta = c.nombre.toUpperCase();
                if (nombreCuenta === 'INVENTARIOS' || nombreCuenta.includes('COSTO')) {
                    totalCostos += parseFloat(c.importe) || 0;
                } else if (nombreCuenta.includes('GASTO')) {
                    totalGastos += parseFloat(c.importe) || 0;
                }
            }
        });
    });
    
    const infoSpan = document.getElementById('totalesChartInfo');
    if (infoSpan) {
        infoSpan.textContent = `Costos: Bs. ${formatearMonto(totalCostos)} | Gastos: Bs. ${formatearMonto(totalGastos)}`;
    }
    
    const canvas = document.getElementById('chartCostosGastos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (chartCostosGastosInstance) {
        chartCostosGastosInstance.destroy();
    }
    
    chartCostosGastosInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Costos (Insumos)', 'Gastos (Operacionales)'],
            datasets: [{
                label: 'Total (Bs.)',
                data: [totalCostos, totalGastos],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.75)', // Indigo Blue
                    'rgba(239, 68, 68, 0.75)'   // Red Gasto
                ],
                borderColor: [
                    'rgb(37, 99, 235)',
                    'rgb(220, 38, 38)'
                ],
                borderWidth: 2,
                borderRadius: 12,
                barPercentage: 0.5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` Bs. ${formatearMonto(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Bs. ' + value;
                        }
                    }
                }
            }
        }
    });

    // Sincronizar colores del gráfico según el tema cargado
    sincronizarGraficoConTema();
}

// === SINCRONIZACIÓN DEL GRÁFICO CON EL TEMA DIARIO (MODO OSCURO) ===
function sincronizarGraficoConTema() {
    if (!chartCostosGastosInstance) return;
    const isDark = localStorage.getItem('darkMode') === 'true';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

    if (chartCostosGastosInstance.options.scales) {
        for (let key in chartCostosGastosInstance.options.scales) {
            const scale = chartCostosGastosInstance.options.scales[key];
            if (scale.ticks) {
                scale.ticks.color = textColor;
            }
            if (scale.grid) {
                scale.grid.color = gridColor;
            }
        }
    }
    if (chartCostosGastosInstance.options.plugins && chartCostosGastosInstance.options.plugins.legend && chartCostosGastosInstance.options.plugins.legend.labels) {
        chartCostosGastosInstance.options.plugins.legend.labels.color = textColor;
    }
    chartCostosGastosInstance.update();
}

window.addEventListener('themeChanged', function() {
    sincronizarGraficoConTema();
});

// Aplica filtros client-side y re-renderiza la tabla
function filtrarYRenderizar() {
    const textoBusqueda = (document.getElementById('buscadorDiario')?.value || '').toLowerCase().trim();
    const tipoFiltro    = (document.getElementById('filtroTipo')?.value || '');
    const montoMin      = parseFloat(document.getElementById('filtroMontoMin')?.value) || 0;
    const montoMax      = parseFloat(document.getElementById('filtroMontoMax')?.value) || Infinity;
    const fechaEspecifica = (document.getElementById('filtroFechaEspecifica')?.value || '');

    // Filtrar asientos
    let filtrados = _asientosData.filter(asiento => {
        // Filtro por tipo o clasificación
        if (tipoFiltro) {
            if (tipoFiltro === 'ingreso') {
                if (asiento.tipo !== 'venta') return false;
            } else if (tipoFiltro === 'egreso') {
                if (!['compra', 'gasto_caja', 'gasto_general'].includes(asiento.tipo)) return false;
            } else {
                if (asiento.tipo !== tipoFiltro) return false;
            }
        }

        // Filtro por fecha específica
        if (fechaEspecifica && asiento.fecha_iso !== fechaEspecifica) return false;

        // Filtro por monto (usar el total del primer DEBE de las cuentas)
        const totalAsiento = asiento.cuentas
            .filter(c => c.tipo === 'DEBE')
            .reduce((sum, c) => sum + (parseFloat(c.importe) || 0), 0);
        if (totalAsiento < montoMin) return false;
        if (montoMax !== Infinity && totalAsiento > montoMax) return false;

        // Filtro por texto: busca en glosa + nombres de cuentas
        if (textoBusqueda) {
            const glosaTexto = (asiento.glosa || '').toLowerCase();
            const cuentasTexto = asiento.cuentas.map(c => c.nombre.toLowerCase()).join(' ');
            const importesTexto = asiento.cuentas.map(c => c.importe.toString()).join(' ');
            const busquedaCompleta = glosaTexto + ' ' + cuentasTexto + ' ' + importesTexto;
            if (!busquedaCompleta.includes(textoBusqueda)) return false;
        }

        return true;
    });

    // Aplicar orden
    if (_ordenActual === 'ASC') {
        filtrados = filtrados.slice().reverse(); // Los datos ya vienen DESC del backend, reverse = ASC
    }

    // Actualizar contador
    const contador = document.getElementById('contadorResultados');
    if (contador) {
        if (filtrados.length === _asientosData.length) {
            contador.textContent = `${filtrados.length} asientos`;
        } else {
            contador.textContent = `${filtrados.length} de ${_asientosData.length} asientos`;
        }
    }

    // Renderizar
    renderizarAsientos(filtrados);
    
    // Actualizar gráfico de Costos vs Gastos
    actualizarGraficoCostosGastos(filtrados);
}


async function cargarEmpresa() {
    try {
        const res = await fetch('/api/parametros');
        if (res.ok) {
            const data = await res.json();
            if (data && data.nombre_empresa) {
                document.getElementById('excelEmpresa').innerText = data.nombre_empresa.toUpperCase() + ' S.R.L.';
            }
        }
    } catch (e) {
        console.error("Error al cargar identidad de empresa:", e);
    }
}

async function cargarLibroDiario() {
    const mes = document.getElementById('filtroMes').value;
    const anio = document.getElementById('filtroAnio').value;
    const body = document.getElementById('libroDiarioCuerpo');
    
    if (!body) return;

    body.innerHTML = `
        <tr>
            <td colspan="6" class="text-center py-20 text-slate-400 italic font-sans">
                <i class="fa-solid fa-spinner fa-spin text-2xl mb-4 text-indigo-500 block"></i>
                Generando asientos del libro diario contable...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`/api/libro-diario?mes=${mes}&anio=${anio}&orden=DESC`);
        if (!res.ok) throw new Error('Error al obtener datos contables');
        const data = await res.json();

        document.getElementById('excelPeriodo').innerText = `${data.mes_nombre} - ${data.anio}`;

        if (!data.asientos || data.asientos.length === 0) {
            _asientosData = [];
            body.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-20 text-slate-400 italic font-sans">
                        No hay movimientos registrados (ventas o compras) para este período.
                    </td>
                </tr>
            `;
            const contador = document.getElementById('contadorResultados');
            if (contador) contador.textContent = '0 asientos';
            return;
        }

        // Guardar en memoria para filtrado client-side
        _asientosData = data.asientos;

        // Aplicar filtros actuales (si los hay) y renderizar
        filtrarYRenderizar();

    } catch (error) {
        console.error("Error cargando Libro Diario:", error);
        body.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-20">
                    <p class="text-rose-500 font-bold mb-2">⚠️ Error de conexión con el servidor contable</p>
                    <button onclick="cargarLibroDiario()" class="text-xs bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200 transition-colors tracking-tight font-black uppercase">Reintentar</button>
                </td>
            </tr>
        `;
    }
}

// Renderiza un array de asientos en el tbody
function renderizarAsientos(asientos) {
    const body = document.getElementById('libroDiarioCuerpo');
    if (!body) return;

    body.innerHTML = '';

    if (asientos.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-16 text-slate-400 italic font-sans">
                    <i class="fa-solid fa-filter-circle-xmark text-2xl mb-3 text-slate-300 block"></i>
                    No hay asientos que coincidan con los filtros aplicados.
                </td>
            </tr>
        `;
        return;
    }

    const esAdmin = ['ADMIN', 'ADMINISTRADOR'].includes((localStorage.getItem('usuario_rol') || '').toUpperCase());

    let totalDebeGlobal = 0;
    let totalHaberGlobal = 0;

    asientos.forEach((asiento, asientoIdx) => {
        let totalAsientoDebe = 0;
        let totalAsientoHaber = 0;

        asiento.cuentas.forEach(c => {
            if (c.tipo === 'DEBE') {
                totalAsientoDebe += parseFloat(c.importe) || 0;
                totalDebeGlobal  += parseFloat(c.importe) || 0;
            } else {
                totalAsientoHaber += parseFloat(c.importe) || 0;
                totalHaberGlobal  += parseFloat(c.importe) || 0;
            }
        });

        const detalleId = `detalle-asiento-${asientoIdx}`;

        // Detectar tipo para badge de color
        const tipoBadges = {
            venta:         { label: 'VENTA',    cls: 'bg-emerald-100 text-emerald-700' },
            compra:        { label: 'COMPRA',   cls: 'bg-blue-100 text-blue-700' },
            gasto_caja:    { label: 'GASTO',    cls: 'bg-red-100 text-red-600' },
            gasto_general: { label: 'G.GRAL',  cls: 'bg-orange-100 text-orange-600' },
        };
        const badge = tipoBadges[asiento.tipo] || { label: asiento.tipo?.toUpperCase() || '', cls: 'bg-slate-100 text-slate-500' };

        // Acortar la glosa para la fila principal (máx 80 chars)
        const glosaCorta = asiento.glosa && asiento.glosa.length > 80
            ? asiento.glosa.substring(0, 80) + '…'
            : (asiento.glosa || '');

        const accionAdmin = esAdmin
            ? `<button onclick="eliminarAsiento('${asiento.tipo}', ${asiento.ref_id}, this)" title="Eliminar asiento" class="text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded p-1 transition-all ml-1"><i class="fa-solid fa-trash-can text-xs"></i></button>
               ${asiento.tipo === 'gasto_general' ? `<button onclick="abrirModalCambiarCategoria(${asiento.ref_id})" title="Cambiar categoría" class="text-amber-400 hover:text-amber-600 hover:bg-amber-50 rounded p-1 transition-all ml-1"><i class="fa-solid fa-pen-to-square text-xs"></i></button>` : ''}`
            : '';

        // ── FILA PRINCIPAL (siempre visible) ──
        const trPrincipal = document.createElement('tr');
        trPrincipal.className = "hover:bg-indigo-50/40 cursor-pointer transition-colors border-b border-slate-100";
        trPrincipal.onclick = () => toggleDetalleAsiento(detalleId, trPrincipal);
        trPrincipal.innerHTML = `
            <td class="text-center font-sans px-3 py-2.5">
                <span class="font-bold text-slate-700 block text-xs">${asiento.fecha}</span>
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">${asiento.dia_semana || ''}</span>
            </td>
            <td class="text-center font-bold px-2 py-2.5">
                <span class="font-bold text-slate-900 text-xs">${asiento.asiento_nro}</span>
            </td>
            <td class="text-left px-3 py-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[9px] font-black px-2 py-0.5 rounded-full ${badge.cls}">${badge.label}</span>
                    <span class="text-xs text-slate-600 leading-snug">${glosaCorta}</span>
                </div>
            </td>
            <td class="text-right font-bold text-slate-900 px-3 py-2.5 text-xs">${formatearMonto(totalAsientoDebe)}</td>
            <td class="text-right font-bold text-slate-400 px-3 py-2.5 text-xs"></td>
            <td class="text-center px-2 py-2.5">
                <div class="flex items-center justify-center gap-0.5">
                    <button title="Ver detalle" class="btn-expand-asiento text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded p-1 transition-all">
                        <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>
                    ${accionAdmin}
                </div>
            </td>
        `;
        body.appendChild(trPrincipal);

        // ── FILAS DE DETALLE (ocultas por defecto) ──
        const trDetalle = document.createElement('tr');
        trDetalle.id = detalleId;
        trDetalle.className = "hidden bg-slate-50/70";

        // Construir contenido del detalle
        let detalleHtml = `<td colspan="6" class="px-0 py-0">
            <table class="w-full border-collapse text-xs font-mono">`;

        asiento.cuentas.forEach(cuenta => {
            const debeVal  = cuenta.tipo === 'DEBE'  ? `<span class="font-bold text-slate-800">${formatearMonto(parseFloat(cuenta.importe))}</span>` : '';
            const haberVal = cuenta.tipo === 'HABER' ? `<span class="font-bold text-slate-500">${formatearMonto(parseFloat(cuenta.importe))}</span>` : '';
            const nombreSpan = cuenta.tipo === 'DEBE'
                ? `<span class="excel-account-debe pl-8">${cuenta.nombre}</span>`
                : `<span class="pl-20 text-slate-500 font-bold">${cuenta.nombre}</span>`;
            detalleHtml += `
                <tr class="border-t border-slate-200/60">
                    <td class="w-48 px-3 py-1.5"></td>
                    <td class="w-16 px-2 py-1.5"></td>
                    <td class="text-left px-3 py-1.5">${nombreSpan}</td>
                    <td class="w-32 text-right px-3 py-1.5">${debeVal}</td>
                    <td class="w-32 text-right px-3 py-1.5">${haberVal}</td>
                    <td class="w-12"></td>
                </tr>`;
        });

        // Fila de glosa completa dentro del detalle
        detalleHtml += `
                <tr class="border-t border-dashed border-slate-200">
                    <td class="px-3 py-1.5"></td>
                    <td class="px-2 py-1.5"></td>
                    <td colspan="3" class="text-left px-3 py-1.5 text-[11px] text-slate-400 italic font-sans">
                        <i class="fa-solid fa-quote-left text-[8px] mr-1"></i>${asiento.glosa}
                    </td>
                    <td></td>
                </tr>`;

        // Fila de subtotales dentro del detalle
        detalleHtml += `
                <tr class="bg-indigo-50/60 border-t border-slate-200">
                    <td class="px-3 py-1.5"></td>
                    <td class="px-2 py-1.5"></td>
                    <td class="text-right px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotales →</td>
                    <td class="text-right px-3 py-1.5 font-bold text-indigo-600">${formatearMonto(totalAsientoDebe)}</td>
                    <td class="text-right px-3 py-1.5 font-bold text-indigo-600">${formatearMonto(totalAsientoHaber)}</td>
                    <td></td>
                </tr>
            </table>
        </td>`;

        trDetalle.innerHTML = detalleHtml;
        body.appendChild(trDetalle);

        // Separador
        const trSep = document.createElement('tr');
        trSep.innerHTML = `<td class="py-0.5" colspan="6"></td>`;
        body.appendChild(trSep);
    });

    // Fila totales globales
    const trGrand = document.createElement('tr');
    trGrand.className = "bg-slate-900 text-white hover:bg-slate-950 transition-colors font-bold";
    trGrand.innerHTML = `
        <td class="text-center font-sans py-3" colspan="2">TOTAL</td>
        <td class="text-left py-3 font-sans uppercase tracking-widest text-xs">SUMAS DE DEBE Y HABER</td>
        <td class="text-right py-3 text-emerald-400 font-bold">${formatearMonto(totalDebeGlobal)}</td>
        <td class="text-right py-3 text-emerald-400 font-bold">${formatearMonto(totalHaberGlobal)}</td>
        <td></td>
    `;
    body.appendChild(trGrand);
}

// Alterna la visibilidad del detalle de un asiento
function toggleDetalleAsiento(detalleId, trPrincipal) {
    const trDetalle = document.getElementById(detalleId);
    if (!trDetalle) return;
    const isHidden = trDetalle.classList.contains('hidden');
    trDetalle.classList.toggle('hidden', !isHidden);
    // Rotar el ícono del chevron
    const chevron = trPrincipal.querySelector('.btn-expand-asiento i');
    if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
        chevron.style.transition = 'transform 0.2s';
    }
    // Highlight fila activa
    trPrincipal.classList.toggle('bg-indigo-50/60', isHidden);
}


// Eliminar un asiento del Libro Diario (solo admin)
async function eliminarAsiento(tipo, refId, btnEl) {
    const etiquetas = {
        venta: 'esta venta',
        compra: 'esta compra',
        gasto_caja: 'este gasto de caja',
        gasto_general: 'este gasto general'
    };
    const label = etiquetas[tipo] || 'este asiento';
    if (!confirm(`¿Estás seguro de eliminar ${label} del Libro Diario? Esta acción no se puede deshacer.`)) return;

    const urls = {
        venta: `/api/libro-diario/venta/${refId}`,
        compra: `/api/libro-diario/compra/${refId}`,
        gasto_caja: `/api/libro-diario/gasto-caja/${refId}`,
        gasto_general: `/api/libro-diario/gastos/${refId}`
    };

    const url = urls[tipo];
    if (!url) { alert('Tipo de asiento desconocido'); return; }

    // Feedback visual
    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>'; }

    try {
        const res = await fetch(url, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');
        cargarLibroDiario();
    } catch (e) {
        alert('Error al eliminar asiento: ' + e.message);
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-trash-can text-xs"></i>'; }
    }
}

function formatearMonto(valor) {
    return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

// Lógica de modal y registro de gastos generales
function abrirModalGasto() {
    const modal = document.getElementById('modalGasto');
    if (modal) {
        modal.classList.remove('hidden');
        // Fecha actual por defecto en formato YYYY-MM-DD
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('gastoFecha').value = hoy;
    }
}

function cerrarModalGasto() {
    const modal = document.getElementById('modalGasto');
    if (modal) {
        modal.classList.add('hidden');
    }
    const form = document.getElementById('formGasto');
    if (form) form.reset();
}

async function guardarGastoGeneral(event) {
    event.preventDefault();
    const descripcion = document.getElementById('gastoDescripcion').value.trim();
    const monto = parseFloat(document.getElementById('gastoMonto').value);
    const metodo_pago = document.getElementById('gastoMetodoPago').value;
    const categoria = document.getElementById('gastoCategoria').value;
    const fecha = document.getElementById('gastoFecha').value;

    if (!descripcion || isNaN(monto) || monto <= 0) {
        alert('Por favor introduce una descripción válida y un monto mayor que cero.');
        return;
    }

    try {
        const res = await fetch('/api/libro-diario/gastos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descripcion, monto, metodo_pago, categoria, fecha })
        });
        
        if (res.ok) {
            alert('Gasto registrado con éxito');
            cerrarModalGasto();
            cargarLibroDiario();
        } else {
            const err = await res.json();
            alert('Error al registrar gasto: ' + (err.error || 'Desconocido'));
        }
    } catch (e) {
        console.error('Error al guardar gasto general:', e);
        alert('Error al conectar con el servidor contable.');
    }
}

// ── CAMBIAR CATEGORÍA DE GASTO GENERAL ───────────────────────────────────────
let _gastoIdParaCambiarCategoria = null;

function abrirModalCambiarCategoria(gastoId) {
    _gastoIdParaCambiarCategoria = gastoId;
    document.getElementById('modalCambiarCategoria').classList.remove('hidden');
}

function cerrarModalCambiarCategoria() {
    _gastoIdParaCambiarCategoria = null;
    document.getElementById('modalCambiarCategoria').classList.add('hidden');
}

async function cambiarCategoriaGasto(nuevaCategoria) {
    if (!_gastoIdParaCambiarCategoria) return;
    const id = _gastoIdParaCambiarCategoria;

    // Resaltar el botón seleccionado
    const botones = document.querySelectorAll('#botones-categorias-cambio button');
    botones.forEach(b => b.disabled = true);

    try {
        const res = await fetch(`/api/libro-diario/gastos/${id}/categoria`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoria: nuevaCategoria })
        });

        if (res.ok) {
            cerrarModalCambiarCategoria();
            await cargarLibroDiario();  // Recargar para reflejar cambio
        } else {
            const err = await res.json();
            alert('Error: ' + (err.error || 'No se pudo actualizar la categoría'));
        }
    } catch (e) {
        console.error('Error al cambiar categoría:', e);
        alert('Error al conectar con el servidor.');
    } finally {
        botones.forEach(b => b.disabled = false);
    }
}
