// backend/services/facturaPdfParser.js
//
// Lee un PDF de una factura ya emitida y autorizada por el SIN (tamaño carta,
// modalidad "en línea") y extrae: (1) los datos de texto (NIT, N° factura, CUF,
// cliente, items, totales) y (2) la imagen REAL del código QR incrustada en el
// PDF (no se regenera ni se inventa: se recorta tal cual la emitió el SIN).
//
// La extracción de imágenes usa pdf-parse (que internamente resuelve los
// XObject de imagen del PDF vía pdf.js) y se queda con la más grande de todas
// las páginas, ya que en este formato de factura el QR es, por lejos, la
// imagen de mayor área — evita tener que adivinar coordenadas de recorte.

const { PDFParse } = require('pdf-parse');

function limpiar(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
}

function soloHex(s) {
    return (s || '').replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
}

function numero(s) {
    if (s === null || s === undefined) return null;
    const n = parseFloat(String(s).replace(/,/g, ''));
    return Number.isNaN(n) ? null : n;
}

function parsearCampos(textoOriginal) {
    const texto = textoOriginal.replace(/\r/g, '');
    const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

    const campos = {
        razonSocialEmisor: lineas[0] || null,
        nitEmisor: null,
        puntoVenta: null,
        direccion: null,
        facturaNumero: null,
        cuf: null,
        fecha: null,
        clienteNitCi: null,
        clienteNombre: null,
        clienteCod: null,
        items: [],
        glosa: null,
        subtotal: null,
        descuento: null,
        total: null,
        montoGiftCard: null,
        montoAPagar: null,
        importeBaseCreditoFiscal: null,
        leyenda: null,
        disclaimer: null,
    };

    let m;

    m = texto.match(/(?<!\/)\bNIT\s+(\d{6,15})\b/);
    if (m) campos.nitEmisor = m[1];

    m = texto.match(/No\.\s*Punto de Venta\s*(\d+)/i);
    if (m) campos.puntoVenta = m[1];

    m = texto.match(/FACTURA\s*N[°ºo]\.?\s*(\d+)/i);
    if (m) campos.facturaNumero = m[1];

    m = texto.match(/C[ÓO]D\.?\s*AUTORIZACI[ÓO]N\s*([\s\S]{40,140}?)(?=FACTURA\b|Fecha:|$)/i);
    if (m) {
        const hex = soloHex(m[1]);
        if (hex.length >= 40) campos.cuf = hex;
    }

    m = texto.match(/Fecha:\s*([\d/]+\s*\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?)/i);
    if (m) campos.fecha = limpiar(m[1]);

    m = texto.match(/NIT\/CI\/CEX:?\s*(\d+)/i);
    if (m) campos.clienteNitCi = m[1];

    m = texto.match(/Nombre\/Raz[oó]n Social:\s*([\s\S]+?)\s*Cod\.?\s*Cliente/i);
    if (m) campos.clienteNombre = limpiar(m[1]);

    m = texto.match(/Cod\.?\s*Cliente:?\s*(\d+)/i);
    if (m) campos.clienteCod = m[1];

    // Dirección: líneas entre "Punto de Venta" y la línea "NIT ..." del emisor.
    const idxPv = lineas.findIndex((l) => /Punto de Venta/i.test(l));
    const idxNit = lineas.findIndex((l) => /^NIT\s+\d/i.test(l));
    if (idxPv >= 0 && idxNit > idxPv) {
        campos.direccion = limpiar(lineas.slice(idxPv + 1, idxNit).join(' '));
    }

    // Items: filas "CODIGO CANTIDAD UNIDAD DESCRIPCION PRECIO DESCUENTO SUBTOTAL"
    const reItem = /([A-Z0-9]{2,10})\s+([\d]+(?:\.\d+)?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+([A-ZÁÉÍÓÚÑ0-9 .ÓN°]+?)\s+([\d]+(?:\.\d+)?)\s+([\d]+(?:\.\d+)?)\s+([\d]+(?:\.\d+)?)(?=\s|$)/g;
    let mi;
    while ((mi = reItem.exec(texto)) !== null) {
        campos.items.push({
            codigo: mi[1],
            cantidad: numero(mi[2]),
            unidad: mi[3],
            descripcion: limpiar(mi[4]),
            precioUnitario: numero(mi[5]),
            descuento: numero(mi[6]),
            subtotal: numero(mi[7]),
        });
    }

    m = texto.match(/Son:\s*([^\n]+)/i);
    if (m) campos.glosa = limpiar(m[1]);

    m = texto.match(/\bSUBTOTAL\s*Bs\.?\s*([\d.,]+)/i);
    if (m) campos.subtotal = numero(m[1]);

    m = texto.match(/\bDESCUENTO\s*Bs\.?\s*([\d.,]+)/i);
    if (m) campos.descuento = numero(m[1]);

    m = texto.match(/(?<!SUB)\bTOTAL\s*Bs\.?\s*([\d.,]+)/i);
    if (m) campos.total = numero(m[1]);

    m = texto.match(/MONTO GIFT CARD\s*Bs\.?\s*([\d.,]+)/i);
    if (m) campos.montoGiftCard = numero(m[1]);

    m = texto.match(/MONTO A PAGAR\s*Bs\.?\s*([\d.,]+)/i);
    if (m) campos.montoAPagar = numero(m[1]);

    m = texto.match(/IMPORTE BASE CR[EÉ]DITO FISCAL\s*Bs\.?\s*([\d.,]+)/i);
    if (m) campos.importeBaseCreditoFiscal = numero(m[1]);

    m = texto.match(/Ley N[°ºo]\s*453:[\s\S]*?especializados\.?/i);
    if (m) campos.leyenda = limpiar(m[0]);

    m = texto.match(/["“]?Este documento es la Representaci[oó]n Gr[aá]fica[\s\S]*?facturaci[oó]n en l[ií]nea["”]?/i);
    campos.disclaimer = m
        ? limpiar(m[0])
        : 'Este documento es la Representación Gráfica de un Documento Fiscal Digital emitido en una modalidad de facturación en línea';

    return campos;
}

// Recorre todas las páginas y se queda con la imagen incrustada de mayor área
// (heurística: en este formato de factura el QR es la única imagen grande).
async function extraerQrMasGrande(parser) {
    const resultado = await parser.getImage({ imageThreshold: 40, imageBuffer: true, imageDataUrl: false });
    let mejor = null;
    for (const pagina of resultado.pages || []) {
        for (const img of pagina.images || []) {
            const area = img.width * img.height;
            if (!mejor || area > mejor.area) mejor = { area, img };
        }
    }
    if (!mejor) return null;
    return {
        buffer: Buffer.from(mejor.img.data),
        width: mejor.img.width,
        height: mejor.img.height,
    };
}

async function analizarFacturaPdf(bufferPdf) {
    const parser = new PDFParse({ data: bufferPdf });
    try {
        const textResult = await parser.getText();
        const campos = parsearCampos(textResult.text);
        const qr = await extraerQrMasGrande(parser);
        return { texto: textResult.text, campos, qr };
    } finally {
        await parser.destroy();
    }
}

module.exports = { analizarFacturaPdf, parsearCampos };
