const fs = require('fs');

const files = fs.readdirSync('frontend').filter(f => f.endsWith('.html'));

const tailwindConfig = `
    <script>
        tailwind.config = { 
            theme: { 
                extend: { 
                    colors: { 
                        sidebar: '#1c1917',
                        sidebarHover: '#292524',
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

const googleFont = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
`;

files.forEach(file => {
    let content = fs.readFileSync('frontend/' + file, 'utf8');

    // 1. UPDATE TAILWIND CONFIG
    content = content.replace(/<script>\s*tailwind\.config\s*=\s*(.|\n)*?<\/script>/, tailwindConfig);

    // 2. INJECT GOOGLE FONTS IF MISSING
    if (!content.includes('fonts.googleapis.com')) {
        content = content.replace('</head>', googleFont + '\n</head>');
    }

    // 3. GLOBAL COLOR AND THEME REPLACEMENTS
    // Topbar (white background, slate text, thin border)
    content = content.replace(/bg-topbar text-white/g, 'bg-white text-gray-900 border-b border-gray-200');
    content = content.replace(/bg-topbar shadow/g, 'bg-white text-gray-900 border-b border-gray-200 shadow-sm');
    
    // Sidebar inner borders and colors
    content = content.replace(/border-\[\#3E2723\]/g, 'border-stone-800');
    content = content.replace(/border-\[\#5D4037\]/g, 'border-stone-800');
    content = content.replace(/text-\[\#D7CCC8\]/g, 'text-orange-500'); // logo icon color
    content = content.replace(/text-\[\#BCAAA4\]/g, 'text-stone-400'); // inactive icon sidebar color
    content = content.replace(/text-\[\#FFB74D\]/g, 'text-orange-500'); // active icon sidebar color
    
    // Primary Button Colors
    content = content.replace(/bg-\[\#E65100\]/g, 'bg-orange-600');
    content = content.replace(/hover:bg-\[\#EF6C00\]/g, 'hover:bg-orange-700 transition-all duration-200 shadow-md hover:shadow-lg');
    content = content.replace(/text-\[\#E65100\]/g, 'text-orange-600');
    content = content.replace(/text-\[\#EF6C00\]/g, 'text-orange-700');
    content = content.replace(/border-\[\#E65100\]/g, 'border-orange-600');
    
    content = content.replace(/focus:ring-\[\#8D6E63\]/g, 'focus:ring-orange-500');
    content = content.replace(/focus:border-\[\#8D6E63\]/g, 'focus:border-orange-500');

    // Avatar Color
    content = content.replace(/bg-\[\#8D6E63\]/g, 'bg-orange-600');
    
    // Data Tables and Panels
    content = content.replace(/border-t-4 border-\[\#5D4037\]/g, 'border border-gray-200 shadow-xl rounded-xl');
    content = content.replace(/text-\[\#4E342E\]/g, 'text-slate-800');
    content = content.replace(/text-\[\#5D4037\]/g, 'text-slate-800');
    content = content.replace(/bg-\[\#FAFAFA\]/g, 'bg-white');
    content = content.replace(/bg-orange-50/g, 'bg-slate-50 border-t border-b border-gray-100'); // Quick edit rows
    content = content.replace(/border-orange-100/g, ''); // Clear orange 100 borders
    content = content.replace(/bg-gray-100 sticky/g, 'bg-slate-50 sticky border-b border-gray-200 shadow-sm'); // Table headers
    
    // General Input fields (sleek borders)
    content = content.replace(/border-gray-300/g, 'border-gray-300 text-slate-800 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors');

    fs.writeFileSync('frontend/' + file, content, 'utf8');
});

console.log('Premium aesthetic injected globally.');
