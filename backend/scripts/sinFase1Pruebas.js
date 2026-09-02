// backend/scripts/sinFase1Pruebas.js
//
// Ejecuta el protocolo de pruebas de Fase 1 exigido por el SIN para autorizar el sistema
// (siatinfo.impuestos.gob.bo > Proceso de Autorización > Fase 1 - Pruebas), usando los
// casos documentados en los Excel oficiales (CasosDePruebaCUIS, ...Sincronización...,
// ...CUFD, ...EmisionIndividual1). Corre contra el ambiente PILOTO.
//
// IMPORTANTE: un CUIS queda atado al punto de venta con el que se pidió (probado el
// 2026-09-02: usar un CUIS obtenido sin punto de venta junto con codigoPuntoVenta=1 en
// otra llamada da "EL PUNTO DE VENTA ES INEXISTENTE O INVALIDO"). Por eso este script pide
// un CUIS propio para el caso "con punto de venta 1" y usa el CUIS por defecto (SIN_CUIS)
// para el caso "sin punto de venta".
//
// Uso: node scripts/sinFase1Pruebas.js
// Resultados en scripts/sinFase1Resultados.jsonl (una línea JSON por llamada).

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const sin = require('../services/sinFacturacion');
const { generarCuf } = require('../services/sinCuf');
const { construirFacturaComputarizadaXml } = require('../services/sinFacturaXml');

