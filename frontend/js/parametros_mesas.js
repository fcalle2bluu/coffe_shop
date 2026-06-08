// frontend/js/parametros_mesas.js

let mesasLienzo = [];
let pisoActualLienzo = 'PLANTA_BAJA';

// Cargar mesas al inicializar
window.addEventListener('DOMContentLoaded', () => {
    // Solo inicializar si estamos en la vista de parámetros
    if (document.getElementById('lienzo-mesas')) {
        cargarMesasLienzo();
    }
});

// Obtener todas las mesas del backend
async function cargarMesasLienzo() {
    try {
        const res = await fetch('/api/mesas');
        if (res.ok) {
            mesasLienzo = await res.json();
            renderizarMesasLienzo();
        } else {
            console.error('Error al cargar mesas de la API.');
        }
    } catch (e) {
        console.error('Error de red al cargar mesas:', e);
    }
}

// Cambiar de piso en el lienzo de diseño
function cambiarPisoLienzo(piso) {
    pisoActualLienzo = piso;
    
    const btnPb = document.getElementById('btn-lienzo-pb');
    const btnPa = document.getElementById('btn-lienzo-pa');
    
    if (piso === 'PLANTA_BAJA') {
        btnPb.className = "px-6 py-3 border-b-2 border-indigo-600 text-indigo-600 font-bold text-sm transition-all focus:outline-none";
        btnPa.className = "px-6 py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-600 font-bold text-sm transition-all focus:outline-none";
    } else {
        btnPb.className = "px-6 py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-600 font-bold text-sm transition-all focus:outline-none";
        btnPa.className = "px-6 py-3 border-b-2 border-indigo-600 text-indigo-600 font-bold text-sm transition-all focus:outline-none";
    }
    
    renderizarMesasLienzo();
}

// Dibujar las mesas en el lienzo
function renderizarMesasLienzo() {
    const lienzo = document.getElementById('lienzo-mesas');
    if (!lienzo) return;
    
    lienzo.innerHTML = '';
    
    // Filtrar mesas por piso activo
    const mesasFiltradas = mesasLienzo.filter(m => m.piso === pisoActualLienzo && m.activo);
    
    if (mesasFiltradas.length === 0) {
        lienzo.innerHTML = `
            <div class="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-xs">
                No hay mesas en este piso. Haz clic en "Añadir Mesa" para agregar una.
            </div>
        `;
        return;
    }
    
    mesasFiltradas.forEach(m => {
        const mesaEl = document.createElement('div');
        mesaEl.className = "absolute cursor-move w-16 h-16 rounded-full flex flex-col items-center justify-center font-bold text-white shadow-xl select-none group transition-shadow hover:shadow-indigo-500/30 touch-none";
        mesaEl.style.left = `${m.pos_x}%`;
        mesaEl.style.top = `${m.pos_y}%`;
        mesaEl.style.transform = "translate(-50%, -50%)";
        mesaEl.style.background = "#1e293b";
        mesaEl.style.border = "3px solid #6366f1";
        mesaEl.setAttribute('data-id', m.id);
        
        mesaEl.innerHTML = `
            <span class="text-[9px] uppercase tracking-wider opacity-60">Mesa</span>
            <span class="text-sm font-black">${m.numero}</span>
            <button class="absolute -top-1 -right-1 bg-indigo-600 hover:bg-indigo-700 rounded-full w-5 h-5 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto" onclick="event.stopPropagation(); abrirModalEditarMesa(${m.id})">
                <i class="fa-solid fa-pencil text-white"></i>
            </button>
        `;
        
        // Habilitar Drag & Drop usando Pointer Events (soporta Mouse y Touch al mismo tiempo)
        habilitarArrastre(mesaEl, m.id);
        
        lienzo.appendChild(mesaEl);
    });
}

