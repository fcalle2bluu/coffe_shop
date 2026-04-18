const fs = require('fs');
const path = require('path');

const dirs = [
    'c:/Users/ASUS/Documents/cafeteria_web/frontend/',
    'c:/Users/ASUS/Documents/cafeteria_web/frontend/js/'
];

function replaceInDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const p = path.join(dir, file);
        if (fs.statSync(p).isFile() && (file.endsWith('.html') || file.endsWith('.js'))) {
            let content = fs.readFileSync(p, 'utf8');
            const originalContent = content;
            
            // Replace 'S/ ' with 'Bs. '
            content = content.replace(/S\/\s/g, 'Bs. ');
            // Replace 'S/' with 'Bs.' when there's no space (e.g. S/0.00 or S/)
            content = content.replace(/S\/(?!\/)/g, 'Bs.');
            
            if (content !== originalContent) {
                fs.writeFileSync(p, content, 'utf8');
                console.log('Updated ' + p);
            }
        }
    });
}

dirs.forEach(replaceInDir);
console.log('Done.');
