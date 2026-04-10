const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\ASUS\\Documents\\cafeteria_web\\frontend';
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');

    // 1. Remover h-screen y overflow-hidden del body para que se active Pull-to-refresh
    content = content.replace(/class="([^"]*)bg-mainBg flex h-screen overflow-hidden([^"]*)"/g, 'class="$1bg-mainBg flex items-start font-sans relative$2"');
    // Para variaciones sin espacios exactos:
    content = content.replace(/h-screen overflow-hidden/g, ''); 

    // 2. El sidebar debe ser sticky en desktop para no perderse si la pagina es muy larga
    content = content.replace(/md:relative/g, 'md:sticky md:top-0 md:h-screen shrink-0');

    // 3. El contenedor "main" tampoco debe estar constreñido
    content = content.replace(/<main class="flex-1 flex flex-col([^"]*)">/g, '<main class="flex-1 flex flex-col min-w-0 min-h-screen">');

    // 4. Transformar los thead de las tablas para que solo aparezcan en desktop o se oculten si hacemos diseño de tarjetas
    content = content.replace(/<thead class="bg-slate-50 sticky top-0/g, '<thead class="bg-slate-50 hidden md:table-header-group sticky top-0');
    
    // Si la tabla no tiene thead modificado, añadimos hidden sm:table-header-group
    content = content.replace(/<thead class="bg-gray-50/g, '<thead class="bg-gray-50 hidden sm:table-header-group');

    // 5. Envolver las tablas en wrappers si no se hacen tarjetas o cambiar tabla directament. 
    // Lo más seguro es eliminar .min-w-full y confiar en el diseño por js.
    
    fs.writeFileSync(path.join(dir, file), content);
    console.log('Fixed', file);
});
