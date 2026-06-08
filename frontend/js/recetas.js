// frontend/js/recetas.js

let recetas = [];
let recetaSeleccionada = null;
let categoriaFiltro = 'TODOS';

// Al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
    cargarRecetas();
});

// Obtener todas las recetas del API
async function cargarRecetas() {
    try {
        const res = await fetch('/api/recetas');
        if (!res.ok) throw new Error('Error al obtener recetas');
        recetas = await res.json();
        
        actualizarKPIs();
        renderListaRecetas();
    } catch (err) {
        console.error('Error al cargar recetas:', err);
        document.getElementById('lista-recetas').innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p class="text-xs font-bold">Error al conectar con el servidor.</p>
            </div>
        `;
    }
}

// Calcular y actualizar indicadores superiores (KPIs)
function actualizarKPIs() {
    document.getElementById('kpi-total-recetas').innerText = recetas.length;
    
    // Contar por categorias
    const reposteriaCount = recetas.filter(r => r.categoria === 'PASTELERIA' || r.categoria === 'MASA SALADA').length;
    const coctelesCount = recetas.filter(r => r.categoria === 'BEBIDAS CON ALCOHOL').length;
    
    document.getElementById('kpi-reposteria').innerText = reposteriaCount;
    document.getElementById('kpi-cocteles').innerText = coctelesCount;

    // Insumos sin stock (insumos de recetas que tienen stock actual <= 0)
    // Para contar esto de forma aproximada, haremos un fetch de insumos en background
    fetch('/api/almacen/insumos')
        .then(res => res.json())
        .then(insumos => {
            const sinStock = insumos.filter(i => parseFloat(i.stock_actual) <= 0).length;
            document.getElementById('kpi-sin-stock').innerText = sinStock;
        })
        .catch(() => {
            document.getElementById('kpi-sin-stock').innerText = '0';
        });
}

// Renderizar la lista de recetas filtradas en la columna izquierda
function renderListaRecetas() {
    const contenedor = document.getElementById('lista-recetas');
    const busqueda = document.getElementById('buscar-receta').value.toLowerCase();

    // Filtrar recetas por categoría y búsqueda
    let filtradas = recetas;

    if (categoriaFiltro !== 'TODOS') {
        if (categoriaFiltro === 'OTROS') {
            // Cualquier categoría que no sea PASTELERIA ni BEBIDAS CON ALCOHOL
            filtradas = recetas.filter(r => r.categoria !== 'PASTELERIA' && r.categoria !== 'MASA SALADA' && r.categoria !== 'BEBIDAS CON ALCOHOL');
        } else if (categoriaFiltro === 'PASTELERIA') {
            filtradas = recetas.filter(r => r.categoria === 'PASTELERIA' || r.categoria === 'MASA SALADA');
        } else {
            filtradas = recetas.filter(r => r.categoria === categoriaFiltro);
        }
    }

    if (busqueda) {
        filtradas = filtradas.filter(r => 
            r.nombre.toLowerCase().includes(busqueda) || 
            (r.preparacion && r.preparacion.toLowerCase().includes(busqueda))
        );
    }

    if (filtradas.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <i class="fa-solid fa-box-open text-2xl mb-2"></i>
                <p class="text-xs">No se encontraron recetas.</p>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = '';
    filtradas.forEach(r => {
        const isSelected = recetaSeleccionada && recetaSeleccionada.id === r.id;
        const cardClass = isSelected 
            ? 'border-2 border-accent bg-orange-500/5 shadow-md shadow-accent/5' 
            : 'border border-slate-200/60 hover:border-slate-300 hover:bg-slate-50';
        
        let catBadge = '';
        if (r.categoria === 'PASTELERIA' || r.categoria === 'MASA SALADA') {
            catBadge = `<span class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black uppercase tracking-wider">Repostería</span>`;
        } else if (r.categoria === 'BEBIDAS CON ALCOHOL') {
            catBadge = `<span class="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[9px] font-black uppercase tracking-wider">Cóctel</span>`;
        } else {
            catBadge = `<span class="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-[9px] font-black uppercase tracking-wider">${r.categoria || 'Sin Categoría'}</span>`;
        }

        const div = document.createElement('div');
        div.className = `p-4 rounded-xl cursor-pointer transition-all ${cardClass}`;
        div.onclick = () => seleccionarReceta(r.id);
        
        div.innerHTML = `
            <div class="flex justify-between items-start gap-2 mb-1.5">
                <h4 class="font-bold text-slate-800 text-sm sm:text-base tracking-tight">${r.nombre}</h4>
                ${catBadge}
            </div>
            <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed">${r.preparacion || 'Sin instrucciones de preparación.'}</p>
            <div class="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                <span class="flex items-center gap-1"><i class="fa-solid fa-users"></i> ${r.porciones || '1 porción'}</span>
                <span>•</span>
                <span class="flex items-center gap-1"><i class="fa-solid fa-tag"></i> Price: ${parseFloat(r.price || r.precio || 0).toFixed(2)} Bs.</span>
            </div>
        `;
        contenedor.appendChild(div);
    });
}

