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
            const detalles = compra.detalles_compra || 'Sin detalles';
            const proveedorStr = compra.proveedor ? `<h3 class="font-bold text-gray-900 border-b pb-1 mb-2">🏭 ${compra.proveedor}</h3>` : '<h3 class="font-bold text-gray-400 italic border-b pb-1 mb-2">Desconocido</h3>';

            const btnFoto = compra.foto_url 
                ? `<a href="${compra.foto_url}" target="_blank" class="mt-2 text-[10px] text-blue-600 font-bold hover:underline border border-blue-200 bg-blue-50 px-2 py-1 rounded inline-block"><i class="fa-solid fa-image"></i> Ver Recibo</a>` 
                : '';

            tbody.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col hover:shadow-md transition-shadow">
                    ${proveedorStr}
                    
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Recibo</span>
                            <span class="font-bold text-stone-800 bg-gray-100 px-2 py-1 rounded text-xs">#COM-${String(compra.id).padStart(5, '0')}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Inversión</span>
                            <span class="text-xl font-black text-orange-600 tracking-tight">Bs. ${Number(compra.total).toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div class="bg-slate-50 border border-gray-100 rounded p-2 text-sm text-gray-600 italic">
                        <i class="fa-solid fa-box-open text-orange-400 mr-2"></i>${detalles}
                        <br>
                        ${btnFoto}
                    </div>
                    
                    <div class="mt-3 text-right">
                        <span class="text-xs text-gray-500 font-medium"><i class="fa-regular fa-calendar mr-1"></i>${compra.fecha_compra}</span>
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
function previewImagenCompra(event) {
    const input = event.target;
    const preview = document.getElementById('previewFotoCompra');
    
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
    
    // Obtener archivo (galeria o camara)
    const fileGaleria = document.getElementById('inpFotoCompraGaleria').files[0];
    const fileCamara = document.getElementById('inpFotoCompraCamara').files[0];
    const archivoInput = fileGaleria || fileCamara;

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
        
        if (archivoInput) {
            if (archivoInput.size > 20 * 1024 * 1024) throw new Error("Aviso de Sistema: La foto pesa más de 20MB, demasiada memoria.");
            const imagenComprimida = await comprimirImagen(archivoInput);
            formData.append('foto', imagenComprimida);
        }

        const res = await fetch('/api/compras', {
            method: 'POST',
            body: formData
        });

        if(!res.ok) throw new Error((await res.json()).error);
        
        // Limpiar inputs pero mantener proveedor
        document.getElementById('selInsumo').value = '';
        document.getElementById('inpContenido').value = '';
        document.getElementById('inpCosto').value = '0.00';
        document.getElementById('inpVence').value = '';
        document.getElementById('inpUnidadCompra').value = '';
        
        document.getElementById('previewFotoCompra').src = '';
        document.getElementById('previewFotoCompra').classList.add('hidden');
        document.getElementById('inpFotoCompraGaleria').value = '';
        document.getElementById('inpFotoCompraCamara').value = '';

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