// frontend/js/compras.js

let listaProveedores = [];
let listaInsumos = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarHistorialCompras();
    cargarProveedores();
    cargarInsumos();
});

// --- CARGA DE DATOS AL CARGAR LA PÁGINA ---
async function cargarHistorialCompras() {
    try {
        const res = await fetch('/api/compras');
        if(!res.ok) throw new Error("Error en servidor");
        const data = await res.json();
        
        const tbody = document.getElementById('tabla-compras');
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-gray-500 font-bold">No hay ingresos registrados.</td></tr>`;
            return;
        }

        data.forEach(compra => {
            const detalles = compra.detalles_compra || 'Sin detalles';
            const proveedorStr = compra.proveedor ? `${compra.proveedor} <br><span class="text-[10px] text-gray-500">${compra.prov_tel || ''}</span>` : '<span class="text-gray-400 italic">Desconocido</span>';

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-4 py-3 font-bold text-[#4E342E]">#COM-${String(compra.id).padStart(5, '0')}</td>
                    <td class="px-4 py-3 text-gray-500 text-xs">${compra.fecha_compra}</td>
                    <td class="px-4 py-3 font-medium text-gray-800">${proveedorStr}</td>
                    <td class="px-4 py-3 text-xs text-gray-600 max-w-xs truncate" title="${detalles}">${detalles}</td>
                    <td class="px-4 py-3 text-right font-black text-[#E65100]">Bs. ${Number(compra.total).toFixed(2)}</td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error al cargar historial de compras", e);
    }
}

async function cargarProveedores() {
    try {
        const res = await fetch('/api/proveedores');
        listaProveedores = await res.json();
        
        const sel = document.getElementById('selProveedor');
        sel.innerHTML = '<option value="" disabled selected>-- Elige Prov. --</option>';
        listaProveedores.forEach(p => {
            sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });
    } catch(e) { console.error("Error al cargar proveedores", e); }
}

async function cargarInsumos() {
    try {
        const res = await fetch('/api/almacen/insumos');
        listaInsumos = await res.json();
        
        const sel = document.getElementById('selInsumo');
        sel.innerHTML = '<option value="" disabled selected>-- Elige Insumo --</option>';
        listaInsumos.forEach(i => {
            // Guardamos ID, nombre y unidad en opciones
            sel.innerHTML += `<option value="${i.id}" data-unidad="${i.unidad_medida}">${i.nombre}</option>`;
        });
    } catch(e) { console.error("Error al cargar insumos", e); }
}

function actualizarUnidadLabel() {
    const sel = document.getElementById('selInsumo');
    const opt = sel.options[sel.selectedIndex];
    if(opt && opt.value) {
        document.getElementById('lblUndFormVisual').innerText = opt.getAttribute('data-unidad');
    }
}

// --- GUARDAR COMPRA RÁPIDA ---
async function ejecutarCompraRapida() {
    const proveedor_id = document.getElementById('selProveedor').value;
    const insumo_id = document.getElementById('selInsumo').value;
    const cantidad = parseFloat(document.getElementById('inpContenido').value) || 0;
    const costo = parseFloat(document.getElementById('inpCosto').value) || 0;
    const vencimiento = document.getElementById('inpVence').value || null;

    if (!proveedor_id) return alert("Selecciona un proveedor.");
    if (!insumo_id) return alert("Selecciona un insumo.");
    if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad mayor a 0.");

    const btn = document.getElementById('btnGuardarCompraRapida');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>';

    const data = {
        proveedor_id: proveedor_id,
        total: costo,
        detalles: [
            {
                insumo_id: insumo_id,
                cantidad: cantidad,
                costo: costo,
                vencimiento: vencimiento
            }
        ]
    };

    try {
        const res = await fetch('/api/compras', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if(!res.ok) throw new Error((await res.json()).error);
        
        // Limpiar inputs pero mantener proveedor
        document.getElementById('selInsumo').value = '';
        document.getElementById('inpContenido').value = '';
        document.getElementById('inpCosto').value = '0.00';
        document.getElementById('inpVence').value = '';
        document.getElementById('lblUndFormVisual').innerText = 'Unidad';

        cargarHistorialCompras();
    } catch (error) {
        alert("Error al procesar la compra: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check text-[10px] mr-1"></i> Comprar';
    }
}

// --- PROVEEDORES RÁPIDOS ---
function abrirModalNuevoProveedor() { document.getElementById('modalNuevoProveedor').classList.remove('hidden'); }
function cerrarModalNuevoProveedor() { document.getElementById('modalNuevoProveedor').classList.add('hidden'); }

async function guardarProveedor() {
    const nombre = document.getElementById('inpProvNombre').value.trim();
    const tel = document.getElementById('inpProvTel').value.trim();
    
    if(!nombre) return alert("Nombre obligatorio");
    
    try {
        await fetch('/api/proveedores', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nombre, telefono: tel, email: '', direccion: '' })
        });
        cerrarModalNuevoProveedor();
        document.getElementById('inpProvNombre').value = '';
        document.getElementById('inpProvTel').value = '';
        cargarProveedores();
    } catch(e) {
        alert("Error guardando proveedor");
    }
}