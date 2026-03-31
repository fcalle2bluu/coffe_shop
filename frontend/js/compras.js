// frontend/js/compras.js
let proveedoresGlobal = [];
let insumosGlobal = [];
let detalleCompra = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarHistorialCompras();
    
    // Configurar fecha de hoy en el modal
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('inpFecha').value = hoy;
});

// ==========================================
// 1. CARGA INICIAL (RUTINAS BASE)
// ==========================================
async function cargarHistorialCompras() {
    try {
        const res = await fetch('/api/compras');
        if(res.ok) {
            const historial = await res.json();
            const tbody = document.getElementById('tabla-compras');
            tbody.innerHTML = ''; 

            if (historial.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500 font-bold">No hay compras registradas aún.</td></tr>';
                return;
            }

            historial.forEach(compra => {
                const folio = compra.id.toString().padStart(5, '0');
                tbody.innerHTML += `
                    <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
                        <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-[#E65100]">#COMP-${folio}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600"><i class="fa-regular fa-calendar mr-2"></i>${compra.fecha_compra}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-800"><i class="fa-solid fa-truck mr-2 text-gray-400"></i>${compra.proveedor || 'Sin Proveedor'}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-black text-green-700">S/ ${parseFloat(compra.total).toFixed(2)}</td>
                    </tr>
                `;
            });
        }
    } catch (e) { 
        console.log('Error cargando historial de compras:', e); 
    }
}

async function cargarProveedores() {
    try {
        const respuesta = await fetch('/api/proveedores'); 
        if (!respuesta.ok) return;
        proveedoresGlobal = await respuesta.json();
        
        const sel = document.getElementById('selProveedor');
        sel.innerHTML = '<option value="" disabled selected>-- Seleccione Proveedor --</option>';
        proveedoresGlobal.forEach(p => {
            sel.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        });
    } catch (error) {
        console.error("Error cargando proveedores:", error);
    }
}

async function cargarInsumos() {
    try {
        const respuesta = await fetch('/api/almacen/insumos');
        if (!respuesta.ok) throw new Error('Error al cargar insumos');
        insumosGlobal = await respuesta.json();
        
        const sel = document.getElementById('selInsumo');
        sel.innerHTML = '<option value="" disabled selected>-- Seleccione Insumo --</option>';
        insumosGlobal.forEach(i => {
            sel.innerHTML += `<option value="${i.id}" data-unidad="${i.unidad_medida}">${i.nombre}</option>`;
        });
    } catch (error) {
        console.error("Error cargando insumos:", error);
    }
}

// ==========================================
// 2. LÓGICA DEL FORMULARIO DE COMPRA
// ==========================================
function abrirModalCompra() {
    cargarProveedores();
    cargarInsumos();
    detalleCompra = [];
    renderizarDetalle();
    document.getElementById('modalCompra').classList.remove('hidden');
}

function cerrarModalCompra() {
    document.getElementById('modalCompra').classList.add('hidden');
}

function actualizarUnidadLabel() {
    const sel = document.getElementById('selInsumo');
    if(!sel.value) return;
    
    const opcionSeleccionada = sel.options[sel.selectedIndex];
    const unidadBase = opcionSeleccionada.getAttribute('data-unidad');
    
    // Al ser un campo de texto, le pasamos el valor directamente
    document.getElementById('selUnidadFila').value = unidadBase;
    
    actualizarLabelAbajo();
    calcularTotalFila();
}

function actualizarLabelAbajo() {
    const unidad = document.getElementById('selUnidadFila').value;
    document.getElementById('lblUndFormVisual').innerText = unidad || '...';
}

function calcularTotalFila() {
    const empaques = parseFloat(document.getElementById('inpEmpaques').value) || 0;
    const contenido = parseFloat(document.getElementById('inpContenido').value) || 0;
    
    const total = (empaques * contenido).toFixed(2);
    document.getElementById('lblSumaTotal').innerText = parseFloat(total);
}

function agregarAlDetalle() {
    const selInsumo = document.getElementById('selInsumo');
    if (!selInsumo.value) return alert('Seleccione un insumo');

    const idInsumo = selInsumo.value;
    const nombreInsumo = selInsumo.options[selInsumo.selectedIndex].text;
    
    const empaques = parseFloat(document.getElementById('inpEmpaques').value) || 1;
    const contenidoUnidad = parseFloat(document.getElementById('inpContenido').value) || 0;
    const costoSubtotal = parseFloat(document.getElementById('inpCosto').value) || 0;
    const unidadElegida = document.getElementById('selUnidadFila').value; 
    const vencimiento = document.getElementById('inpVence').value || null;

    const cantidadTotal = parseFloat((empaques * contenidoUnidad).toFixed(2));

    if (cantidadTotal <= 0) return alert('La cantidad debe ser mayor a 0');
    if (!unidadElegida) return alert('Debes especificar la unidad de medida');

    detalleCompra.push({
        insumo_id: idInsumo,
        nombre: nombreInsumo,
        cantidad: cantidadTotal,
        unidad: unidadElegida,
        costo: costoSubtotal,
        vencimiento: vencimiento
    });

    renderizarDetalle();
    
    document.getElementById('inpEmpaques').value = '1';
    document.getElementById('inpContenido').value = '1000';
    document.getElementById('inpCosto').value = '0.00';
    document.getElementById('inpVence').value = '';
    calcularTotalFila();
}

function quitarDelDetalle(index) {
    detalleCompra.splice(index, 1);
    renderizarDetalle();
}

