// backend/services/facturaTicketBuilder.js
//
// Arma un PDF nuevo, angosto (58mm), con diseño cuidado para impresora térmica,
// a partir de los campos ya extraídos de la factura original del SIN y la
// imagen REAL del QR recortada de esa misma factura (no se regenera el QR, ni
// se inventa ningún dato: todo lo que se ve acá salió de la factura original).
//
// El alto del PDF se calcula en base al contenido real (cantidad de ítems, si
// las descripciones ocupan una o varias líneas, si hay QR o no), no con un
// número fijo: se dibuja todo una primera vez en un documento descartable para
// medir cuánto ocupa, y recién ahí se arma el PDF final con el alto exacto.

const PDFDocument = require('pdfkit');
const path = require('path');

const MM_A_PT = 2.83465;
const ANCHO_MM = 58;
const ANCHO_PT = ANCHO_MM * MM_A_PT;
const MARGEN = 10;
const ANCHO_UTIL = ANCHO_PT - MARGEN * 2;
// Copia chica (160x160) del logo, generada una sola vez con `sips` a partir de
// frontend/favicon.png (que es en realidad un JPEG de 1024x1024 mal nombrado).
// Usar la original inflaba el PDF a ~460KB por nada — a 34pt de alto en el
// ticket, 160px de origen sobra de sobra en nitidez.
const LOGO_PATH = path.join(__dirname, '../assets/logo_ticket.jpg');

const GRIS_OSCURO = '#1a1a1a';
const GRIS_TEXTO = '#3a3a3a';
const GRIS_ETIQUETA = '#8a8a8a';
const GRIS_LINEA = '#c9c9c9';
const GRIS_CLARO_FONDO = '#eeeeee';

function fmt(n) {
    return n === null || n === undefined ? '' : n.toFixed(2);
}

