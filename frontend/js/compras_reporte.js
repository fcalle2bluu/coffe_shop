// frontend/js/compras_reporte.js

const meses = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
    "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

document.addEventListener('DOMContentLoaded', () => {
    cargarReporte();
});

async function cargarReporte() {
    const tbody = document.getElementById('tabla-reporte-body');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-orange-500 text-2xl"></i></td></tr>`;

    try {
        const response = await fetch('/api/compras');
        if (!response.ok) throw new Error('Error al obtener datos');
        let compras = await response.json();
        
        dibujarTablaReporte(compras);
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500 font-bold">Error al cargar datos.</td></tr>`;
    }
}

function dibujarTablaReporte(compras) {
    const tbody = document.getElementById('tabla-reporte-body');
    tbody.innerHTML = '';

    if (!compras || compras.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-10 text-gray-400 font-bold">NO HAY COMPRAS REGISTRADAS</td></tr>`;
        return;
    }

    // Agrupar compras por "AAAA-MM"
    // fecha_compra tiene formato "DD/MM/YYYY HH24:MI"
    const grupos = {};
    
    compras.forEach(comp => {
        let mesAnoVal = 'Desconocido';
        try {
            const partesFecha = comp.fecha_compra.split(' ')[0].split('/'); // [DD, MM, YYYY]
            if(partesFecha.length === 3) {
                const mes = partesFecha[1];
                const ano = partesFecha[2];
                mesAnoVal = `${ano}-${mes}`;
            }
        } catch(e) {}
        
        if (!grupos[mesAnoVal]) {
            grupos[mesAnoVal] = {
                mesAnoVal,
                compras: [],
                total: 0
            };
        }
        grupos[mesAnoVal].compras.push(comp);
        grupos[mesAnoVal].total += parseFloat(comp.total || 0);
    });

    // Ordenar los grupos cronológicamente (más recientes primero)
    const clavesOrdenadas = Object.keys(grupos).sort((a,b) => b.localeCompare(a));
    
    let htmlTotalGasto = 0;

    clavesOrdenadas.forEach(clave => {
        const grupo = grupos[clave];
        htmlTotalGasto += grupo.total;
        
        // Determinar texto visible (ej. "Mayo 2026")
        let textoMes = clave;
        if(clave !== 'Desconocido') {
            const [y, m] = clave.split('-');
            textoMes = `${meses[m]} ${y}`;
        }

        // 1. DIBUJAR FILA SEPARADORA DE MES (LA CABECERA DEL GRUPO)
        tbody.innerHTML += `
            <tr class="bg-stone-800 text-white font-bold group-header border-t-4 border-stone-900 shadow-sm">
                <td colspan="4" class="px-4 py-3 text-left tracking-wider uppercase text-sm border-r border-stone-700">
                    <i class="fa-solid fa-calendar-days mr-2 text-orange-500"></i> ${textoMes}
                    <span class="text-xs text-gray-400 ml-2 font-normal">(${grupo.compras.length} operaciones)</span>
                </td>
                <td class="px-4 py-3 text-right bg-stone-900 text-orange-400 border-l border-stone-700">
                    Total: Bs. ${grupo.total.toFixed(2)}
                </td>
            </tr>
        `;

        // 2. DIBUJAR LAS FILAS DEL MES
        grupo.compras.forEach(c => {
            // Generar string de insumos
            let cadenaInsumos = "";
            let itemsCount = 0;
            if(c.detalles_compra && c.detalles_compra.length > 0) {
                const arr = c.detalles_compra;
                itemsCount = arr.length;
                cadenaInsumos = arr.map(i => `<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] mr-1 inline-block border border-gray-200">${i.cantidad} ${i.unidad} ${i.nombre}</span>`).join('');
            } else {
                cadenaInsumos = '<span class="text-gray-400 italic text-[10px]">Sin detalles</span>';
            }

            tbody.innerHTML += `
                <tr class="bg-white border-b border-gray-100 hover:bg-orange-50 transition-colors">
                    <td class="px-4 py-3 font-mono text-xs text-gray-500 border-r border-gray-100 text-center">#${c.id.toString().padStart(5, '0')}</td>
                    <td class="px-4 py-3 text-sm text-stone-800 border-r border-gray-100 whitespace-nowrap"><i class="fa-regular fa-clock text-gray-400 mr-1 text-xs"></i> ${c.fecha_compra}</td>
                    <td class="px-4 py-3 text-sm font-bold text-gray-700 border-r border-gray-100">
                        ${c.proveedor || '<span class="text-gray-400 font-normal">Sin Proveedor</span>'}
                    </td>
                    <td class="px-4 py-3 text-sm border-r border-gray-100">
                        <div class="flex flex-wrap gap-1 mt-1">${cadenaInsumos}</div>
                    </td>
                    <td class="px-4 py-3 text-right font-black text-stone-800 tabular-nums bg-gray-50/50">
                        Bs. ${parseFloat(c.total).toFixed(2)}
                    </td>
                </tr>
            `;
        });
    });

    // TOTAL GLOBAL
    document.getElementById('total-global-reporte').innerText = `Bs. ${htmlTotalGasto.toFixed(2)}`;
}

function imprimirReporte() {
    window.print();
}
