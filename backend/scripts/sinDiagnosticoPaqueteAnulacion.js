// Diagnóstico puntual de Etapa VI (paquetes) y VII (anulación) contra PILOTO.
// No re-corre CUIS/sync/CUFD masivos. Un evento tipo 1 (corte de internet) +
// un paquete de 2 facturas offline, y 3 anulaciones de facturas nuevas online.
//
// Uso: node scripts/sinDiagnosticoPaqueteAnulacion.js
//
// CAFC: este script NO envía CAFC. El evento 1 no lo requiere. Eventos 5/6/7
// (manuales de contingencia) hay que pedir CAFC de PILOTO en el portal SIAT
// para este NIT + sucursal 0 + documento sector 1, y pasarlo en SIN_CAFC.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sin = require('../services/sinFacturacion');
const { generarCuf } = require('../services/sinCuf');
const { construirFacturaComputarizadaXml, formatoFechaEmision } = require('../services/sinFacturaXml');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function armarFactura({ numeroFactura, fechaEmision, cufd, tipoEmision, pv, cafc = null }) {
    const nit = process.env.SIN_NIT;
    const cuf = generarCuf({
        nit,
        fecha: fechaEmision,
        sucursal: 0,
        modalidad: 2,
        tipoEmision,
        tipoFacturaDocumento: 1,
        tipoDocumentoSector: 1,
        numeroFactura,
        puntoVenta: pv || 0,
        codigoControl: cufd.codigoControl,
    });
    const xml = construirFacturaComputarizadaXml({
        nitEmisor: nit,
        razonSocialEmisor: 'JUAN CANCIO ESPEJO CAMACOPA',
        municipio: 'La Paz',
        telefono: null,
        numeroFactura,
        cuf,
        cufd: cufd.codigo,
        codigoSucursal: 0,
        direccion: cufd.direccion,
        codigoPuntoVenta: pv,
        fechaEmision,
        nombreRazonSocial: 'CLIENTE DE PRUEBA',
        codigoTipoDocumentoIdentidad: 1,
        numeroDocumento: '1234567',
        complemento: null,
        codigoCliente: '1234567',
        codigoMetodoPago: 1,
        numeroTarjeta: null,
        montoTotal: '15.00',
        montoTotalSujetoIva: '15.00',
        codigoMoneda: 1,
        tipoCambio: '1.00',
        montoTotalMoneda: '15.00',
        montoGiftCard: null,
        descuentoAdicional: null,
        codigoExcepcion: null,
        cafc,
        leyenda: 'Ley N 453: Tienes derecho a recibir informacion sobre las caracteristicas y contenidos de los servicios que utilices.',
        usuario: 'PRUEBA',
        detalles: [{
            actividadEconomica: '5610200',
            codigoProductoSin: 1003802,
            codigoProducto: 'CAFE-001',
            descripcion: 'Cafe con leche',
            cantidad: '1.00',
            unidadMedida: 57,
            precioUnitario: '15.00',
            montoDescuento: 0,
            subTotal: '15.00',
            numeroSerie: null,
            numeroImei: null,
        }],
    });
    return { cuf, xml };
}

