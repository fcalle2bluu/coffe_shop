// frontend/js/caja.js
let cajaActualId = null;
let efectivoEsperadoEnCaja = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarEstadoCaja();
    cargarHistorial();
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
            document.getElementById('res-inicial').innerText = `S/ ${data.caja.saldo_inicial}`;
            document.getElementById('res-efectivo').innerText = `S/ ${data.ventas.total_efectivo}`;
            document.getElementById('res-digital').innerText = `S/ ${(parseFloat(data.ventas.total_qr) + parseFloat(data.ventas.total_tarjeta)).toFixed(2)}`;
            document.getElementById('res-esperado').innerText = `S/ ${efectivoEsperadoEnCaja.toFixed(2)}`;
            
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
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-4 py-3 text-gray-800">${turno.apertura}</td>
                    <td class="px-4 py-3 text-gray-800">${turno.cierre}</td>
                    <td class="px-4 py-3 text-right font-medium">S/ ${turno.saldo_inicial}</td>
                    <td class="px-4 py-3 text-right font-bold ${colorDif}">S/ ${turno.saldo_final}</td>
                </tr>
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
    document.getElementById('lbl-esperado').innerText = `S/ ${efectivoEsperadoEnCaja.toFixed(2)}`;
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