function dibujarContenido(doc, campos, qrPngBuffer) {
    const items = Array.isArray(campos.items) ? campos.items : [];

    const centro = (texto, fontSize = 7, opts = {}) => {
        doc.font(opts.font || (opts.bold ? 'Helvetica-Bold' : 'Helvetica'))
            .fontSize(fontSize)
            .fillColor(opts.color || GRIS_TEXTO);
        doc.text(texto, MARGEN, doc.y, { width: ANCHO_UTIL, align: 'center', ...opts.textOpts });
    };
    const izq = (texto, fontSize = 7, opts = {}) => {
        doc.font(opts.font || (opts.bold ? 'Helvetica-Bold' : 'Helvetica'))
            .fontSize(fontSize)
            .fillColor(opts.color || GRIS_TEXTO);
        doc.text(texto, MARGEN, doc.y, { width: ANCHO_UTIL, align: 'left', ...opts.textOpts });
    };
    // Fila etiqueta (izquierda, gris) + valor (derecha, oscuro/negrita) en la misma línea.
    const filaEtiquetaValor = (etiqueta, valor, fontSize = 7) => {
        const y = doc.y;
        doc.font('Helvetica').fontSize(fontSize).fillColor(GRIS_ETIQUETA);
        doc.text(etiqueta, MARGEN, y, { width: ANCHO_UTIL * 0.42, align: 'left' });
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(GRIS_OSCURO);
        doc.text(valor || '-', MARGEN + ANCHO_UTIL * 0.42, y, { width: ANCHO_UTIL * 0.58, align: 'right' });
        doc.y = Math.max(doc.y, y + fontSize * 1.35);
    };
    const lineaSolida = (grosor = 0.6, color = GRIS_LINEA, espacioAntes = 0.15, espacioDespues = 0.15) => {
        doc.moveDown(espacioAntes);
        doc.moveTo(MARGEN, doc.y).lineTo(ANCHO_PT - MARGEN, doc.y).lineWidth(grosor).strokeColor(color).stroke();
        doc.moveDown(espacioDespues);
    };
    const lineaPunteada = (espacioAntes = 0.2, espacioDespues = 0.25) => {
        doc.moveDown(espacioAntes);
        doc.save();
        doc.dash(2, { space: 2 });
        doc.moveTo(MARGEN, doc.y).lineTo(ANCHO_PT - MARGEN, doc.y).lineWidth(0.75).strokeColor(GRIS_ETIQUETA).stroke();
        doc.undash();
        doc.restore();
        doc.moveDown(espacioDespues);
    };

    // --- Encabezado: logo + datos del emisor -------------------------------
    try {
        const logoSize = 34;
        doc.image(LOGO_PATH, (ANCHO_PT - logoSize) / 2, doc.y, { width: logoSize, height: logoSize });
        doc.y += logoSize + 5;
    } catch (e) {
        // Si el logo no se puede leer, el ticket sigue sin él (nunca debe romper la generación).
    }

    centro(campos.razonSocialEmisor || '', 9, { bold: true, color: GRIS_OSCURO });
    doc.moveDown(0.15);
    if (campos.direccion) centro(campos.direccion, 6.3, { color: GRIS_ETIQUETA });
    const lineaPvNit = [
        campos.puntoVenta !== null && campos.puntoVenta !== undefined ? `Punto de Venta ${campos.puntoVenta}` : null,
        campos.nitEmisor ? `NIT ${campos.nitEmisor}` : null,
    ].filter(Boolean).join('   ·   ');
    if (lineaPvNit) {
        doc.moveDown(0.1);
        centro(lineaPvNit, 6.3, { color: GRIS_ETIQUETA });
    }

    lineaSolida(1, GRIS_OSCURO, 0.35, 0.25);

    // --- Título FACTURA + N° + CUF ------------------------------------------
    centro('FACTURA', 12, { bold: true, color: GRIS_OSCURO, textOpts: { characterSpacing: 1.5 } });
    doc.moveDown(0.15);
    centro(`N° ${campos.facturaNumero || '-'}`, 8, { bold: true });
    doc.moveDown(0.3);

    if (campos.cuf) {
        const yCaja = doc.y;
        doc.font('Helvetica').fontSize(5.6).fillColor(GRIS_ETIQUETA);
        doc.text('CÓDIGO DE AUTORIZACIÓN (CUF)', MARGEN + 4, yCaja + 3, { width: ANCHO_UTIL - 8, align: 'center', characterSpacing: 0.4 });
        doc.font('Courier').fontSize(6.4).fillColor(GRIS_TEXTO);
        const alturaTexto = doc.heightOfString(campos.cuf, { width: ANCHO_UTIL - 8, align: 'center' });
        doc.text(campos.cuf, MARGEN + 4, doc.y + 1, { width: ANCHO_UTIL - 8, align: 'center' });
        const alturaCaja = (doc.y - yCaja) + 4;
        doc.roundedRect(MARGEN, yCaja - 3, ANCHO_UTIL, alturaCaja + 2, 3).lineWidth(0.6).strokeColor(GRIS_LINEA).stroke();
        doc.y = yCaja + alturaCaja + 6;
    }

    lineaSolida(0.6, GRIS_LINEA, 0.1, 0.2);

    // --- Fecha / Cliente ------------------------------------------------------
    filaEtiquetaValor('Fecha', campos.fecha, 6.8);
    filaEtiquetaValor('Cliente', campos.clienteNombre, 6.8);
    filaEtiquetaValor('NIT / CI', campos.clienteNitCi, 6.8);

    // --- Tabla de ítems ---------------------------------------------------
    lineaSolida(0.25, GRIS_OSCURO, 0.3, 0.15);

    const colCantX = MARGEN;
    const colCantW = 22;
    const colSubtW = 38;
    const colSubtX = MARGEN + ANCHO_UTIL - colSubtW;
    const colDescX = colCantX + colCantW + 3;
    const colDescW = colSubtX - colDescX - 3;

    const yHead = doc.y;
    doc.font('Helvetica-Bold').fontSize(6).fillColor(GRIS_ETIQUETA);
    doc.text('CANT', colCantX, yHead, { width: colCantW, align: 'left' });
    doc.text('DESCRIPCIÓN', colDescX, yHead, { width: colDescW, align: 'left' });
    doc.text('SUBTOTAL', colSubtX, yHead, { width: colSubtW, align: 'right' });
    doc.y = yHead + 9;
    lineaSolida(0.5, GRIS_LINEA, 0, 0.15);

    items.forEach((it, idx) => {
        const yFila = doc.y;
        doc.font('Helvetica').fontSize(7).fillColor(GRIS_TEXTO);
        doc.text(fmt(it.cantidad), colCantX, yFila, { width: colCantW, align: 'left' });
        doc.text(it.descripcion || '', colDescX, yFila, { width: colDescW, align: 'left' });
        doc.font('Helvetica-Bold').fontSize(7).fillColor(GRIS_OSCURO);
        doc.text(fmt(it.subtotal), colSubtX, yFila, { width: colSubtW, align: 'right' });

        const altoDesc = doc.heightOfString(it.descripcion || '', { width: colDescW });
        const altoFila = Math.max(altoDesc, 9);
        doc.font('Helvetica').fontSize(5.8).fillColor(GRIS_ETIQUETA);
        doc.text(`P. Unit. ${fmt(it.precioUnitario)}`, colDescX, yFila + altoFila + 1, { width: colDescW, align: 'left' });

        doc.y = yFila + altoFila + 1 + 8;
        if (idx < items.length - 1) lineaSolida(0.3, GRIS_CLARO_FONDO, 0.05, 0.1);
    });

    // --- Totales ------------------------------------------------------------
    lineaSolida(0.6, GRIS_OSCURO, 0.3, 0.2);

    const filaTotal = (etiqueta, valor, fontSize = 7, bold = false) => {
        if (valor === null || valor === undefined) return;
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(bold ? GRIS_OSCURO : GRIS_ETIQUETA);
        doc.text(etiqueta, MARGEN, y, { width: ANCHO_UTIL * 0.55, align: 'left' });
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(bold ? GRIS_OSCURO : GRIS_TEXTO);
        doc.text(`Bs ${fmt(valor)}`, MARGEN + ANCHO_UTIL * 0.55, y, { width: ANCHO_UTIL * 0.45, align: 'right' });
        doc.y = Math.max(doc.y, y + fontSize * 1.4);
    };

    filaTotal('Subtotal', campos.subtotal, 6.8);
    filaTotal('Descuento', campos.descuento && campos.descuento > 0 ? campos.descuento : null, 6.8);
    filaTotal('Gift Card', campos.montoGiftCard && campos.montoGiftCard > 0 ? campos.montoGiftCard : null, 6.8);
    filaTotal('Crédito Fiscal', campos.importeBaseCreditoFiscal, 5.8);

    // El monto final (a pagar, o total si no viene desglosado) se destaca en
    // una franja sombreada — es el número que la clienta necesita ver primero.
    const montoFinal = campos.montoAPagar !== null && campos.montoAPagar !== undefined ? campos.montoAPagar : campos.total;
    if (montoFinal !== null && montoFinal !== undefined) {
        doc.moveDown(0.2);
        const yFranja = doc.y;
        const altoFranja = 22;
        doc.rect(0, yFranja, ANCHO_PT, altoFranja).fill(GRIS_OSCURO);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
        doc.text('TOTAL A PAGAR', MARGEN, yFranja + 6, { width: ANCHO_UTIL * 0.5, align: 'left' });
        doc.fontSize(11);
        doc.text(`Bs ${fmt(montoFinal)}`, MARGEN + ANCHO_UTIL * 0.4, yFranja + 4, { width: ANCHO_UTIL * 0.6, align: 'right' });
        doc.y = yFranja + altoFranja + 6;
        doc.fillColor(GRIS_TEXTO);
    }

    if (campos.glosa) {
        doc.moveDown(0.15);
        centro(campos.glosa, 6.2, { font: 'Helvetica-Oblique', color: GRIS_ETIQUETA });
    }

    // --- QR + pie -------------------------------------------------------------
    if (qrPngBuffer) {
        lineaPunteada(0.35, 0.3);
        centro('Escanea para verificar esta factura', 5.8, { color: GRIS_ETIQUETA });
        doc.moveDown(0.25);
        const qrSize = ANCHO_UTIL * 0.55;
        const x = (ANCHO_PT - qrSize) / 2;
        const y = doc.y;
        doc.image(qrPngBuffer, x, y, { width: qrSize, height: qrSize });
        doc.y = y + qrSize + 8;
    } else {
        lineaPunteada(0.35, 0.3);
    }

    if (campos.leyenda) {
        centro(campos.leyenda, 5.2, { color: GRIS_ETIQUETA });
        doc.moveDown(0.15);
    }
    if (campos.disclaimer) {
        centro(campos.disclaimer, 5.2, { font: 'Helvetica-Oblique', color: GRIS_ETIQUETA });
        doc.moveDown(0.2);
    }

    doc.moveDown(0.1);
    centro('¡Gracias por su preferencia!', 7, { bold: true, color: GRIS_OSCURO });
}

