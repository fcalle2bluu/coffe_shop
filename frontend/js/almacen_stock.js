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
            ? `<img src="${insumo.imagen_url}" class="w-20 h-20 rounded-lg object-cover shadow-md border border-gray-300 cursor-pointer hover:scale-105 transition-transform" onclick="window.open('${insumo.imagen_url}', '_blank')">` 
            : `<div class="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-3xl border border-gray-200"><i class="fa-solid fa-image"></i></div>`;

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-2">${imgHtml}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${insumo.nombre}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-500">${insumo.unidad_medida}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm font-bold ${alerta ? 'text-red-600' : 'text-stone-800'} text-lg">${insumo.stock_actual}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-400">${insumo.stock_minimo}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold border ${badgeClase}">${badgeTexto}</span>
                </td>
                
                <td class="px-4 py-3 whitespace-nowrap text-center">
                    <div class="flex items-center justify-center space-x-2">
                        
                        <button onclick="eliminarInsumo(${insumo.id}, '${insumo.nombre}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors" title="Eliminar">
                            <i class="fa-solid fa-trash-can text-lg"></i>
                        </button>
                        
                        <div class="flex items-center justify-center shadow-sm rounded-md border border-gray-300 overflow-hidden">
                            <input type="number" id="qty-${insumo.id}" value="10" min="0.1" step="0.1" class="w-16 text-center text-sm py-1 outline-none bg-gray-50 font-bold">
                            <button onclick="aplicarAjusteRapido(${insumo.id}, 'MERMA')" class="bg-gray-200 hover:bg-red-500 hover:text-white text-gray-600 px-2 py-1 transition-colors border-l" title="Restar">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <button onclick="aplicarAjusteRapido(${insumo.id}, 'AJUSTE')" class="bg-gray-200 hover:bg-green-500 hover:text-white text-gray-600 px-2 py-1 transition-colors border-l" title="Sumar">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
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

async function guardarInsumoRapido() {
    const nombre = document.getElementById('inpRapidoNombre').value.trim();
    const unidad = document.getElementById('inpRapidoUnidad').value.trim();
    const min = document.getElementById('inpRapidoMin') ? parseFloat(document.getElementById('inpRapidoMin').value) : 10;
    
    // Puede venir del input Galería o del input Cámara
    const fileGallery = document.getElementById('inpRapidoFoto');
    const fileCamera = document.getElementById('inpRapidoCamara');
    const foto = (fileGallery.files && fileGallery.files[0]) ? fileGallery.files[0] : 
                 (fileCamera.files && fileCamera.files[0]) ? fileCamera.files[0] : null;

    if (!nombre) return alert('Por favor, ingresa el nombre del insumo');
    if (!unidad) return alert('Por favor, ingresa la unidad de medida');

    const btn = document.getElementById('btnGuardarRapido');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>'; }

    try {
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
            if (archivoInput) archivoInput.value = '';
            
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