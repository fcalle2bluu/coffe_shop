// frontend/js/security_guard.js

(function() {
    // 1. Verificar Autenticación Básica
    if (!localStorage.getItem('usuario_id')) {
        window.location.href = 'index.html'; 
        return;
    }

    const rol = localStorage.getItem('usuario_rol') ? localStorage.getItem('usuario_rol').toUpperCase() : '';
    
    const urlPath = window.location.pathname;
    const pageName = urlPath.substring(urlPath.lastIndexOf('/') + 1) || 'index.html';

    // REGLAS PARA ENCARGADO DE LOGÍSTICA O ALMACEN
    if (rol.includes('LOGISTICA') || rol.includes('ALMACEN')) {
        const paginasPermitidas = ['pedidos_internos.html', 'index.html', ''];
        
        if (!paginasPermitidas.includes(pageName)) {
            window.location.href = 'pedidos_internos.html';
            return;
        }

        window.addEventListener('DOMContentLoaded', () => {
            // Ocultar tabs de menú que no sean pedidos internos
            document.querySelectorAll('aside nav a').forEach(el => {
                if (!el.href.includes('pedidos_internos.html')) {
                    el.style.display = 'none';
                }
            });
            // Ocultar botones y elementos de admin
            document.querySelectorAll('.solo-admin').forEach(el => {
                el.style.display = 'none';
            });
        });
        return;
    }

    // REGLAS PARA CAJERO
    const adminPages = [
        'almacen_stock.html', 
        'almacen_movimientos.html', 
        'compras.html',
        'compras_reporte.html', 
        'inventario.html', 
        'comprobantes.html', 
        'parametros.html',
        'informe_general.html'
    ];

    if (adminPages.includes(pageName) && rol === 'CAJERO') {
        alert('⛔ Acceso denegado: Control exclusivo de Administradores.');
        window.location.href = 'dashboard.html';
        return;
    }

    window.addEventListener('DOMContentLoaded', () => {
        if (rol === 'CAJERO') {
            document.querySelectorAll('.solo-admin').forEach(el => {
                el.style.display = 'none';
            });
        }
    });
})();