function renderizarDetalle() {
    const tbody = document.getElementById('lista-detalle');
    tbody.innerHTML = '';
    
    let totalSuma = 0;

    detalleCompra.forEach((item, index) => {
        totalSuma += item.costo;
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50">
                <td class="p-2 font-bold text-gray-800">${item.nombre}</td>
                <td class="p-2 text-center text-green-700 font-bold">${item.cantidad}</td>
                <td class="p-2 text-center text-xs font-bold text-gray-500">${item.unidad}</td>
                <td class="p-2 text-center text-red-600 text-xs">${item.vencimiento || '-'}</td>
                <td class="p-2 text-right font-bold">S/ ${item.costo.toFixed(2)}</td>
                <td class="p-2 text-center">
                    <button onclick="quitarDelDetalle(${index})" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });

    document.getElementById('lblTotalCompra').innerText = totalSuma.toFixed(2);
}

// ==========================================
// 3. FUNCIONES: CREAR / ELIMINAR PROVEEDOR
// ==========================================

function abrirModalNuevoProveedor() {
    document.getElementById('modalNuevoProveedor').classList.remove('hidden');
    document.getElementById('inpProvNombre').value = '';
    document.getElementById('inpProvTel').value = '';
    document.getElementById('inpProvEmail').value = '';
    document.getElementById('inpProvDir').value = '';
}

function cerrarModalNuevoProveedor() {
    document.getElementById('modalNuevoProveedor').classList.add('hidden');
}

async function guardarProveedor() {
    const nombre = document.getElementById('inpProvNombre').value;
    const tel = document.getElementById('inpProvTel').value;
    const email = document.getElementById('inpProvEmail').value;
    const dir = document.getElementById('inpProvDir').value;

    if(!nombre) return alert('El nombre de la empresa es obligatorio.');

    try {
        const res = await fetch('/api/proveedores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                nombre: nombre, 
                telefono: tel,
                email: email,
                direccion: dir
            })
        });
        
        if(!res.ok) throw new Error('No se pudo guardar el proveedor');
        
        alert('Proveedor guardado exitosamente');
        cerrarModalNuevoProveedor();
        await cargarProveedores(); 
        
    } catch(e) {
        console.error(e);
        alert('Error conectando al servidor para guardar proveedor.');
    }
}

async function eliminarProveedorSeleccionado() {
    const sel = document.getElementById('selProveedor');
    const idProveedor = sel.value;
    
    if (!idProveedor) {
        return alert('Por favor, selecciona primero un proveedor de la lista para eliminarlo.');
    }
    
    const nombreProveedor = sel.options[sel.selectedIndex].text;
    
    const confirmar = confirm(`¿Estás seguro que deseas eliminar al proveedor "${nombreProveedor}" de tu base de datos?`);
    if (!confirmar) return;

    try {
        const res = await fetch(`/api/proveedores/${idProveedor}`, {
            method: 'DELETE'
        });
        
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Error al eliminar el proveedor');
        
        alert('Proveedor eliminado exitosamente');
        await cargarProveedores(); // Recargamos el Select
        
    } catch(e) {
        console.error(e);
        alert(e.message);
    }
}

// --- INSUMOS ---
function abrirModalNuevoInsumo() {
    document.getElementById('modalNuevoInsumoCompras').classList.remove('hidden');
    document.getElementById('inpInsNombre').value = '';
    
    // Lo dejamos en blanco para que escribas libremente
    document.getElementById('inpInsUnidad').value = '';
    
    document.getElementById('inpInsMinimo').value = '10';
}

function cerrarModalNuevoInsumo() {
    document.getElementById('modalNuevoInsumoCompras').classList.add('hidden');
}

async function guardarInsumoDesdeCompras() {
    const nombre = document.getElementById('inpInsNombre').value;
    // Eliminamos espacios extra con trim()
    const unidad = document.getElementById('inpInsUnidad').value.trim();
    const minimo = document.getElementById('inpInsMinimo').value;

    if(!nombre) return alert('El nombre del insumo es obligatorio.');
    if(!unidad) return alert('La unidad de medida es obligatoria. Ej: kg, lt, cajas...');

    try {
        const res = await fetch('/api/almacen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: nombre,
                unidad_medida: unidad,
                stock_inicial: 0, 
                stock_minimo: minimo
            })
        });
        
        if(!res.ok) throw new Error('No se pudo crear el insumo');
        
        alert('Insumo guardado exitosamente');
        cerrarModalNuevoInsumo();
        await cargarInsumos(); 
        
    } catch(e) {
        console.error(e);
        alert('Error conectando al servidor para guardar insumo.');
    }
}

// ==========================================
// 4. GUARDAR LA COMPRA FINAL
// ==========================================
async function guardarCompra() {
    if (detalleCompra.length === 0) return alert('No hay productos en la compra');
    
    const provId = document.getElementById('selProveedor').value;
    if(!provId) return alert('Debe seleccionar un proveedor');

    const totalCompra = parseFloat(document.getElementById('lblTotalCompra').innerText);

    const data = {
        proveedor_id: provId,
        total: totalCompra,
        detalles: detalleCompra
    };

    const btn = document.getElementById('btnGuardarCompra');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando...';

    try {
        const respuesta = await fetch('/api/compras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!respuesta.ok) throw new Error('Error al registrar compra');
        
        alert('¡Compra registrada exitosamente! El stock ha sido actualizado.');
        cerrarModalCompra();
        cargarHistorialCompras();
    } catch (error) {
        alert(error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Confirmar Compra';
    }
}