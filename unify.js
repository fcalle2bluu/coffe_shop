const fs = require('fs');

const files = fs.readdirSync('frontend').filter(f => f.endsWith('.html') && f !== 'index.html' && f !== 'almacen_stock2.html');

const adminPages = ['almacen_stock.html', 'almacen_movimientos.html', 'compras.html', 'inventario.html', 'comprobantes.html', 'parametros.html'];

const navItems = [
    {href: "dashboard.html", icon: "fa-house", text: "Inicio", admin: false},
    {href: "almacen_stock.html", icon: "fa-box", text: "Stock Insumos", admin: true},
    {href: "almacen_movimientos.html", icon: "fa-clock-rotate-left", text: "Historial Almacén", admin: true},
    {href: "cotizaciones.html", icon: "fa-file-invoice", text: "Cotizaciones", admin: false},
    {href: "compras.html", icon: "fa-truck", text: "Compras", admin: true},
    {href: "caja.html", icon: "fa-cash-register", text: "Caja", admin: false},
    {href: "ventas.html", icon: "fa-cart-shopping", text: "Ventas", admin: false},
    {href: "pedidos_internos.html", icon: "fa-clipboard-list", text: "Pedidos Internos", admin: false},
    {href: "apartados.html", icon: "fa-hand-holding-hand", text: "Reservas Clientes", admin: false},
    {href: "inventario.html", icon: "fa-boxes-stacked", text: "Auditoría", admin: true},
    {href: "comprobantes.html", icon: "fa-receipt", text: "Comprobantes", admin: true},
    {href: "parametros.html", icon: "fa-gear", text: "Parámetros", admin: true}
];

files.forEach(file => {
    let content = fs.readFileSync('frontend/' + file, 'utf8');

    // 1. GENERATE THE NEW ASIDE UNIFORM BLOCK
    // Identify the active page
    
    let ulContent = `<ul class="space-y-1">\n`;
    navItems.forEach(item => {
        const isAdmin = item.admin ? 'solo-admin ' : '';
        const liClass = item.admin ? 'class="solo-admin"' : '';
        
        let aClass, innerHtml;
        if (item.href === file) {
            // Active style
            aClass = `flex items-center px-4 py-3 bg-sidebarHover border-l-4 border-[#E65100] text-white`;
            innerHtml = `<i class="fa-solid ${item.icon} w-6 text-center text-[#FFB74D]"></i><span class="font-medium">${item.text}</span>`;
        } else {
            // Inactive style
            aClass = `flex items-center px-4 py-2 hover:bg-sidebarHover hover:text-white transition-colors`;
            innerHtml = `<i class="fa-solid ${item.icon} w-6 text-center text-[#BCAAA4]"></i> <span>${item.text}</span>`;
        }

        // We wrap in li
        ulContent += `                <li ${liClass}><a href="${item.href}" class="${aClass}">${innerHtml}</a></li>\n`;
    });
    ulContent += `            </ul>`;

    // 2. We inject this into the file. We need to find the <nav> block and replace its contents.
    const navRegex = /(<nav[^>]*>)([\s\S]*?)(<\/nav>)/i;
    let newContent = content.replace(navRegex, `$1\n            ${ulContent}\n        $3`);

    // 3. GENERATE UNIFIED SECURITY SCRIPT
    // Replace EVERYTHING inside the script block or bottom scripts. Wait, since each page has specific functionality inline script,
    // we can't just regex out <script> because it has page-logic (e.g. `cargarPedidos()`).
    // BUT we CAN make sure the basic auth checks are there!
    
    // Instead of messing with the bottom scripts, let's just make sure the `solo-admin` hiding rule exists and applies correctly!
    // And that page guarding exists.
    
    // We can inject a <script src="js/security_guard.js"></script> before </body>.
    if (!newContent.includes('<script src="js/security_guard.js"></script>')) {
        newContent = newContent.replace('</body>', '    <script src="js/security_guard.js"></script>\n</body>');
    }

    // Now we must ensure the manual role hiding that might be hard-bugging the user is removed so they don't double-fire,
    // or we just leave them. The issue is likely missing `.solo-admin` classes on `<ul>` instead of `<li>` or `<a>`. 
    // By re-writing the `<ul>`, we guaranteed `.solo-admin` is on the `<li>`.

    fs.writeFileSync('frontend/' + file, newContent);
    console.log(`Updated ${file}`);
});
