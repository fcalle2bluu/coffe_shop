// backend/scripts/sinFase1EtapaVIMatriz.js
//
// Reintento de Etapa VI ajustado a la matriz REAL del portal SIAT (14 filas, vistas
// en vivo el 2026-09-02): para cada uno de los 7 tipos de evento significativo hace
// falta UNA fila con codigoPuntoVenta=1 + cantidadFacturas="igual a 500" (paquete de
// ~500 facturas reales) y OTRA fila con codigoPuntoVenta=0 + cantidadFacturas="menor
// a 500" (paquete chico). Cada fila pide 10 casos correctos. El campo <cafc> NO
// aparece en la lista de parámetros de ninguna de las 14 filas (ni las de eventos
// 5/6/7) según el propio portal, así que no se envía en ningún caso.
//
// El intento anterior (sinFase1EtapaVICompletar.js) solo probó los eventos 1-4 y
// siempre con paquetes de 2 facturas ("menor a 500"), por eso la matriz real marcó
// 163/280 (58%): 0% en todas las filas "igual a 500" (nunca se probaron) y resultados
// parejos/erráticos en "menor a 500" (posible flakiness del 984 en algunos eventos).
//
// Uso: node scripts/sinFase1EtapaVIMatriz.js
// Resultados en scripts/sinFase1EtapaVIMatrizResultados.jsonl

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const sin = require('../services/sinFacturacion');
const { generarCuf } = require('../services/sinCuf');
const { construirFacturaComputarizadaXml, formatoFechaEmision } = require('../services/sinFacturaXml');

