document.addEventListener('DOMContentLoaded', () => {
    cargarEmpresa();
    cargarLibroDiario();
});

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
            <td colspan="5" class="text-center py-20 text-slate-400 italic font-sans">
                <i class="fa-solid fa-spinner fa-spin text-2xl mb-4 text-indigo-500 block"></i>
                Generando asientos del libro diario contable...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`/api/libro-diario?mes=${mes}&anio=${anio}`);
        if (!res.ok) throw new Error('Error al obtener datos contables');
        const data = await res.json();

        // Actualizar etiqueta del período
        document.getElementById('excelPeriodo').innerText = `${data.mes_nombre} - ${data.anio}`;

        body.innerHTML = '';

        if (!data.asientos || data.asientos.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-20 text-slate-400 italic font-sans">
                        No hay movimientos registrados (ventas o compras) para este período.
                    </td>
                </tr>
            `;
            return;
        }

        let totalDebeGlobal = 0;
        let totalHaberGlobal = 0;

        data.asientos.forEach(asiento => {
            // Calcular totales de este asiento
            let totalAsientoDebe = 0;
            let totalAsientoHaber = 0;

            asiento.cuentas.forEach(c => {
                if (c.tipo === 'DEBE') {
                    totalAsientoDebe += c.importe;
                    totalDebeGlobal += c.importe;
                } else {
                    totalAsientoHaber += c.importe;
                    totalHaberGlobal += c.importe;
                }
            });

            // 1. Renderizar filas de cuentas
            asiento.cuentas.forEach((cuenta, idx) => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50/50 transition-colors";

                // Columna Fecha
                let fechaCol = '';
                if (idx === 0) {
                    fechaCol = `<span class="font-bold text-slate-700">${asiento.fecha}</span>`;
                } else if (idx === 1) {
                    fechaCol = `<span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${asiento.dia_semana}</span>`;
                }

                // Columna N°
                let nroCol = idx === 0 ? `<span class="font-bold text-slate-900">${asiento.asiento_nro}</span>` : '';

                // Columna Detalle
                let detalleCol = '';
                if (cuenta.tipo === 'DEBE') {
                    detalleCol = `<span class="excel-account-debe">${cuenta.nombre}</span>`;
                } else {
                    detalleCol = `<span class="ml-10 text-slate-500 font-bold">${cuenta.nombre}</span>`;
                }

                // Debe / Haber importes
                const debeCol = cuenta.tipo === 'DEBE' ? formatearMonto(cuenta.importe) : '';
                const haberCol = cuenta.tipo === 'HABER' ? formatearMonto(cuenta.importe) : '';

                tr.innerHTML = `
                    <td class="text-center font-sans">${fechaCol}</td>
                    <td class="text-center font-bold">${nroCol}</td>
                    <td class="text-left">${detalleCol}</td>
                    <td class="text-right font-bold text-slate-900">${debeCol}</td>
                    <td class="text-right font-bold text-slate-500">${haberCol}</td>
                `;
                body.appendChild(tr);
            });

            // 2. Renderizar fila de Glosa
            const trGlosa = document.createElement('tr');
            trGlosa.className = "hover:bg-slate-50/50 transition-colors";
            trGlosa.innerHTML = `
                <td></td>
                <td></td>
                <td class="text-left text-xs text-slate-400 italic font-sans py-2" colspan="3">
                    Glosa: ${asiento.glosa}
                </td>
            `;
            body.appendChild(trGlosa);

            // 3. Renderizar fila de Totales de Asiento (imitando la fila de bordes de Excel)
            const trTotalAsiento = document.createElement('tr');
            trTotalAsiento.className = "hover:bg-slate-50/50 transition-colors";
            trTotalAsiento.innerHTML = `
                <td></td>
                <td></td>
                <td></td>
                <td class="text-right font-bold text-indigo-600 border-t border-b border-dashed border-slate-300 py-2">${formatearMonto(totalAsientoDebe)}</td>
                <td class="text-right font-bold text-indigo-600 border-t border-b border-dashed border-slate-300 py-2">${formatearMonto(totalAsientoHaber)}</td>
            `;
            body.appendChild(trTotalAsiento);

            // Fila vacía de separación
            const trSeparador = document.createElement('tr');
            trSeparador.innerHTML = `<td class="py-2" colspan="5"></td>`;
            body.appendChild(trSeparador);
        });

        // 5. Renderizar Fila de Totales Generales del Mes
        const trGrandTotal = document.createElement('tr');
        trGrandTotal.className = "bg-slate-900 text-white hover:bg-slate-950 transition-colors font-bold";
        trGrandTotal.innerHTML = `
            <td class="text-center font-sans py-3" colspan="2">TOTAL</td>
            <td class="text-left py-3 font-sans uppercase tracking-widest text-xs">SUMAS DE DEBE Y HABER</td>
            <td class="text-right py-3 text-emerald-400 font-bold">${formatearMonto(totalDebeGlobal)}</td>
            <td class="text-right py-3 text-emerald-400 font-bold">${formatearMonto(totalHaberGlobal)}</td>
        `;
        body.appendChild(trGrandTotal);

    } catch (error) {
        console.error("Error cargando Libro Diario:", error);
        body.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-20">
                    <p class="text-rose-500 font-bold mb-2">⚠️ Error de conexión con el servidor contable</p>
                    <button onclick="cargarLibroDiario()" class="text-xs bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200 transition-colors tracking-tight font-black uppercase">Reintentar</button>
                </td>
            </tr>
        `;
    }
}

function formatearMonto(valor) {
    return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}
