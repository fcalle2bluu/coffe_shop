// frontend/js/almacen.js
let insumosGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarInsumos();
    cargarMovimientos(); 

    // Filtro de búsqueda
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase();
        const filtrados = insumosGlobal.filter(i => i.nombre.toLowerCase().includes(busqueda));
        renderizarTabla(filtrados);
    });

    // Listeners para la "Calculadora de Ingreso"
    const inputsCalculo = ['cantEmpaques', 'contenidoPorEmpaque', 'selectUnidad'];
    inputsCalculo.forEach(id => {
        document.getElementById(id).addEventListener('input', calcularTotalIngreso);
    });
    // Forzar un cálculo inicial
    calcularTotalIngreso();
});

// --- LOGICA DE LA CALCULADORA VISUAL ---
function calcularTotalIngreso() {
    const cantidad = parseFloat(document.getElementById('cantEmpaques').value) || 0;
    const contenido = parseFloat(document.getElementById('contenidoPorEmpaque').value) || 0;
    const unidad = document.getElementById('selectUnidad').value;
    
    // Multiplicación (Ej: 3 bolsas x 1000 ml = 3000)
    const totalReal = (cantidad * contenido).toFixed(2);
    
    // Quitar ceros innecesarios (ej. 3000.00 -> 3000)
    const totalLimpio = parseFloat(totalReal); 
    
    // Actualizar etiquetas en la pantalla
    document.getElementById('totalCalculado').innerText = totalLimpio;
    document.getElementById('lblUnidad').innerText = unidad;
    document.getElementById('lblMinimoUnidad').innerText = unidad;

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

async function cargarMovimientos() {
    try {
        const respuesta = await fetch('/api/almacen/movimientos');
        if (!respuesta.ok) throw new Error('Error al cargar historial');
        const movimientos = await respuesta.json();
        renderizarHistorial(movimientos);
    } catch (error) {
        console.error("Error cargando historial:", error);
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
                    <div class="flex items-center justify-center shadow-sm rounded-md w-max mx-auto border border-gray-300 overflow-hidden">
                        <input type="number" id="qty-${insumo.id}" value="100" min="0.1" step="0.1" class="w-20 text-center text-sm py-1 outline-none bg-gray-50 text-gray-800 font-bold">
                        <button onclick="aplicarAjusteRapido(${insumo.id}, 'MERMA')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 transition-colors border-l border-red-600" title="Restar (Merma)">
                            <i class="fa-solid fa-minus"></i>
                        </button>
                        <button onclick="aplicarAjusteRapido(${insumo.id}, 'AJUSTE')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 transition-colors border-l border-green-600" title="Sumar (Ingreso)">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderizarHistorial(movimientos) {
    const tbody = document.getElementById('tabla-movimientos');
    tbody.innerHTML = '';

    movimientos.forEach(mov => {
        const esMerma = mov.tipo === 'MERMA';
        const colorBadge = esMerma ? 'bg-red-100 text-red-800 border-red-200' : 'bg-blue-100 text-blue-800 border-blue-200';
        const colorCantidad = esMerma ? 'text-red-600' : 'text-green-600';
        const signo = esMerma ? '-' : '+';

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500"><i class="fa-regular fa-calendar mr-2"></i>${mov.fecha_hora}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${mov.insumo}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center text-sm">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold border ${colorBadge}">${mov.tipo}</span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-bold ${colorCantidad}">${signo} ${mov.cantidad}</td>
            </tr>
        `;
    });
}

// --- AJUSTES RÁPIDOS ---
async function aplicarAjusteRapido(id, tipo) {
    const cantidadInput = document.getElementById(`qty-${id}`).value;
    
    if(!cantidadInput || cantidadInput <= 0) {
        return alert("Ingresa una cantidad válida mayor a 0");
    }

    try {
        const respuesta = await fetch('/api/almacen/ajuste', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ insumo_id: id, tipo: tipo, cantidad: cantidadInput })
        });
        
        const resultado = await respuesta.json();
        if (!respuesta.ok) throw new Error(resultado.error);
        
        cargarInsumos();
        cargarMovimientos();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// --- MODALES Y GUARDADO ---
function abrirModal() {
    document.getElementById('modalInsumo').classList.remove('hidden');
    calcularTotalIngreso(); // Resetear cálculo visual
}

function cerrarModal() {
    document.getElementById('modalInsumo').classList.add('hidden');
    document.getElementById('formInsumo').reset();
}

async function guardarNuevoInsumo(e) {
    e.preventDefault(); 
    
    // Obtenemos el total calculado usando nuestra función matemática
    const totalRegistrarBase = calcularTotalIngreso();

    const data = {
        nombre: document.getElementById('inputNombre').value,
        unidad_medida: document.getElementById('selectUnidad').value,
        // Mandamos el total multiplicado, NO la cantidad de bolsas
        stock_inicial: totalRegistrarBase, 
        stock_minimo: document.getElementById('inputMinimo').value
    };

    try {
        const respuesta = await fetch('/api/almacen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const resultado = await respuesta.json();
        if (!respuesta.ok) throw new Error(resultado.error);
        
        cerrarModal();
        cargarInsumos(); 
        cargarMovimientos();
    } catch (error) {
        alert('Error al crear: ' + error.message);
    }
}