// Cambiar la categoría de filtro seleccionada
function filtrarCategoria(cat, btn) {
    categoriaFiltro = cat;
    
    // Cambiar estilos activos en los botones
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.className = 'px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold rounded-lg shrink-0 transition-all filter-btn';
    });
    btn.className = 'px-3 py-1.5 bg-accent text-white text-xs font-bold rounded-lg shrink-0 transition-all filter-btn';

    renderListaRecetas();
}

// Filtrar en tiempo real por campo de texto
function filtrarRecetas() {
    renderListaRecetas();
}

// Seleccionar y ver detalle de una receta
async function seleccionarReceta(id) {
    // Para marcar el item seleccionado
    const found = recetas.find(r => r.id === id);
    if (!found) return;
    recetaSeleccionada = found;
    renderListaRecetas(); // Refrescar clase activa

    const contenedor = document.getElementById('detalle-receta-card');
    contenedor.innerHTML = `
        <div class="flex-1 flex flex-col items-center justify-center text-center text-slate-400 py-16">
            <i class="fa-solid fa-spinner fa-spin text-3xl mb-2 text-accent"></i>
            <p class="text-xs">Cargando detalles de la receta...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/recetas/${id}`);
        if (!res.ok) throw new Error('Error al obtener detalle de la receta');
        const receta = await res.json();

        let imageHTML = '';
        if (receta.imagen_url) {
            imageHTML = `<img src="${receta.imagen_url}" alt="${receta.nombre}" class="w-full h-48 sm:h-56 object-cover rounded-xl border border-slate-200 mb-4">`;
        } else {
            // Default icon wrapper
            imageHTML = `
                <div class="w-full h-36 bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100 rounded-xl flex items-center justify-center mb-4">
                    <i class="fa-solid fa-mug-hot text-4xl text-accent/30"></i>
                </div>
            `;
        }

        // Renderizar ingredientes con stock e inteligente conversión
        let ingredientesHTML = '';
        if (!receta.ingredientes || receta.ingredientes.length === 0) {
            ingredientesHTML = `<p class="text-xs text-slate-400 italic">No se registraron ingredientes para esta receta.</p>`;
        } else {
            ingredientesHTML = `
                <div class="space-y-3">
                    ${receta.ingredientes.map(ing => {
                        const hasInsumo = ing.insumo_id !== null;
                        let stockBadgeClass = 'bg-red-50 text-red-600 border border-red-200';
                        let stockText = 'Sin vincular a Inventario';
                        let equivalenciaHTML = '';
                        let checkIcon = '<i class="fa-solid fa-circle-xmark text-red-500"></i>';

                        if (hasInsumo) {
                            const stockEquiv = obtenerStockEquivalente(
                                ing.insumo_stock_actual,
                                ing.insumo_unidad_medida,
                                ing.unidad_medida,
                                ing.nombre_ingrediente
                            );

                            const reqQty = parseFloat(ing.cantidad) || 0;
                            const stockQty = stockEquiv.cantidad;

                            // Formatear stocks para que sean legibles
                            const stockTextFormated = stockQty % 1 === 0 ? stockQty.toFixed(0) : stockQty.toFixed(2);
                            const realStockFormated = parseFloat(ing.insumo_stock_actual) % 1 === 0 
                                ? parseFloat(ing.insumo_stock_actual).toFixed(0) 
                                : parseFloat(ing.insumo_stock_actual).toFixed(2);

                            if (stockQty >= reqQty) {
                                if (stockQty >= reqQty * 2) {
                                    stockBadgeClass = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
                                    checkIcon = '<i class="fa-solid fa-circle-check text-emerald-500"></i>';
                                } else {
                                    stockBadgeClass = 'bg-amber-50 text-amber-600 border border-amber-200';
                                    checkIcon = '<i class="fa-solid fa-circle-check text-amber-500"></i>';
                                }
                                stockText = `Disponible: ${stockTextFormated} ${ing.unidad_medida}`;
                            } else {
                                stockBadgeClass = 'bg-red-50 text-red-600 border border-red-200';
                                stockText = `Insuficiente: ${stockTextFormated} ${ing.unidad_medida}`;
                            }

                            // Añadir detalles de conversión en letra pequeña si aplica
                            const baseText = `En Inventario: ${realStockFormated} ${ing.insumo_unidad_medida}`;
                            const equivText = stockEquiv.glosa ? ` | (${stockEquiv.glosa})` : '';
                            equivalenciaHTML = `<p class="text-[9px] text-slate-400 mt-0.5 leading-relaxed font-mono">${baseText}${equivText}</p>`;
                        }

                        return `
                            <div class="flex flex-col p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors">
                                <div class="flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2">
                                        ${checkIcon}
                                        <span class="text-xs font-bold text-slate-800">${ing.nombre_ingrediente}</span>
                                    </div>
                                    <div class="text-right flex items-center gap-2">
                                        <span class="text-xs font-medium text-slate-500">Requerido: ${parseFloat(ing.cantidad).toFixed(0)} ${ing.unidad_medida}</span>
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${stockBadgeClass}">${stockText}</span>
                                    </div>
                                </div>
                                ${equivalenciaHTML}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        contenedor.innerHTML = `
            <div class="flex flex-col gap-4 overflow-y-auto max-h-[650px] pr-1">
                ${imageHTML}
                <div class="flex justify-between items-start gap-4">
                    <div>
                        <h2 class="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">${receta.nombre}</h2>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">${receta.categoria || 'SIN CATEGORÍA'}</p>
                    </div>
                    <div class="text-right">
                        <span class="px-3 py-1.5 bg-orange-500/10 text-orange-600 rounded-xl text-xs font-bold uppercase tracking-wider inline-block">
                            <i class="fa-solid fa-users mr-1"></i> Rinde: ${receta.porciones || '1 porción'}
                        </span>
                    </div>
                </div>

                <hr class="border-slate-100">

                <div>
                    <h3 class="font-black text-slate-700 text-sm uppercase tracking-wider mb-2.5 flex items-center gap-2">
                        <i class="fa-solid fa-basket-shopping text-accent"></i> Ingredientes y Estado de Stock
                    </h3>
                    ${ingredientesHTML}
                </div>

                <hr class="border-slate-100">

                <div>
                    <h3 class="font-black text-slate-700 text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                        <i class="fa-solid fa-kitchen-set text-accent"></i> Instrucciones de Preparación
                    </h3>
                    <p class="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">${receta.preparacion || 'No hay instrucciones cargadas para esta receta.'}</p>
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Error al cargar detalle de receta:', err);
        contenedor.innerHTML = `
            <div class="flex-1 flex flex-col items-center justify-center text-center text-red-500 py-16">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
                <h3 class="font-bold">Error de Carga</h3>
                <p class="text-xs text-slate-400">No se pudieron recuperar los ingredientes ni stock.</p>
            </div>
        `;
    }
}

// Convertidor automático de stock de inventario a receta
function obtenerStockEquivalente(stockActual, unidadStock, unidadReceta, ingredienteNombre) {
    const val = parseFloat(stockActual) || 0;
    const uS = (unidadStock || '').trim().toLowerCase();
    const uR = (unidadReceta || '').trim().toLowerCase();

    // Si coinciden directamente
    if (uS === uR) {
        return {
            cantidad: val,
            unidad: unidadStock,
            glosa: ''
        };
    }

    let stockEnGramosOMl = val;
    let factorDeConversion = 1;

    // Convertir stock a una unidad base (gramos o mililitros o unidades)
    if (uS === 'kintales' || uS === 'kintal') {
        stockEnGramosOMl = val * 46000; // 1 Kintal = 46 Kg = 46000 gr.
    } else if (uS === 'kg' || uS === 'kilo' || uS === 'kilos') {
        stockEnGramosOMl = val * 1000; // 1 Kg = 1000 gr.
    } else if (uS === 'litro' || uS === 'litros' || uS === 'botella' || uS === 'botellas') {
        stockEnGramosOMl = val * 1000; // 1 Litro = 1000 ml
    } else if (uS === 'botellon') {
        stockEnGramosOMl = val * 20000; // 20 Litros = 20000 ml
    } else if (uS === 'maples' || uS === 'maple') {
        stockEnGramosOMl = val * 30; // 1 Maple = 30 unidades
    } else {
        stockEnGramosOMl = val;
    }

    let stockConvertido = 0;
    let glosaEquivalencia = '';

    // Si receta pide gramos
    if (uR === 'gr.' || uR === 'gr' || uR === 'g') {
        stockConvertido = stockEnGramosOMl;
        if (uS === 'kintales' || uS === 'kintal') glosaEquivalencia = `1 Kintal = 46 Kg = 46,000 gr`;
        else if (uS === 'kg' || uS === 'kilo') glosaEquivalencia = `1 Kg = 1,000 gr`;
    }
    // Si receta pide ml
    else if (uR === 'ml.' || uR === 'ml') {
        stockConvertido = stockEnGramosOMl;
        if (uS === 'litro' || uS === 'litros' || uS === 'botella' || uS === 'botellas') glosaEquivalencia = `1 L = 1,000 ml`;
        else if (uS === 'botellon') glosaEquivalencia = `1 Botellón = 20,000 ml`;
    }
    // Si receta pide unidades
    else if (uR === 'unidades' || uR === 'unidad' || uR === 'u' || uR === 'unid') {
        stockConvertido = stockEnGramosOMl;
        if (uS === 'maples' || uS === 'maple') glosaEquivalencia = `1 Maple = 30 unidades`;
    }
    // Si receta pide cucharadas (~15 gr)
    else if (uR === 'cucharadas' || uR === 'cucharada') {
        stockConvertido = stockEnGramosOMl / 15;
        glosaEquivalencia = `1 cucharada = 15 gr`;
    }
    // Si receta pide cucharaditas (~5 gr)
    else if (uR === 'cucharaditas' || uR === 'cucharadita') {
        stockConvertido = stockEnGramosOMl / 5;
        glosaEquivalencia = `1 cucharadita = 5 gr`;
    }
    // Si receta pide tazas (~200 gr/ml)
    else if (uR === 'tazas' || uR === 'taza') {
        stockConvertido = stockEnGramosOMl / 200;
        glosaEquivalencia = `1 taza = 200 gr/ml`;
    }
    // Si receta pide onzas (~30 ml)
    else if (uR === 'onzas' || uR === 'onza' || uR === 'oz') {
        stockConvertido = stockEnGramosOMl / 30;
        glosaEquivalencia = `1 oz = 30 ml`;
    }
    else {
        // Fallback: 1 a 1
        stockConvertido = val;
    }

    return {
        cantidad: stockConvertido,
        unidad: unidadReceta,
        glosa: glosaEquivalencia
    };
}
