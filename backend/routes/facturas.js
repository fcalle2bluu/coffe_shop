// backend/routes/facturas.js
//
// Módulo "Facturas": recibe el PDF (tamaño carta) que ya emitió el SIN para una
// venta, y devuelve un PDF nuevo reformateado a 58mm listo para la impresora
// térmica, conservando los datos reales (NIT, CUF, ítems, totales) y el QR
// real recortado del PDF original.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const { analizarFacturaPdf } = require('../services/facturaPdfParser');
const { construirTicket58mm } = require('../services/facturaTicketBuilder');

// Analiza el PDF y devuelve los campos detectados + el QR recortado en base64,
// sin generar todavía el PDF final. Útil para revisar que la extracción salió bien.
router.post('/analizar', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Debe subir un archivo PDF (campo "pdf")' });
        const { campos, qr } = await analizarFacturaPdf(req.file.buffer);
        res.json({
            campos,
            qrDetectado: !!qr,
            qrBase64: qr ? `data:image/png;base64,${qr.buffer.toString('base64')}` : null,
        });
    } catch (error) {
        console.error('Error al analizar factura PDF:', error);
        res.status(500).json({ error: 'No se pudo leer el PDF: ' + error.message });
    }
});

// Analiza el PDF y devuelve directamente el PDF nuevo (58mm) para imprimir/descargar.
router.post('/reformatear', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Debe subir un archivo PDF (campo "pdf")' });
        const { campos, qr } = await analizarFacturaPdf(req.file.buffer);
        const pdfBuffer = await construirTicket58mm(campos, qr ? qr.buffer : null);
        const nombre = `ticket_factura_${campos.facturaNumero || 'nuevo'}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error al reformatear factura PDF:', error);
        res.status(500).json({ error: 'No se pudo generar el ticket: ' + error.message });
    }
});

module.exports = router;
