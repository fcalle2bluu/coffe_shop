// frontend/js/caja.js
let cajaActualId = null;
let efectivoEsperadoEnCaja = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarEstadoCaja();
    cargarHistorial();
    
    if(localStorage.getItem('usuario_rol') === 'ADMIN') {
        const secAuditoria = document.getElementById('seccion-auditoria-cajeros');
        if(secAuditoria) secAuditoria.classList.remove('hidden');
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
            txtInfo.innerHTML = `Apertura: <strong>${new Date(data.caja.fecha_apertura).toLocaleString('es-ES')}</strong>`;
            
            btnAccion.innerHTML = '<i class="fa-solid fa-lock mr-2"></i> Cerrar Caja';
            btnAccion.className = "bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded shadow font-bold text-lg transition-colors";
            btnAccion.onclick = abrirModalCierre;

            // Llenar montos en vivo
            document.getElementById('res-inicial').innerText = `Bs. ${data.caja.saldo_inicial}`;
            document.getElementById('res-efectivo').innerText = `Bs. ${data.ventas.total_efectivo}`;
            document.getElementById('res-digital').innerText = `Bs. ${(parseFloat(data.ventas.total_qr) + parseFloat(data.ventas.total_tarjeta)).toFixed(2)}`;
            document.getElementById('res-esperado').innerText = `Bs. ${efectivoEsperadoEnCaja.toFixed(2)}`;
            
            panelResumen.classList.remove('hidden');

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
            const colorDif = diferencia >= 0 ? 'text-green-600' : 'text-red-600';
            
            tbody.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                        <div>
                            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Apertura</span>
                            <span class="font-bold text-stone-800 text-sm"><i class="fa-regular fa-clock text-green-500 mr-1"></i>${turno.apertura}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Cierre</span>
                            <span class="font-bold text-stone-800 text-sm"><i class="fa-solid fa-lock text-red-500 mr-1"></i>${turno.cierre}</span>
                        </div>
                    </div>
                    
                    <div class="flex justify-between mt-1">
                        <div>
                            <span class="text-[10px] text-gray-500 block uppercase">Fondo Inicial</span>
                            <span class="font-medium text-gray-700">Bs. ${turno.saldo_inicial}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] text-gray-500 block uppercase">Cierre Efectivo</span>
                            <span class="font-black text-lg ${colorDif}">Bs. ${turno.saldo_final}</span>
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
}

// --- ACCIONES POST ---
async function procesarApertura() {
    const saldo = document.getElementById('inputSaldoInicial').value;
    try {
        const res = await fetch('/api/caja/abrir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saldo_inicial: saldo })
        });
        if (!res.ok) throw new Error(await res.text());
        
        cerrarModales();
        cargarEstadoCaja();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function procesarCierre() {
    const saldoReal = document.getElementById('inputSaldoFinal').value;
    try {
        const res = await fetch('/api/caja/cerrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caja_id: cajaActualId, saldo_final: saldoReal })
        });
        if (!res.ok) throw new Error(await res.text());
        
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
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                dataCajero.lista.forEach(venta => {
                    const iconMetodo = venta.metodo_pago === 'EFECTIVO' ? '<i class="fa-solid fa-money-bill-wave text-green-600 mr-1"></i>' : 
                                       venta.metodo_pago === 'QR' ? '<i class="fa-solid fa-qrcode text-blue-600 mr-1"></i>' : 
                                       '<i class="fa-solid fa-credit-card text-purple-600 mr-1"></i>';

                    htmlMes += `
                                    <tr class="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                                        <td class="px-4 py-1.5 font-mono text-gray-500 border-r border-gray-100">#${venta.venta_id.toString().padStart(5,'0')}</td>
                                        <td class="px-4 py-1.5 text-stone-700 border-r border-gray-100 whitespace-nowrap">${venta.fecha_venta}</td>
                                        <td class="px-4 py-1.5 text-stone-700 border-r border-gray-100 font-bold text-[10px]">${iconMetodo} ${venta.metodo_pago}</td>
                                        <td class="px-4 py-1.5 text-right font-black text-stone-900">Bs. ${parseFloat(venta.total).toFixed(2)}</td>
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