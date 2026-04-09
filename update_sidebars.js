const fs = require('fs');
const path = './frontend';
const files = fs.readdirSync(path).filter(f => f.endsWith('.html') && f !== 'apartados.html' && f !== 'pedidos_internos.html');

files.forEach(file => {
    const p = path + '/' + file;
    let text = fs.readFileSync(p, 'utf8');
    
    // Some sidebars might have "Apartados" or "Pedidos Internos" linked to apartados.html
    text = text.replace(/<li>\s*<a href="apartados\.html".*?<\/li>/g, 
        '<li><a href="pedidos_internos.html" class="flex items-center px-4 py-2 hover:bg-sidebarHover hover:text-white transition-colors"><i class="fa-solid fa-clipboard-list w-6 text-center text-[#BCAAA4]"></i> <span>Pedidos Internos</span></a></li>\n                <li><a href="apartados.html" class="flex items-center px-4 py-2 hover:bg-sidebarHover hover:text-white transition-colors"><i class="fa-solid fa-hand-holding-hand w-6 text-center text-[#BCAAA4]"></i> <span>Reservas Clientes</span></a></li>');
        
    fs.writeFileSync(p, text);
});
console.log('Sidebar updated');
