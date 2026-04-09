const fs = require('fs');
const path = require('path');

const colorMap = {
    '#3E2723': 'slate-900', // Very Dark Brown
    '#4E342E': 'slate-800', // Dark Brown
    '#5D4037': 'slate-700', // Brown
    '#8D6E63': 'orange-500',// Light Brown / Ring Color
    '#E65100': 'orange-600',// Orange
    '#EF6C00': 'orange-500',// Hover Orange
    '#F4F1EA': 'slate-50'   // Dirty white
};

// Also map direct hex substitution for JS files and inline styles
const hexMap = {
    '#3E2723': '#0f172a', 
    '#4E342E': '#1e293b', 
    '#5D4037': '#334155', 
    '#8D6E63': '#f97316', 
    '#E65100': '#ea580c', 
    '#EF6C00': '#f97316', 
    '#F4F1EA': '#f8fafc'
};

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.css')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;

            // TailWind classes replacement e.g. text-[#3E2723] -> text-slate-900
            for (let [oldHex, twClass] of Object.entries(colorMap)) {
                // Regex for tailwind classes with dynamic hex
                const rClassPrefixes = ['bg', 'text', 'border', 'ring', 'focus:ring', 'focus:border', 'hover:bg', 'hover:text', 'border-t', 'border-b', 'border-l', 'border-r'];
                for (let prefix of rClassPrefixes) {
                    // Match literally e.g. bg-[#3E2723]
                    const classRegex = new RegExp(prefix + '-\\[\\s*' + oldHex + '\\s*\\]', 'gi');
                    content = content.replace(classRegex, prefix + '-' + twClass);
                }
                
                // Replace remaining raw hex (like in JS charts or config)
                const rawRegex = new RegExp(oldHex, 'gi');
                content = content.replace(rawRegex, hexMap[oldHex]);
            }

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Fixed colors in', fullPath);
            }
        }
    }
}

processDir('frontend');
