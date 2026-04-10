const fs = require('fs');
const path = require('path');

const dir = 'frontend';
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html'); 

const premiumConfig = `
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

    // Robust replacement: find first <script> that contains tailwind.config and replace until </script>
    const startIdx = content.indexOf('<script>');
    let found = false;
    
    // We search for the script block that contains tailwind.config
    let currentIdx = 0;
    while ((currentIdx = content.indexOf('<script>', currentIdx)) !== -1) {
        const endIdx = content.indexOf('</script>', currentIdx);
        if (endIdx === -1) break;
        
        const scriptBlock = content.substring(currentIdx, endIdx + 9);
        if (scriptBlock.includes('tailwind.config')) {
            content = content.substring(0, currentIdx) + premiumConfig.trim() + content.substring(endIdx + 9);
            found = true;
            break;
        }
        currentIdx = endIdx + 9;
    }

    if (found) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Corregido: ${file}`);
    }
});
