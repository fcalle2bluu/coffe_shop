// frontend/js/almacen_stock.js
let insumosGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarInsumos();
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase();
        const filtrados = insumosGlobal.filter(i => i.nombre.toLowerCase().includes(busqueda));
        renderizarTabla(filtrados);
    });
});

// --- CONEXIÓN AL BACKEND ---
async function cargarInsumos() {
    try {
        const respuesta = await fetch('/api/almacen/insumos');
        if (!respuesta.ok) throw new Error('Error en el servidor');
        insumosGlobal = await respuesta.json();
        renderizarTabla(insumosGlobal);
    } catch (error) {
        console.error("Error cargando insumos:", error);
    }
}

function renderizarTabla(insumos) {
    const tbody = document.getElementById('tabla-insumos');
    tbody.innerHTML = '';

    insumos.forEach(insumo => {
        const alerta = parseFloat(insumo.stock_actual) <= parseFloat(insumo.stock_minimo);
        const badgeClase = alerta ? 'bg-red-100 text-red-800 border-red-200' : 'bg-green-100 text-green-800 border-green-200';
        const badgeTexto = alerta ? '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Bajo Stock' : 'Normal';
        const imgHtml = insumo.imagen_url 
            ? `<img src="${insumo.imagen_url}" class="w-full h-40 object-cover cursor-pointer hover:scale-105 transition-transform" onclick="window.open('${insumo.imagen_url}', '_blank')">` 
            : `<div class="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-300 text-5xl"><i class="fa-solid fa-image"></i></div>`;

        tbody.innerHTML += `
            <div class="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
                <!-- Foto Grande -->
                <div class="relative w-full h-40 overflow-hidden shrink-0 bg-gray-50 border-b border-gray-100">
                    ${imgHtml}
                    <!-- Badge superpuesto -->
                    <div class="absolute top-2 right-2">
                        <span class="px-2 py-1 rounded-full text-[10px] font-black tracking-wide uppercase shadow-sm border bg-white ${alerta ? 'text-red-600 border-red-300' : 'text-green-600 border-green-300'}">
                            ${badgeTexto}
                        </span>
                    </div>
                </div>

                <!-- Info (2 líneas principales) -->
                <div class="p-4 flex-1 flex flex-col justify-between">
                    <div>
                        <h3 class="font-bold text-gray-900 text-lg leading-tight truncate mb-2" title="${insumo.nombre}">${insumo.nombre}</h3>
                        <div class="flex justify-between items-baseline mb-1">
                            <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Detalle</span>
                            <span class="text-2xl font-black tracking-tight ${alerta ? 'text-red-600' : 'text-stone-800'}">${insumo.stock_actual} <span class="text-sm text-gray-500 font-bold">${insumo.unidad_medida}</span></span>
                        </div>
                    </div>
                    
                    <!-- Acciones Inferiores -->
                    <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <button onclick="eliminarInsumo(${insumo.id}, '${insumo.nombre}')" class="text-gray-400 hover:text-red-500 hover:bg-red-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors" title="Eliminar Insumo">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                        
                        <div class="flex items-center rounded-lg border border-gray-300 overflow-hidden shadow-sm">
                            <button onclick="aplicarAjusteRapido(${insumo.id}, 'MERMA')" class="bg-gray-50 hover:bg-red-500 hover:text-white text-gray-600 w-9 h-8 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <input type="number" id="qty-${insumo.id}" value="10" min="0.1" step="0.1" class="w-14 text-center text-sm outline-none bg-white font-bold h-8 border-x border-gray-200">
                            <button onclick="aplicarAjusteRapido(${insumo.id}, 'AJUSTE')" class="bg-gray-50 hover:bg-green-500 hover:text-white text-gray-600 w-9 h-8 flex items-center justify-center transition-colors">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

// --- ACCIONES CRUD ---
async function aplicarAjusteRapido(id, tipo) {
    const cantidadInput = document.getElementById(`qty-${id}`).value;
    if(!cantidadInput || cantidadInput <= 0) return alert("Ingresa una cantidad válida mayor a 0");

    try {
        const respuesta = await fetch('/api/almacen/ajuste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ insumo_id: id, tipo: tipo, cantidad: cantidadInput })
        });
        if (!respuesta.ok) throw new Error((await respuesta.json()).error);
        cargarInsumos();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function eliminarInsumo(id, nombre) {
    const confirmar = confirm(`¿Estás seguro que deseas eliminar "${nombre}" del almacén? Esta acción lo ocultará permanentemente.`);
    if(!confirmar) return;

    try {
        const respuesta = await fetch(`/api/almacen/${id}`, {
            method: 'DELETE'
        });
        if (!respuesta.ok) throw new Error('No se pudo eliminar');
        cargarInsumos();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}
// --- VISTA PREVIA DE IMAGEN ---
function previewImagenRapida(event) {
    const input = event.target;
    const preview = document.getElementById('previewFoto');
    
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

// --- COMPRESIÓN DE IMAGEN ---
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
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

async function guardarInsumoRapido() {
    const nombre = document.getElementById('inpRapidoNombre').value.trim();
    const unidad = document.getElementById('inpRapidoUnidad').value.trim();
    const min = document.getElementById('inpRapidoMin') ? parseFloat(document.getElementById('inpRapidoMin').value) : 10;
    
    // Puede venir del input Galería o del input Cámara
    const fileGallery = document.getElementById('inpRapidoFoto');
    const fileCamera = document.getElementById('inpRapidoCamara');
    let foto = (fileGallery.files && fileGallery.files[0]) ? fileGallery.files[0] : 
                 (fileCamera.files && fileCamera.files[0]) ? fileCamera.files[0] : null;

    if (!nombre) return alert('Por favor, ingresa el nombre del insumo');
    if (!unidad) return alert('Por favor, ingresa la unidad de medida');

    const btn = document.getElementById('btnGuardarRapido');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Comprimiendo...'; }

    try {
        if (foto) {
            // ¡Magia aquí! Comprimimos la foto a un tamaño más pequeño (max 1024x1024) antes de enviarla
            foto = await comprimirImagen(foto, 1024, 1024, 0.7);
        }

        if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Subiendo...'; }

        const formData = new FormData();
        formData.append('nombre', nombre);
        formData.append('unidad_medida', unidad);
        formData.append('stock_inicial', 0);
        formData.append('stock_minimo', min);
        if (foto) {
            formData.append('imagen', foto);
        }

        const response = await fetch('/api/almacen', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('inpRapidoNombre').value = '';
            document.getElementById('inpRapidoUnidad').value = '';
            if (document.getElementById('inpRapidoMin')) document.getElementById('inpRapidoMin').value = '0';
            if (fileGallery) fileGallery.value = '';
            if (fileCamera) fileCamera.value = '';
            
            const preview = document.getElementById('previewFoto');
            if (preview) {
                preview.src = '';
                preview.classList.add('hidden');
            }
            
            cargarInsumos();
            
            if (data.advertencia) {
                alert('Insumo guardado, PERO:\n' + data.advertencia);
            }
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error conectando al servidor');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Crear'; }
    }
}