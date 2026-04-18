const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/ASUS/Documents/cafeteria_web/frontend/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const linkHTML = `            <a href="pedidos_internos.html" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 hover:bg-slate-900 hover:text-slate-200 font-medium">
                <i class="fa-solid fa-clipboard-list w-5 text-center text-orange-500/60"></i> <span>Pedidos Internos</span>
            </a>
`;

files.forEach(file => {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');

    const hasLink = content.includes('href="pedidos_internos.html"');
    
    if (content.includes('</nav>') && !hasLink) {
        content = content.replace(/<\/nav>/, linkHTML + '        </nav>');
        fs.writeFileSync(p, content);
        console.log('Updated ' + file);
    }
});
