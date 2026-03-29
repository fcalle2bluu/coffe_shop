// frontend/js/almacen_stock.js
let insumosGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarInsumos();
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase();
        const filtrados = insumosGlobal.filter(i => i.nombre.toLowerCase().includes(busqueda));
        renderizarTabla(filtrados);
    });
    actualizarResumen(); // Iniciar UI del modal
});

// --- LÓGICA DE UI DEL MODAL ---
function toggleModoIngreso() {
    const modo = document.querySelector('input[name="modoIngreso"]:checked').value;
    if (modo === 'directo') {
        document.getElementById('divIngresoDirecto').classList.remove('hidden');
        document.getElementById('divIngresoDirecto').classList.add('flex');
        document.getElementById('divCalculadora').classList.add('hidden');
    } else {
        document.getElementById('divIngresoDirecto').classList.add('hidden');
        document.getElementById('divIngresoDirecto').classList.remove('flex');
        document.getElementById('divCalculadora').classList.remove('hidden');
    }
    actualizarResumen();
}

function sincronizarUnidades(desdeCalculadora = false) {
    const unidad = desdeCalculadora 
        ? document.getElementById('selectUnidadCalc').value 
        : document.getElementById('selectUnidadDir').value;
    
    document.getElementById('selectUnidadDir').value = unidad;
    document.getElementById('selectUnidadCalc').value = unidad;
    document.getElementById('lblUnidad').innerText = unidad;
    document.getElementById('lblMinimoUnidad').innerText = unidad;
}

function actualizarResumen() {
    const modo = document.querySelector('input[name="modoIngreso"]:checked').value;
    let totalLimpio = 0;

    if (modo === 'directo') {
        totalLimpio = parseFloat(document.getElementById('inputCantDirecta').value) || 0;
    } else {
        const cantidad = parseFloat(document.getElementById('cantEmpaques').value) || 0;
        const contenido = parseFloat(document.getElementById('contenidoPorEmpaque').value) || 0;
        totalLimpio = parseFloat((cantidad * contenido).toFixed(2));
    }

    document.getElementById('totalCalculado').innerText = totalLimpio;
    return totalLimpio;
}

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

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${insumo.nombre}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-500">${insumo.unidad_medida}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm font-bold ${alerta ? 'text-red-600' : 'text-[#4E342E]'} text-lg">${insumo.stock_actual}</td>
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

// NUEVA FUNCIÓN PARA ELIMINAR
async function eliminarInsumo(id, nombre) {
    const confirmar = confirm(`¿Estás seguro que deseas eliminar "${nombre}" del almacén? Esta acción lo ocultará permanentemente.`);
    if(!confirmar) return;

    try {
        const respuesta = await fetch(`/api/almacen/${id}`, {
            method: 'DELETE'
        });
        if (!respuesta.ok) throw new Error('No se pudo eliminar');
        cargarInsumos(); // Recargamos la tabla automáticamente
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function abrirModal() {
    document.getElementById('modalInsumo').classList.remove('hidden');
    actualizarResumen();
}

function cerrarModal() {
    document.getElementById('modalInsumo').classList.add('hidden');
    document.getElementById('formInsumo').reset();
    toggleModoIngreso();
}

async function guardarNuevoInsumo(e) {
    e.preventDefault(); 
    
    const data = {
        nombre: document.getElementById('inputNombre').value,
        unidad_medida: document.getElementById('selectUnidadDir').value, // Ambos selectores tienen lo mismo gracias a la sincronización
        stock_inicial: actualizarResumen(), 
        stock_minimo: document.getElementById('inputMinimo').value
    };

    try {
        const respuesta = await fetch('/api/almacen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!respuesta.ok) throw new Error((await respuesta.json()).error);
        cerrarModal();
        cargarInsumos(); 
    } catch (error) {
        alert('Error al crear: ' + error.message);
    }
}