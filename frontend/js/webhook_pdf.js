// frontend/js/webhook_pdf.js

let catalogProductosPDF = []; // Catálogo global para filtros y manejo

// Función global para alternar entre pestañas
window.switchTab = function(tab) {
    const tabWebhook = document.getElementById('tab-webhook');
    const tabPdfMenu = document.getElementById('tab-pdf-menu');
    const tabChat = document.getElementById('tab-chat');
    const panelWebhook = document.getElementById('panel-webhook');
    const panelPdfMenu = document.getElementById('panel-pdf-menu');
    const panelChat = document.getElementById('panel-chat');
    
    if (!tabWebhook || !tabPdfMenu || !tabChat || !panelWebhook || !panelPdfMenu || !panelChat) return;

    // Clases base desactivadas
    const inactiveClass = "flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-slate-400 hover:text-slate-600 font-bold text-sm transition-all focus:outline-none";
    const activeClass = "flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-orange-500 text-white font-bold text-sm transition-all focus:outline-none";

    tabWebhook.className = inactiveClass;
    tabPdfMenu.className = inactiveClass;
    tabChat.className = inactiveClass;
    
    panelWebhook.classList.add('hidden');
    panelPdfMenu.classList.add('hidden');
    panelChat.classList.add('hidden');

    if (tab === 'webhook') {
        tabWebhook.className = activeClass;
        panelWebhook.classList.remove('hidden');
        if (window.detenerRecargaChat) window.detenerRecargaChat();
    } else if (tab === 'pdf-menu') {
        tabPdfMenu.className = activeClass;
        panelPdfMenu.classList.remove('hidden');
        if (window.detenerRecargaChat) window.detenerRecargaChat();
        cargarConfiguracionPDF();
    } else if (tab === 'chat') {
        tabChat.className = activeClass;
        panelChat.classList.remove('hidden');
        if (window.iniciarChatConsole) window.iniciarChatConsole();
    }
};

// Cargar catálogo de productos y su configuración de menú PDF
window.cargarConfiguracionPDF = async function() {
    const container = document.getElementById('categorias-pdf-container');
    if (!container) return;

    try {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <i class="fa-solid fa-spinner fa-spin text-2xl text-orange-500 mb-2 block"></i>
                Obteniendo configuración del catálogo...
            </div>
        `;

        const res = await fetch('/api/menu-pdf/productos');
        if (!res.ok) throw new Error('Error al cargar datos del catálogo.');
        
        catalogProductosPDF = await res.json();
        renderCatProductosPDF();
    } catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="text-center py-12 text-rose-500 font-bold">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2 block"></i>
                ${error.message || 'No se pudo conectar con el servidor.'}
                <button onclick="cargarConfiguracionPDF()" class="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-xs block mx-auto">Reintentar</button>
            </div>
        `;
    }
};

