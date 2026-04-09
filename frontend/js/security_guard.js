// frontend/js/security_guard.js

(function() {
    // 1. Verificar Autenticación Básica
    if (!localStorage.getItem('usuario_id')) {
        window.location.href = 'index.html'; 
        return;
    }

    const rol = localStorage.getItem('usuario_rol');
    
    // 2. Definir Páginas Restringidas
    const urlPath = window.location.pathname;
    const pageName = urlPath.substring(urlPath.lastIndexOf('/') + 1) || 'index.html';
    
    const adminPages = [
        'almacen_stock.html', 
        'almacen_movimientos.html', 
        'compras.html', 
        'inventario.html', 
        'comprobantes.html', 
        'parametros.html'
    ];

    // 3. Ejecutar Redirección si un CAJERO intenta entrar a zona admin
    if (adminPages.includes(pageName) && rol === 'CAJERO') {
        alert('⛔ Acceso denegado: Control exclusivo de Administradores.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 4. Ocultar elementos de UI globales (tabs de menú lateral y botones)
    window.addEventListener('DOMContentLoaded', () => {
        if (rol === 'CAJERO') {
            document.querySelectorAll('.solo-admin').forEach(el => {
                el.style.display = 'none';
            });
        }
    });
})();
