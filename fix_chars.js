const fs = require('fs');
const files = fs.readdirSync('frontend').filter(f => f.endsWith('.html'));

files.forEach(file => {
    let text = fs.readFileSync('frontend/' + file, 'utf8');
    text = text.replace(/Almac.n/gi, 'Almacén');
    text = text.replace(/Auditor.a/gi, 'Auditoría');
    text = text.replace(/Par.metros/gi, 'Parámetros');
    text = text.replace(/Sesi.n/gi, 'Sesión');
    text = text.replace(/AlmacǸn/gi, 'Almacén');
    text = text.replace(/Auditora/gi, 'Auditoría');
    text = text.replace(/Parǭmetros/gi, 'Parámetros');
    text = text.replace(/Sesin/gi, 'Sesión');

    fs.writeFileSync('frontend/' + file, text, 'utf8');
});
console.log('Fixed encodings!');
