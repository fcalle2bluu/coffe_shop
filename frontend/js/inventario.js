// frontend/js/inventario.js
let datosAuditoria = [];
let chart1, chart2;

document.addEventListener('DOMContentLoaded', () => {
    cargarDatosDashboard();
});

async function cargarDatosDashboard() {
    try {
        const res = await fetch('/api/inventario/dashboard');
        const data = await res.json();

        // 1. Llenar KPIs
        document.getElementById('kpi-total').innerText = data.kpis.totalInsumos;
        document.getElementById('kpi-alertas').innerText = data.kpis.alertasStock;

        // 2. Dibujar Gráficas
        renderizarGraficas(data.graficas);

        // 3. Llenar Tabla de Auditoría
        datosAuditoria = data.auditoria;
        renderizarTablaAuditoria();

    } catch (error) {
        console.error("Error al cargar inventario:", error);
    }
}

function renderizarGraficas(graficas) {
    // Destruir previas si existen (para recargas)
    if (chart1) chart1.destroy();
    if (chart2) chart2.destroy();

    // Gráfica 1: Top Stock (Barras Horizontales)
    const ctx1 = document.getElementById('chartTopStock').getContext('2d');
    chart1 = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: graficas.topStock.map(i => i.nombre),
            datasets: [{
                label: 'Cantidad en Stock',
                data: graficas.topStock.map(i => i.stock_actual),
                backgroundColor: '#f97316',
                borderRadius: 4
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Gráfica 2: Tipos de Movimientos (Doughnut)
    // Extraer colores según tipo de movimiento para que sea visualmente lógico
    const labelsMov = graficas.movimientos.map(m => m.tipo);
    const dataMov = graficas.movimientos.map(m => m.total);
    const colores = labelsMov.map(tipo => {
        if(tipo === 'COMPRA') return '#3b82f6'; // Azul
        if(tipo === 'VENTA') return '#22c55e'; // Verde
        if(tipo === 'MERMA') return '#ef4444'; // Rojo
        return '#f59e0b'; // Amarillo (Ajuste)
    });

    const ctx2 = document.getElementById('chartMovimientos').getContext('2d');
    chart2 = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: labelsMov,
            datasets: [{ data: dataMov, backgroundColor: colores, borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%' }
    });
}

function renderizarTablaAuditoria() {
    const tbody = document.getElementById('tabla-auditoria');
    tbody.innerHTML = '';

    datosAuditoria.forEach((item, index) => {
        tbody.innerHTML += `
            <tr class="hover:bg-orange-50 transition-colors">
                <td class="p-3 font-medium text-gray-800">${item.nombre} <span class="text-xs text-gray-400">(${item.unidad_medida})</span></td>
                <td class="p-3 text-center font-bold text-gray-600">${item.stock_actual}</td>
                <td class="p-3 text-center">
                    <input type="number" id="fisico-${index}" value="${item.stock_actual}" step="0.1" 
                           class="w-24 border-2 border-gray-300 rounded px-2 py-1 text-center font-bold text-orange-600 focus:border-orange-600 outline-none"
                           oninput="calcularDiferencia(${index}, ${item.stock_actual})">
                </td>
                <td class="p-3 text-center font-black text-gray-400" id="dif-${index}">0.00</td>
                <td class="p-3 text-center" id="estado-${index}">
                    <span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded">CUADRADO</span>
                </td>
            </tr>
        `;
    });
}

function calcularDiferencia(index, stockSistema) {
    const inputFisico = parseFloat(document.getElementById(`fisico-${index}`).value) || 0;
    const diferencia = (inputFisico - stockSistema).toFixed(2);
    
    const tdDif = document.getElementById(`dif-${index}`);
    const tdEstado = document.getElementById(`estado-${index}`);

    tdDif.innerText = diferencia > 0 ? `+${diferencia}` : diferencia;

    if (diferencia == 0) {
        tdDif.className = "p-3 text-center font-black text-gray-400";
        tdEstado.innerHTML = `<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded">CUADRADO</span>`;
    } else if (diferencia > 0) {
        tdDif.className = "p-3 text-center font-black text-blue-600";
        tdEstado.innerHTML = `<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">SOBRANTE</span>`;
    } else {
        tdDif.className = "p-3 text-center font-black text-red-600";
        tdEstado.innerHTML = `<span class="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded">FALTANTE (MERMA)</span>`;
    }
}

async function procesarAuditoria() {
    // Recopilar solo los ítems que tienen diferencias
    let ajustesReales = [];
    
    datosAuditoria.forEach((item, index) => {
        const fisico = parseFloat(document.getElementById(`fisico-${index}`).value) || 0;
        const diferencia = fisico - item.stock_actual;
        
        if (diferencia !== 0) {
            ajustesReales.push({ id: item.id, fisico: fisico, diferencia: diferencia });
        }
    });

    if (ajustesReales.length === 0) {
        return alert("Todos los inventarios están cuadrados. No hay diferencias que aplicar.");
    }

    if (!confirm(`Se detectaron diferencias en ${ajustesReales.length} insumo(s). ¿Deseas aplicar el ajuste al sistema?`)) return;

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
        const res = await fetch('/api/inventario/auditoria', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ajustes: ajustesReales })
        });

        if (!res.ok) throw new Error("Error al aplicar auditoría");

        alert("Auditoría guardada con éxito.");
        cargarDatosDashboard(); // Recargar gráficas y tabla
    } catch (error) {
        alert(error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Aplicar Diferencias';
    }
}