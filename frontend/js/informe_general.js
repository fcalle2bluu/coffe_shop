// frontend/js/informe_general.js

document.addEventListener('DOMContentLoaded', () => {
    // Validar Rol
    if(localStorage.getItem('usuario_rol') !== 'ADMIN') {
        window.location.href = 'dashboard.html';
        return;
    }

    const fechaActual = new Date().toLocaleDateString('es-ES', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('fecha-impresion').innerText = `Generado el: ${fechaActual}`;

    cargarDatosInforme();
});

const mesesNombres = {
    "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
    "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

async function cargarDatosInforme() {
    try {
        // Ejecutar las 3 peticiones en paralelo para max velocidad
        const [resInsumos, resVentas, resCompras] = await Promise.all([
            fetch('/api/almacen/insumos'),
            fetch('/api/caja/historial-ventas-cajeros'),
            fetch('/api/compras')
        ]);

        const insumos = await resInsumos.json();
        const ventas = await resVentas.json();
        const compras = await resCompras.json();

        renderInsumos(insumos);
        renderVentas(ventas);
        renderGananciasMensuales(ventas, compras);

    } catch (error) {
        console.error("Error al generar el informe:", error);
        alert("Ocurrió un error obteniendo los datos para el informe.");
    }
}

function renderInsumos(insumos) {
    const tbody = document.getElementById('tabla-insumos');
    tbody.innerHTML = '';
    
    if(!insumos || insumos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-gray-500">No hay insumos registrados.</td></tr>';
        return;
    }

    insumos.forEach(i => {
        let warnText = '';
        if(i.stock_actual <= i.stock_minimo) {
            warnText = '<span class="text-xs ml-2 text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100">Bajo Stock</span>';
        }

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2 text-stone-800 font-bold">${i.nombre} ${warnText}</td>
                <td class="px-4 py-2 text-stone-600 text-xs uppercase tracking-wide">${i.unidad_medida}</td>
                <td class="px-4 py-2 text-right font-black text-stone-900">${parseFloat(i.stock_actual).toFixed(2)}</td>
            </tr>
        `;
    });
}

function renderVentas(ventas) {
    const tbody = document.getElementById('tabla-ventas');
    tbody.innerHTML = '';

    if(!ventas || ventas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">No hay historial de ventas.</td></tr>';
        return;
    }

    // Mostramos solo las últimas 50 para no hacer un reporte de 20.000 páginas
    const recientes = ventas.slice(0, 50);

    recientes.forEach(v => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-1.5 text-stone-600 font-mono text-xs">#${v.venta_id.toString().padStart(6,'0')}</td>
                <td class="px-4 py-1.5 text-stone-800">${v.fecha_venta}</td>
                <td class="px-4 py-1.5 text-stone-700">${v.cajero || 'Desconocido'}</td>
                <td class="px-4 py-1.5 text-right font-black text-stone-900">Bs. ${parseFloat(v.total).toFixed(2)}</td>
            </tr>
        `;
    });
}

function renderGananciasMensuales(ventas, compras) {
    const tbody = document.getElementById('tabla-ganancias');
    tbody.innerHTML = '';

    const agrupado = {};

    // 1. Sumar Ventas (Ingresos)
    ventas.forEach(v => {
        if(!v.fecha_venta) return;
        const partes = v.fecha_venta.split(' ')[0].split('-'); // "YYYY-MM-DD"
        if(partes.length < 3) return;
        const mesAno = `${partes[0]}-${partes[1]}`;

        if(!agrupado[mesAno]) agrupado[mesAno] = { ingresos: 0, egresos: 0 };
        agrupado[mesAno].ingresos += parseFloat(v.total || 0);
    });

    // 2. Sumar Compras (Egresos)
    compras.forEach(c => {
        if(!c.fecha_compra) return;
        // c.fecha_compra: "DD/MM/YYYY HH24:MI"
        const fecha = c.fecha_compra.split(' ')[0]; // "DD/MM/YYYY"
        const partes = fecha.split('/');
        if(partes.length < 3) return;
        const mesAno = `${partes[2]}-${partes[1]}`; // Convertir a YYYY-MM

        if(!agrupado[mesAno]) agrupado[mesAno] = { ingresos: 0, egresos: 0 };
        agrupado[mesAno].egresos += parseFloat(c.total || 0);
    });

    const mesesOrdenados = Object.keys(agrupado).sort((a,b) => b.localeCompare(a)); // Descendente

    if(mesesOrdenados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Sin datos financieros para calcular ganancias.</td></tr>';
        return;
    }

    let sumaTotalGanancias = 0;

    mesesOrdenados.forEach(mesClave => {
        const data = agrupado[mesClave];
        const utilidad = data.ingresos - data.egresos;
        sumaTotalGanancias += utilidad;

        const [yyyy, mm] = mesClave.split('-');
        const tituloMes = `${mesesNombres[mm]} ${yyyy}`;

        const colorUtilidad = utilidad >= 0 ? 'text-green-600' : 'text-red-600';

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-2 font-bold text-stone-800 uppercase tracking-wide text-xs">${tituloMes}</td>
                <td class="px-4 py-2 text-right font-bold text-green-700 bg-green-50/30">Bs. ${data.ingresos.toFixed(2)}</td>
                <td class="px-4 py-2 text-right font-bold text-red-700 bg-red-50/30">Bs. ${data.egresos.toFixed(2)}</td>
                <td class="px-4 py-2 text-right font-black text-lg ${colorUtilidad}">Bs. ${utilidad.toFixed(2)}</td>
            </tr>
        `;
    });

    // Añadir Fila de Total Histórico
    const colorTotal = sumaTotalGanancias >= 0 ? 'text-green-600' : 'text-red-600 bg-red-50';
    tbody.innerHTML += `
        <tr class="bg-gray-800 text-white border-t-4 border-slate-900">
            <td colspan="3" class="px-4 py-3 text-right uppercase font-bold text-xs tracking-widest text-slate-300">Utilidad Neta Histórica Total</td>
            <td class="px-4 py-3 text-right font-black text-xl ${colorTotal}">Bs. ${sumaTotalGanancias.toFixed(2)}</td>
        </tr>
    `;
}

// Menú Hamburger
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

function cerrarSesión() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// Cargar UI Header
window.addEventListener('DOMContentLoaded', () => {
    const nombreActual = localStorage.getItem('usuario_nombre');
    const rolActual = localStorage.getItem('usuario_rol');
    if (nombreActual) {
        const headerName = document.getElementById('header-nombre-usuario');
        if(headerName) headerName.innerText = nombreActual;
        const elem = document.getElementById('nombre-usuario');
        if(elem) elem.innerText = nombreActual;
        const avatar = document.getElementById('avatar-letra');
        if(avatar) avatar.innerText = nombreActual.charAt(0).toUpperCase();
    }
    if (rolActual) {
        const rolIcon = document.getElementById('rol-usuario');
        if(rolIcon) rolIcon.innerHTML = `<i class="fa-solid fa-circle text-[10px] mr-1"></i> ${rolActual}`;
    }
});
