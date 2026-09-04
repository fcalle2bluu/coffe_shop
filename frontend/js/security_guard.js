// frontend/js/security_guard.js

(function() {
    // === MONKEY PATCH FETCH PARA INYECTAR USUARIO ID Y TOKEN DE SESIÓN ===
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        const usuarioId = localStorage.getItem('usuario_id');
        const token = localStorage.getItem('token');
        init = init || {};
        init.headers = init.headers || {};
        const setHeader = (name, value) => {
            if (init.headers instanceof Headers) {
                init.headers.set(name, value);
            } else {
                init.headers[name] = value;
            }
        };
        if (usuarioId) setHeader('x-usuario-id', usuarioId);
        if (token) setHeader('Authorization', `Bearer ${token}`);

        return originalFetch(input, init).then(response => {
            // Sesión inválida/expirada en el backend: mandar de vuelta al login
            const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
            if (response.status === 401 && urlStr.includes('/api/')) {
                localStorage.clear();
                window.location.href = 'index.html';
            }
            return response;
        });
    };

    // === TEMA AZUL OSCURO PREMIUM (único modo, siempre activo) ===
    function applyTheme() {
        let styleEl = document.getElementById('dark-mode-style');
        document.documentElement.classList.add('dark');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dark-mode-style';
            styleEl.innerHTML = `
                    /* Azul Oscuro Premium - Café La Paz */
                    html, body, main, .bg-mainBg {
                        background-color: #0b1830 !important;
                        color: #eef3fc !important;
                    }
                    /* Ocultar el interruptor de modo oscuro: ya no hay modo claro */
                    #btn-theme-toggle { display: none !important; }
                    /* Tarjetas y Contenedores */
                    .bg-white, [class*="bg-white"] {
                        background-color: #142a4d !important;
                        color: #eef3fc !important;
                    }
                    /* Fondos Gris Claro a Oscuro */
                    .bg-slate-50, .bg-slate-50\\/60, .bg-slate-50\\/70, .bg-indigo-50\\/60, .bg-gray-50, .bg-slate-100, .bg-gray-100, .bg-stone-50, .bg-zinc-50, .bg-neutral-50 {
                        background-color: #1b3358 !important;
                    }
                    /* Cabecera / Topbar */
                    header, .bg-white\\/70 {
                        background-color: rgba(18, 37, 68, 0.92) !important;
                        border-color: rgba(96, 165, 250, 0.3) !important;
                    }
                    /* Bordes */
                    .border-slate-100, .border-slate-200, .border-gray-100, .border-gray-200, .border-slate-200\\/60, .border-stone-200, .border-zinc-200, .border-neutral-200, .border, .border-b, .border-t, .border-r, .border-l, .excel-table, .excel-table td, .excel-table th {
                        border-color: rgba(96, 165, 250, 0.3) !important;
                    }
                    /* Texto */
                    .text-slate-800, .text-gray-800, .text-slate-900, .text-slate-700, .text-gray-700, .text-slate-600, .text-slate-950,
                    .text-gray-900, .text-stone-800, .text-stone-700, .text-stone-900, .text-zinc-800, .text-zinc-700, .text-zinc-900,
                    .text-neutral-800, .text-neutral-700, .text-neutral-900 {
                        color: #f3f6fc !important;
                    }
                    .text-slate-500, .text-gray-500, .text-slate-400, .text-stone-500, .text-stone-600, .text-zinc-500, .text-zinc-600, .text-neutral-500, .text-neutral-600 {
                        color: #a9b8d4 !important;
                    }
                    .text-slate-200, .text-gray-200, .text-stone-200, .text-zinc-200, .text-neutral-200 {
                        color: #d7e1f4 !important;
                    }
                    /* Inputs, Selects, Textareas */
                    input[type="text"], input[type="number"], input[type="password"], input[type="date"], input[type="time"], select, textarea {
                        background-color: #1b3358 !important;
                        border-color: rgba(96, 165, 250, 0.45) !important;
                        color: #f9fafb !important;
                    }
                    input::placeholder {
                        color: #7f93bc !important;
                    }
                    /* Tablas */
                    th {
                        background-color: #1b3358 !important;
                        color: #eaf0fb !important;
                        border-bottom: 2px solid rgba(96, 165, 250, 0.5) !important;
                    }
                    td {
                        color: #eaf0fb !important;
                        border-bottom: 1px solid rgba(148, 180, 230, 0.12) !important;
                    }
                    tr:hover td {
                        background-color: #1b3358 !important;
                    }
                    /* Sombras */
                    .shadow-premium, .shadow-md, .shadow-lg {
                        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.55) !important;
                    }
                    /* Hover states: cualquier hover:bg-COLOR-50/100 (con o sin opacidad /NN) de toda la app */
                    [class*="hover:bg-slate-50"]:hover, [class*="hover:bg-gray-50"]:hover, [class*="hover:bg-zinc-50"]:hover, [class*="hover:bg-stone-50"]:hover, [class*="hover:bg-neutral-50"]:hover,
                    [class*="hover:bg-slate-100"]:hover, [class*="hover:bg-gray-100"]:hover, [class*="hover:bg-zinc-100"]:hover, [class*="hover:bg-stone-100"]:hover, [class*="hover:bg-neutral-100"]:hover {
                        background-color: #1b3358 !important;
                    }
                    [class*="hover:bg-orange-50"]:hover, [class*="hover:bg-amber-50"]:hover, [class*="hover:bg-yellow-50"]:hover,
                    [class*="hover:bg-red-50"]:hover, [class*="hover:bg-rose-50"]:hover, [class*="hover:bg-pink-50"]:hover,
                    [class*="hover:bg-emerald-50"]:hover, [class*="hover:bg-green-50"]:hover, [class*="hover:bg-lime-50"]:hover, [class*="hover:bg-teal-50"]:hover,
                    [class*="hover:bg-blue-50"]:hover, [class*="hover:bg-sky-50"]:hover, [class*="hover:bg-cyan-50"]:hover, [class*="hover:bg-indigo-50"]:hover,
                    [class*="hover:bg-purple-50"]:hover, [class*="hover:bg-violet-50"]:hover, [class*="hover:bg-fuchsia-50"]:hover,
                    [class*="hover:bg-orange-100"]:hover, [class*="hover:bg-amber-100"]:hover, [class*="hover:bg-yellow-100"]:hover,
                    [class*="hover:bg-red-100"]:hover, [class*="hover:bg-rose-100"]:hover, [class*="hover:bg-pink-100"]:hover,
                    [class*="hover:bg-emerald-100"]:hover, [class*="hover:bg-green-100"]:hover, [class*="hover:bg-lime-100"]:hover, [class*="hover:bg-teal-100"]:hover,
                    [class*="hover:bg-blue-100"]:hover, [class*="hover:bg-sky-100"]:hover, [class*="hover:bg-cyan-100"]:hover, [class*="hover:bg-indigo-100"]:hover,
                    [class*="hover:bg-purple-100"]:hover, [class*="hover:bg-violet-100"]:hover, [class*="hover:bg-fuchsia-100"]:hover {
                        background-color: rgba(96, 165, 250, 0.14) !important;
                    }
                    .bg-blue-50 { background-color: rgba(59, 130, 246, 0.12) !important; }
                    .bg-green-50 { background-color: rgba(34, 197, 94, 0.12) !important; }
                    .bg-purple-50 { background-color: rgba(168, 85, 247, 0.12) !important; }
                    .bg-red-50 { background-color: rgba(239, 68, 68, 0.12) !important; }
                    .bg-teal-50 { background-color: rgba(20, 184, 166, 0.12) !important; }
                    .bg-amber-50 { background-color: rgba(245, 158, 11, 0.12) !important; }
                    .bg-orange-50 { background-color: rgba(249, 115, 22, 0.12) !important; }
                    .bg-emerald-50, .bg-emerald-50\\/40, .bg-emerald-50\\/30 { background-color: rgba(16, 185, 129, 0.05) !important; }

                    .border-blue-100, .border-blue-100\\/60 { border-color: rgba(59, 130, 246, 0.25) !important; }
                    .border-green-100, .border-green-100\\/60 { border-color: rgba(34, 197, 94, 0.25) !important; }
                    .border-purple-100, .border-purple-100\\/60 { border-color: rgba(168, 85, 247, 0.25) !important; }
                    .border-red-100, .border-red-100\\/60 { border-color: rgba(239, 68, 68, 0.25) !important; }
                    .border-teal-100, .border-teal-100\\/60 { border-color: rgba(20, 184, 166, 0.25) !important; }
                    .border-amber-100, .border-amber-200, .border-amber-200\\/60 { border-color: rgba(245, 158, 11, 0.25) !important; }
                    .border-orange-100, .border-orange-200, .border-orange-100\\/60 { border-color: rgba(249, 115, 22, 0.25) !important; }
                    .border-emerald-100, .border-emerald-200, .border-emerald-100\\/60 { border-color: rgba(16, 185, 129, 0.15) !important; }

                    .text-blue-700, .text-blue-800, .text-blue-900 { color: #60a5fa !important; }
                    .text-green-700, .text-green-800, .text-green-900 { color: #4ade80 !important; }
                    .text-purple-700, .text-purple-800, .text-purple-900 { color: #c084fc !important; }
                    .text-red-700, .text-red-800, .text-red-900 { color: #f87171 !important; }
                    .text-teal-700, .text-teal-800, .text-teal-900, .text-teal-700 { color: #2dd4bf !important; }
                    .text-amber-700, .text-amber-800, .text-amber-900 { color: #fbbf24 !important; }
                    .text-orange-700, .text-orange-800, .text-orange-900 { color: #fb923c !important; }
                    .text-emerald-600, .text-emerald-700, .text-emerald-800, .text-emerald-900 { color: #34d399 !important; }

                    /* Additional improvements for buttons & tables */
                    button.bg-slate-100, button.bg-gray-100, a.bg-slate-100, a.bg-gray-100 {
                        background-color: #1b3358 !important;
                        color: #f3f6fc !important;
                        border: 1px solid rgba(96, 165, 250, 0.45) !important;
                    }
                    button.bg-slate-100:hover, button.bg-gray-100:hover, a.bg-slate-100:hover, a.bg-gray-100:hover {
                        background-color: #22406e !important;
                        color: #ffffff !important;
                    }
                    .hover\\:bg-slate-200:hover, .hover\\:bg-gray-200:hover {
                        background-color: #22406e !important;
                    }
                    .hover\\:bg-emerald-50\\/30:hover {
                        background-color: rgba(16, 185, 129, 0.12) !important;
                    }
                    .hover\\:bg-orange-100:hover {
                        background-color: rgba(249, 115, 22, 0.18) !important;
                    }
                    
                    /* Libro Diario & Excel Dark Mode overrides */
                    .text-indigo-600, .text-indigo-700, .text-indigo-800 { color: #818cf8 !important; }
                    .excel-account-debe {
                        background-color: rgba(99, 102, 241, 0.2) !important;
                        color: #a5b4fc !important;
                    }
                    .excel-account-haber {
                        background-color: rgba(148, 163, 184, 0.15) !important;
                        color: #94a3b8 !important;
                    }

                    /* === POS (Punto de Venta) === */
                    /* Encabezados de categoría pegajosos */
                    .bg-mainBg\\/95 { background-color: rgba(11, 24, 48, 0.95) !important; }
                    /* Placeholder de imagen de producto (degradado crema -> tinte naranja oscuro) */
                    .bg-gradient-to-br.from-orange-50 {
                        background-image: none !important;
                        background-color: rgba(249, 115, 22, 0.08) !important;
                    }
                    /* Zona de items del ticket */
                    .bg-slate-50\\/50 { background-color: #1b3358 !important; }
                    /* Bordes tenues introducidos por el rediseño */
                    .border-slate-200\\/70, .border-slate-200\\/80, .border-slate-300 { border-color: rgba(96, 165, 250, 0.3) !important; }
                `;
            document.documentElement.appendChild(styleEl);
        }
    }

    // El tema azul oscuro es el único modo de la aplicación: sin selector, sin modo claro.
    localStorage.setItem('darkMode', 'true');
    applyTheme();
    // Stub inofensivo: el botón de cambio de tema quedó oculto (ya no hay modo claro que alternar).
    window.toggleDarkMode = function() {};

    // === MEJORAS GLOBALES DE UI (móvil, transiciones fluidas, tablas y gráficos) ===

    // 1. Estilos globales inyectados en todas las páginas
    (function inyectarEstilosPremium() {
        if (document.getElementById('ui-premium-style')) return;
        const st = document.createElement('style');
        st.id = 'ui-premium-style';
        st.innerHTML = `
            html { -webkit-tap-highlight-color: transparent; }

            /* Entrada suave de cada página */
            body { animation: pageFadeIn .45s cubic-bezier(.22, 1, .36, 1); }
            @keyframes pageFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

            /* Transiciones fluidas en elementos interactivos */
            button, a, input, select, textarea { transition: background-color .2s cubic-bezier(.4,0,.2,1), border-color .2s cubic-bezier(.4,0,.2,1), color .2s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1), transform .2s cubic-bezier(.4,0,.2,1), opacity .2s ease; }
            button:active { transform: scale(.97); }

            /* Scrollbars finos y elegantes */
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, .35); border-radius: 8px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, .6); }

            /* Tablas responsive: scroll horizontal con inercia en el teléfono */
            .tabla-responsive { overflow-x: auto; width: 100%; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }

            @media (max-width: 640px) {
                .tabla-responsive > table { min-width: 560px; }
                /* Evita el zoom automático de iOS al enfocar campos */
                input, select, textarea { font-size: 16px !important; }
                /* Tap targets cómodos */
                .tabla-responsive td, .tabla-responsive th { padding-top: .65rem !important; padding-bottom: .65rem !important; white-space: nowrap; }
            }

            /* Respeto por usuarios con movimiento reducido */
            @media (prefers-reduced-motion: reduce) {
                body { animation: none; }
                * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
            }
        `;
        document.head.appendChild(st);
    })();

    // 2. Envolver tablas en contenedores scrolleables (estáticas y las que crea el JS después)
    function envolverTablas(raiz) {
        (raiz.querySelectorAll ? raiz.querySelectorAll('table') : []).forEach(t => {
            if (t.closest('#zona-impresion') || t.closest('.tabla-responsive')) return;
            const padre = t.parentElement;
            if (!padre) return;
            const overflowPadre = getComputedStyle(padre).overflowX;
            if (overflowPadre === 'auto' || overflowPadre === 'scroll') {
                padre.classList.add('tabla-responsive');
                return;
            }
            const wrap = document.createElement('div');
            wrap.className = 'tabla-responsive';
            padre.insertBefore(wrap, t);
            wrap.appendChild(t);
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        envolverTablas(document);
        // Observar tablas agregadas dinámicamente (con debounce para no impactar rendimiento)
        let tmrTablas = null;
        const obs = new MutationObserver(() => {
            clearTimeout(tmrTablas);
            tmrTablas = setTimeout(() => envolverTablas(document), 250);
        });
        obs.observe(document.body, { childList: true, subtree: true });
    });

    // 3. Defaults premium de Chart.js para TODOS los gráficos del sistema
    function aplicarDefaultsChart() {
        if (typeof Chart === 'undefined') return;
        try {
            Chart.defaults.font.family = "'Outfit', sans-serif";
            Chart.defaults.animation.duration = 800;
            Chart.defaults.animation.easing = 'easeOutQuart';
            // CRÍTICO: no animar colores. Con fondos degradados (CanvasGradient) la
            // interpolación de color de Chart.js lanza una excepción dentro del bucle
            // de animación y TODOS los gráficos se quedan congelados en altura cero.
            Chart.defaults.animations.colors = false;
            Chart.defaults.plugins.tooltip.backgroundColor = '#0f172a';
            Chart.defaults.plugins.tooltip.titleColor = '#f8fafc';
            Chart.defaults.plugins.tooltip.bodyColor = '#cbd5e1';
            Chart.defaults.plugins.tooltip.borderColor = 'rgba(148, 163, 184, 0.25)';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
            Chart.defaults.plugins.tooltip.padding = 12;
            Chart.defaults.plugins.tooltip.cornerRadius = 12;
            Chart.defaults.plugins.tooltip.usePointStyle = true;
            Chart.defaults.plugins.tooltip.boxPadding = 4;
            Chart.defaults.plugins.legend.labels.usePointStyle = true;
            Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
            Chart.defaults.plugins.legend.labels.boxWidth = 6;
            Chart.defaults.plugins.legend.labels.boxHeight = 6;
            Chart.defaults.plugins.legend.labels.padding = 14;
            Chart.defaults.elements.line.tension = 0.4;
            Chart.defaults.elements.line.borderWidth = 2.5;
            Chart.defaults.elements.point.radius = 0;
            Chart.defaults.elements.point.hoverRadius = 5;
            Chart.defaults.elements.point.hitRadius = 20;
            Chart.defaults.elements.bar.borderRadius = 6;
        } catch (e) { console.warn('No se pudieron aplicar defaults de Chart:', e); }
    }
    aplicarDefaultsChart();
    window.addEventListener('DOMContentLoaded', aplicarDefaultsChart);

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

    // REGLAS PARA ROLES LIMITADOS (PASTELERA, MESERO, COCINERO, BARISTA)
    const esRolLimitado = ['PASTELERA', 'PASTELERO', 'MESERO', 'COCINERO', 'BARISTA'].some(r => rol.includes(r));
    if (esRolLimitado) {
        const esMesero = rol.includes('MESERO');
        const paginasPermitidas = esMesero
            ? ['asistencia.html', 'pedidos_internos.html', 'realizar_pedido.html', 'index.html', '']
            : ['asistencia.html', 'pedidos_internos.html', 'index.html', ''];

        if (!paginasPermitidas.includes(pageName)) {
            window.location.href = esMesero ? 'realizar_pedido.html' : 'asistencia.html';
            return;
        }

        window.addEventListener('DOMContentLoaded', () => {
            // Ocultar todos los enlaces del sidebar excepto las páginas permitidas para este rol
            document.querySelectorAll('aside nav a').forEach(el => {
                const href = el.getAttribute('href') || '';
                const visible = paginasPermitidas.some(p => p && href.includes(p));
                el.style.display = visible ? 'flex' : 'none';
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
        } else if (pageName.includes('bitacora.html')) {
            hasAccess = isAdmin;
        }

        if (!hasAccess) {
            alert('⛔ Acceso denegado: No tienes permisos para acceder a esta sección.');
            window.location.href = 'ventas.html';
            return;
        }
    }

    // Abre/cierra el grupo colapsable "Más" del sidebar y recuerda la preferencia
    // del usuario (localStorage) para que no se cierre solo al cambiar de página.
    window.toggleMasMenu = function(btn) {
        const group = btn.nextElementSibling;
        if (!group) return;
        const abrir = group.classList.contains('hidden');
        group.classList.toggle('hidden', !abrir);
        const chevron = btn.querySelector('.mas-menu-chevron');
        if (chevron) chevron.classList.toggle('rotate-180', abrir);
        try { localStorage.setItem('sidebarMasAbierto', abrir ? 'true' : 'false'); } catch (e) {}
    };

    window.addEventListener('DOMContentLoaded', () => {
        // Inyectar dinámicamente el enlace de "Control Diario" en el sidebar,
        // como primer ítem del grupo colapsable "Más".
        const nav = document.querySelector('aside nav');
        const masGroup = nav ? nav.querySelector('.mas-menu-group') : null;
        const pageName = window.location.pathname.split("/").pop();
        const isControlDiarioActive = pageName.includes('control_diario.html');
        if (nav) {
            const controlDiarioHTML = `
                <a href="control_diario.html" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isControlDiarioActive ? 'bg-orange-500/10 text-orange-500 font-bold' : 'hover:bg-slate-900 hover:text-slate-200 font-medium'}">
                    <i class="fa-solid fa-calendar-day w-5 text-center text-orange-500/60"></i> <span>Control Diario</span>
                </a>
            `;
            if (!nav.querySelector('a[href="control_diario.html"]')) {
                if (masGroup) {
                    masGroup.insertAdjacentHTML('afterbegin', controlDiarioHTML);
                } else {
                    const empleadosLink = nav.querySelector('a[href="empleados.html"]');
                    const dashLink = nav.querySelector('a[href="dashboard.html"]');
                    if (empleadosLink) {
                        empleadosLink.insertAdjacentHTML('afterend', controlDiarioHTML);
                    } else if (dashLink) {
                        dashLink.insertAdjacentHTML('afterend', controlDiarioHTML);
                    } else {
                        nav.insertAdjacentHTML('afterbegin', controlDiarioHTML);
                    }
                }
            }
        }

        // Inyectar dinámicamente el enlace de "Facturas" dentro del grupo colapsable
        // "Más" (no como ítem de primer nivel — se agregó por error así en un commit
        // hecho desde otra PC, duplicado a mano en cada página; este es el mismo
        // mecanismo que ya usan "Control Diario" y "Bitácora" para no tener que
        // mantener 25+ copias sueltas del link).
        if (nav) {
            const pageNameFacturas = window.location.pathname.split("/").pop();
            const isFacturasActive = pageNameFacturas.includes('facturas.html');
            const facturasHTML = `
                <a href="facturas.html" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isFacturasActive ? 'bg-accent/20 text-accent font-bold' : 'hover:bg-slate-900 hover:text-slate-200 font-medium'}">
                    <i class="fa-solid fa-file-invoice w-5 text-center text-accent/70"></i> <span>Facturas</span>
                </a>
            `;
            if (!nav.querySelector('a[href="facturas.html"]')) {
                const controlDiarioLink = nav.querySelector('a[href="control_diario.html"]');
                if (controlDiarioLink) {
                    controlDiarioLink.insertAdjacentHTML('afterend', facturasHTML);
                } else if (masGroup) {
                    masGroup.insertAdjacentHTML('afterbegin', facturasHTML);
                } else {
                    nav.insertAdjacentHTML('beforeend', facturasHTML);
                }
            }
        }

        // Inyectar dinámicamente el enlace de "Bitácora" como último ítem del
        // sidebar, justo arriba del botón "Más" (solo visible para administradores).
        if (nav) {
            const pageNameBitacora = window.location.pathname.split("/").pop();
            const isBitacoraActive = pageNameBitacora.includes('bitacora.html');
            const bitacoraHTML = `
                <a href="bitacora.html" class="solo-admin flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isBitacoraActive ? 'bg-accent/20 text-accent font-bold' : 'hover:bg-slate-900 hover:text-slate-200 font-medium'}">
                    <i class="fa-solid fa-timeline w-5 text-center text-accent/70"></i> <span>Bitácora</span>
                </a>
            `;
            if (!nav.querySelector('a[href="bitacora.html"]')) {
                const toggleBtn = nav.querySelector('.mas-menu-toggle');
                if (toggleBtn) {
                    toggleBtn.insertAdjacentHTML('beforebegin', bitacoraHTML);
                } else {
                    nav.insertAdjacentHTML('beforeend', bitacoraHTML);
                }
            }
        }

        // Grupo colapsable "Más" del sidebar: se abre solo si la página activa
        // vive adentro, o si el usuario lo había dejado abierto la última vez.
        if (masGroup) {
            const toggleBtn = nav.querySelector('.mas-menu-toggle');
            const chevron = toggleBtn ? toggleBtn.querySelector('.mas-menu-chevron') : null;
            const tieneActivaAdentro = isControlDiarioActive || !!masGroup.querySelector('a.bg-accent\\/20, a.text-accent');
            let abierto = tieneActivaAdentro;
            if (!abierto) {
                try { abierto = localStorage.getItem('sidebarMasAbierto') === 'true'; } catch (e) { abierto = false; }
            } else {
                try { localStorage.setItem('sidebarMasAbierto', 'true'); } catch (e) {}
            }
            masGroup.classList.toggle('hidden', !abierto);
            if (chevron) chevron.classList.toggle('rotate-180', abierto);
        }

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
                const tieneAccesoAsistencia = isAdmin || rol === 'CAJERO' || ['PASTELERA', 'PASTELERO', 'MESERO', 'COCINERO', 'BARISTA'].some(r => rol.includes(r));
                if (!tieneAccesoAsistencia) el.style.display = 'none';
                else el.style.display = 'flex';
            }
            if (href.includes('ventas.html') || href.includes('venta_mesa.html')) {
                // Cajeros también tienen acceso al Punto de Venta y Venta por Mesa
                if (!isAdmin && rol !== 'CAJERO') el.style.display = 'none';
                else el.style.display = 'flex';
            }
            if (href.includes('caja.html') || href.includes('webhook.html')) {
                if (!isAdmin) el.style.display = 'none';
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
