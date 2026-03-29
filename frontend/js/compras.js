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
    // Si tienes una ruta GET /api/compras, aquí se cargaría. 
    // Para no romper tu sistema si aún no tienes el endpoint, lo dejamos preparado.
    try {
        const res = await fetch('/api/compras');
        if(res.ok) {
            const historial = await res.json();
            // Lógica para pintar tabla-compras
        }
    } catch (e) { console.log('Historial no implementado aún o error:', e); }
}

async function cargarProveedores() {
    try {
        const respuesta = await fetch('/api/proveedores'); // Asume que tienes este endpoint o lo crearás
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

// Cuando se selecciona un insumo en el dropdown
function actualizarUnidadLabel() {
    const sel = document.getElementById('selInsumo');
    if(!sel.value) return;
    
    const opcionSeleccionada = sel.options[sel.selectedIndex];
    const unidadBase = opcionSeleccionada.getAttribute('data-unidad');
    
    // Auto-seleccionar la unidad base en el nuevo selector
    const selUnidad = document.getElementById('selUnidadFila');
    if([...selUnidad.options].some(o => o.value === unidadBase)) {
        selUnidad.value = unidadBase;
    }
    
    actualizarLabelAbajo();
    calcularTotalFila();
}

function actualizarLabelAbajo() {
    const unidad = document.getElementById('selUnidadFila').value;
    document.getElementById('lblUndFormVisual').innerText = unidad;
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
    const unidadElegida = document.getElementById('selUnidadFila').value; // Nueva Unidad Dinámica
    const vencimiento = document.getElementById('inpVence').value || null;

    const cantidadTotal = parseFloat((empaques * contenidoUnidad).toFixed(2));

    if (cantidadTotal <= 0) return alert('La cantidad debe ser mayor a 0');

    detalleCompra.push({
        insumo_id: idInsumo,
        nombre: nombreInsumo,
        cantidad: cantidadTotal,
        unidad: unidadElegida,
        costo: costoSubtotal,
        vencimiento: vencimiento
    });

    renderizarDetalle();
    
    // Limpiar fila de ingreso
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
// 3. NUEVAS FUNCIONES: CREAR DESDE COMPRAS
// ==========================================

// --- PROVEEDORES ---
function abrirModalNuevoProveedor() {
    document.getElementById('modalNuevoProveedor').classList.remove('hidden');
    document.getElementById('inpProvNombre').value = '';
    document.getElementById('inpProvTel').value = '';
}

function cerrarModalNuevoProveedor() {
    document.getElementById('modalNuevoProveedor').classList.add('hidden');
}

async function guardarProveedor() {
    const nombre = document.getElementById('inpProvNombre').value;
    const tel = document.getElementById('inpProvTel').value;

    if(!nombre) return alert('El nombre de la empresa es obligatorio.');

    // Simulación o llamada real al backend
    try {
        const res = await fetch('/api/proveedores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, telefono: tel })
        });
        
        if(!res.ok) throw new Error('No se pudo guardar el proveedor');
        
        alert('Proveedor guardado exitosamente');
        cerrarModalNuevoProveedor();
        await cargarProveedores(); // Recargar el dropdown
        
        // Intentar auto-seleccionar el último si la API lo devuelve (opcional)
    } catch(e) {
        console.error(e);
        alert('Error conectando al servidor para guardar proveedor.');
    }
}

// --- INSUMOS ---
function abrirModalNuevoInsumo() {
    document.getElementById('modalNuevoInsumoCompras').classList.remove('hidden');
    document.getElementById('inpInsNombre').value = '';
    document.getElementById('inpInsUnidad').value = 'ml';
    document.getElementById('inpInsMinimo').value = '10';
}

function cerrarModalNuevoInsumo() {
    document.getElementById('modalNuevoInsumoCompras').classList.add('hidden');
}

async function guardarInsumoDesdeCompras() {
    const nombre = document.getElementById('inpInsNombre').value;
    const unidad = document.getElementById('inpInsUnidad').value;
    const minimo = document.getElementById('inpInsMinimo').value;

    if(!nombre) return alert('El nombre del insumo es obligatorio.');

    try {
        const res = await fetch('/api/almacen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: nombre,
                unidad_medida: unidad,
                stock_inicial: 0, // Inicia en 0, porque el ingreso se hace en la tabla de compras
                stock_minimo: minimo
            })
        });
        
        if(!res.ok) throw new Error('No se pudo crear el insumo');
        
        alert('Insumo guardado exitosamente');
        cerrarModalNuevoInsumo();
        await cargarInsumos(); // Recargar el dropdown
        
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
    const usuarioId = localStorage.getItem('usuario_id');

    const data = {
        proveedor_id: provId,
        usuario_id: usuarioId,
        total: totalCompra,
        detalles: detalleCompra // Aquí ya va la "unidad" personalizada
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