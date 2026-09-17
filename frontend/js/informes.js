// frontend/js/informes.js
const NOMBRES_MES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

let chartVentasDia = null;
let chartIngresosEgresos = null;
let chartTopProductos = null;
let chartMetodoPago = null;
let chartVentasCategoria = null;
let chartGastosCategoria = null;
let ultimoReporte = null;

const COLORES_GASTO = {
    'Insumos': '#e11d48',
    'Salarios': '#f97316',
    'Gastos Fijos': '#0ea5e9',
    'Caja Chica': '#eab308',
    'Otros gastos operativos': '#a855f7',
};

function formatoBs(valor) {
    return `Bs ${Number(valor || 0).toFixed(2)}`;
}

async function poblarSelectores() {
    const selectMes = document.getElementById('select-mes');
    const selectAnio = document.getElementById('select-anio');

    selectMes.innerHTML = NOMBRES_MES.map((nombre, i) => `<option value="${i + 1}">${nombre}</option>`).join('');

    const hoy = new Date();
    let anios = new Set([hoy.getFullYear()]);
    try {
        const res = await fetch('/api/kpis/meses-disponibles');
        if (res.ok) {
            const disponibles = await res.json();
            disponibles.forEach(d => anios.add(parseInt(d.anio)));
        }
    } catch (e) {
        console.error('No se pudieron cargar los años disponibles:', e);
    }
    const aniosOrdenados = Array.from(anios).sort((a, b) => b - a);
    selectAnio.innerHTML = aniosOrdenados.map(a => `<option value="${a}">${a}</option>`).join('');

    selectMes.value = hoy.getMonth() + 1;
    selectAnio.value = hoy.getFullYear();
}

function renderizarKPIs(data) {
    document.getElementById('kpi-total-ventas').textContent = formatoBs(data.totalVentas);
    document.getElementById('kpi-cantidad-ventas').textContent = data.cantidadVentas;
    document.getElementById('kpi-ticket-promedio').textContent = formatoBs(data.ticketPromedio);

    document.getElementById('kpi-variacion-label').textContent = `Vs. ${data.mesAnterior.nombre}`;
    const elVariacion = document.getElementById('kpi-variacion');
    const elVariacionBar = document.getElementById('kpi-variacion-bar');
    const elVariacionIcono = document.getElementById('kpi-variacion-icono');
    if (data.variacionPct === null) {
        elVariacion.textContent = 'Sin datos';
        elVariacion.className = 'text-2xl font-black mt-1 text-slate-400';
        elVariacionBar.className = 'absolute top-0 left-0 right-0 h-1 bg-slate-400';
        elVariacionIcono.className = 'fa-solid fa-arrow-right-arrow-left text-slate-400';
    } else {
        const positivo = data.variacionPct >= 0;
        elVariacion.textContent = `${positivo ? '+' : ''}${data.variacionPct.toFixed(1)}%`;
        elVariacion.className = `text-2xl font-black mt-1 ${positivo ? 'text-emerald-600' : 'text-red-600'}`;
        elVariacionBar.className = `absolute top-0 left-0 right-0 h-1 ${positivo ? 'bg-emerald-500' : 'bg-red-500'}`;
        elVariacionIcono.className = `fa-solid ${positivo ? 'fa-arrow-trend-up text-emerald-500' : 'fa-arrow-trend-down text-red-500'}`;
    }

    document.getElementById('kpi-gastos-insumos').textContent = formatoBs(data.gastosInsumos);
    document.getElementById('kpi-salarios').textContent = formatoBs(data.salarios);

    const elMargen = document.getElementById('kpi-margen');
    const elMargenBar = document.getElementById('kpi-margen-bar');
    const elMargenIcono = document.getElementById('kpi-margen-icono');
    const margenPositivo = data.margen >= 0;
    elMargen.textContent = formatoBs(data.margen);
    elMargen.className = `text-2xl font-black mt-1 ${margenPositivo ? 'text-emerald-600' : 'text-red-600'}`;
    elMargenBar.className = `absolute top-0 left-0 right-0 h-1 ${margenPositivo ? 'bg-emerald-500' : 'bg-red-500'}`;
    elMargenIcono.className = `fa-solid fa-scale-balanced ${margenPositivo ? 'text-emerald-500' : 'text-red-500'}`;
}

