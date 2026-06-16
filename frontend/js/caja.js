// frontend/js/caja.js
let cajaActualId = null;
let efectivoEsperadoEnCaja = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarEstadoCaja();
    
    const rolActual = localStorage.getItem('usuario_rol') ? localStorage.getItem('usuario_rol').toUpperCase() : '';
    if (rolActual !== 'CAJERO') {
        cargarHistorial();
    }
    
    if (rolActual === 'ADMIN' || rolActual === 'ADMINISTRADOR') {
        cargarHistorialVentasAdmin();
    }
});

async function cargarEstadoCaja() {
    try {
        const res = await fetch('/api/caja/estado');
        const data = await res.json();

        const panelEstado = document.getElementById('panel-estado');
        const txtEstado = document.getElementById('txt-estado');
        const txtInfo = document.getElementById('txt-info-estado');
        const btnAccion = document.getElementById('btn-accion-caja');
        const panelResumen = document.getElementById('panel-resumen');

        if (data.abierta) {
            cajaActualId = data.caja.id;
            efectivoEsperadoEnCaja = data.efectivo_esperado;

            // UI Caja Abierta
            panelEstado.className = "bg-white rounded shadow border-t-4 border-green-500 p-6 flex items-center justify-between";
            txtEstado.innerText = "Caja Abierta (Turno Activo)";
            txtEstado.className = "text-2xl font-black text-green-700";
            const apertureTime = data.caja.fecha_apertura_formateada || new Date(data.caja.fecha_apertura).toLocaleString('es-ES');
            const openerName = data.caja.usuario_nombre || 'Usuario Desconocido';
            txtInfo.innerHTML = `Apertura: <strong>${apertureTime}</strong> por <strong>${openerName}</strong>`;
            
            btnAccion.innerHTML = '<i class="fa-solid fa-lock mr-2"></i> Cerrar Caja';
            btnAccion.className = "bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded shadow font-bold text-lg transition-colors";
            btnAccion.onclick = abrirModalCierre;

            // Mostrar el botón de registrar gasto
            document.getElementById('btn-gasto-caja').classList.remove('hidden');

            document.getElementById('res-inicial').innerText = `Bs. ${data.caja.saldo_inicial}`;
            document.getElementById('res-efectivo').innerText = `Bs. ${data.ventas.total_efectivo}`;
            document.getElementById('res-gastos').innerText = `Bs. ${parseFloat(data.total_gastos || 0).toFixed(2)}`;
            const totalDigital = parseFloat(data.ventas.total_qr) + parseFloat(data.ventas.total_tarjeta) + parseFloat(data.ventas.total_consume_lo_nuestro || 0);
            document.getElementById('res-digital').innerHTML = `Bs. ${totalDigital.toFixed(2)}<br><span class="text-[10px] font-bold text-purple-750 block mt-1">QR: ${parseFloat(data.ventas.total_qr).toFixed(2)} | Tarj: ${parseFloat(data.ventas.total_tarjeta).toFixed(2)} | CLN: ${parseFloat(data.ventas.total_consume_lo_nuestro || 0).toFixed(2)}</span>`;
            
            const ventasNetas = parseFloat(data.ventas.total_efectivo) + totalDigital - parseFloat(data.total_gastos || 0);
            document.getElementById('res-netas').innerText = `Bs. ${ventasNetas.toFixed(2)}`;
            
            document.getElementById('res-esperado').innerText = `Bs. ${efectivoEsperadoEnCaja.toFixed(2)}`;
            
            panelResumen.classList.remove('hidden');
            
            // Cargar y mostrar lista de gastos de este turno
            document.getElementById('seccion-gastos-turno').classList.remove('hidden');
            cargarGastosDelTurno(cajaActualId);

        } else {
            cajaActualId = null;
            // UI Caja Cerrada
            panelEstado.className = "bg-white rounded shadow border-t-4 border-gray-400 p-6 flex items-center justify-between";
            txtEstado.innerText = "Caja Cerrada";
            txtEstado.className = "text-2xl font-black text-gray-800";
            txtInfo.innerText = "No hay ningún turno activo. Abre la caja para empezar a vender.";
            
            btnAccion.innerHTML = '<i class="fa-solid fa-key mr-2"></i> Abrir Caja';
            btnAccion.className = "bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded shadow font-bold text-lg transition-colors";
            btnAccion.onclick = abrirModalApertura;

            // Ocultar botón de gasto y sección de gastos
            document.getElementById('btn-gasto-caja').classList.add('hidden');
            document.getElementById('seccion-gastos-turno').classList.add('hidden');

            panelResumen.classList.add('hidden');
        }
    } catch (error) {
        console.error("Error al cargar estado:", error);
    }
}

