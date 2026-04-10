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
            tbody.innerHTML = `<div class="col-span-full text-center py-10 bg-white rounded-xl shadow-sm"><p class="text-gray-400 font-bold"><i class="fa-solid fa-truck-fast text-4xl mb-3 opacity-30 block"></i> No hay ingresos registrados.</p></div>`;
            return;
        }

        data.forEach(compra => {
            let detallesHtml = '';
            
            // compra.detalles_compra ahora es un array JSON (gracias al cambio en el backend)
            if (Array.isArray(compra.detalles_compra)) {
                compra.detalles_compra.forEach(det => {
                    const imgInsumo = det.imagen_url 
                        ? `<img src="${det.imagen_url}" class="w-10 h-10 object-cover rounded border border-gray-200 shadow-sm shrink-0">` 
                        : `<div class="w-10 h-10 bg-gray-100 flex items-center justify-center text-gray-300 rounded border border-gray-100 shrink-0"><i class="fa-solid fa-image text-xs"></i></div>`;
                    
                    detallesHtml += `
                        <div class="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-50 mb-2 last:mb-0">
                            ${imgInsumo}
                            <div class="flex-1">
                                <p class="text-xs font-bold text-gray-800 leading-tight">${det.nombre}</p>
                                <p class="text-[10px] text-gray-500 font-medium uppercase">${det.cantidad} ${det.unidad}</p>
                            </div>
                        </div>
                    `;
                });
            } else {
                detallesHtml = `<p class="text-xs text-gray-500 italic">${compra.detalles_compra || 'Sin detalles'}</p>`;
            }

            const proveedorStr = compra.proveedor ? `<h3 class="font-bold text-gray-900 border-b pb-2 mb-3 px-1 flex items-center justify-between"><span>🏭 ${compra.proveedor}</span></h3>` : '<h3 class="font-bold text-gray-400 italic border-b pb-2 mb-3">Proveedor Desconocido</h3>';

            const btnFotoComprobante = compra.foto_url 
                ? `<a href="${compra.foto_url}" target="_blank" class="w-full mt-3 flex items-center justify-center gap-2 text-[11px] text-orange-700 bg-orange-50 border border-orange-200 py-2 rounded-lg font-black hover:bg-orange-100 transition-colors uppercase tracking-tight shadow-sm">
                    <i class="fa-solid fa-file-invoice"></i> Ver Foto del Comprobante
                   </a>` 
                : '';

            tbody.innerHTML += `
                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col hover:shadow-md transition-shadow">
                    ${proveedorStr}
                    
                    <div class="flex justify-between items-start mb-4 px-1">
                        <div>
                            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Recibo</span>
                            <span class="font-bold text-stone-800 bg-gray-100 px-2 py-0.5 rounded text-[11px]">#${String(compra.id).padStart(5, '0')}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Total Pagado</span>
                            <span class="text-xl font-black text-orange-600 tracking-tight leading-none italic">Bs. ${Number(compra.total).toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div class="flex-1 bg-slate-50 border border-gray-100 rounded-xl p-3">
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2"><i class="fa-solid fa-list-check mr-1"></i> Artículos</p>
                        ${detallesHtml}
                    </div>
                    
                    ${btnFotoComprobante}
                    
                    <div class="mt-4 pt-3 border-t border-gray-50 flex justify-between items-center text-[11px] text-gray-400">
                        <span class="font-medium"><i class="fa-regular fa-calendar mr-1"></i> ${compra.fecha_compra}</span>
                        <span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase">Finalizado</span>
                    </div>
                </div>
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
        document.getElementById('inpUnidadCompra').value = opt.getAttribute('data-unidad');
    }
}

// --- VISTA PREVIA Y COMPRESIÓN DE LA FOTO ---
function previewImagenCompra(event, previewId) {
    const input = event.target;
    const preview = document.getElementById(previewId);
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.src = '';
        preview.classList.add('hidden');
    }
}

function comprimirImagen(file, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    }));
                }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// --- GUARDAR COMPRA RÁPIDA ---
async function ejecutarCompraRapida() {
    const proveedor_id = document.getElementById('selProveedor').value;
    const insumo_id = document.getElementById('selInsumo').value;
    const cantidad = parseFloat(document.getElementById('inpContenido').value) || 0;
    const costo = parseFloat(document.getElementById('inpCosto').value) || 0;
    const vencimiento = document.getElementById('inpVence').value || null;
    
    // Archivos de Factura
    const fFacturaG = document.getElementById('inpFacturaGaleria').files[0];
    const fFacturaC = document.getElementById('inpFacturaCamara').files[0];
    const fileFactura = fFacturaG || fFacturaC;

    // Archivos de Insumo
    const fInsumoG = document.getElementById('inpInsumoGaleria').files[0];
    const fInsumoC = document.getElementById('inpInsumoCamara').files[0];
    const fileInsumo = fInsumoG || fInsumoC;

    if (!proveedor_id) return alert("Selecciona un proveedor.");
    if (!insumo_id) return alert("Selecciona un insumo.");
    if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad mayor a 0.");

    const btn = document.getElementById('btnGuardarCompraRapida');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>';

    try {
        const formData = new FormData();
        
        const payloadData = {
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
        
        formData.append('datos', JSON.stringify(payloadData));
        
        if (fileFactura) {
            const imgComp = await comprimirImagen(fileFactura);
            formData.append('foto_recibo', imgComp);
        }

        if (fileInsumo) {
            const imgComp = await comprimirImagen(fileInsumo);
            formData.append('foto_producto', imgComp);
        }

        const res = await fetch('/api/compras', {
            method: 'POST',
            body: formData
        });

        if(!res.ok) throw new Error((await res.json()).error);
        
        // Limpiar inputs
        document.getElementById('selInsumo').value = '';
        document.getElementById('inpContenido').value = '';
        document.getElementById('inpCosto').value = '0.00';
        document.getElementById('inpVence').value = '';
        document.getElementById('inpUnidadCompra').value = '';
        
        // Limpiar previas
        ['previewFotoFactura', 'previewFotoInsumo'].forEach(id => {
            document.getElementById(id).src = '';
            document.getElementById(id).classList.add('hidden');
        });
        ['inpFacturaGaleria', 'inpFacturaCamara', 'inpInsumoGaleria', 'inpInsumoCamara'].forEach(id => {
            document.getElementById(id).value = '';
        });

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