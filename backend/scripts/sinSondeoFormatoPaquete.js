// Prueba varios formatos de <archivo> contra el mismo evento de contingencia.
// Uso: node scripts/sinSondeoFormatoPaquete.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const sin = require('../services/sinFacturacion');
const { generarCuf } = require('../services/sinCuf');
const { construirFacturaComputarizadaXml, formatoFechaEmision } = require('../services/sinFacturaXml');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function facturaXml(numero, fecha, cufd) {
    const nit = process.env.SIN_NIT;
    const cuf = generarCuf({
        nit, fecha, sucursal: 0, modalidad: 2, tipoEmision: 2,
        tipoFacturaDocumento: 1, tipoDocumentoSector: 1, numeroFactura: numero,
        puntoVenta: 0, codigoControl: cufd.codigoControl,
    });
    return construirFacturaComputarizadaXml({
        nitEmisor: nit, razonSocialEmisor: 'JUAN CANCIO ESPEJO CAMACOPA', municipio: 'La Paz',
        telefono: null, numeroFactura: numero, cuf, cufd: cufd.codigo, codigoSucursal: 0,
        direccion: cufd.direccion, codigoPuntoVenta: null, fechaEmision: fecha,
        nombreRazonSocial: 'CLIENTE DE PRUEBA', codigoTipoDocumentoIdentidad: 1,
        numeroDocumento: '1234567', complemento: null, codigoCliente: '1234567',
        codigoMetodoPago: 1, numeroTarjeta: null, montoTotal: '15.00', montoTotalSujetoIva: '15.00',
        codigoMoneda: 1, tipoCambio: '1.00', montoTotalMoneda: '15.00',
        montoGiftCard: null, descuentoAdicional: null, codigoExcepcion: null, cafc: null,
        leyenda: 'Ley N 453: Tienes derecho a recibir informacion sobre las caracteristicas y contenidos de los servicios que utilices.',
        usuario: 'PRUEBA',
        detalles: [{
            actividadEconomica: '5610200', codigoProductoSin: 1003802, codigoProducto: 'CAFE-001',
            descripcion: 'Cafe con leche', cantidad: '1.00', unidadMedida: 57, precioUnitario: '15.00',
            montoDescuento: 0, subTotal: '15.00', numeroSerie: null, numeroImei: null,
        }],
    });
}

function escribirXmls(dir, xmls) {
    fs.mkdirSync(dir, { recursive: true });
    xmls.forEach((xml, i) => fs.writeFileSync(path.join(dir, `${i + 1}.xml`), xml));
}

function formatos(xmls) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siatpkg-'));
    escribirXmls(tmp, xmls);
    const zipPath = path.join(tmp, 'p.zip');
    execFileSync('zip', ['-X', '-0', '-j', zipPath, ...xmls.map((_, i) => path.join(tmp, `${i + 1}.xml`))]);
    const zipBuf = fs.readFileSync(zipPath);
    const tarPath = path.join(tmp, 'p.tar');
    execFileSync('tar', ['-cf', tarPath, '-C', tmp, ...xmls.map((_, i) => `${i + 1}.xml`)]);
    const tarBuf = fs.readFileSync(tarPath);

    const zipGzXmls = Buffer.concat([]); // placeholder
    const gzDir = path.join(tmp, 'gz');
    fs.mkdirSync(gzDir);
    xmls.forEach((xml, i) => fs.writeFileSync(path.join(gzDir, `${i + 1}.xml`), zlib.gzipSync(Buffer.from(xml))));
    const zipGzPath = path.join(tmp, 'gzxmls.zip');
    execFileSync('zip', ['-X', '-0', '-j', zipGzPath, ...xmls.map((_, i) => path.join(gzDir, `${i + 1}.xml`))]);

    return {
        'zip-store-sistema': zipBuf,
        'gzip(zip-store-sistema)': zlib.gzipSync(zipBuf),
        'tar.gz': zlib.gzipSync(tarBuf),
        'gzip(xmls-concat)': zlib.gzipSync(Buffer.from(xmls.join('\n'))),
        'zip-de-xml-gzip': fs.readFileSync(zipGzPath),
        'gzip(zip-de-xml-gzip)': zlib.gzipSync(fs.readFileSync(zipGzPath)),
    };
}

(async () => {
    const cuis = process.env.SIN_CUIS;
    const cufdA = await sin.solicitarCufd(cuis, null);
    await sleep(3000);
    const inicio = new Date();
    await sleep(800);
    let n = 40000 + Math.floor(Date.now() / 1000) % 5000;
    const xmls = [];
    for (let i = 0; i < 2; i++) {
        xmls.push(facturaXml(n++, new Date(), cufdA));
        await sleep(150);
    }
    await sleep(800);
    const fin = new Date();
    const evento = await sin.registrarEventoSignificativo({
        codigoMotivoEvento: 1, descripcion: 'CORTE DEL SERVICIO DE INTERNET',
        cufd: cufdA.codigo, cufdEvento: cufdA.codigo,
        fechaInicio: formatoFechaEmision(inicio), fechaFin: formatoFechaEmision(fin),
        codigoPuntoVenta: null, cuis,
    });
    console.log('evento', evento.transaccion, evento.codigoRecepcionEvento);
    if (!evento.transaccion) { console.error(evento.xml); process.exit(1); }

    const cufdB = await sin.solicitarCufd(cuis, null);
    const packs = formatos(xmls);
    for (const [nombre, buf] of Object.entries(packs)) {
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        const d = sin.datosBase();
        const xml = `
      <SolicitudServicioRecepcionPaquete>
        <codigoAmbiente>${d.codigoAmbiente}</codigoAmbiente>
        <codigoDocumentoSector>1</codigoDocumentoSector>
        <codigoEmision>2</codigoEmision>
        <codigoModalidad>${d.codigoModalidad}</codigoModalidad>
        <codigoSistema>${d.codigoSistema}</codigoSistema>
        <codigoSucursal>${d.codigoSucursal}</codigoSucursal>
        <cufd>${cufdB.codigo}</cufd>
        <cuis>${cuis}</cuis>
        <nit>${d.nit}</nit>
        <tipoFacturaDocumento>1</tipoFacturaDocumento>
        <archivo>${buf.toString('base64')}</archivo>
        <fechaEnvio>${formatoFechaEmision(new Date())}</fechaEnvio>
        <hashArchivo>${hash}</hashArchivo>
        <cantidadFacturas>${xmls.length}</cantidadFacturas>
        <codigoEvento>${evento.codigoRecepcionEvento}</codigoEvento>
      </SolicitudServicioRecepcionPaquete>`;
        const r = await sin.llamarSoap(sin.RUTAS.compraVenta, 'recepcionPaqueteFactura', xml);
        const estado = (r.xml.match(/<codigoEstado>([^<]*)/) || [])[1];
        const msgs = [...r.xml.matchAll(/<descripcion>([^<]*)<\/descripcion>/g)].map((m) => m[1]);
        console.log(nombre, 'bytes', buf.length, 'estado', estado, 'msgs', msgs.join(' | '));
        await sleep(400);
    }
})().catch((e) => { console.error(e); process.exit(1); });
