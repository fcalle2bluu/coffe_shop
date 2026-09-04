// backend/services/facturaTicketBuilder.js
//
// Arma un PDF nuevo, angosto (58mm), con el mismo diseño reducido para impresora
// térmica, a partir de los campos ya extraídos de la factura original del SIN y
// la imagen REAL del QR recortada de esa misma factura (no se regenera el QR).

const PDFDocument = require('pdfkit');

const MM_A_PT = 2.83465;
const ANCHO_MM = 58;
const ANCHO_PT = ANCHO_MM * MM_A_PT;
const MARGEN = 8;
const ANCHO_UTIL = ANCHO_PT - MARGEN * 2;

function fmt(n) {
    return n === null || n === undefined ? '' : n.toFixed(2);
}

function construirTicket58mm(campos, qrPngBuffer) {
    return new Promise((resolve, reject) => {
        const filas = Math.max(campos.items.length, 1);
        const altoEstimadoMm = 62 + filas * 9 + (qrPngBuffer ? 40 : 0);

        const doc = new PDFDocument({
            size: [ANCHO_PT, altoEstimadoMm * MM_A_PT],
            margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
        });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const centro = (texto, fontSize = 7, bold = false) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
            doc.text(texto, MARGEN, doc.y, { width: ANCHO_UTIL, align: 'center' });
        };
        const izq = (texto, fontSize = 7, bold = false) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
            doc.text(texto, MARGEN, doc.y, { width: ANCHO_UTIL, align: 'left' });
        };
        const linea = () => {
            doc.moveDown(0.15);
            doc.moveTo(MARGEN, doc.y).lineTo(ANCHO_PT - MARGEN, doc.y).lineWidth(0.5).stroke();
            doc.moveDown(0.15);
        };

        centro(campos.razonSocialEmisor || '', 8, true);
        if (campos.direccion) centro(campos.direccion, 6.5);
        if (campos.puntoVenta !== null && campos.puntoVenta !== undefined) {
            centro(`Punto de Venta: ${campos.puntoVenta}`, 6.5);
        }
        centro(`NIT: ${campos.nitEmisor || '-'}`, 6.5);

        linea();
        centro('FACTURA', 8, true);
        centro(`N° ${campos.facturaNumero || '-'}`, 7);
        doc.moveDown(0.15);
        izq('CÓD. AUTORIZACIÓN:', 6, true);
        izq(campos.cuf || '-', 5.8);

        linea();
        izq(`Fecha: ${campos.fecha || '-'}`, 6.5);
        izq(`Cliente: ${campos.clienteNombre || '-'}`, 6.5);
        izq(`NIT/CI: ${campos.clienteNitCi || '-'}`, 6.5);

        linea();
        izq('DESCRIPCIÓN', 6.5, true);
        campos.items.forEach((it) => {
            izq(`${fmt(it.cantidad)} ${it.descripcion}`, 6.5);
            izq(`  P.Unit ${fmt(it.precioUnitario)}    Subt. ${fmt(it.subtotal)}`, 6.3);
        });

        linea();
        if (campos.subtotal !== null) izq(`SUBTOTAL Bs: ${fmt(campos.subtotal)}`, 6.8);
        if (campos.descuento !== null) izq(`DESCUENTO Bs: ${fmt(campos.descuento)}`, 6.8);
        if (campos.total !== null) izq(`TOTAL Bs: ${fmt(campos.total)}`, 7.5, true);
        if (campos.montoGiftCard) izq(`MONTO GIFT CARD Bs: ${fmt(campos.montoGiftCard)}`, 6.8);
        if (campos.montoAPagar !== null) izq(`MONTO A PAGAR Bs: ${fmt(campos.montoAPagar)}`, 7.5, true);
        if (campos.importeBaseCreditoFiscal !== null) {
            izq(`IMPORTE BASE CRÉDITO FISCAL Bs: ${fmt(campos.importeBaseCreditoFiscal)}`, 6.3);
        }

        if (campos.glosa) {
            doc.moveDown(0.2);
            centro(`Son: ${campos.glosa}`, 6.3);
        }

        if (qrPngBuffer) {
            doc.moveDown(0.4);
            const qrSize = ANCHO_UTIL * 0.62;
            const x = (ANCHO_PT - qrSize) / 2;
            const y = doc.y;
            doc.image(qrPngBuffer, x, y, { width: qrSize, height: qrSize });
            doc.y = y + qrSize + 6;
        }

        doc.moveDown(0.2);
        if (campos.leyenda) centro(campos.leyenda, 5.2);
        doc.moveDown(0.15);
        if (campos.disclaimer) centro(campos.disclaimer, 5.2);

        doc.end();
    });
}

module.exports = { construirTicket58mm };
