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

    const isAdmin = rol === 'ADMINISTRADOR' || rol === 'ADMIN';

    if (!rol.includes('LOGISTICA') && !rol.includes('ALMACEN') && !isAdmin) {
        if (pageName === 'dashboard.html' && rol !== 'CAJERO' && rol !== 'MESERO') {
            window.location.href = 'ventas.html';
            return;
        }

        // Validar acceso por página
        let hasAccess = true;
        if (pageName.includes('almacen_stock.html') || pageName.includes('almacen_movimientos.html')) {
            hasAccess = localStorage.getItem('perm_stock') === 'true';
        } else if (pageName.includes('recetas.html')) {
            hasAccess = localStorage.getItem('perm_stock') === 'true' || localStorage.getItem('perm_auditoria') === 'true';
        } else if (pageName.includes('compras.html') || pageName.includes('compras_reporte.html')) {
            hasAccess = localStorage.getItem('perm_compras') === 'true';
        } else if (pageName.includes('proveedores.html')) {
            hasAccess = localStorage.getItem('perm_proveedores') === 'true';
        } else if (pageName.includes('inventario.html')) {
            hasAccess = localStorage.getItem('perm_auditoria') === 'true';
        } else if (pageName.includes('parametros.html') || pageName.includes('usuarios.html') || pageName.includes('empleados.html')) {
            hasAccess = localStorage.getItem('perm_parametros') === 'true';
        } else if (pageName.includes('informe_general.html') || pageName.includes('libro_diario.html')) {
            hasAccess = localStorage.getItem('perm_informe') === 'true';
        }

        if (!hasAccess) {
            alert('⛔ Acceso denegado: No tienes permisos para acceder a esta sección.');
            window.location.href = 'ventas.html';
            return;
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        // Ocultar o mostrar links del sidebar según permisos individuales
        document.querySelectorAll('aside nav a').forEach(el => {
            const href = el.getAttribute('href') || '';
            
            if (href.includes('dashboard.html') && rol === 'CAJERO' && false) {
                const parentLi = el.closest('li');
                if (parentLi) parentLi.style.display = 'none';
                else el.style.display = 'none';
                return;
            }

            if (href.includes('recetas.html')) {
                const hasPerm = localStorage.getItem('perm_stock') === 'true' || localStorage.getItem('perm_auditoria') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }

            if (href.includes('almacen_stock.html')) {
                const hasPerm = localStorage.getItem('perm_stock') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('compras.html')) {
                const hasPerm = localStorage.getItem('perm_compras') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('proveedores.html')) {
                const hasPerm = localStorage.getItem('perm_proveedores') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('inventario.html')) {
                const hasPerm = localStorage.getItem('perm_auditoria') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('parametros.html')) {
                const hasPerm = localStorage.getItem('perm_parametros') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('usuarios.html') || href.includes('empleados.html')) {
                const hasPerm = localStorage.getItem('perm_parametros') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('informe_general.html')) {
                const hasPerm = localStorage.getItem('perm_informe') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
            if (href.includes('libro_diario.html')) {
                const hasPerm = localStorage.getItem('perm_informe') === 'true';
                if (!isAdmin && !hasPerm) el.style.display = 'none';
                else if (hasPerm || isAdmin) el.style.display = 'flex';
            }
        });

        // Ocultar u mostrar otros elementos marcados como solo-admin en la página si tiene el permiso correspondiente
        if (!isAdmin) {
            let keepSoloAdmin = false;
            if (pageName.includes('almacen_stock') && localStorage.getItem('perm_stock') === 'true') keepSoloAdmin = true;
            if (pageName.includes('compras') && localStorage.getItem('perm_compras') === 'true') keepSoloAdmin = true;
            if (pageName.includes('proveedores') && localStorage.getItem('perm_proveedores') === 'true') keepSoloAdmin = true;
            if (pageName.includes('inventario') && localStorage.getItem('perm_auditoria') === 'true') keepSoloAdmin = true;
            if ((pageName.includes('parametros') || pageName.includes('usuarios') || pageName.includes('empleados')) && localStorage.getItem('perm_parametros') === 'true') keepSoloAdmin = true;
            if ((pageName.includes('informe_general') || pageName.includes('libro_diario')) && localStorage.getItem('perm_informe') === 'true') keepSoloAdmin = true;

            // Filtrar para no tocar la barra lateral (aside)
            const elementosNoSidebar = Array.from(document.querySelectorAll('.solo-admin')).filter(el => !el.closest('aside'));

            if (keepSoloAdmin) {
                elementosNoSidebar.forEach(el => {
                    const href = el.getAttribute('href');
                    if (!href) {
                        el.style.display = ''; // Restaurar a su display original (ej: block/flex de Tailwind)
                    }
                });
            } else {
                elementosNoSidebar.forEach(el => {
                    el.style.display = 'none';
                });
            }
        }
    });

    // Revalidación en segundo plano (para actualizar permisos en tiempo real sin obligar a reloguear)
    const usuarioId = localStorage.getItem('usuario_id');
    if (usuarioId && !rol.includes('LOGISTICA') && !rol.includes('ALMACEN') && !isAdmin) {
        fetch(`/api/auth/check-permissions?usuario_id=${usuarioId}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.permisos) {
                    const keys = ['perm_stock', 'perm_compras', 'perm_proveedores', 'perm_auditoria', 'perm_parametros', 'perm_informe'];
                    let changed = false;
                    keys.forEach(k => {
                        const dbVal = String(data.permisos[k]);
                        if (localStorage.getItem(k) !== dbVal) {
                            localStorage.setItem(k, dbVal);
                            changed = true;
                        }
                    });
                    
                    if (changed) {
                        console.log("🔄 Permisos actualizados en segundo plano. Re-aplicando reglas...");
                        window.location.reload();
                    }
                }
            })
            .catch(err => console.error("Error al revalidar permisos:", err));
    }
})();