const LOG_PATH = path.join(__dirname, 'sinFase1Resultados.jsonl');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(etapa, nro, ok, detalle) {
    const linea = { ts: new Date().toISOString(), etapa, nro, ok, detalle };
    logStream.write(JSON.stringify(linea) + '\n');
    console.log(`[${etapa} #${nro}] ${ok ? 'OK' : 'FALLO'} ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYNC_OPS = [
    'sincronizarParametricaMotivoAnulacion', 'sincronizarActividades', 'sincronizarFechaHora',
    'sincronizarListaLeyendasFactura', 'sincronizarListaActividadesDocumentoSector',
    'sincronizarParametricaTipoDocumentoIdentidad', 'sincronizarParametricaUnidadMedida',
    'sincronizarParametricaTipoDocumentoSector', 'sincronizarParametricaTiposFactura',
    'sincronizarListaMensajesServicios', 'sincronizarParametricaTipoMetodoPago',
    'sincronizarParametricaEventosSignificativos', 'sincronizarListaProductosServicios',
    'sincronizarParametricaTipoMoneda',
];

async function sincronizarUnaVez(operacion, cuis, codigoPuntoVenta) {
    const d = sin.datosBase();
    const pv = codigoPuntoVenta === null ? '' : `<codigoPuntoVenta>${codigoPuntoVenta}</codigoPuntoVenta>`;
    const xml = `
      <SolicitudSincronizacion>
        <codigoAmbiente>${d.codigoAmbiente}</codigoAmbiente>
        ${pv}
        <codigoSistema>${d.codigoSistema}</codigoSistema>
        <codigoSucursal>${d.codigoSucursal}</codigoSucursal>
        <cuis>${cuis}</cuis>
        <nit>${d.nit}</nit>
      </SolicitudSincronizacion>`;
    return sin.llamarSoap(sin.RUTAS.sincronizacion, operacion, xml);
}

async function etapaI_Cuis() {
    // Caso 1: con punto de venta 1 (ya registrado como "Caja Principal"). Genera un CUIS
    // propio para ese punto de venta. Caso 2: sin punto de venta (usa/renueva el CUIS base).
    let cuisPv1 = null;
    try {
        const r = await sin.solicitarCuis(1);
        cuisPv1 = r.codigo;
        log('I-CUIS', 'pv=1', r.transaccion, `cuis=${cuisPv1}`);
    } catch (e) {
        log('I-CUIS', 'pv=1', false, e.message);
    }
    await sleep(150);

    try {
        const r = await sin.solicitarCuis(null);
        log('I-CUIS', 'pv=null', r.transaccion, `cuis=${r.codigo}`);
    } catch (e) {
        log('I-CUIS', 'pv=null', false, e.message);
    }

    return cuisPv1;
}

async function etapaII_Sincronizacion(cuisPv1, cuisPv0) {
    for (const op of SYNC_OPS) {
        let exitos = 0;
        for (let i = 0; i < 50; i++) {
            const usarPv1 = i % 2 === 0;
            try {
                const r = await sincronizarUnaVez(op, usarPv1 ? cuisPv1 : cuisPv0, usarPv1 ? 1 : null);
                if (r.transaccion) exitos++;
            } catch (e) { /* sigue */ }
            await sleep(80);
        }
        log('II-SINCRONIZACION', op, exitos === 50, `${exitos}/50 exitosas`);
    }
}

async function etapaIII_Cufd(cuisPv1, cuisPv0) {
    const resultados = {};
    for (const variante of ['pv1', 'pv0']) {
        const cuis = variante === 'pv1' ? cuisPv1 : cuisPv0;
        const pv = variante === 'pv1' ? 1 : null;
        let exitos = 0;
        let ultimoCufd = null;
        for (let i = 0; i < 100; i++) {
            try {
                const r = await sin.solicitarCufd(cuis, pv);
                if (r.transaccion) { exitos++; ultimoCufd = r; }
            } catch (e) { /* sigue */ }
            await sleep(80);
        }
        log('III-CUFD', variante, exitos === 100, `${exitos}/100 exitosas`);
        resultados[variante] = ultimoCufd;
    }
    return resultados;
}

async function etapaIV_EmisionIndividual(numeroFacturaInicial, cuisPv1, cuisPv0, cufdPv1, cufdPv0) {
    const nit = process.env.SIN_NIT;
    let numeroFactura = numeroFacturaInicial;
    const cufsEmitidos = [];

    for (let i = 0; i < 500; i++) {
        const usarPv1 = i % 2 === 0;
        const pv = usarPv1 ? 1 : null;
        const cuis = usarPv1 ? cuisPv1 : cuisPv0;
        const cufd = usarPv1 ? cufdPv1 : cufdPv0;
        const fechaEmision = new Date();
        try {
            const cuf = generarCuf({
                nit, fecha: fechaEmision, sucursal: 0, modalidad: 2, tipoEmision: 1,
                tipoFacturaDocumento: 1, tipoDocumentoSector: 1, numeroFactura,
                puntoVenta: pv || 0, codigoControl: cufd.codigoControl,
            });
            const xmlFactura = construirFacturaComputarizadaXml({
                nitEmisor: nit, razonSocialEmisor: 'JUAN CANCIO ESPEJO CAMACOPA', municipio: 'La Paz',
                telefono: null, numeroFactura, cuf, cufd: cufd.codigo, codigoSucursal: 0,
                direccion: cufd.direccion, codigoPuntoVenta: pv,
                fechaEmision, nombreRazonSocial: 'CLIENTE DE PRUEBA', codigoTipoDocumentoIdentidad: 1,
                numeroDocumento: '1234567', complemento: null, codigoCliente: '1234567',
                codigoMetodoPago: 1, numeroTarjeta: null,
                montoTotal: '15.00', montoTotalSujetoIva: '15.00', codigoMoneda: 1,
                tipoCambio: '1.00', montoTotalMoneda: '15.00',
                montoGiftCard: null, descuentoAdicional: null, codigoExcepcion: null, cafc: null,
                leyenda: 'Ley N° 453: Tienes derecho a recibir información sobre las características y contenidos de los servicios que utilices.',
                usuario: 'PRUEBA',
                detalles: [{
                    actividadEconomica: '5610200', codigoProductoSin: 1003802, codigoProducto: 'CAFE-001',
                    descripcion: 'Cafe con leche', cantidad: '1.00', unidadMedida: 57, precioUnitario: '15.00',
                    montoDescuento: 0, subTotal: '15.00', numeroSerie: null, numeroImei: null,
                }],
            });
            const r = await sin.enviarFactura({ xmlFactura, cufd: cufd.codigo, cuis, codigoPuntoVenta: pv });
            const ok = r.transaccion && r.codigoEstado === '908';
            log('IV-EMISION', numeroFactura, ok, `estado=${r.codigoEstado}`);
            if (ok) cufsEmitidos.push({ cuf, numeroFactura, pv, cuis, cufdCodigo: cufd.codigo });
        } catch (e) {
            log('IV-EMISION', numeroFactura, false, e.message);
        }
        numeroFactura++;
        await sleep(120);
    }

    fs.writeFileSync(path.join(__dirname, 'sinFase1FacturasEmitidas.json'), JSON.stringify(cufsEmitidos, null, 2));
    return cufsEmitidos;
}

async function etapaVII_Anulacion(cufsEmitidos) {
    let hechas = 0;
    let exitos = 0;
    for (const factura of cufsEmitidos) {
        if (hechas >= 250) break;
        try {
            const r = await sin.anularFactura({
                cuf: factura.cuf, codigoMotivo: 1, cufd: factura.cufdCodigo,
                codigoPuntoVenta: factura.pv, cuis: factura.cuis,
            });
            const ok = r.transaccion && r.codigoEstado === '905';
            if (ok) exitos++;
            log('VII-ANULACION', factura.numeroFactura, ok, `estado=${r.codigoEstado}`);
        } catch (e) {
            log('VII-ANULACION', factura.numeroFactura, false, e.message);
        }
        hechas++;
        await sleep(150);
        // Si las primeras 5 fallan igual (error de servidor ya visto), no sigue insistiendo
        // 250 veces contra el mismo error: corta temprano y deja el resto pendiente.
        if (hechas === 5 && exitos === 0) {
            log('VII-ANULACION', 'CORTE', false, 'Las primeras 5 anulaciones fallaron igual - deteniendo esta etapa para revisar manualmente');
            break;
        }
    }
}

(async () => {
    console.log('=== ETAPA I: CUIS ===');
    const cuisPv1 = await etapaI_Cuis();
    const cuisPv0 = process.env.SIN_CUIS;

    console.log('=== ETAPA II: SINCRONIZACION (14 catálogos x 50) ===');
    await etapaII_Sincronizacion(cuisPv1, cuisPv0);

    console.log('=== ETAPA III: CUFD (2 casos x 100) ===');
    const cufds = await etapaIII_Cufd(cuisPv1, cuisPv0);

    console.log('=== ETAPA IV: EMISION INDIVIDUAL (500 facturas) ===');
    const cufsEmitidos = await etapaIV_EmisionIndividual(2, cuisPv1, cuisPv0, cufds.pv1, cufds.pv0);

    console.log('=== ETAPA VII: ANULACION (hasta 250) ===');
    await etapaVII_Anulacion(cufsEmitidos);

    console.log('=== LISTO. Ver resultados en scripts/sinFase1Resultados.jsonl ===');
    process.exit(0);
})().catch((e) => {
    console.error('ERROR FATAL:', e);
    process.exit(1);
});
