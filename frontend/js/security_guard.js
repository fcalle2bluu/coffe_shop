// frontend/js/security_guard.js

(function() {
    // === LÓGICA GLOBAL DE MODO OSCURO ===
    function applyTheme(isDark) {
        let styleEl = document.getElementById('dark-mode-style');
        if (isDark) {
            document.documentElement.classList.add('dark');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dark-mode-style';
                styleEl.innerHTML = `
                    /* Modo Oscuro Profesional - Café La Paz */
                    html, body, main, .bg-mainBg {
                        background-color: #0b0f19 !important;
                        color: #f1f5f9 !important;
                    }
                    /* Tarjetas y Contenedores */
                    .bg-white, [class*="bg-white"] {
                        background-color: #111827 !important;
                        color: #f1f5f9 !important;
                    }
                    /* Fondos Gris Claro a Oscuro */
                    .bg-slate-50, .bg-gray-50, .bg-slate-100, .bg-gray-100 {
                        background-color: #0f172a !important;
                    }
                    /* Cabecera / Topbar */
                    header, .bg-white\\/70 {
                        background-color: rgba(17, 24, 39, 0.8) !important;
                        border-color: #1f2937 !important;
                    }
                    /* Bordes */
                    .border-slate-100, .border-slate-200, .border-gray-100, .border-gray-200, .border-slate-200\\/60, .border, .border-b, .border-t, .border-r, .border-l {
                        border-color: #1f2937 !important;
                    }
                    /* Texto */
                    .text-slate-800, .text-gray-800, .text-slate-900, .text-slate-700, .text-gray-700, .text-slate-600, .text-slate-950,
                    .text-gray-900, .text-stone-800, .text-stone-700, .text-stone-900, .text-zinc-800, .text-zinc-700, .text-zinc-900,
                    .text-neutral-800, .text-neutral-700, .text-neutral-900 {
                        color: #f3f4f6 !important;
                    }
                    .text-slate-500, .text-gray-500, .text-slate-400, .text-stone-500, .text-stone-600, .text-zinc-500, .text-zinc-600, .text-neutral-500, .text-neutral-600 {
                        color: #9ca3af !important;
                    }
                    .text-slate-200, .text-gray-200, .text-stone-200, .text-zinc-200, .text-neutral-200 {
                        color: #d1d5db !important;
                    }
                    /* Inputs, Selects, Textareas */
                    input[type="text"], input[type="number"], input[type="password"], input[type="date"], input[type="time"], select, textarea {
                        background-color: #1f2937 !important;
                        border-color: #374151 !important;
                        color: #f9fafb !important;
                    }
                    input::placeholder {
                        color: #6b7280 !important;
                    }
                    /* Tablas */
                    th {
                        background-color: #1f2937 !important;
                        color: #e5e7eb !important;
                        border-bottom: 2px solid #374151 !important;
                    }
                    td {
                        color: #e5e7eb !important;
                        border-bottom: 1px solid #1f2937 !important;
                    }
                    tr:hover td {
                        background-color: #1f2937 !important;
                    }
                    /* Sombras */
                    .shadow-premium, .shadow-md, .shadow-lg {
                        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5) !important;
                    }
                    /* Hover states */
                    .hover\\:bg-slate-50:hover, .hover\\:bg-gray-50:hover, .hover\\:bg-slate-100:hover, .hover\\:bg-gray-100:hover {
                        background-color: #1f2937 !important;
                    }
                    /* Caja pastel boxes overrides in dark mode */
                    .bg-blue-50 { background-color: rgba(59, 130, 246, 0.15) !important; }
                    .bg-green-50 { background-color: rgba(34, 197, 94, 0.15) !important; }
                    .bg-purple-50 { background-color: rgba(168, 85, 247, 0.15) !important; }
                    .bg-red-50 { background-color: rgba(239, 68, 68, 0.15) !important; }
                    .bg-teal-50 { background-color: rgba(20, 184, 166, 0.15) !important; }
                    .bg-amber-50 { background-color: rgba(245, 158, 11, 0.15) !important; }

                    .border-blue-100\\/60 { border-color: rgba(59, 130, 246, 0.3) !important; }
                    .border-green-100\\/60 { border-color: rgba(34, 197, 94, 0.3) !important; }
                    .border-purple-100\\/60 { border-color: rgba(168, 85, 247, 0.3) !important; }
                    .border-red-100\\/60 { border-color: rgba(239, 68, 68, 0.3) !important; }
                    .border-teal-100\\/60 { border-color: rgba(20, 184, 166, 0.3) !important; }
                    .border-amber-200\\/60 { border-color: rgba(245, 158, 11, 0.3) !important; }

                    .text-blue-800, .text-blue-900 { color: #60a5fa !important; }
                    .text-green-800, .text-green-900 { color: #4ade80 !important; }
                    .text-purple-800, .text-purple-900 { color: #c084fc !important; }
                    .text-red-800, .text-red-900 { color: #f87171 !important; }
                    .text-teal-800, .text-teal-900, .text-teal-700 { color: #2dd4bf !important; }
                    .text-amber-800, .text-amber-900 { color: #fbbf24 !important; }
                `;
                document.documentElement.appendChild(styleEl);
            }
        } else {
            document.documentElement.classList.remove('dark');
            if (styleEl) {
                styleEl.remove();
            }
        }
    }

    function updateToggleButtons(isDark) {
        const btn = document.getElementById('btn-theme-toggle');
        const icon = document.getElementById('theme-toggle-icon');
        if (btn && icon) {
            if (isDark) {
                icon.className = 'fa-solid fa-sun text-lg text-amber-400';
                btn.className = 'w-10 h-10 rounded-xl flex items-center justify-center border border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 transition-all shadow-sm';
            } else {
                icon.className = 'fa-solid fa-moon text-lg text-slate-600';
                btn.className = 'w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all shadow-sm';
            }
        }
    }

    window.toggleDarkMode = function() {
        const isDark = localStorage.getItem('darkMode') === 'true';
        const newDark = !isDark;
        localStorage.setItem('darkMode', newDark);
        applyTheme(newDark);
        updateToggleButtons(newDark);
        
        const event = new CustomEvent('themeChanged', { detail: { isDark: newDark } });
        window.dispatchEvent(event);
    };

    // Aplicar inmediatamente
    const darkModeActivo = localStorage.getItem('darkMode') === 'true';
    applyTheme(darkModeActivo);

    window.addEventListener('DOMContentLoaded', () => {
        const isDark = localStorage.getItem('darkMode') === 'true';
        updateToggleButtons(isDark);
    });

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
        const paginasPermitidas = ['pedidos_internos.html', 'produccion.html', 'index.html', ''];
        
        if (!paginasPermitidas.includes(pageName)) {
            window.location.href = 'pedidos_internos.html';
            return;
        }

        window.addEventListener('DOMContentLoaded', () => {
            // Ocultar tabs de menú que no sean pedidos internos o produccion
            document.querySelectorAll('aside nav a').forEach(el => {
                if (!el.href.includes('pedidos_internos.html') && !el.href.includes('produccion.html')) {
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

    // REGLAS PARA PASTELERA/PASTELERO
    if (rol.includes('PASTELERA') || rol.includes('PASTELERO')) {
        const paginasPermitidas = ['produccion.html', 'index.html', ''];
        
        if (!paginasPermitidas.includes(pageName)) {
            window.location.href = 'produccion.html';
            return;
        }

        window.addEventListener('DOMContentLoaded', () => {
            // Ocultar tabs de menú que no sean produccion
            document.querySelectorAll('aside nav a').forEach(el => {
                if (!el.href.includes('produccion.html')) {
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

    if (!rol.includes('LOGISTICA') && !rol.includes('ALMACEN') && !rol.includes('PASTELERA') && !rol.includes('PASTELERO') && !isAdmin) {
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
        } else if (pageName.includes('webhook.html')) {
            hasAccess = isAdmin || rol === 'CAJERO';
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
            if (href.includes('produccion.html')) {
                const hasAccess = isAdmin || rol.includes('PASTELERA') || rol.includes('PASTELERO') || rol.includes('LOGISTICA') || rol.includes('ALMACEN');
                if (!hasAccess) el.style.display = 'none';
                else el.style.display = 'flex';
            }
            if (href.includes('auditoria_pasteleria.html')) {
                const hasPerm = localStorage.getItem('perm_auditoria') === 'true';
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
            if (href.includes('asistencia.html')) {
                if (!isAdmin && rol !== 'CAJERO') el.style.display = 'none';
                else el.style.display = 'flex';
            }
            if (href.includes('webhook.html')) {
                if (!isAdmin && rol !== 'CAJERO') el.style.display = 'none';
                else el.style.display = 'flex';
            }
        });

        // Ocultar u mostrar otros elementos marcados como solo-admin en la página si tiene el permiso correspondiente
        if (!isAdmin) {
            let keepSoloAdmin = false;
            if (pageName.includes('almacen_stock') && localStorage.getItem('perm_stock') === 'true') keepSoloAdmin = true;
            if (pageName.includes('compras') && localStorage.getItem('perm_compras') === 'true') keepSoloAdmin = true;
            if (pageName.includes('proveedores') && localStorage.getItem('perm_proveedores') === 'true') keepSoloAdmin = true;
            if (pageName.includes('inventario') && localStorage.getItem('perm_auditoria') === 'true') keepSoloAdmin = true;
            if (pageName.includes('produccion') && isAdmin) keepSoloAdmin = true;
            if (pageName.includes('auditoria_pasteleria') && (isAdmin || localStorage.getItem('perm_auditoria') === 'true')) keepSoloAdmin = true;
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