function construirTicket58mm(campos, qrPngBuffer) {
    return new Promise((resolve, reject) => {
        try {
            // Pase 1 (medición): se dibuja todo en un documento descartable con
            // alto generoso, para saber cuánto ocupa el contenido real —
            // descripciones largas que se cortan en varias líneas, más o menos
            // ítems, con o sin QR, etc. — en vez de adivinar con una fórmula fija.
            const alturaGenerosaPt = 1200 * MM_A_PT;
            const docMedicion = new PDFDocument({
                size: [ANCHO_PT, alturaGenerosaPt],
                margins: { top: MARGEN, bottom: 0, left: MARGEN, right: MARGEN },
                bufferPages: true,
            });
            docMedicion.on('data', () => {});
            docMedicion.on('error', reject);
            dibujarContenido(docMedicion, campos, qrPngBuffer);
            // + MARGEN (espacio en blanco final) + 3pt de colchón por si el
            // redondeo de fuentes varía una fracción de punto entre pases.
            const alturaContenidoPt = docMedicion.y + MARGEN + 3;
            docMedicion.end();

            // Pase 2 (final): mismo contenido, documento con el alto exacto.
            // OJO: bottom:0 acá a propósito — el espacio de sobra ya se sumó
            // arriba como parte del alto de la página. Si acá también se le
            // resta un margen inferior, el límite de "se acaba la página" para
            // pdfkit termina justo donde corta el contenido real, y cualquier
            // redondeo mínimo empuja la última línea a una segunda hoja casi
            // en blanco (bug real que pasó en la primera versión de este fix).
            const doc = new PDFDocument({
                size: [ANCHO_PT, alturaContenidoPt],
                margins: { top: MARGEN, bottom: 0, left: MARGEN, right: MARGEN },
            });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            dibujarContenido(doc, campos, qrPngBuffer);
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { construirTicket58mm };
