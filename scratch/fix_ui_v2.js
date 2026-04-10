const fs = require('fs');
const path = require('path');

const dir = 'frontend';
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html'); 

const cleanTailwindConfig = `
    <script>
        tailwind.config = { 
            theme: { 
                extend: { 
                    colors: { 
                        sidebar: '#020617',
                        sidebarHover: '#0f172a',
                        topbar: '#ffffff',
                        mainBg: '#f8fafc',
                        accent: '#f97316',
                        glass: 'rgba(255, 255, 255, 0.8)'
                    },
                    fontFamily: {
                        sans: ['Outfit', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    boxShadow: {
                        'premium': '0 10px 40px -10px rgba(0,0,0,0.08)',
                        'inner-soft': 'inset 0 2px 4px 0 rgba(0,0,0,0.02)',
                    }
                } 
            } 
        }
    </script>
`;

htmlFiles.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix the tailwind config block completely by replacing the whole script block
    const configRegex = /<script>\s*tailwind\.config\s*=\s*{[\s\S]+?}<\/script>/g;
    content = content.replace(configRegex, cleanTailwindConfig.trim());

    // Ensure sidebar has bg-sidebar and text-slate-400
    content = content.replace(/<aside id="sidebar" class="([^"]*)"/, (match, classes) => {
        if (!classes.includes('bg-sidebar')) {
            return `<aside id="sidebar" class="w-64 bg-sidebar text-slate-400 flex flex-col fixed inset-y-0 left-0 z-50 transform -translate-x-full md:sticky md:top-0 md:h-screen shrink-0 md:translate-x-0 transition-all duration-300 ease-in-out border-r border-slate-800"`;
        }
        return match;
    });

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Corregido: ${file}`);
});