// Renderizar dinámicamente las categorías y sus productos
function renderCatProductosPDF() {
    const container = document.getElementById('categorias-pdf-container');
    if (!container) return;

    if (catalogProductosPDF.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400 italic">
                <i class="fa-solid fa-folder-open text-2xl mb-2 block"></i>
                No se encontraron productos activos en el catálogo.
            </div>
        `;
        return;
    }

    // Agrupar productos por categoría
    const grupos = {};
    catalogProductosPDF.forEach(prod => {
        const cat = prod.categoria_nombre || 'Sin Categoría';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(prod);
    });

    container.innerHTML = '';

    // Generar la interfaz por categoría
    Object.keys(grupos).sort().forEach(catName => {
        const prods = grupos[catName];
        const categoryId = catName.replace(/[^a-zA-Z0-9]/g, '_');

        const catSection = document.createElement('section');
        catSection.className = 'bg-white rounded-xl shadow-premium border border-slate-100 overflow-hidden category-pdf-block';
        catSection.dataset.category = catName.toLowerCase();
        catSection.id = `cat-block-${categoryId}`;

        // Header de la categoría con botones rápidos
        catSection.innerHTML = `
            <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <i class="fa-solid fa-folder-open text-orange-500"></i> ${catName}
                </h3>
                <div class="flex items-center gap-2">
                    <button onclick="seleccionarCategoria('${categoryId}', true)" class="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold tracking-wider uppercase">Marcar Categoría</button>
                    <span class="text-slate-300">|</span>
                    <button onclick="seleccionarCategoria('${categoryId}', false)" class="text-[10px] text-slate-400 hover:text-slate-600 font-bold tracking-wider uppercase">Desmarcar</button>
                </div>
            </div>
            <div class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="grid-${categoryId}">
                <!-- Aquí entran los productos -->
            </div>
        `;

        container.appendChild(catSection);

        const grid = document.getElementById(`grid-${categoryId}`);
        prods.forEach(prod => {
            const prodCard = document.createElement('div');
            prodCard.className = 'flex items-center gap-4 p-4 border border-slate-100 rounded-xl hover:shadow-md transition-all product-pdf-card';
            prodCard.dataset.name = prod.nombre.toLowerCase();

            // Miniatura de la imagen
            const imgHtml = prod.imagen_url 
                ? `<img src="${prod.imagen_url}" class="w-12 h-12 object-cover rounded-lg border border-slate-200" alt="Foto">`
                : `<div class="w-12 h-12 rounded-lg bg-orange-50 text-orange-600 font-black text-sm flex items-center justify-center border border-orange-100">${prod.nombre.slice(0,2).toUpperCase()}</div>`;

            prodCard.innerHTML = `
                <div class="shrink-0 flex items-center">
                    <input type="checkbox" id="chk-pdf-${prod.id}" data-prod-id="${prod.id}" ${prod.incluido ? 'checked' : ''} class="w-4.5 h-4.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer chk-product-select">
                </div>
                ${imgHtml}
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-slate-800 truncate mb-0.5">${prod.nombre}</p>
                    <span class="inline-block px-2 py-0.5 bg-orange-50 text-[10px] font-bold text-orange-700 rounded-md">Bs. ${parseFloat(prod.precio_venta).toFixed(2)}</span>
                </div>
                <div class="w-16 shrink-0">
                    <label class="block text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Orden</label>
                    <input type="number" id="ord-pdf-${prod.id}" data-prod-id="${prod.id}" min="0" value="${prod.orden}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center font-bold text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none ord-product-value">
                </div>
            `;
            grid.appendChild(prodCard);
        });
    });
}

// Guardar los cambios de configuración del PDF
window.guardarConfiguracionPDF = async function() {
    const btn = document.getElementById('btnGuardarPDFConfig');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Guardando...';
    btn.disabled = true;

    // Recolectar datos de los checkboxes y los inputs de orden
    const productos = [];
    const checkboxes = document.querySelectorAll('.chk-product-select');
    checkboxes.forEach(chk => {
        const id = parseInt(chk.dataset.prodId);
        const incluido = chk.checked;
        const inputOrden = document.getElementById(`ord-pdf-${id}`);
        const orden = inputOrden ? parseInt(inputOrden.value) || 0 : 0;
        
        productos.push({
            producto_id: id,
            incluido: incluido,
            orden: orden
        });
    });

    try {
        const res = await fetch('/api/menu-pdf/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productos })
        });

        if (!res.ok) throw new Error('Error al guardar configuración.');
        alert('✅ ¡Configuración del PDF guardada exitosamente!');
        
        // Recargar para sincronizar
        cargarConfiguracionPDF();
    } catch (error) {
        console.error(error);
        alert('❌ Ocurrió un error al guardar: ' + error.message);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};

// Seleccionar/Deseleccionar todos los productos de una categoría específica
window.seleccionarCategoria = function(categoryId, state) {
    const grid = document.getElementById(`grid-${categoryId}`);
    if (!grid) return;
    const checkboxes = grid.querySelectorAll('.chk-product-select');
    checkboxes.forEach(chk => chk.checked = state);
};

// Seleccionar/Deseleccionar todos los productos de todo el catálogo
window.seleccionarTodosGeneral = function(state) {
    const checkboxes = document.querySelectorAll('.chk-product-select');
    checkboxes.forEach(chk => chk.checked = state);
};

// Filtrar productos y categorías de forma reactiva local al escribir en el buscador
window.filtrarProductosPDF = function() {
    const query = document.getElementById('busqueda-productos-pdf').value.toLowerCase().trim();
    const categoriesBlocks = document.querySelectorAll('.category-pdf-block');

    categoriesBlocks.forEach(catBlock => {
        const catName = catBlock.dataset.category;
        const cards = catBlock.querySelectorAll('.product-pdf-card');
        let catHasVisibleProducts = false;

        cards.forEach(card => {
            const prodName = card.dataset.name;
            // Coincide si el texto buscado está en el nombre del producto o en la categoría
            if (prodName.includes(query) || catName.includes(query)) {
                card.classList.remove('hidden');
                catHasVisibleProducts = true;
            } else {
                card.classList.add('hidden');
            }
        });

        // Ocultar bloque completo de categoría si no contiene ningún producto coincidente
        if (catHasVisibleProducts) {
            catBlock.classList.remove('hidden');
        } else {
            catBlock.classList.add('hidden');
        }
    });
};
