// frontend/js/compras.js
let historialCompras = [];
let insumosBase = [];
let detalleCompra = [];
let granTotal = 0;

document.addEventListener('DOMContentLoaded', () => {
    cargarHistorial();
    document.getElementById('inpFecha').valueAsDate = new Date();
});

async function cargarHistorial() {
    try {
        const res = await fetch('/api/compras');
        historialCompras = await res.json();
        const tbody = document.getElementById('tabla-compras');
        tbody.innerHTML = '';

        historialCompras.forEach(c => {
            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-4 py-3 font-black text-gray-700">CMP-${c.id.toString().padStart(5, '0')}</td>
                    <td class="px-4 py-3 text-gray-600"><i class="fa-regular fa-calendar mr-2"></i>${c.fecha_compra}</td>
                    <td class="px-4 py-3 font-bold text-gray-800">${c.proveedor || 'Sin Proveedor Registrado'}</td>
                    <td class="px-4 py-3 text-right font-black text-[#E65100]">S/ ${c.total}</td>
                </tr>
            `;
        });
    } catch (e) { console.error(e); }
}

async function abrirModalCompra() {
    detalleCompra = [];
    actualizarTablaDetalle();
    
    // Cargar listas
    const res = await fetch('/api/compras/datos-formulario');
    const data = await res.json();
    insumosBase = data.insumos;

    const selProv = document.getElementById('selProveedor');
    selProv.innerHTML = '<option value="">-- Selecciona un Proveedor --</option>';
    data.proveedores.forEach(p => selProv.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);

    const selIns = document.getElementById('selInsumo');
    selIns.innerHTML = '<option value="">-- Selecciona Insumo --</option>';
    insumosBase.forEach(i => selIns.innerHTML += `<option value="${i.id}" data-unidad="${i.unidad_medida}">${i.nombre}</option>`);

    document.getElementById('modalCompra').classList.remove('hidden');
}

function cerrarModalCompra() {
    document.getElementById('modalCompra').classList.add('hidden');
}

// --- LÓGICA DE CONVERSIÓN ---
function actualizarUnidadLabel() {
    const sel = document.getElementById('selInsumo');
    if(sel.selectedIndex <= 0) return;
    const unidad = sel.options[sel.selectedIndex].getAttribute('data-unidad');
    
    document.getElementById('lblUndFila').innerText = unidad;
    document.querySelectorAll('.lblUndForm').forEach(l => l.innerText = unidad);
    calcularTotalFila();
}

function calcularTotalFila() {
    const empaques = parseFloat(document.getElementById('inpEmpaques').value) || 0;
    const cont = parseFloat(document.getElementById('inpContenido').value) || 0;
    document.getElementById('lblSumaTotal').innerText = (empaques * cont).toFixed(2);
}

// --- CARRITO DE COMPRAS ---
function agregarAlDetalle() {
    const insumoId = document.getElementById('selInsumo').value;
    const selIndex = document.getElementById('selInsumo').selectedIndex;
    const insumoNom = document.getElementById('selInsumo').options[selIndex].text;
    const unidad = document.getElementById('lblUndFila').innerText;
    
    const cantBase = parseFloat(document.getElementById('lblSumaTotal').innerText);
    const costoSubtotal = parseFloat(document.getElementById('inpCosto').value) || 0;
    const vencimiento = document.getElementById('inpVence').value;

    if (!insumoId || cantBase <= 0 || costoSubtotal <= 0) {
        return alert("Selecciona un insumo, verifica la cantidad y asegúrate de poner el Costo Total de esa fila.");
    }

    // Calcular costo unitario (costo total / cantidad base)
    const costoUnit = costoSubtotal / cantBase;

    detalleCompra.push({
        insumo_id: insumoId,
        nombre: insumoNom,
        cantidad_base: cantBase,
        unidad: unidad,
        costo_unitario: costoUnit,
        subtotal: costoSubtotal,
        fecha_vencimiento: vencimiento || null
    });

    // Resetear fila
    document.getElementById('inpEmpaques').value = 1;
    document.getElementById('inpCosto').value = "0.00";
    document.getElementById('inpVence').value = "";
    calcularTotalFila();

    actualizarTablaDetalle();
}

function actualizarTablaDetalle() {
    const tbody = document.getElementById('lista-detalle');
    tbody.innerHTML = '';
    granTotal = 0;

    detalleCompra.forEach((item, index) => {
        granTotal += item.subtotal;
        const venceText = item.fecha_vencimiento ? `<span class="text-red-600 font-bold">${item.fecha_vencimiento}</span>` : '<span class="text-gray-400">Sin caducidad</span>';
        
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="p-2 font-bold text-gray-700">${item.nombre}</td>
                <td class="p-2 text-center bg-green-50 text-green-700 font-black">+${item.cantidad_base} ${item.unidad}</td>
                <td class="p-2 text-center">${venceText}</td>
                <td class="p-2 text-right font-black text-[#4E342E]">S/ ${item.subtotal.toFixed(2)}</td>
                <td class="p-2 text-center">
                    <button onclick="detalleCompra.splice(${index}, 1); actualizarTablaDetalle()" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });

    document.getElementById('lblTotalCompra').innerText = granTotal.toFixed(2);
}

// --- GUARDAR COMPRA ---
async function guardarCompra() {
    const provId = document.getElementById('selProveedor').value;
    
    if (!provId) return alert("Por favor selecciona a qué proveedor le estás comprando.");
    if (detalleCompra.length === 0) return alert("El detalle de compra está vacío.");

    const btn = document.getElementById('btnGuardarCompra');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

    const payload = {
        proveedor_id: provId,
        total: granTotal,
        detalles: detalleCompra
    };

    try {
        const res = await fetch('/api/compras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Error al guardar la compra");

        alert("✅ ¡Compra registrada! El stock del almacén ha sido actualizado automáticamente.");
        cerrarModalCompra();
        cargarHistorial();
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Confirmar Compra';
    }
}