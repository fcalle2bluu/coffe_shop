// backend/scripts/sinFase1EtapaVICompletar.js
//
// Corre solo la Etapa VI (Envío por Paquetes) a volumen, usando el formato tar.gz
// verificado en vivo el 2026-09-02 (sinDiagnosticoPaqueteAnulacion.js: 901 -> 908).
// No repite Etapas II/V, que ya están al 100% (ver sinFase1Parte2Resultados.jsonl).
//
// Uso: node scripts/sinFase1EtapaVICompletar.js
// Resultados en scripts/sinFase1EtapaVIResultados.jsonl

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const sin = require('../services/sinFacturacion');
const { generarCuf } = require('../services/sinCuf');
const { construirFacturaComputarizadaXml, formatoFechaEmision } = require('../services/sinFacturaXml');

const LOG_PATH = path.join(__dirname, 'sinFase1EtapaVIResultados.jsonl');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(nro, ok, detalle) {
    const linea = { ts: new Date().toISOString(), etapa: 'VI-PAQUETES', nro, ok, detalle };
    logStream.write(JSON.stringify(linea) + '\n');
    console.log(`[VI-PAQUETES #${nro}] ${ok ? 'OK' : 'FALLO'} ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TIPOS_OFFLINE = [
    { codigo: 1, descripcion: 'CORTE DEL SERVICIO DE INTERNET' },
    { codigo: 2, descripcion: 'INACCESIBILIDAD AL SERVICIO WEB DE LA ADMINISTRACION TRIBUTARIA' },
    { codigo: 3, descripcion: 'INGRESO A ZONAS SIN INTERNET POR DESPLIEGUE DE PUNTO DE VENTA EN VEHICULOS AUTOMOTORES' },
    { codigo: 4, descripcion: 'VENTA EN LUGARES SIN INTERNET' },
];

const OBJETIVO = 280;

async function unCaso(n, cuis, pv, nit) {
    const cufdA = await sin.solicitarCufd(cuis, pv);
    if (!cufdA.transaccion && !cufdA.codigo) throw new Error('No se pudo pedir CUFD A: ' + cufdA.xml.slice(0, 300));
    await sleep(3000);
    const fechaInicio = new Date();
    await sleep(800);

    const tipo = TIPOS_OFFLINE[n % TIPOS_OFFLINE.length];
    let numeroFactura = 60000 + n * 10;
    const xmlsFactura = [];
    for (let i = 0; i < 2; i++) {
        const fechaEmision = new Date();
        const cuf = generarCuf({
            nit, fecha: fechaEmision, sucursal: 0, modalidad: 2, tipoEmision: 2,
            tipoFacturaDocumento: 1, tipoDocumentoSector: 1, numeroFactura,
            puntoVenta: pv || 0, codigoControl: cufdA.codigoControl,
        });
        xmlsFactura.push(construirFacturaComputarizadaXml({
            nitEmisor: nit, razonSocialEmisor: 'JUAN CANCIO ESPEJO CAMACOPA', municipio: 'La Paz',
            telefono: null, numeroFactura, cuf, cufd: cufdA.codigo, codigoSucursal: 0,
            direccion: cufdA.direccion, codigoPuntoVenta: pv,
            fechaEmision, nombreRazonSocial: 'CLIENTE DE PRUEBA', codigoTipoDocumentoIdentidad: 1,
            numeroDocumento: '1234567', complemento: null, codigoCliente: '1234567',
            codigoMetodoPago: 1, numeroTarjeta: null,
            montoTotal: '15.00', montoTotalSujetoIva: '15.00', codigoMoneda: 1,
            tipoCambio: '1.00', montoTotalMoneda: '15.00',
            montoGiftCard: null, descuentoAdicional: null, codigoExcepcion: null, cafc: null,
            leyenda: 'Ley N 453: Tienes derecho a recibir informacion sobre las caracteristicas y contenidos de los servicios que utilices.',
            usuario: 'PRUEBA',
            detalles: [{
                actividadEconomica: '5610200', codigoProductoSin: 1003802, codigoProducto: 'CAFE-001',
                descripcion: 'Cafe con leche', cantidad: '1.00', unidadMedida: 57, precioUnitario: '15.00',
                montoDescuento: 0, subTotal: '15.00', numeroSerie: null, numeroImei: null,
            }],
        }));
        numeroFactura++;
        await sleep(120);
    }

    await sleep(800);
    const fechaFin = new Date();
    const evento = await sin.registrarEventoSignificativo({
        codigoMotivoEvento: tipo.codigo,
        descripcion: tipo.descripcion,
        cufd: cufdA.codigo,
        cufdEvento: cufdA.codigo,
        fechaInicio: formatoFechaEmision(fechaInicio),
        fechaFin: formatoFechaEmision(fechaFin),
        codigoPuntoVenta: pv,
        cuis,
    });
    if (!evento.transaccion) throw new Error('Evento fallo: ' + evento.xml.slice(0, 300));

    const cufdB = await sin.solicitarCufd(cuis, pv);
    const r = await sin.enviarPaqueteFacturas({
        xmlsFactura, cufd: cufdB.codigo, codigoEvento: evento.codigoRecepcionEvento,
        cuis, codigoPuntoVenta: pv, cafc: null,
    });
    if (r.codigoEstado !== '901' && r.codigoEstado !== '908') {
        throw new Error('Paquete rechazado: ' + r.xml.slice(0, 400));
    }
    await sleep(1200);
    const val = await sin.validarPaqueteFacturas({
        codigoRecepcion: r.codigoRecepcion, cufd: cufdB.codigo, cuis, codigoPuntoVenta: pv,
    });
    return val.codigoEstado === '908';
}

(async () => {
    const nit = process.env.SIN_NIT;
    const cuisPv1r = await sin.solicitarCuis(1);
    const cuisPv1 = cuisPv1r.codigo;
    const cuisPv0 = process.env.SIN_CUIS;
    console.log('cuisPv1=', cuisPv1, 'cuisPv0=', cuisPv0, 'objetivo=', OBJETIVO);

    let exitos = 0;
    for (let n = 0; n < OBJETIVO; n++) {
        const usarPv1 = n % 2 === 0;
        const cuis = usarPv1 ? cuisPv1 : cuisPv0;
        const pv = usarPv1 ? 1 : null;
        try {
            const ok = await unCaso(n, cuis, pv, nit);
            if (ok) exitos++;
            log(n + 1, ok, ok ? 'validado=908' : 'validacion no llego a 908');
        } catch (e) {
            log(n + 1, false, e.message);
        }
    }
    console.log(`=== LISTO: ${exitos}/${OBJETIVO} paquetes validados con 908 ===`);
    process.exit(0);
})().catch((e) => {
    console.error('ERROR FATAL:', e);
    process.exit(1);
});