async function cargarHistorial() {
    try {
        const res = await fetch('/api/caja/historial');
        const historial = await res.json();
        const tbody = document.getElementById('tabla-historial');
        tbody.innerHTML = '';

        historial.forEach(turno => {
            const diferencia = parseFloat(turno.diferencia);
            const ventasEfectivo = parseFloat(turno.ventas_efectivo || 0);
            const ventasQr = parseFloat(turno.ventas_qr || 0);
            const ventasTarjeta = parseFloat(turno.ventas_tarjeta || 0);
            const ventasCln = parseFloat(turno.ventas_cln || 0);
            const totalGastos = parseFloat(turno.total_gastos || 0);
            const saldoInicial = parseFloat(turno.saldo_inicial || 0);
            const saldoFinal = parseFloat(turno.saldo_final || 0);

            const totalDigital = ventasQr + ventasTarjeta + ventasCln;
            const efectivoEsperado = saldoInicial + ventasEfectivo - totalGastos;

            let colorDif = '';
            let labelDif = '';
            let signoDif = '';

            if (diferencia > 0.01) {
                colorDif = 'text-green-600 bg-green-50 border-green-200';
                labelDif = 'Sobrante';
                signoDif = '+';
            } else if (diferencia < -0.01) {
                colorDif = 'text-red-600 bg-red-50 border-red-200';
                labelDif = 'Faltante';
                signoDif = '';
            } else {
                colorDif = 'text-stone-600 bg-stone-50 border-stone-200';
                labelDif = 'Cuadrado';
                signoDif = '';
            }
            
            tbody.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 flex flex-col hover:shadow-md transition-all duration-300">
                    <!-- Cabecera de Tarjeta -->
                    <div class="flex justify-between items-start border-b border-gray-100 pb-3 mb-3">
                        <div>
                            <span class="text-[14px] font-black text-stone-850 block mb-0.5">Turno #${turno.id}</span>
                            <span class="text-[10px] text-gray-500 font-bold block"><i class="fa-solid fa-user-check mr-1 text-slate-400"></i>Cajero: ${turno.usuario_nombre || 'Desconocido'}</span>
                        </div>
                        <div class="text-right text-xs">
                            <div class="text-stone-600 font-semibold mb-0.5"><span class="text-gray-400 font-bold text-[9px] uppercase tracking-wider mr-1">Apertura:</span> ${turno.apertura}</div>
                            <div class="text-stone-600 font-semibold"><span class="text-gray-400 font-bold text-[9px] uppercase tracking-wider mr-1">Cierre:</span> ${turno.cierre}</div>
                        </div>
                    </div>
                    
                    <!-- Desglose de 6 Columnas en Rejilla -->
                    <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center mt-1">
                        <!-- Fondo Inicial -->
                        <div class="bg-blue-50 border border-blue-100/60 p-2 rounded-xl flex flex-col justify-between">
                            <span class="text-[9px] font-black text-blue-800 uppercase tracking-wide">Fondo Inicial</span>
                            <span class="font-extrabold text-blue-900 text-sm mt-1">Bs. ${saldoInicial.toFixed(2)}</span>
                        </div>
                        <!-- Ventas Efectivo -->
                        <div class="bg-green-50 border border-green-100/60 p-2 rounded-xl flex flex-col justify-between">
                            <span class="text-[9px] font-black text-green-800 uppercase tracking-wide">Ventas Efectivo</span>
                            <span class="font-extrabold text-green-900 text-sm mt-1">Bs. ${ventasEfectivo.toFixed(2)}</span>
                        </div>
                        <!-- Ventas Digitales -->
                        <div class="bg-purple-50 border border-purple-100/60 p-2 rounded-xl flex flex-col justify-between">
                            <span class="text-[9px] font-black text-purple-800 uppercase tracking-wide">Ventas Digitales</span>
                            <span class="font-extrabold text-purple-900 text-sm mt-1">Bs. ${totalDigital.toFixed(2)}</span>
                            <span class="text-[8px] font-bold text-purple-750 block mt-1 leading-tight">QR: ${ventasQr.toFixed(2)} | Tarj: ${ventasTarjeta.toFixed(2)} | CLN: ${ventasCln.toFixed(2)}</span>
                        </div>
                        <!-- Gastos del Turno -->
                        <div class="bg-red-50 border border-red-100/60 p-2 rounded-xl flex flex-col justify-between">
                            <span class="text-[9px] font-black text-red-800 uppercase tracking-wide">Gastos Turno</span>
                            <span class="font-extrabold text-red-900 text-sm mt-1">Bs. ${totalGastos.toFixed(2)}</span>
                        </div>
                        <!-- Ventas Netas -->
                        <div class="bg-teal-50 border border-teal-100/60 p-2 rounded-xl flex flex-col justify-between">
                            <span class="text-[9px] font-black text-teal-800 uppercase tracking-wide">Ventas Netas</span>
                            <span class="font-extrabold text-teal-900 text-sm mt-1">Bs. ${(ventasEfectivo + totalDigital - totalGastos).toFixed(2)}</span>
                            <span class="text-[8px] font-bold text-teal-700 block mt-1 leading-tight">Efec + Dig - Gastos</span>
                        </div>
                        <!-- Efectivo en Cajón -->
                        <div class="bg-amber-50 border border-amber-200/60 p-2 rounded-xl flex flex-col justify-between">
                            <span class="text-[9px] font-black text-amber-800 uppercase tracking-wide">Efectivo Cajón</span>
                            <span class="font-extrabold text-amber-900 text-sm mt-1">Bs. ${saldoFinal.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <!-- Resumen y Descuadre al Pie -->
                    <div class="flex flex-col sm:flex-row justify-between items-center mt-4 pt-3 border-t border-gray-100 text-xs gap-2 shrink-0">
                        <div class="text-gray-500 font-semibold">
                            Esperado en Caja: <strong class="text-stone-800">Bs. ${efectivoEsperado.toFixed(2)}</strong>
                        </div>
                        <div class="px-3 py-1 rounded-full border text-[11px] font-black tracking-wide ${colorDif}">
                            Diferencia: ${signoDif}Bs. ${diferencia.toFixed(2)} (${labelDif})
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error al cargar historial:", error);
    }
}

// --- MODALES ---
function abrirModalApertura() {
    document.getElementById('inputSaldoInicial').value = '0.00';
    document.getElementById('modalAbrir').classList.remove('hidden');
}

function abrirModalCierre() {
    document.getElementById('lbl-esperado').innerText = `Bs. ${efectivoEsperadoEnCaja.toFixed(2)}`;
    document.getElementById('inputSaldoFinal').value = efectivoEsperadoEnCaja.toFixed(2);
    document.getElementById('modalCerrar').classList.remove('hidden');
}

function cerrarModales() {
    document.getElementById('modalAbrir').classList.add('hidden');
    document.getElementById('modalCerrar').classList.add('hidden');
    const modalG = document.getElementById('modalGasto');
    if (modalG) modalG.classList.add('hidden');
}

// --- ACCIONES POST ---
async function procesarApertura() {
    const saldo = document.getElementById('inputSaldoInicial').value;
    const usuarioId = localStorage.getItem('usuario_id');
    try {
        const res = await fetch('/api/caja/abrir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saldo_inicial: saldo, usuario_id: usuarioId })
        });
        if (!res.ok) {
            let errorMsg = 'Error al abrir caja';
            try {
                const errData = await res.json();
                errorMsg = errData.error || errorMsg;
            } catch (e) {
                errorMsg = await res.text();
            }
            throw new Error(errorMsg);
        }
        
        cerrarModales();
        cargarEstadoCaja();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function procesarCierre() {
    const saldoReal = document.getElementById('inputSaldoFinal').value;
    const usuarioId = localStorage.getItem('usuario_id');
    try {
        const res = await fetch('/api/caja/cerrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caja_id: cajaActualId, saldo_final: saldoReal, usuario_id: usuarioId })
        });
        if (!res.ok) {
            let errorMsg = 'Error al cerrar caja';
            try {
                const errData = await res.json();
                errorMsg = errData.error || errorMsg;
            } catch (e) {
                errorMsg = await res.text();
            }
            throw new Error(errorMsg);
        }
        
        cerrarModales();
        cargarEstadoCaja();
        cargarHistorial();
        alert("Caja cerrada exitosamente.");
    } catch (error) {
        alert("Error: " + error.message);
    }
}

const mesesNombres = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
    "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

async function cargarHistorialVentasAdmin() {
    try {
        const res = await fetch('/api/caja/historial-ventas-cajeros');
        if (!res.ok) throw new Error('Error de red');
        const ventas = await res.json();
        
        const contenedor = document.getElementById('contenedor-ventas-cajeros');
        contenedor.innerHTML = '';
        
        if(ventas.length === 0) {
            contenedor.innerHTML = '<div class="p-8 text-center text-gray-500 font-bold">No hay ventas registradas aún.</div>';
            return;
        }

        // Agrupar por Mes -> Cajero
        const agrupado = {};
        ventas.forEach(v => {
            // fecha_venta: "YYYY-MM-DD HH24:MI"
            let mesAno = "Desconocido";
            if(v.fecha_venta) {
                const partes = v.fecha_venta.split(' ')[0].split('-'); // [YYYY, MM, DD]
                if(partes.length >= 3) {
                    mesAno = `${partes[0]}-${partes[1]}`;
                }
            }

            const cajero = v.cajero || 'Sin Cajero Asignado';

            if(!agrupado[mesAno]) agrupado[mesAno] = { totalMes: 0, cajeros: {} };
            if(!agrupado[mesAno].cajeros[cajero]) agrupado[mesAno].cajeros[cajero] = { total: 0, lista: [] };

            const importe = parseFloat(v.total || 0);
            agrupado[mesAno].totalMes += importe;
            agrupado[mesAno].cajeros[cajero].total += importe;
            agrupado[mesAno].cajeros[cajero].lista.push(v);
        });

        // Generar HTML
        const mesesOrdenados = Object.keys(agrupado).sort((a,b) => b.localeCompare(a));
        
        mesesOrdenados.forEach(mesClave => {
            const dataMes = agrupado[mesClave];
            let tituloMes = mesClave;
            if(mesClave !== 'Desconocido') {
                const [yyyy, mm] = mesClave.split('-');
                tituloMes = `${mesesNombres[mm]} ${yyyy}`;
            }

            let htmlMes = `
                <div class="mb-8 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <div class="bg-gray-800 text-white p-3 flex justify-between items-center">
                        <h3 class="font-black text-lg uppercase tracking-wide"><i class="fa-regular fa-calendar-days mr-2 text-orange-400"></i> ${tituloMes}</h3>
                        <span class="font-black tabular-nums bg-gray-900 px-3 py-1 text-orange-400 rounded-lg shadow-inner">Total Mes: Bs. ${dataMes.totalMes.toFixed(2)}</span>
                    </div>
                    <div class="p-4 bg-gray-50 flex flex-col gap-4">
            `;

            for(const [nombreCajero, dataCajero] of Object.entries(dataMes.cajeros)) {
                htmlMes += `
                    <div class="bg-white rounded border border-gray-200 border-l-4 border-l-stone-600 shadow-sm overflow-hidden">
                        <div class="bg-gray-100 p-2 px-4 flex justify-between items-center border-b border-gray-200">
                            <h4 class="font-bold text-stone-800 text-sm uppercase"><i class="fa-solid fa-user-check text-stone-500 mr-2"></i> ${nombreCajero}</h4>
                            <span class="font-black text-stone-700 text-sm">Ventas: Bs. ${dataCajero.total.toFixed(2)}</span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs">
                                <thead>
                                    <tr class="bg-gray-50 text-gray-500 uppercase tracking-wider">
                                        <th class="px-4 py-2 border-r border-gray-200 w-[100px]">ID Venta</th>
                                        <th class="px-4 py-2 border-r border-gray-200 w-[160px]">Fecha</th>
                                        <th class="px-4 py-2 border-r border-gray-200">Método Pago</th>
                                        <th class="px-4 py-2 text-right">Monto</th>
                                        <th class="px-4 py-2 text-center w-[220px] no-print">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                const rolActual = localStorage.getItem('usuario_rol') ? localStorage.getItem('usuario_rol').toUpperCase() : '';
                const esAdmin = rolActual === 'ADMINISTRADOR' || rolActual === 'ADMIN';

                dataCajero.lista.forEach(venta => {
                    const iconMetodo = venta.metodo_pago === 'EFECTIVO' ? '<i class="fa-solid fa-money-bill-wave text-green-600 mr-1"></i>' : 
                                       (venta.metodo_pago === 'QR' || venta.metodo_pago === 'QR DIGITAL') ? '<i class="fa-solid fa-qrcode text-blue-600 mr-1"></i>' : 
                                       (venta.metodo_pago === 'CONSUME_LO_NUESTRO' || venta.metodo_pago === 'CONSUME LO NUESTRO') ? '<i class="fa-solid fa-wallet text-orange-600 mr-1"></i>' :
                                       '<i class="fa-solid fa-credit-card text-purple-600 mr-1"></i>';

                    let tdMetodoPago = '';
                    if (esAdmin) {
                        tdMetodoPago = `
                            <td class="px-4 py-1.5 text-stone-700 border-r border-gray-100 font-bold text-[10px]">
                                <div class="flex items-center gap-1.5">
                                    ${iconMetodo}
                                    <select onchange="actualizarMetodoPago(${venta.venta_id}, this.value)" class="bg-transparent text-stone-700 font-black border-none outline-none cursor-pointer focus:ring-0 text-[10px] uppercase py-0.5">
                                        <option value="EFECTIVO" ${venta.metodo_pago === 'EFECTIVO' ? 'selected' : ''}>EFECTIVO</option>
                                        <option value="QR" ${['QR', 'QR DIGITAL'].includes(venta.metodo_pago) ? 'selected' : ''}>QR</option>
                                        <option value="TARJETA" ${['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].includes(venta.metodo_pago) ? 'selected' : ''}>TARJETA</option>
                                        <option value="CONSUME LO NUESTRO" ${['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].includes(venta.metodo_pago) ? 'selected' : ''}>CONSUME LO NUESTRO</option>
                                    </select>
                                </div>
                            </td>
                        `;
                    } else {
                        tdMetodoPago = `
                            <td class="px-4 py-1.5 text-stone-700 border-r border-gray-100 font-bold text-[10px]">${iconMetodo} ${venta.metodo_pago}</td>
                        `;
                    }

                    htmlMes += `
                                    <tr class="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                                        <td class="px-4 py-1.5 font-mono text-gray-500 border-r border-gray-100">#${venta.venta_id.toString().padStart(5,'0')}</td>
                                        <td class="px-4 py-1.5 text-stone-700 border-r border-gray-100 whitespace-nowrap">${venta.fecha_venta}</td>
                                        ${tdMetodoPago}
                                        <td class="px-4 py-1.5 text-right font-black text-stone-900 font-mono">Bs. ${parseFloat(venta.total).toFixed(2)}</td>
                                        <td class="px-4 py-1.5 text-center whitespace-nowrap no-print flex items-center justify-center gap-1.5">
                                            <button onclick="window.abrirTicket(${venta.venta_id})" class="text-orange-600 hover:text-orange-850 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-0.5 rounded font-bold transition-all text-[10px]" title="Ver / Imprimir">
                                                <i class="fa-solid fa-print"></i> Re-Imprimir
                                            </button>
                                            <button onclick="window.toggleVentaHistorica(${venta.venta_id}, ${venta.es_historica})" 
                                                    class="px-2 py-0.5 rounded font-bold transition-all text-[10px] ${venta.es_historica ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm shadow-orange-500/20' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}" 
                                                    title="${venta.es_historica ? 'Marcar como Normal' : 'Marcar como Histórica'}">
                                                <i class="fa-solid ${venta.es_historica ? 'fa-calendar-check' : 'fa-calendar-days'} mr-1"></i>
                                                ${venta.es_historica ? 'Histórica' : 'Normal'}
                                            </button>
                                        </td>
                                    </tr>
                    `;
                });

                htmlMes += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            htmlMes += `</div></div>`;
            contenedor.innerHTML += htmlMes;
        });

    } catch (e) {
        console.error("Error al cargar historial cajeros:", e);
        document.getElementById('contenedor-ventas-cajeros').innerHTML = '<div class="p-4 text-red-500 font-bold">Ocurrió un error al cargar la auditoría.</div>';
    }
}

function abrirModalGasto() {
    document.getElementById('inputMontoGasto').value = '';
    document.getElementById('inputDescGasto').value = '';
    document.getElementById('modalGasto').classList.remove('hidden');
}

async function cargarGastosDelTurno(cajaId) {
    try {
        const res = await fetch(`/api/caja/gastos/${cajaId}`);
        const gastos = await res.json();
        const tbody = document.getElementById('tabla-gastos-caja');
        const totalSpan = document.getElementById('total-gastos-lista');
        
        tbody.innerHTML = '';
        let total = 0;

        if (gastos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-gray-400 italic">No hay gastos registrados en este turno.</td></tr>';
            totalSpan.innerText = 'Total: Bs. 0.00';
            return;
        }

        gastos.forEach(g => {
            const monto = parseFloat(g.monto);
            total += monto;
            tbody.innerHTML += `
                <tr class="border-b border-gray-105 hover:bg-red-50/30 transition-colors">
                    <td class="px-4 py-2.5 text-stone-600 font-mono text-xs">${g.hora}</td>
                    <td class="px-4 py-2.5 text-stone-800 font-medium text-xs">${g.descripcion}</td>
                    <td class="px-4 py-2.5 text-right font-black text-red-600 text-xs">-Bs. ${monto.toFixed(2)}</td>
                </tr>
            `;
        });

        totalSpan.innerText = `Total: Bs. ${total.toFixed(2)}`;
    } catch (error) {
        console.error("Error al cargar gastos del turno:", error);
    }
}

async function procesarRegistroGasto() {
    const monto = document.getElementById('inputMontoGasto').value;
    const desc = document.getElementById('inputDescGasto').value.trim();
    const usuarioId = localStorage.getItem('usuario_id');

    if (!monto || parseFloat(monto) <= 0 || !desc) {
        alert("Por favor completa todos los campos correctamente.");
        return;
    }

    try {
        const res = await fetch('/api/caja/gastos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                caja_id: cajaActualId,
                usuario_id: usuarioId,
                monto: monto,
                descripcion: desc
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Error al registrar gasto');
        }

        cerrarModales();
        cargarEstadoCaja();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function cambiarPestana(tabId) {
    const secTurnoActual = document.getElementById('seccion-turno-actual-container');
    const secHistorial = document.getElementById('seccion-historial-turnos');
    const secAuditoria = document.getElementById('seccion-auditoria-cajeros');
    const secVentasRealizadas = document.getElementById('seccion-ventas-realizadas');

    const btnTurno = document.getElementById('tab-turno-actual');
    const btnHistorial = document.getElementById('tab-historial-turnos');
    const btnAuditoria = document.getElementById('tab-auditoria');
    const btnVentasRealizadas = document.getElementById('tab-ventas-realizadas');

    const activeClasses = ['bg-orange-500', 'text-white', 'shadow-md', 'shadow-orange-500/10'];
    const inactiveClasses = ['text-slate-600', 'hover:bg-slate-50'];

    if (secTurnoActual) { secTurnoActual.classList.add('hidden'); secTurnoActual.style.display = 'none'; }
    if (secHistorial) { secHistorial.classList.add('hidden'); secHistorial.style.display = 'none'; }
    if (secAuditoria) { secAuditoria.classList.add('hidden'); secAuditoria.style.display = 'none'; }
    if (secVentasRealizadas) { secVentasRealizadas.classList.add('hidden'); secVentasRealizadas.style.display = 'none'; }

    [btnTurno, btnHistorial, btnAuditoria, btnVentasRealizadas].forEach(btn => {
        if (btn) {
            activeClasses.forEach(cls => btn.classList.remove(cls));
            inactiveClasses.forEach(cls => btn.classList.add(cls));
        }
    });

    if (tabId === 'turno-actual') {
        if (secTurnoActual) { secTurnoActual.classList.remove('hidden'); secTurnoActual.style.display = ''; }
        if (btnTurno) {
            inactiveClasses.forEach(cls => btnTurno.classList.remove(cls));
            activeClasses.forEach(cls => btnTurno.classList.add(cls));
        }
    } else if (tabId === 'historial-turnos') {
        if (secHistorial) { secHistorial.classList.remove('hidden'); secHistorial.style.display = ''; }
        if (btnHistorial) {
            inactiveClasses.forEach(cls => btnHistorial.classList.remove(cls));
            activeClasses.forEach(cls => btnHistorial.classList.add(cls));
        }
    } else if (tabId === 'auditoria') {
        if (secAuditoria) { secAuditoria.classList.remove('hidden'); secAuditoria.style.display = ''; }
        if (btnAuditoria) {
            inactiveClasses.forEach(cls => btnAuditoria.classList.remove(cls));
            activeClasses.forEach(cls => btnAuditoria.classList.add(cls));
        }
    } else if (tabId === 'ventas-realizadas') {
        if (secVentasRealizadas) { secVentasRealizadas.classList.remove('hidden'); secVentasRealizadas.style.display = ''; }
        if (btnVentasRealizadas) {
            inactiveClasses.forEach(cls => btnVentasRealizadas.classList.remove(cls));
            activeClasses.forEach(cls => btnVentasRealizadas.classList.add(cls));
        }
        cargarVentasRealizadas();
    }
}

// === VENTAS REALIZADAS ===
let _todasLasVentas = []; // Cache de todas las ventas cargadas

async function cargarVentasRealizadas() {
    const tbody = document.getElementById('tabla-ventas-realizadas-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="text-center p-8 text-slate-400 font-semibold">
        <i class="fa-solid fa-spinner fa-spin text-xl mb-2 block text-emerald-500"></i>Cargando ventas...</td></tr>`;

    const rolActual = (localStorage.getItem('usuario_rol') || '').toUpperCase();
    const esAdmin   = rolActual === 'ADMIN' || rolActual === 'ADMINISTRADOR';

    try {
        const res = await fetch('/api/caja/historial-ventas-cajeros');
        if (!res.ok) throw new Error('Error al cargar ventas');
        _todasLasVentas = await res.json();

        if (esAdmin) {
            // Mostrar filtros y tarjetas de resumen
            const filtrosDiv   = document.getElementById('filtros-ventas-admin');
            const resumenDiv   = document.getElementById('resumen-ventas-admin');
            const colCajero    = document.querySelectorAll('.solo-admin-col');
            if (filtrosDiv) filtrosDiv.classList.remove('hidden');
            if (resumenDiv) resumenDiv.classList.remove('hidden');
            colCajero.forEach(el => el.style.display = '');

            // Poblar selector de cajeros
            const cajeros = [...new Set(_todasLasVentas.map(v => v.cajero).filter(Boolean))].sort();
            const selCajero = document.getElementById('filtroVentaCajero');
            if (selCajero) {
                selCajero.innerHTML = '<option value="">Todos</option>' +
                    cajeros.map(c => `<option value="${c}">${c}</option>`).join('');
            }

            // Establecer fechas por defecto: hoy
            const hoy = obtenerFechaBolivia();
            const desde = document.getElementById('filtroVentaDesde');
            const hasta = document.getElementById('filtroVentaHasta');
            if (desde && !desde.value) desde.value = hoy;
            if (hasta && !hasta.value) hasta.value = hoy;

            aplicarFiltrosVentas();
        } else {
            // Cajero: solo ventas del día propias
            const loggedUserId = localStorage.getItem('usuario_id');
            const hoy = obtenerFechaBolivia();

            const filtradas = _todasLasVentas.filter(v => {
                if (!v.fecha_venta) return false;
                const fecha = v.fecha_venta.split(' ')[0];
                return fecha === hoy && String(v.usuario_id) === String(loggedUserId);
            });

            renderizarTablaVentas(filtradas, false);
        }
    } catch (e) {
        console.error('Error ventas realizadas:', e);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-6 text-red-500 font-bold">Error al cargar ventas.</td></tr>`;
    }
}

function obtenerFechaBolivia() {
    try {
        const options = { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' };
        return new Intl.DateTimeFormat('en-CA', options).format(new Date());
    } catch (e) {
        console.warn('Timezone America/La_Paz not supported, falling back to local date:', e);
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}

function aplicarFiltrosVentas() {
    const desde  = document.getElementById('filtroVentaDesde')?.value || '';
    const hasta  = document.getElementById('filtroVentaHasta')?.value || '';
    const metodo = document.getElementById('filtroVentaMetodo')?.value || '';
    const cajero = document.getElementById('filtroVentaCajero')?.value || '';

    const filtradas = _todasLasVentas.filter(v => {
        if (!v.fecha_venta) return false;
        const fechaParte = v.fecha_venta.split(' ')[0];

        if (desde && fechaParte < desde) return false;
        if (hasta && fechaParte > hasta) return false;

        if (metodo) {
            const mp = (v.metodo_pago || '').toUpperCase();
            if (metodo === 'QR' && !['QR', 'QR DIGITAL'].includes(mp)) return false;
            if (metodo === 'TARJETA' && !['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].includes(mp)) return false;
            if (metodo === 'CONSUME LO NUESTRO' && !['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].includes(mp)) return false;
            if (metodo === 'EFECTIVO' && mp !== 'EFECTIVO') return false;
        }

        if (cajero && v.cajero !== cajero) return false;

        return true;
    });

    // Calcular totales
    let totalG = 0, totEfec = 0, totQr = 0, totTarj = 0, totCln = 0;
    filtradas.forEach(v => {
        const t  = parseFloat(v.total) || 0;
        const mp = (v.metodo_pago || '').toUpperCase();
        totalG += t;
        if (mp === 'EFECTIVO') totEfec += t;
        else if (['QR', 'QR DIGITAL'].includes(mp)) totQr += t;
        else if (['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].includes(mp)) totTarj += t;
        else if (['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].includes(mp)) totCln += t;
    });

    const promedio = filtradas.length > 0 ? totalG / filtradas.length : 0;

    // Actualizar tarjetas
    document.getElementById('rv-total-general').textContent  = `Bs. ${totalG.toFixed(2)}`;
    document.getElementById('rv-total-count').textContent    = `${filtradas.length} venta${filtradas.length !== 1 ? 's' : ''}`;
    document.getElementById('rv-total-efectivo').textContent = `Bs. ${totEfec.toFixed(2)}`;
    document.getElementById('rv-total-qr').textContent       = `Bs. ${totQr.toFixed(2)}`;
    document.getElementById('rv-total-tarjeta').textContent  = `Bs. ${totTarj.toFixed(2)}`;
    document.getElementById('rv-total-cln').textContent      = `Bs. ${totCln.toFixed(2)}`;
    document.getElementById('rv-promedio').textContent       = `Bs. ${promedio.toFixed(2)}`;

    // Actualizar total en tfoot
    const tfoot     = document.getElementById('tabla-ventas-tfoot');
    const tfMetodo  = document.getElementById('rv-tfoot-metodo');
    const tfTotal   = document.getElementById('rv-tfoot-total');
    if (tfoot && filtradas.length > 0) {
        tfoot.classList.remove('hidden');
        if (tfMetodo) tfMetodo.textContent = metodo ? metodo : '';
        if (tfTotal)  tfTotal.textContent  = `Bs. ${totalG.toFixed(2)}`;
    } else if (tfoot) {
        tfoot.classList.add('hidden');
    }

    renderizarTablaVentas(filtradas, true);
}

function limpiarFiltrosVentas() {
    const hoy = obtenerFechaBolivia();
    const desde = document.getElementById('filtroVentaDesde');
    const hasta = document.getElementById('filtroVentaHasta');
    if (desde) desde.value = hoy;
    if (hasta) hasta.value = hoy;
    const metodo = document.getElementById('filtroVentaMetodo');
    const cajero = document.getElementById('filtroVentaCajero');
    if (metodo) metodo.value = '';
    if (cajero) cajero.value = '';
    aplicarFiltrosVentas();
}

function imprimirVentasRealizadas() {
    window.print();
}

function renderizarTablaVentas(ventas, esAdmin) {
    const tbody = document.getElementById('tabla-ventas-realizadas-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (ventas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${esAdmin ? 6 : 5}" class="text-center p-8 text-slate-400 font-semibold">
            <i class="fa-solid fa-receipt text-2xl mb-2 block text-slate-300"></i>
            No hay ventas que coincidan con los filtros aplicados.</td></tr>`;
        return;
    }

    ventas.forEach(venta => {
        const padId = venta.venta_id.toString().padStart(5, '0');
        const total = parseFloat(venta.total).toFixed(2);
        const mp    = (venta.metodo_pago || '').toUpperCase();

        let badgeCls = 'bg-slate-100 text-slate-600';
        let icono    = '<i class="fa-solid fa-circle-question mr-1"></i>';
        if (mp === 'EFECTIVO') {
            badgeCls = 'bg-green-100 text-green-700';
            icono    = '<i class="fa-solid fa-money-bill-wave mr-1"></i>';
        } else if (['QR', 'QR DIGITAL'].includes(mp)) {
            badgeCls = 'bg-blue-100 text-blue-700';
            icono    = '<i class="fa-solid fa-qrcode mr-1"></i>';
        } else if (['TARJETA', 'TARJETA DE DÉBITO/CRÉDITO'].includes(mp)) {
            badgeCls = 'bg-purple-100 text-purple-700';
            icono    = '<i class="fa-solid fa-credit-card mr-1"></i>';
        } else if (['CONSUME LO NUESTRO', 'CONSUME_LO_NUESTRO'].includes(mp)) {
            badgeCls = 'bg-orange-100 text-orange-700';
            icono    = '<i class="fa-solid fa-wallet mr-1"></i>';
        }

        const metodoBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${badgeCls}">${icono}${venta.metodo_pago}</span>`;
        const cajeroCol   = esAdmin ? `<td class="px-4 py-3 text-slate-600 font-medium solo-admin-col">${venta.cajero || '-'}</td>` : '';

        tbody.innerHTML += `
            <tr class="border-b border-slate-100 hover:bg-emerald-50/30 transition-colors">
                <td class="px-4 py-3 font-mono font-bold text-slate-500">#${padId}</td>
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${venta.fecha_venta}</td>
                ${cajeroCol}
                <td class="px-4 py-3">${metodoBadge}</td>
                <td class="px-4 py-3 text-right font-black text-slate-900 font-mono text-sm">Bs. ${total}</td>
                <td class="px-4 py-3 text-center no-print">
                    <button onclick="window.abrirTicket(${venta.venta_id})"
                        class="bg-slate-50 hover:bg-orange-100 text-slate-600 hover:text-orange-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-orange-200 transition-all text-[10px] flex items-center gap-1.5 mx-auto">
                        <i class="fa-solid fa-print"></i> Re-Imprimir
                    </button>
                </td>
            </tr>
        `;
    });
}



async function abrirTicket(id) {
    try {
        const res = await fetch(`/api/comprobantes/${id}`);
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error);

        // Llenar datos de cabecera
        document.getElementById('t-id').innerText = data.ticket.id.toString().padStart(4, '0');
        document.getElementById('t-fecha').innerText = data.ticket.fecha;
        document.getElementById('t-total').innerText = `Bs. ${data.ticket.total}`;
        document.getElementById('t-pago').innerText = data.ticket.metodo_pago;

        // Llenar productos
        const tbodyItems = document.getElementById('t-items');
        tbodyItems.innerHTML = '';
        data.items.forEach(item => {
            tbodyItems.innerHTML += `
                <tr class="border-b border-gray-100">
                    <td class="py-2 text-center">${item.cantidad}</td>
                    <td class="py-2">${item.nombre}</td>
                    <td class="py-2 text-right">Bs. ${item.subtotal}</td>
                </tr>
            `;
        });

        // Mostrar el modal
        document.getElementById('modalTicket').classList.remove('hidden');

    } catch (error) {
        alert("Error al abrir ticket: " + error.message);
    }
}

function cerrarModalTicket() {
    document.getElementById('modalTicket').classList.add('hidden');
}

function imprimirTicket() {
    document.body.classList.add('print-ticket');
    window.print();
    document.body.classList.remove('print-ticket');
}

function imprimirAuditoria() {
    document.body.classList.add('print-auditoria');
    window.print();
    document.body.classList.remove('print-auditoria');
}

async function actualizarMetodoPago(ventaId, nuevoMetodo) {
    const editor_rol = localStorage.getItem('usuario_rol');
    try {
        const res = await fetch(`/api/caja/ventas/${ventaId}/metodo-pago`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                metodo_pago: nuevoMetodo,
                editor_rol: editor_rol
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar método de pago');

        // Recargar vistas para refrescar totales y estados
        cargarHistorialVentasAdmin();
        cargarEstadoCaja();
        cargarHistorial();
    } catch (error) {
        alert("Error al actualizar método de pago: " + error.message);
        cargarHistorialVentasAdmin();
    }
}

// Exponer funciones globalmente para inline onclick handlers
window.abrirTicket = abrirTicket;
window.cerrarModalTicket = cerrarModalTicket;
window.imprimirTicket = imprimirTicket;
window.imprimirAuditoria = imprimirAuditoria;

// === REGISTRO DE VENTA HISTORICA (Solo Admin) ===
function abrirModalVentaHistorica() {
    const totalInput = document.getElementById('inputVentaHistTotal');
    const fechaInput = document.getElementById('inputVentaHistFecha');
    
    if (totalInput) totalInput.value = '';
    
    if (fechaInput) {
        const ahora = new Date();
        const offset = ahora.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(ahora - offset)).toISOString().slice(0, 16);
        fechaInput.value = localISOTime;
    }

    cargarCajerosSelectorHistorico();

    document.getElementById('modalVentaHistorica').classList.remove('hidden');
}

function cerrarModalVentaHistorica() {
    document.getElementById('modalVentaHistorica').classList.add('hidden');
}

async function cargarCajerosSelectorHistorico() {
    const select = document.getElementById('inputVentaHistCajero');
    if (!select) return;

    try {
        const res = await fetch('/api/parametros/usuarios');
        if (!res.ok) throw new Error('Error al cargar cajeros');
        const usuarios = await res.json();

        const loggedUser = localStorage.getItem('usuario_id');
        
        select.innerHTML = usuarios
            .filter(u => u.activo)
            .map(u => `<option value="${u.id}" ${String(u.id) === String(loggedUser) ? 'selected' : ''}>${u.nombre} (${u.rol})</option>`)
            .join('');
    } catch (e) {
        console.error('Error cargando selector de cajeros:', e);
        select.innerHTML = `<option value="">Error al cargar cajeros</option>`;
    }
}

async function procesarVentaHistorica() {
    const usuario_id = document.getElementById('inputVentaHistCajero')?.value;
    const fecha_venta = document.getElementById('inputVentaHistFecha')?.value;
    const metodo_pago = document.getElementById('inputVentaHistMetodo')?.value;
    const total = document.getElementById('inputVentaHistTotal')?.value;

    if (!usuario_id || !fecha_venta || !metodo_pago || !total || parseFloat(total) <= 0) {
        alert('Por favor complete todos los campos correctamente. El total debe ser mayor a 0.');
        return;
    }

    try {
        const res = await fetch('/api/caja/venta-historica', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id,
                total,
                metodo_pago,
                fecha_venta
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrar venta histórica');

        alert('Venta histórica registrada con éxito.');
        cerrarModalVentaHistorica();
        
        cargarVentasRealizadas();
        cargarEstadoCaja();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

window.abrirModalVentaHistorica = abrirModalVentaHistorica;
window.cerrarModalVentaHistorica = cerrarModalVentaHistorica;
window.procesarVentaHistorica = procesarVentaHistorica;

async function toggleVentaHistorica(id, currentStatus) {
    try {
        const nuevoEstado = !currentStatus;
        const res = await fetch(`/api/caja/ventas/${id}/historica`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ es_historica: nuevoEstado })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar tipo de venta');
        
        cargarHistorialVentasAdmin();
        if (typeof cargarVentasRealizadas === 'function') {
            cargarVentasRealizadas();
        }
    } catch (error) {
        alert("Error al conmutar venta histórica: " + error.message);
    }
}
window.toggleVentaHistorica = toggleVentaHistorica;