function renderizarAnalisis(analisis) {
    const lista = document.getElementById('lista-analisis');
    if (!analisis || analisis.length === 0) {
        lista.innerHTML = '<li class="text-slate-400 list-none">No hay suficientes datos para generar un análisis.</li>';
        return;
    }
    lista.innerHTML = analisis.map(linea => `<li>${linea}</li>`).join('');
}

function renderizarTablaTopProductos(productos) {
    document.getElementById('titulo-top-productos').innerHTML =
        `<i class="fa-solid fa-ranking-star text-amber-500"></i> Detalle: top ${productos.length || ''} productos`;
    const tbody = document.getElementById('tabla-top-productos');
    if (!productos || productos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="py-6 text-center text-slate-400">Sin ventas registradas este mes.</td></tr>';
        return;
    }
    tbody.innerHTML = productos.map(p => `
        <tr>
            <td class="py-2 pr-2 font-medium text-slate-700">${p.nombre}</td>
            <td class="py-2 px-2 text-right">${p.cantidad}</td>
            <td class="py-2 pl-2 text-right">${p.ingreso.toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderizarTablaGastosDetalle(items) {
    const tbody = document.getElementById('tabla-gastos-detalle');
    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-slate-400">Sin gastos registrados este mes.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(it => {
        const fecha = new Date(it.fecha);
        const fechaTexto = fecha.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });
        const color = COLORES_GASTO[it.categoria] || '#6b7280';
        return `
        <tr>
            <td class="py-2 pr-2 pl-2 whitespace-nowrap text-slate-500">${fechaTexto}</td>
            <td class="py-2 px-2 whitespace-nowrap">
                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style="background:${color}1a;color:${color}">${it.categoria}</span>
            </td>
            <td class="py-2 px-2 text-slate-700">${it.descripcion || ''}</td>
            <td class="py-2 pl-2 pr-2 text-right font-medium">${it.monto.toFixed(2)}</td>
        </tr>
    `;
    }).join('');
}

function renderizarTablaSalariosEmpleado(lista) {
    const tbody = document.getElementById('tabla-salarios-empleado');
    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="py-6 text-center text-slate-400">Sin pagos de salario registrados este mes.</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(s => `
        <tr>
            <td class="py-2 pr-2 pl-2 font-medium text-slate-700">${s.nombre}</td>
            <td class="py-2 px-2 text-right">${s.pagos}</td>
            <td class="py-2 pl-2 pr-2 text-right font-medium">${s.total.toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderizarGraficos(data) {
    const ctxDia = document.getElementById('chart-ventas-dia').getContext('2d');
    if (chartVentasDia) chartVentasDia.destroy();
    chartVentasDia = new Chart(ctxDia, {
        type: 'bar',
        data: {
            labels: data.ventasPorDia.map(d => d.dia),
            datasets: [{
                label: 'Ventas (Bs)',
                data: data.ventasPorDia.map(d => d.total),
                backgroundColor: '#3b82f6',
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    const ctxIngEgr = document.getElementById('chart-ingresos-egresos').getContext('2d');
    if (chartIngresosEgresos) chartIngresosEgresos.destroy();
    chartIngresosEgresos = new Chart(ctxIngEgr, {
        type: 'bar',
        data: {
            labels: ['Ventas', 'Insumos', 'Salarios', 'Margen'],
            datasets: [{
                data: [data.totalVentas, data.gastosInsumos, data.salarios, data.margen],
                backgroundColor: ['#B8923D', '#e11d48', '#f97316', data.margen >= 0 ? '#10b981' : '#ef4444'],
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    const ctxTop = document.getElementById('chart-top-productos').getContext('2d');
    if (chartTopProductos) chartTopProductos.destroy();
    chartTopProductos = new Chart(ctxTop, {
        type: 'bar',
        data: {
            labels: data.topProductos.map(p => p.nombre),
            datasets: [{
                label: 'Ingreso (Bs)',
                data: data.topProductos.map(p => p.ingreso),
                backgroundColor: '#B8923D',
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } }
        }
    });

    const ctxMetodo = document.getElementById('chart-metodo-pago').getContext('2d');
    if (chartMetodoPago) chartMetodoPago.destroy();
    const coloresMetodo = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];
    chartMetodoPago = new Chart(ctxMetodo, {
        type: 'doughnut',
        data: {
            labels: data.ventasPorMetodoPago.map(m => m.metodo),
            datasets: [{
                data: data.ventasPorMetodoPago.map(m => m.total),
                backgroundColor: data.ventasPorMetodoPago.map((_, i) => coloresMetodo[i % coloresMetodo.length]),
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    const topCategorias = data.ventasPorCategoria.slice(0, 10);
    const ctxCat = document.getElementById('chart-ventas-categoria').getContext('2d');
    if (chartVentasCategoria) chartVentasCategoria.destroy();
    chartVentasCategoria = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: topCategorias.map(c => c.categoria),
            datasets: [{
                label: 'Ventas (Bs)',
                data: topCategorias.map(c => c.total),
                backgroundColor: '#B8923D',
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } }
        }
    });

    const ctxGastos = document.getElementById('chart-gastos-categoria').getContext('2d');
    if (chartGastosCategoria) chartGastosCategoria.destroy();
    chartGastosCategoria = new Chart(ctxGastos, {
        type: 'doughnut',
        data: {
            labels: data.gastosPorCategoria.map(c => c.categoria),
            datasets: [{
                data: data.gastosPorCategoria.map(c => c.total),
                backgroundColor: data.gastosPorCategoria.map(c => COLORES_GASTO[c.categoria] || '#6b7280'),
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

async function cargarInforme() {
    const mes = document.getElementById('select-mes').value;
    const anio = document.getElementById('select-anio').value;

    document.getElementById('lista-analisis').innerHTML = '<li class="text-slate-400 list-none">Cargando datos...</li>';

    try {
        const res = await fetch(`/api/reportes/mensual?mes=${mes}&anio=${anio}`);
        if (!res.ok) throw new Error('Error al obtener el informe');
        const data = await res.json();
        ultimoReporte = data;

        renderizarKPIs(data);
        renderizarAnalisis(data.analisis);
        renderizarTablaTopProductos(data.topProductos);
        renderizarTablaGastosDetalle(data.gastosDetalle);
        renderizarTablaSalariosEmpleado(data.salariosPorEmpleado);
        renderizarGraficos(data);
    } catch (e) {
        console.error('Error al cargar informe mensual:', e);
        document.getElementById('lista-analisis').innerHTML = '<li class="text-red-500 list-none">No se pudo cargar el informe. Intenta de nuevo.</li>';
    }
}

async function descargarPDF() {
    if (!ultimoReporte) return;
    const btn = document.getElementById('btn-descargar-pdf');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generando...';

    try {
        const graficos = {
            ventasPorDia: chartVentasDia ? chartVentasDia.toBase64Image() : null,
            ingresosVsEgresos: chartIngresosEgresos ? chartIngresosEgresos.toBase64Image() : null,
            topProductos: chartTopProductos ? chartTopProductos.toBase64Image() : null,
            metodoPago: chartMetodoPago ? chartMetodoPago.toBase64Image() : null,
            ventasCategoria: chartVentasCategoria ? chartVentasCategoria.toBase64Image() : null,
            gastosCategoria: chartGastosCategoria ? chartGastosCategoria.toBase64Image() : null,
        };

        const mes = document.getElementById('select-mes').value;
        const anio = document.getElementById('select-anio').value;

        const res = await fetch('/api/reportes/mensual/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mes, anio, graficos })
        });
        if (!res.ok) throw new Error('Error al generar el PDF');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `informe_${NOMBRES_MES[mes - 1]}_${anio}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Error al descargar PDF:', e);
        alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await poblarSelectores();
    document.getElementById('select-mes').addEventListener('change', cargarInforme);
    document.getElementById('select-anio').addEventListener('change', cargarInforme);
    document.getElementById('btn-descargar-pdf').addEventListener('click', descargarPDF);
    cargarInforme();
});
