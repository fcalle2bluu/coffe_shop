const fs = require('fs');
const files = fs.readdirSync('frontend').filter(f => f.endsWith('.html'));
files.forEach(file => {
    let content = fs.readFileSync('frontend/' + file, 'utf8');
    
    // Fix all possible mutated URLs
    content = content.replace(/Almacén_stock\.html/g, 'almacen_stock.html');
    content = content.replace(/Almacén_movimientos\.html/g, 'almacen_movimientos.html');
    content = content.replace(/Auditoría\.html/g, 'inventario.html'); // Just in case "Auditoría" replaced "inventario" somewhere, etc.
    content = content.replace(/Parámetros\.html/g, 'parametros.html');
    content = content.replace(/Sesión\.html/g, 'index.html');
    
    fs.writeFileSync('frontend/' + file, content, 'utf8');
});
console.log('Fixed URLs');
