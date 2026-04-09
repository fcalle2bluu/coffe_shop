const fs = require('fs');
const path = require('path');

const standardTailwindConfig = `
    <script>
        tailwind.config = { 
            theme: { 
                extend: { 
                    colors: { 
                        sidebar: '#1c1917',
                        sidebarHover: '#292524',
                        topbar: '#ffffff',
                        logoBg: '#1c1917',
                        mainBg: '#f8fafc',
                        accent: '#ea580c'
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    }
                } 
            } 
        }
    </script>
`;

function processDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (f.endsWith('.html') || f.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let orig = content;

            // 1. Unify all tailwind.config scripts in HTML files
            if (f.endsWith('.html')) {
                // Remove all variants of tailwind.config script completely
                content = content.replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>/gi, '');
                
                // Now insert it right before </head>
                content = content.replace('</head>', standardTailwindConfig + '\n</head>');
            }

            // 2. Unify Tailwind utility classes in JS and HTML
            content = content.replace(/slate-900/g, 'stone-900');
            content = content.replace(/slate-800/g, 'stone-800');
            content = content.replace(/slate-700/g, 'stone-700');
            
            // 3. Unify literal Hex colors for charts in JS
            content = content.replace(/#0f172a/gi, '#1c1917'); // slate-900 to stone-900
            content = content.replace(/#1e293b/gi, '#292524'); // slate-800 to stone-800
            content = content.replace(/#334155/gi, '#44403c'); // slate-700 to stone-700

            if (orig !== content) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Unificado:', f);
            }
        }
    });
}
processDir('frontend');