(async () => {
    const cuis = process.env.SIN_CUIS;
    console.log('=== CUFD A (durante la contingencia) ===');
    const cufdA = await sin.solicitarCufd(cuis, null);
    if (!cufdA.transaccion) {
        console.error('No se pudo pedir CUFD A', cufdA.xml);
        process.exit(1);
    }
    console.log('CUFD A', cufdA.codigo, 'control', cufdA.codigoControl, 'vigencia', cufdA.fechaVigencia);
    // fechaInicio no puede ser anterior al instante en que el SIN emitió el CUFD
    // (error 984). Un margen de unos segundos evita el desfase de milisegundos.
    await sleep(3000);

    const fechaInicio = new Date();
    await sleep(1500);

    const xmls = [];
    const cufsOffline = [];
    let numero = 30000 + Math.floor(Date.now() / 1000) % 10000;
    for (let i = 0; i < 2; i++) {
        const fechaEmision = new Date();
        const f = armarFactura({ numeroFactura: numero, fechaEmision, cufd: cufdA, tipoEmision: 2, pv: null });
        xmls.push(f.xml);
        cufsOffline.push({ cuf: f.cuf, numeroFactura: numero });
        console.log('factura offline', numero, 'cuf', f.cuf);
        numero++;
        await sleep(200);
    }

    await sleep(1500);
    const fechaFin = new Date();

    // Pedir el CUFD B ANTES de registrar el evento invalida el A y el SIN responde
    // 984 (el evento no corresponde al CUFD). Se registra con A/A (como las 70
    // pruebas que ya pasaron) y el B se pide recién para el envío del paquete.
    console.log('=== Registrar evento tipo 1 con el mismo CUFD A ===');
    const evento = await sin.registrarEventoSignificativo({
        codigoMotivoEvento: 1,
        descripcion: 'CORTE DEL SERVICIO DE INTERNET',
        cufd: cufdA.codigo,
        cufdEvento: cufdA.codigo,
        fechaInicio: formatoFechaEmision(fechaInicio),
        fechaFin: formatoFechaEmision(fechaFin),
        codigoPuntoVenta: null,
        cuis,
    });
    console.log('evento transaccion=', evento.transaccion, 'codigo=', evento.codigoRecepcionEvento);
    if (!evento.transaccion) {
        console.error(evento.xml);
        process.exit(1);
    }

    console.log('=== CUFD B (solo para enviar el paquete) ===');
    const cufdB = await sin.solicitarCufd(cuis, null);
    if (!cufdB.transaccion) {
        console.error('No se pudo pedir CUFD B', cufdB.xml);
        process.exit(1);
    }
    console.log('CUFD B', cufdB.codigo);

    console.log('=== Enviar paquete tar.gz sin CAFC ===');
    const paquete = await sin.enviarPaqueteFacturas({
        xmlsFactura: xmls,
        cufd: cufdB.codigo,
        codigoEvento: evento.codigoRecepcionEvento,
        cuis,
        codigoPuntoVenta: null,
        cafc: null,
    });
    console.log('paquete estado=', paquete.codigoEstado, 'recepcion=', paquete.codigoRecepcion, 'msgs=', JSON.stringify(paquete.mensajes));
    if (!paquete.transaccion) {
        console.error(paquete.xml.slice(0, 2000));
    } else if (paquete.codigoRecepcion) {
        console.log('=== Validar paquete ===');
        await sleep(1500);
        const val = await sin.validarPaqueteFacturas({
            codigoRecepcion: paquete.codigoRecepcion,
            cufd: cufdB.codigo,
            cuis,
            codigoPuntoVenta: 0,
        });
        console.log('validacion estado=', val.codigoEstado, 'msgs=', JSON.stringify(val.mensajes));
        if (!val.transaccion) console.error(val.xml.slice(0, 2000));
    }

    console.log('=== Anulación: emitir 3 facturas online nuevas y anularlas ya ===');
    const cufdNow = cufdB;
    for (let i = 0; i < 3; i++) {
        const fechaEmision = new Date();
        const f = armarFactura({ numeroFactura: numero, fechaEmision, cufd: cufdNow, tipoEmision: 1, pv: null });
        const emision = await sin.enviarFactura({
            xmlFactura: f.xml,
            cufd: cufdNow.codigo,
            cuis,
            tipoEmision: 1,
            codigoPuntoVenta: null,
        });
        console.log('emitida', numero, 'estado=', emision.codigoEstado, 'cuf=', f.cuf);
        if (emision.codigoEstado !== '908') {
            console.error(emision.xml.slice(0, 800));
            numero++;
            continue;
        }
        await sleep(800);
        const anu = await sin.anularFactura({
            cuf: f.cuf,
            codigoMotivo: 1,
            cufd: cufdNow.codigo,
            codigoPuntoVenta: null,
            cuis,
        });
        console.log('anulacion', numero, 'estado=', anu.codigoEstado, 'msgs=', JSON.stringify(anu.mensajes));
        if (!anu.transaccion) console.error(anu.xml.slice(0, 800));
        numero++;
        await sleep(400);
    }

    console.log('=== FIN ===');
    process.exit(0);
})().catch((e) => {
    console.error('ERROR FATAL', e);
    process.exit(1);
});