// Lógica de arrastre
function habilitarArrastre(elemento, id) {
    elemento.addEventListener('pointerdown', (e) => {
        // Ignorar si se hace clic en el botón de edición
        if (e.target.closest('button')) return;
        
        e.preventDefault();
        elemento.setPointerCapture(e.pointerId);
        elemento.classList.add('scale-105', 'z-50');
        elemento.style.borderColor = '#f97316'; // color naranja al arrastrar

        const lienzo = document.getElementById('contenedor-lienzo');
        
        const onPointerMove = (moveEv) => {
            const rect = lienzo.getBoundingClientRect();
            
            // Calcular posición relativa en porcentaje
            let x = ((moveEv.clientX - rect.left) / rect.width) * 100;
            let y = ((moveEv.clientY - rect.top) / rect.height) * 100;
            
            // Limitar dentro del lienzo (0% a 100%)
            x = Math.max(5, Math.min(95, x));
            y = Math.max(5, Math.min(95, y));
            
            elemento.style.left = `${x}%`;
            elemento.style.top = `${y}%`;
        };
        
        const onPointerUp = async (upEv) => {
            elemento.releasePointerCapture(upEv.pointerId);
            elemento.classList.remove('scale-105', 'z-50');
            elemento.style.borderColor = '#6366f1';
            
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            
            // Obtener coordenadas finales del elemento
            const finalX = parseFloat(elemento.style.left);
            const finalY = parseFloat(elemento.style.top);
            
            // Actualizar localmente
            const idx = mesasLienzo.findIndex(m => m.id === id);
            if (idx !== -1) {
                mesasLienzo[idx].pos_x = finalX;
                mesasLienzo[idx].pos_y = finalY;
            }
            
            // Guardar en backend
            try {
                await fetch(`/api/mesas/${id}/posicion`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pos_x: finalX, pos_y: finalY })
                });
            } catch (error) {
                console.error('Error al guardar posición de mesa:', error);
            }
        };
        
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });
}

// Modal Nueva Mesa
function abrirModalNuevaMesa() {
    document.getElementById('tituloModalMesa').innerText = 'Nueva Mesa';
    document.getElementById('modalMesaId').value = '';
    document.getElementById('modalMesaNumero').value = '';
    document.getElementById('modalMesaPiso').value = pisoActualLienzo;
    document.getElementById('btnEliminarMesaContainer').classList.add('hidden');
    
    document.getElementById('modalMesaConfig').classList.remove('hidden');
}

// Modal Editar Mesa
function abrirModalEditarMesa(id) {
    const m = mesasLienzo.find(item => item.id === id);
    if (!m) return;
    
    document.getElementById('tituloModalMesa').innerText = 'Editar Mesa';
    document.getElementById('modalMesaId').value = m.id;
    document.getElementById('modalMesaNumero').value = m.numero;
    document.getElementById('modalMesaPiso').value = m.piso;
    document.getElementById('btnEliminarMesaContainer').classList.remove('hidden');
    
    document.getElementById('modalMesaConfig').classList.remove('hidden');
}

function cerrarModalMesaConfig() {
    document.getElementById('modalMesaConfig').classList.add('hidden');
}

// Crear o Actualizar Mesa
async function guardarMesaConfig() {
    const id = document.getElementById('modalMesaId').value;
    const numero = document.getElementById('modalMesaNumero').value.trim();
    const piso = document.getElementById('modalMesaPiso').value;
    
    if (!numero) {
        alert('Por favor ingrese el identificador de la mesa (Ej: 11, VIP-B).');
        return;
    }
    
    const body = { numero, piso };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/mesas/${id}` : '/api/mesas';
    
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (res.ok) {
            cerrarModalMesaConfig();
            await cargarMesasLienzo();
            cambiarPisoLienzo(piso); // ir al piso donde se guardó la mesa
        } else {
            const data = await res.json();
            alert(`Error: ${data.error || 'No se pudo guardar la configuración.'}`);
        }
    } catch (e) {
        console.error('Error al guardar configuración de mesa:', e);
        alert('Error de red al guardar.');
    }
}

// Desactivar Mesa
async function eliminarMesaConfig() {
    const id = document.getElementById('modalMesaId').value;
    if (!id) return;
    
    if (!confirm('¿Está seguro de desactivar esta mesa? Esto la removerá del plano de ventas.')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/mesas/${id}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            cerrarModalMesaConfig();
            await cargarMesasLienzo();
        } else {
            const data = await res.json();
            alert(`Error: ${data.error || 'No se pudo desactivar la mesa.'}`);
        }
    } catch (e) {
        console.error('Error al eliminar mesa:', e);
        alert('Error de red al eliminar.');
    }
}
