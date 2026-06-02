// frontend/js/proveedores.js

let todosLosProveedores = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarListaProveedores();
});

// 1. Cargar y renderizar la lista de proveedores
async function cargarListaProveedores() {
    try {
        const res = await fetch('/api/proveedores');
        if (!res.ok) throw new Error("Error al obtener los proveedores");
        todosLosProveedores = await res.json();
        
        renderizarProveedores(todosLosProveedores);
    } catch (error) {
        console.error("Error al cargar proveedores:", error);
        const cont = document.getElementById('contenedor-proveedores');
        cont.innerHTML = `
            <div class="col-span-full text-center py-10 bg-red-50 text-red-600 rounded-xl border border-red-100">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
                <p class="font-bold">Error de conexión: No se pudieron cargar los proveedores.</p>
            </div>
        `;
    }
}

// 2. Renderizar los proveedores en el contenedor
function renderizarProveedores(lista) {
    const cont = document.getElementById('contenedor-proveedores');
    cont.innerHTML = '';
    
    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="col-span-full text-center py-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                <i class="fa-solid fa-truck-loading text-4xl text-slate-300 mb-3"></i>
                <p class="text-slate-400 font-bold">No se encontraron proveedores registrados.</p>
            </div>
        `;
        return;
    }
    
    lista.forEach(p => {
        const telefonoHtml = p.telefono 
            ? `<a href="tel:${p.telefono}" class="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-orange-500 transition-colors"><i class="fa-solid fa-phone text-orange-500/80 w-4"></i> ${p.telefono}</a>` 
            : `<span class="flex items-center gap-2 text-xs font-medium text-slate-400 italic"><i class="fa-solid fa-phone text-slate-300 w-4"></i> Sin teléfono</span>`;
            
        const lugarHtml = p.lugar || p.direccion
            ? `<p class="flex items-start gap-2 text-xs font-semibold text-slate-600"><i class="fa-solid fa-location-dot text-orange-500/80 w-4 mt-0.5"></i> <span>${p.lugar || p.direccion}</span></p>`
            : `<p class="flex items-center gap-2 text-xs font-medium text-slate-400 italic"><i class="fa-solid fa-location-dot text-slate-300 w-4"></i> Sin ubicación</p>`;
            
        const otrosHtml = p.otros || p.email
            ? `<div class="bg-slate-50 border border-slate-100 rounded-xl p-3 mt-3"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1"><i class="fa-solid fa-sticky-note mr-1"></i> Notas / Adicionales</p><p class="text-xs text-slate-600 font-medium leading-relaxed">${p.otros || p.email}</p></div>`
            : '';
            
        cont.innerHTML += `
            <div class="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-orange-500/20 transition-all duration-300 flex flex-col justify-between relative group">
                <button onclick="eliminarProveedor(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')" class="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg hover:bg-red-50" title="Eliminar Proveedor">
                    <i class="fa-solid fa-trash-can text-sm"></i>
                </button>
                
                <div>
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center font-bold text-base shadow-inner-soft">
                            <i class="fa-solid fa-truck"></i>
                        </div>
                        <h3 class="font-bold text-slate-800 text-sm leading-snug pr-6 truncate" title="${p.nombre}">${p.nombre}</h3>
                    </div>
                    
                    <div class="space-y-2 mb-2">
                        ${telefonoHtml}
                        ${lugarHtml}
                    </div>
                </div>
                
                ${otrosHtml}
            </div>
        `;
    });
}

// 3. Crear un nuevo proveedor
async function crearProveedor() {
    const nombre = document.getElementById('provNombre').value.trim();
    const telefono = document.getElementById('provTel').value.trim();
    const lugar = document.getElementById('provLugar').value.trim();
    const otros = document.getElementById('provOtros').value.trim();
    
    if (!nombre) {
        return alert("⚠️ El nombre del proveedor es obligatorio.");
    }
    
    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';
    
    try {
        const res = await fetch('/api/proveedores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, telefono, lugar, otros })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al crear el proveedor");
        
        // Limpiar formulario
        document.getElementById('provNombre').value = '';
        document.getElementById('provTel').value = '';
        document.getElementById('provLugar').value = '';
        document.getElementById('provOtros').value = '';
        
        cargarListaProveedores();
    } catch (error) {
        alert("🚨 Error: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plus"></i> Guardar Proveedor';
    }
}

// 4. Eliminar un proveedor
async function eliminarProveedor(id, nombre) {
    if (!confirm(`¿Estás seguro de que deseas eliminar al proveedor "${nombre}"?\nEsta acción no se puede deshacer.`)) {
        return;
    }
    
    try {
        const res = await fetch(`/api/proveedores/${id}`, {
            method: 'DELETE'
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al eliminar el proveedor");
        
        cargarListaProveedores();
    } catch (error) {
        alert(error.message);
    }
}

// 5. Filtrar proveedores dinámicamente en tiempo real
function filtrarProveedores() {
    const query = document.getElementById('busquedaProv').value.toLowerCase().trim();
    
    if (!query) {
        renderizarProveedores(todosLosProveedores);
        return;
    }
    
    const filtrados = todosLosProveedores.filter(p => {
        const nombre = (p.nombre || '').toLowerCase();
        const telefono = (p.telefono || '').toLowerCase();
        const lugar = (p.lugar || p.direccion || '').toLowerCase();
        const otros = (p.otros || p.email || '').toLowerCase();
        
        return nombre.includes(query) || telefono.includes(query) || lugar.includes(query) || otros.includes(query);
    });
    
    renderizarProveedores(filtrados);
}
