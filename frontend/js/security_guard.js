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

    if (rol === 'CAJERO') {
        if (pageName === 'dashboard.html') {
            window.location.href = 'ventas.html';
            return;
        }
        if (adminPages.includes(pageName)) {
            alert('⛔ Acceso denegado: Control exclusivo de Administradores.');
            window.location.href = 'ventas.html';
            return;
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        if (rol === 'CAJERO') {
            document.querySelectorAll('.solo-admin').forEach(el => {
                el.style.display = 'none';
            });

            // Ocultar opción Dashboard en el menú lateral para CAJERO
            document.querySelectorAll('aside nav a').forEach(el => {
                const href = el.getAttribute('href');
                if (href === 'dashboard.html') {
                    const parentLi = el.closest('li');
                    if (parentLi) {
                        parentLi.style.display = 'none';
                    } else {
                        el.style.display = 'none';
                    }
                }
            });
        }
    });
})();
