// backend/routes/menu_pdf.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const PDFDocument = require('pdfkit');

// Helper to download an external image as a buffer with a timeout using native fetch
async function fetchImageBuffer(url, timeoutMs = 4000) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return null;
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        clearTimeout(id);
        console.error(`❌ Error al descargar imagen para PDF: ${url}`, e.message);
        return null;
    }
}

// Helper to get initials of a product for placeholder
function getInitials(name) {
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

// 1. Obtener todos los productos activos y su estado de inclusión en el PDF
router.get('/productos', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.nombre, p.precio_venta, p.imagen_url, p.categoria_id, c.nombre as categoria_nombre,
                   COALESCE(cfg.incluido, FALSE) as incluido, COALESCE(cfg.orden, 0) as orden
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN config_menu_pdf cfg ON p.id = cfg.producto_id
            WHERE p.activo = TRUE
            ORDER BY c.nombre ASC, p.nombre ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener catálogo para PDF:', error.message);
        res.status(500).json({ error: 'Error al obtener catálogo de menú.' });
    }
});

// 2. Guardar configuración de productos incluidos y su orden en el PDF
router.post('/config', async (req, res) => {
    const { productos } = req.body;
    if (!Array.isArray(productos)) {
        return res.status(400).json({ error: 'Se requiere una lista de productos válida.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
            INSERT INTO config_menu_pdf (producto_id, incluido, orden, fecha_actualizacion)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (producto_id) 
            DO UPDATE SET incluido = EXCLUDED.incluido, orden = EXCLUDED.orden, fecha_actualizacion = NOW()
        `;
        
        for (const prod of productos) {
            await client.query(query, [prod.producto_id, prod.incluido, prod.orden]);
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'Configuración guardada exitosamente.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al guardar configuración de PDF:', error.message);
        res.status(500).json({ error: 'Error al guardar configuración en base de datos.' });
    } finally {
        client.release();
    }
});

// 3. Generar y descargar el PDF en vivo usando PDFKit
router.get('/generar', async (req, res) => {
    try {
        // 1. Cargar datos de la empresa desde parámetros
        const paramRes = await pool.query('SELECT nombre_empresa, telefono, direccion FROM parametros WHERE id = 1');
        const empresaInfo = paramRes.rows[0] || {
            nombre_empresa: 'Café La Paz',
            telefono: 'Sin teléfono',
            direccion: 'La Paz, Bolivia'
        };

        // 2. Cargar productos incluidos en el menú ordenados por categoría y orden
        const query = `
            SELECT p.id, p.nombre, p.precio_venta, p.imagen_url, c.nombre as categoria_nombre, cfg.orden
            FROM config_menu_pdf cfg
            JOIN productos p ON cfg.producto_id = p.id
            JOIN categorias c ON p.categoria_id = c.id
            WHERE p.activo = TRUE AND cfg.incluido = TRUE
            ORDER BY c.nombre ASC, cfg.orden ASC, p.nombre ASC
        `;
        const prodRes = await pool.query(query);
        const productos = prodRes.rows;

        // Establecer tipo de contenido como PDF y abrir en inline en el navegador
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="menu_cafelapaz.pdf"');

        // Instanciar el documento PDF con buffer para la numeración final
        const doc = new PDFDocument({
            size: 'letter',
            margin: 40,
            bufferPages: true
        });

        // Tubería directa a la respuesta Express
        doc.pipe(res);

        // --- DIBUJAR CABECERA EN PORTADA / PÁGINA 1 ---
        // Franja café superior
        doc.rect(0, 0, doc.page.width, 130).fill('#3D231D');
        
        // Título de la empresa
        doc.fillColor('#FDFBF7')
           .font('Helvetica-Bold')
           .fontSize(24)
           .text(empresaInfo.nombre_empresa.toUpperCase(), 40, 45, { tracking: 2 });
           
        // Subtítulo
        doc.fillColor('#D4A373')
           .font('Helvetica-Bold')
           .fontSize(10)
           .text('CARTA DE PRODUCTOS / MENÚ GENERAL', 40, 75, { tracking: 4 });

        // Línea dorada divisora inferior en la cabecera
        doc.rect(0, 127, doc.page.width, 3).fill('#D4A373');

        // Coordenadas iniciales para la grilla
        let y = 150;
        let currentColumn = 0; // 0 = izquierda, 1 = derecha
        const colWidth = 256;
        const colSpacing = 20;
        const cardHeight = 80;
        const rowSpacing = 15;
        const bottomLimit = 720;
        let lastCategory = '';

        // Descarga previa de imágenes en paralelo para agilizar la generación
        console.log('🖼️ Descargando imágenes para el PDF...');
        const imageBuffers = {};
        await Promise.all(
            productos.map(async (prod) => {
                if (prod.imagen_url) {
                    const buf = await fetchImageBuffer(prod.imagen_url);
                    if (buf) imageBuffers[prod.id] = buf;
                }
            })
        );
        console.log('✅ Descarga de imágenes completada.');

        for (const prod of productos) {
            // Si la categoría cambia
            if (prod.categoria_nombre !== lastCategory) {
                lastCategory = prod.categoria_nombre;

                // Si estábamos en la columna derecha (index 1), pasamos a la siguiente fila antes de dibujar la cabecera
                if (currentColumn === 1) {
                    y += (cardHeight + rowSpacing);
                    currentColumn = 0;
                }

                // Verificar si hay espacio suficiente para la cabecera de categoría + al menos una fila de productos
                if (y + 120 > bottomLimit) {
                    doc.addPage();
                    y = 60;
                }

                // Dibujar cabecera de categoría
                doc.rect(40, y, 532, 22).fill('#3D231D');
                doc.fillColor('#FDFBF7')
                   .font('Helvetica-Bold')
                   .fontSize(9)
                   .text(prod.categoria_nombre.toUpperCase(), 52, y + 7, { tracking: 2 });
                   
                y += 32; // Avanzamos bajo la cabecera
            }

            // Verificar si el producto actual cabe en la página
            if (y + cardHeight > bottomLimit) {
                doc.addPage();
                y = 60;
                currentColumn = 0;

                // Re-dibujar cabecera de la categoría para indicar continuidad
                doc.rect(40, y, 532, 18).fill('#3D231D');
                doc.fillColor('#D4A373')
                   .font('Helvetica-Bold')
                   .fontSize(8)
                   .text(`${prod.categoria_nombre.toUpperCase()} (CONTINUACIÓN)`, 52, y + 5, { tracking: 1 });
                y += 28;
            }

            // Calcular coordenada X de la tarjeta
            const x = currentColumn === 0 ? 40 : (40 + colWidth + colSpacing);

            // Dibujar fondo de tarjeta redondeado con stroke sutil
            doc.save();
            doc.roundedRect(x, y, colWidth, cardHeight, 6).fill('#FDFBF7');
            doc.roundedRect(x, y, colWidth, cardHeight, 6).lineWidth(0.5).stroke('#E2E8F0');
            doc.restore();

            // Dibujar la imagen a la izquierda de la tarjeta
            const imgX = x + 8;
            const imgY = y + 8;
            const imgSize = 64;

            const buffer = imageBuffers[prod.id];
            if (buffer) {
                try {
                    // Recortar la imagen con esquinas redondeadas mediante clip
                    doc.save();
                    doc.roundedRect(imgX, imgY, imgSize, imgSize, 4).clip();
                    doc.image(buffer, imgX, imgY, {
                        width: imgSize,
                        height: imgSize,
                        fit: [imgSize, imgSize],
                        align: 'center',
                        valign: 'center'
                    });
                    doc.restore();
                } catch (imgErr) {
                    console.error('Error dibujando imagen en PDF:', imgErr.message);
                    // Fallback a iniciales en caso de fallo al decodificar
                    doc.save();
                    doc.roundedRect(imgX, imgY, imgSize, imgSize, 4).fill('#F5EBE0');
                    doc.fillColor('#C68B59')
                       .font('Helvetica-Bold')
                       .fontSize(14)
                       .text(getInitials(prod.nombre), imgX, imgY + 25, { width: imgSize, align: 'center' });
                    doc.restore();
                }
            } else {
                // Dibujar caja placeholder para productos sin imagen
                doc.save();
                doc.roundedRect(imgX, imgY, imgSize, imgSize, 4).fill('#F5EBE0');
                doc.fillColor('#C68B59')
                   .font('Helvetica-Bold')
                   .fontSize(14)
                   .text(getInitials(prod.nombre), imgX, imgY + 25, { width: imgSize, align: 'center' });
                doc.restore();
            }

            // Dibujar nombre de producto a la derecha
            doc.fillColor('#222222')
               .font('Helvetica-Bold')
               .fontSize(9.5)
               .text(prod.nombre, x + 80, y + 12, {
                   width: 165,
                   height: 25,
                   ellipsis: true
               });

            // Dibujar badge de precio en oro café
            const priceBadgeY = y + 44;
            doc.save();
            doc.roundedRect(x + 80, priceBadgeY, 65, 16, 3).fill('#D4A373');
            doc.fillColor('#FDFBF7')
               .font('Helvetica-Bold')
               .fontSize(8)
               .text(`Bs. ${parseFloat(prod.precio_venta).toFixed(2)}`, x + 80, priceBadgeY + 4, {
                   width: 65,
                   align: 'center'
               });
            doc.restore();

            // Avanzar columna
            if (currentColumn === 0) {
                currentColumn = 1;
            } else {
                currentColumn = 0;
                y += (cardHeight + rowSpacing);
            }
        }

        // --- RENDERIZADO DE FOOTER Y NUMERACIÓN DE PÁGINAS ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            
            // Línea divisoria de pie de página
            doc.save();
            doc.moveTo(40, 745)
               .lineTo(572, 745)
               .lineWidth(0.5)
               .stroke('#C68B59');
               
            // Texto de contacto
            const contactText = `${empresaInfo.nombre_empresa}  |  Tel: ${empresaInfo.telefono}  |  Dir: ${empresaInfo.direccion}`;
            doc.fillColor('#888888')
               .font('Helvetica')
               .fontSize(7.5)
               .text(contactText, 40, 755, { width: 420, truncate: true });
               
            // Paginación
            const pageText = `Página ${i + 1} de ${range.count}`;
            doc.fillColor('#888888')
               .font('Helvetica-Bold')
               .fontSize(7.5)
               .text(pageText, 472, 755, { width: 100, align: 'right' });
            doc.restore();
        }

        // Finalizar y transmitir el documento
        doc.end();
        console.log('🎉 Documento PDF generado y streameado correctamente.');

    } catch (error) {
        console.error('Error al generar PDF de menú:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error interno al generar el archivo PDF.' });
        }
    }
});

module.exports = router;
