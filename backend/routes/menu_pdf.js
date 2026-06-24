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

        // 2. Cargar productos incluidos en el menú ordenados por categoría y orden (consulta defensiva para evitar duplicados)
        const query = `
            SELECT id, nombre, precio_venta, imagen_url, categoria_nombre, orden
            FROM (
                SELECT DISTINCT ON (p.id) p.id, p.nombre, p.precio_venta, p.imagen_url, c.nombre as categoria_nombre, cfg.orden
                FROM config_menu_pdf cfg
                JOIN productos p ON cfg.producto_id = p.id
                JOIN categorias c ON p.categoria_id = c.id
                WHERE p.activo = TRUE AND cfg.incluido = TRUE
            ) sub
            ORDER BY categoria_nombre ASC, orden ASC, nombre ASC
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
            bufferPages: true,
            autoFirstPage: false // Controlamos manualmente la creación de páginas para evitar páginas en blanco
        });

        // Tubería directa a la respuesta Express
        doc.pipe(res);

        // Función para pintar el fondo café oscuro y marcos elegantes
        const paintBackground = (pageDoc) => {
            pageDoc.save();
            pageDoc.rect(0, 0, pageDoc.page.width, pageDoc.page.height).fill('#1A0F0D'); // Deep warm espresso
            
            // Marcos elegantes
            pageDoc.rect(20, 20, pageDoc.page.width - 40, pageDoc.page.height - 40)
                   .lineWidth(1)
                   .stroke('#3A2520');
            pageDoc.rect(24, 24, pageDoc.page.width - 48, pageDoc.page.height - 48)
                   .lineWidth(0.5)
                   .stroke('#D4A373'); // Borde dorado
            pageDoc.restore();
        };

        // Pintar automáticamente cada página añadida (incluida la primera, que añadimos manualmente)
        doc.on('pageAdded', () => {
            paintBackground(doc);
        });

        // Crear explícitamente la primera página (dispara 'pageAdded' -> pinta fondo)
        doc.addPage();

        // --- DIBUJAR CABECERA EN PORTADA / PÁGINA 1 ---
        doc.rect(24, 24, doc.page.width - 48, 110).fill('#2A1B18');
        doc.rect(24, 131, doc.page.width - 48, 3).fill('#D4A373'); // Línea dorada
        
        doc.fillColor('#E6B89C')
           .font('Times-Bold')
           .fontSize(11)
           .text('☕   C A F É   L A   P A Z   ☕', 40, 46, { align: 'center', tracking: 4 });

        doc.fillColor('#FDFBF7')
           .font('Times-Bold')
           .fontSize(24)
           .text(empresaInfo.nombre_empresa.toUpperCase(), 40, 68, { align: 'center', tracking: 2 });
           
        doc.fillColor('#D4A373')
           .font('Times-Italic')
           .fontSize(10.5)
           .text('Menú de Especialidades & Repostería', 40, 102, { align: 'center', tracking: 1 });

        // Si no hay productos configurados, avisar dentro del propio PDF y cerrar limpio (evita páginas extra sin contenido)
        if (!productos || productos.length === 0) {
            doc.fillColor('#D4A373')
               .font('Times-Italic')
               .fontSize(13)
               .text('Aún no se ha configurado ningún producto para este menú.', 40, 220, { align: 'center', width: doc.page.width - 80 });

            finalizarConFooter(doc, empresaInfo);
            doc.end();
            return;
        }

        // Coordenadas iniciales para la grilla (tarjetas más grandes y con imágenes más grandes)
        let y = 160;
        let currentColumn = 0; // 0 = izquierda, 1 = derecha
        const colWidth = 250;
        const colSpacing = 32;
        const cardHeight = 190; // Antes 150 -> optimizado para que la imagen y el texto quepan sin salirse
        const rowSpacing = 16;
        const bottomLimit = 700;
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

        // Helper: ¿queda suficiente espacio vertical en la página actual?
        const espacioDisponible = () => bottomLimit - y;

        for (let idx = 0; idx < productos.length; idx++) {
            const prod = productos[idx];

            // Si la categoría cambia
            if (prod.categoria_nombre !== lastCategory) {
                lastCategory = prod.categoria_nombre;

                // Si estábamos en la columna derecha, pasar a la siguiente fila antes del header
                if (currentColumn === 1) {
                    y += (cardHeight + rowSpacing);
                    currentColumn = 0;
                }

                // Solo saltamos de página si REALMENTE no entra la cabecera + al menos una tarjeta completa.
                // (antes este chequeo + el de la tarjeta individual podían dispararse ambos y generar un addPage de más)
                const necesitaNuevaPagina = (y + 45 + cardHeight) > bottomLimit;
                if (necesitaNuevaPagina) {
                    doc.addPage();
                    y = 60;
                }

                // Dibujar cabecera de categoría
                doc.rect(40, y, 532, 28).fill('#4E2C24');
                doc.fillColor('#E6B89C')
                   .font('Times-Bold')
                   .fontSize(11)
                   .text(prod.categoria_nombre.toUpperCase(), 55, y + 8, { tracking: 2 });
                   
                y += 45; // Avanzamos bajo la cabecera
            } else if (currentColumn === 0 && (y + cardHeight) > bottomLimit) {
                // Solo verificamos salto de página por tarjeta cuando empieza una fila nueva (columna izquierda).
                // Antes este chequeo podía dispararse también justo tras un salto de categoría -> doble addPage.
                doc.addPage();
                y = 60;
                currentColumn = 0;

                // Re-dibujar cabecera de la categoría para indicar continuidad
                doc.rect(40, y, 532, 22).fill('#4E2C24');
                doc.fillColor('#E6B89C')
                   .font('Times-Bold')
                   .fontSize(9)
                   .text(`${prod.categoria_nombre.toUpperCase()} (CONTINUACIÓN)`, 55, y + 6, { tracking: 1 });
                y += 38;
            }

            // Calcular coordenada X de la tarjeta
            const x = currentColumn === 0 ? 40 : (40 + colWidth + colSpacing);

            // Dibujar fondo de tarjeta redondeado con stroke sutil
            doc.save();
            doc.roundedRect(x, y, colWidth, cardHeight, 6).fill('#2A1B18');
            doc.roundedRect(x, y, colWidth, cardHeight, 6).lineWidth(0.5).stroke('#3E2A26');
            doc.restore();

            // Dibujar la imagen ocupando casi todo el ancho superior de la tarjeta (mucho más grande e impactante)
            const imgPadding = 8;
            const imgX = x + imgPadding;
            const imgY = y + imgPadding;
            const imgWidth = colWidth - (imgPadding * 2); // ~234px
            const imgHeight = 110; // Formato horizontal elegante para evitar desbordar la tarjeta

            const buffer = imageBuffers[prod.id];
            if (buffer) {
                try {
                    doc.save();
                    doc.roundedRect(imgX, imgY, imgWidth, imgHeight, 8).clip();
                    doc.image(buffer, imgX, imgY, {
                        width: imgWidth,
                        height: imgHeight,
                        fit: [imgWidth, imgHeight],
                        align: 'center',
                        valign: 'center'
                    });
                    doc.restore();
                } catch (imgErr) {
                    console.error('Error dibujando imagen en PDF:', imgErr.message);
                    dibujarPlaceholder(doc, imgX, imgY, imgWidth, imgHeight, prod.nombre);
                }
            } else {
                dibujarPlaceholder(doc, imgX, imgY, imgWidth, imgHeight, prod.nombre);
            }

            // Dibujar nombre de producto debajo de la imagen (Times-Bold)
            const textY = imgY + imgHeight + 8;
            doc.fillColor('#FDFBF7')
               .font('Times-Bold')
               .fontSize(11.5)
               .text(prod.nombre, x + 10, textY, {
                   width: colWidth - 20,
                   height: 18,
                   ellipsis: true
               });

            // Dibujar precio en color dorado, debajo del nombre (Times-Bold)
            doc.fillColor('#E6B89C')
               .font('Times-Bold')
               .fontSize(12.5)
               .text(`Bs. ${parseFloat(prod.precio_venta).toFixed(2)}`, x + 10, textY + 20, {
                   width: colWidth - 20
               });

            // Avanzar columna
            if (currentColumn === 0) {
                currentColumn = 1;
            } else {
                currentColumn = 0;
                y += (cardHeight + rowSpacing);
            }
        }

        finalizarConFooter(doc, empresaInfo);

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

// Dibuja un placeholder con iniciales cuando no hay imagen disponible o falló la descarga
function dibujarPlaceholder(doc, imgX, imgY, imgWidth, imgHeight, nombre) {
    doc.save();
    doc.roundedRect(imgX, imgY, imgWidth, imgHeight, 8).fill('#1A0F0D');
    doc.fillColor('#D4A373')
       .font('Times-Bold')
       .fontSize(Math.floor(imgHeight / 3))
       .text(getInitials(nombre), imgX, imgY + (imgHeight / 2) - 12, { width: imgWidth, align: 'center' });
    doc.restore();
}

// --- RENDERIZADO DE FOOTER Y NUMERACIÓN DE PÁGINAS ---
// Recorre únicamente las páginas que REALMENTE se crearon (bufferedPageRange refleja el total real,
// ya no se generan páginas extra de sobra porque autoFirstPage:false + addPage() controlado evita el desfase)
function finalizarConFooter(doc, empresaInfo) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        // Línea divisoria de pie de página
        doc.save();
        doc.moveTo(40, 745)
           .lineTo(572, 745)
           .lineWidth(0.5)
           .stroke('#3A2520');
           
        // Texto de contacto
        const contactText = `${empresaInfo.nombre_empresa}  |  Tel: ${empresaInfo.telefono}  |  Dir: ${empresaInfo.direccion}`;
        doc.fillColor('#8A7571')
           .font('Times-Roman')
           .fontSize(8)
           .text(contactText, 40, 755, { width: 420, truncate: true });
           
        // Paginación
        const pageText = `Página ${i + 1} de ${range.count}`;
        doc.fillColor('#D4A373')
           .font('Times-Bold')
           .fontSize(8)
           .text(pageText, 472, 755, { width: 100, align: 'right' });
        doc.restore();
    }
}

module.exports = router;