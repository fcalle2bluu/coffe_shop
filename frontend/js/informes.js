// frontend/js/informes.js
const NOMBRES_MES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

let chartVentasDia = null;
let chartTopProductos = null;
let chartMetodoPago = null;
let ultimoReporte = null;

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
    if (data.variacionPct === null) {
        elVariacion.textContent = 'Sin datos';
        elVariacion.className = 'text-2xl font-black mt-1 text-slate-400';
    } else {
        const positivo = data.variacionPct >= 0;
        elVariacion.textContent = `${positivo ? '+' : ''}${data.variacionPct.toFixed(1)}%`;
        elVariacion.className = `text-2xl font-black mt-1 ${positivo ? 'text-emerald-600' : 'text-red-600'}`;
    }
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
            topProductos: chartTopProductos ? chartTopProductos.toBase64Image() : null,
            metodoPago: chartMetodoPago ? chartMetodoPago.toBase64Image() : null,
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