const LOG_PATH = path.join(__dirname, 'sinFase1EtapaVIMatrizResultados.jsonl');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(fila, intento, ok, detalle) {
    const linea = { ts: new Date().toISOString(), fila, intento, ok, detalle };
    logStream.write(JSON.stringify(linea) + '\n');
    console.log(`[${fila} #${intento}] ${ok ? 'OK' : 'FALLO'} ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Los 7 tipos de evento del catálogo oficial (CasosDePruebaEventosSignificativos.xlsx).
const TIPOS_EVENTO = [
    { codigo: 1, descripcion: 'CORTE DEL SERVICIO DE INTERNET' },
    { codigo: 2, descripcion: 'INACCESIBILIDAD AL SERVICIO WEB DE LA ADMINISTRACION TRIBUTARIA' },
    { codigo: 3, descripcion: 'INGRESO A ZONAS SIN INTERNET POR DESPLIEGUE DE PUNTO DE VENTA EN VEHICULOS AUTOMOTORES' },
    { codigo: 4, descripcion: 'VENTA EN LUGARES SIN INTERNET' },
    { codigo: 5, descripcion: 'CORTE DE SUMINISTRO DE ENERGIA ELECTRICA' },
    { codigo: 6, descripcion: 'VIRUS INFORMATICO O FALLA DE SOFTWARE' },
    { codigo: 7, descripcion: 'CAMBIO DE INFRAESTRUCTURA DEL SISTEMA INFORMATICO DE FACTURACION O FALLA DE HARDWARE' },
];

const INTENTOS_POR_FILA = 15; // el portal pide 10 correctos; se deja margen por flakiness ya observada

function armarFactura({ nit, numeroFactura, fechaEmision, cufd, pv }) {
    const cuf = generarCuf({
        nit, fecha: fechaEmision, sucursal: 0, modalidad: 2, tipoEmision: 2,
        tipoFacturaDocumento: 1, tipoDocumentoSector: 1, numeroFactura,
        puntoVenta: pv || 0, codigoControl: cufd.codigoControl,
    });
    const xml = construirFacturaComputarizadaXml({
        nitEmisor: nit, razonSocialEmisor: 'JUAN CANCIO ESPEJO CAMACOPA', municipio: 'La Paz',
        telefono: null, numeroFactura, cuf, cufd: cufd.codigo, codigoSucursal: 0,
        direccion: cufd.direccion, codigoPuntoVenta: pv,
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
    });
    return xml;
}

async function unIntento({ nit, cuis, pv, tipo, numeroFacturaInicial, cantidadFacturas }) {
    const cufdA = await sin.solicitarCufd(cuis, pv);
    if (!cufdA.transaccion && !cufdA.codigo) throw new Error('No se pudo pedir CUFD A: ' + cufdA.xml.slice(0, 300));
    await sleep(3000);
    const fechaInicio = new Date();
    await sleep(800);

    const xmlsFactura = [];
    let numeroFactura = numeroFacturaInicial;
    for (let i = 0; i < cantidadFacturas; i++) {
        const fechaEmision = new Date();
        xmlsFactura.push(armarFactura({ nit, numeroFactura, fechaEmision, cufd: cufdA, pv }));
        numeroFactura++;
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
    // Con paquetes grandes (~500 facturas) la validación puede tardar unos segundos
    // más en pasar de 901 (pendiente) a 908 (validada); se reintenta con paciencia
    // en vez de darla por fallida al primer 901.
    for (let intento = 0; intento < 6; intento++) {
        await sleep(4000);
        const cufdV = await sin.solicitarCufd(cuis, pv);
        const val = await sin.validarPaqueteFacturas({
            codigoRecepcion: r.codigoRecepcion, cufd: cufdV.codigo, cuis, codigoPuntoVenta: pv,
        });
        if (val.codigoEstado === '908') return true;
        if (intento === 5) throw new Error('Validacion no llego a 908: ' + val.xml.slice(0, 400));
    }
    return false;
}

(async () => {
    const nit = process.env.SIN_NIT;
    const cuisPv1r = await sin.solicitarCuis(1);
    const cuisPv1 = cuisPv1r.codigo;
    const cuisPv0 = process.env.SIN_CUIS;
    console.log('cuisPv1=', cuisPv1, 'cuisPv0=', cuisPv0);

    let numeroBase500 = 100000;
    let numeroBaseChico = 900000;

    for (const tipo of TIPOS_EVENTO) {
        // Fila "igual a 500": codigoPuntoVenta = 1
        let exitos500 = 0;
        for (let i = 0; i < INTENTOS_POR_FILA; i++) {
            const numeroFacturaInicial = numeroBase500;
            numeroBase500 += 600;
            try {
                await unIntento({
                    nit, cuis: cuisPv1, pv: 1, tipo, numeroFacturaInicial, cantidadFacturas: 500,
                });
                exitos500++;
                log(`evento${tipo.codigo}-igual500`, i + 1, true, 'validado=908 (500 facturas)');
            } catch (e) {
                log(`evento${tipo.codigo}-igual500`, i + 1, false, e.message);
            }
            if (exitos500 >= 10) break; // ya cubrió el requisito de esta fila
        }

        // Fila "menor a 500": codigoPuntoVenta = 0 (casa matriz, se envía como null)
        let exitosChico = 0;
        for (let i = 0; i < INTENTOS_POR_FILA; i++) {
            const numeroFacturaInicial = numeroBaseChico;
            numeroBaseChico += 10;
            try {
                await unIntento({
                    nit, cuis: cuisPv0, pv: null, tipo, numeroFacturaInicial, cantidadFacturas: 2,
                });
                exitosChico++;
                log(`evento${tipo.codigo}-menor500`, i + 1, true, 'validado=908 (2 facturas)');
            } catch (e) {
                log(`evento${tipo.codigo}-menor500`, i + 1, false, e.message);
            }
            if (exitosChico >= 10) break;
        }

        console.log(`=== Evento ${tipo.codigo} (${tipo.descripcion}): igual500=${exitos500}/10, menor500=${exitosChico}/10 ===`);
    }

    console.log('=== LISTO. Ver scripts/sinFase1EtapaVIMatrizResultados.jsonl ===');
    process.exit(0);
})().catch((e) => {
    console.error('ERROR FATAL:', e);
    process.exit(1);
});
