// backend/scripts/sinFase1Parte2.js
//
// Segunda pasada de Fase 1, tras revisar la matriz real de avance del portal SIAT
// ("Gestión de Autorización de Sistemas" > matriz de certificación), que mostró los
// totales EXACTOS que exige el SIN (distintos de lo que habíamos asumido la primera vez):
//
//   Etapa II  Sincronización        1800 casos = 18 catálogos x 100 (el WSDL real tiene
//                                    18 catálogos, no 14 - faltaban sincronizarParametricaPaisOrigen,
//                                    TipoEmision, TipoHabitacion y TipoPuntoVenta).
//   Etapa V   Eventos Significativos  70 casos = 14 casos base (7 tipos x pv 1/0) x 5.
//   Etapa VI  Envío por Paquetes     tar.gz + validación (verificado 901/908 en PILOTO).
//                                    Eventos 1-4 sin CAFC. 5/6/7 requieren CAFC de PILOTO.
//   Etapa VII Anulación              250 casos (bloqueada la vez anterior; se reintenta acá
//                                    pidiendo un CUFD recién emitido en vez de reusar el de
//                                    emisión, y reusando las 500 facturas ya validadas).
//   Reversión Anulación              revierte las anulaciones que sí se confirmen.
//
// Uso: node scripts/sinFase1Parte2.js
// Resultados en scripts/sinFase1Parte2Resultados.jsonl

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const sin = require('../services/sinFacturacion');
const { generarCuf } = require('../services/sinCuf');
const { construirFacturaComputarizadaXml } = require('../services/sinFacturaXml');

const LOG_PATH = path.join(__dirname, 'sinFase1Parte2Resultados.jsonl');
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(etapa, nro, ok, detalle) {
    const linea = { ts: new Date().toISOString(), etapa, nro, ok, detalle };
    logStream.write(JSON.stringify(linea) + '\n');
    console.log(`[${etapa} #${nro}] ${ok ? 'OK' : 'FALLO'} ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Las 18 operaciones reales del WSDL FacturacionSincronizacion (confirmado 2026-09-02
// contra pilotosiatservicios.impuestos.gob.bo/v2/FacturacionSincronizacion?WSDL).
const SYNC_OPS = [
    'sincronizarActividades', 'sincronizarFechaHora', 'sincronizarListaActividadesDocumentoSector',
    'sincronizarListaLeyendasFactura', 'sincronizarListaMensajesServicios', 'sincronizarListaProductosServicios',
    'sincronizarParametricaEventosSignificativos', 'sincronizarParametricaMotivoAnulacion',
    'sincronizarParametricaPaisOrigen', 'sincronizarParametricaTipoDocumentoIdentidad',
    'sincronizarParametricaTipoDocumentoSector', 'sincronizarParametricaTipoEmision',
    'sincronizarParametricaTipoHabitacion', 'sincronizarParametricaTipoMetodoPago',
    'sincronizarParametricaTipoMoneda', 'sincronizarParametricaTipoPuntoVenta',
    'sincronizarParametricaTiposFactura', 'sincronizarParametricaUnidadMedida',
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

async function etapaII_Sincronizacion(cuisPv1, cuisPv0) {
    for (const op of SYNC_OPS) {
        let exitos = 0;
        for (let i = 0; i < 100; i++) {
            const usarPv1 = i % 2 === 0;
            try {
                const r = await sincronizarUnaVez(op, usarPv1 ? cuisPv1 : cuisPv0, usarPv1 ? 1 : null);
                if (r.transaccion) exitos++;
            } catch (e) { /* sigue */ }
            await sleep(60);
        }
        log('II-SINCRONIZACION', op, exitos === 100, `${exitos}/100 exitosas`);
    }
}

// Los 7 tipos de Evento Significativo del catálogo oficial (CasosDePruebaEventosSignificativos.xlsx),
// cada uno probado con pv=1 y pv=null (14 casos base), repetido 5 veces = 70.
const TIPOS_EVENTO = [
    { codigo: 1, descripcion: 'CORTE DEL SERVICIO DE INTERNET' },
    { codigo: 2, descripcion: 'INACCESIBILIDAD AL SERVICIO WEB DE LA ADMINISTRACION TRIBUTARIA' },
    { codigo: 3, descripcion: 'INGRESO A ZONAS SIN INTERNET POR DESPLIEGUE DE PUNTO DE VENTA EN VEHICULOS AUTOMOTORES' },
    { codigo: 4, descripcion: 'VENTA EN LUGARES SIN INTERNET' },
    { codigo: 5, descripcion: 'CORTE DE SUMINISTRO DE ENERGIA ELECTRICA' },
    { codigo: 6, descripcion: 'VIRUS INFORMATICO O FALLA DE SOFTWARE' },
    { codigo: 7, descripcion: 'CAMBIO DE INFRAESTRUCTURA DEL SISTEMA INFORMATICO DE FACTURACION O FALLA DE HARDWARE' },
];

async function etapaV_Eventos(cuisPv1, cuisPv0, cufdPv1, cufdPv0) {
    const { formatoFechaEmision } = require('../services/sinFacturaXml');
    const eventosRegistrados = [];
    for (let rep = 0; rep < 5; rep++) {
        for (const tipo of TIPOS_EVENTO) {
            for (const usarPv1 of [true, false]) {
                const cuis = usarPv1 ? cuisPv1 : cuisPv0;
                const cufd = usarPv1 ? cufdPv1 : cufdPv0;
                const pv = usarPv1 ? 1 : null;
                // El SIN exige que fechaInicio/fechaFin del evento "correspondan" al CUFD usado
                // (código 984 si no) y que fechaFin no esté en el futuro (código 981 si lo está).
                // Verificado empíricamente: una ventana muy corta que termina justo "ahora" (después
                // de que el CUFD ya está vigente) funciona; una ventana futura o anterior a la
                // emisión del CUFD falla.
                const inicio = new Date();
                await sleep(1000);
                const fin = new Date();
                try {
                    const r = await sin.registrarEventoSignificativo({
                        codigoMotivoEvento: tipo.codigo,
                        descripcion: tipo.descripcion,
                        cufd: cufd.codigo,
                        cufdEvento: cufd.codigo,
                        fechaInicio: formatoFechaEmision(inicio),
                        fechaFin: formatoFechaEmision(fin),
                        codigoPuntoVenta: pv,
                        cuis,
                    });
                    const ok = !!r.transaccion;
                    log('V-EVENTOS', `rep${rep + 1}-tipo${tipo.codigo}-pv${pv}`, ok, ok ? `codigo=${r.codigoRecepcionEvento}` : r.xml.slice(0, 300));
                    if (ok) eventosRegistrados.push({ codigoRecepcion: r.codigoRecepcionEvento, pv, cuis, cufd: cufd.codigo });
                } catch (e) {
                    log('V-EVENTOS', `rep${rep + 1}-tipo${tipo.codigo}-pv${pv}`, false, e.message);
                }
                await sleep(150);
            }
        }
    }
    return eventosRegistrados;
}

async function etapaVI_Paquetes(cuisPv1, cuisPv0) {
    // Ciclo correcto (verificado 2026-09-02 en PILOTO: recepción 901 + validación 908):
    //   CUFD A → esperar 3s → emitir XML offline DENTRO de la ventana → registrar evento
    //   con el mismo CUFD A → pedir CUFD B → enviar tar.gz → validar paquete.
    // Eventos 1-4 NO llevan CAFC. 5/6/7 sí, y hay que pedir el CAFC de PILOTO en el portal.
    const nit = process.env.SIN_NIT;
    let numeroFactura = 50000;
    const { formatoFechaEmision } = require('../services/sinFacturaXml');
    const tiposOffline = TIPOS_EVENTO.filter((t) => t.codigo <= 4);
    let n = 0;
    const objetivo = 20;
    while (n < objetivo) {
        for (const tipo of tiposOffline) {
            if (n >= objetivo) break;
            for (const usarPv1 of [true, false]) {
                if (n >= objetivo) break;
                n++;
                const cuis = usarPv1 ? cuisPv1 : cuisPv0;
                const pv = usarPv1 ? 1 : null;
                try {
                    const cufdA = await sin.solicitarCufd(cuis, pv);
                    await sleep(3000);
                    const fechaInicio = new Date();
                    await sleep(800);
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
                        await sleep(150);
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
                    if (!evento.transaccion) {
                        log('VI-PAQUETES', n, false, evento.xml.slice(0, 400));
                        continue;
                    }
                    const cufdB = await sin.solicitarCufd(cuis, pv);
                    const r = await sin.enviarPaqueteFacturas({
                        xmlsFactura, cufd: cufdB.codigo, codigoEvento: evento.codigoRecepcionEvento,
                        cuis, codigoPuntoVenta: pv, cafc: null,
                    });
                    if (r.codigoEstado !== '901' && r.codigoEstado !== '908') {
                        log('VI-PAQUETES', n, false, r.xml.slice(0, 500));
                        continue;
                    }
                    await sleep(1200);
                    const val = await sin.validarPaqueteFacturas({
                        codigoRecepcion: r.codigoRecepcion, cufd: cufdB.codigo, cuis, codigoPuntoVenta: pv,
                    });
                    const ok = val.codigoEstado === '908';
                    log('VI-PAQUETES', n, ok, ok
                        ? `tipo${tipo.codigo} pv=${pv} recepcion=${r.codigoRecepcion} validado=908`
                        : val.xml.slice(0, 500));
                } catch (e) {
                    log('VI-PAQUETES', n, false, e.message);
                }
            }
        }
    }
}

async function etapaVII_Anulacion(cufsEmitidos, cuisPv1, cuisPv0, cufdPv1, cufdPv0) {
    let hechas = 0;
    let exitos = 0;
    const anuladas = [];
    for (const factura of cufsEmitidos) {
        if (hechas >= 250) break;
        const usarPv1 = factura.pv === 1;
        const cufdFresco = usarPv1 ? cufdPv1 : cufdPv0;
        const cuisFresco = usarPv1 ? cuisPv1 : cuisPv0;
        try {
            const r = await sin.anularFactura({
                cuf: factura.cuf, codigoMotivo: 1, cufd: cufdFresco.codigo,
                codigoPuntoVenta: factura.pv, cuis: cuisFresco,
            });
            const ok = r.transaccion && r.codigoEstado === '905';
            if (ok) { exitos++; anuladas.push({ ...factura, cufdCodigo: cufdFresco.codigo }); }
            log('VII-ANULACION', factura.numeroFactura, ok, ok ? `estado=${r.codigoEstado}` : r.xml.slice(0, 400));
        } catch (e) {
            log('VII-ANULACION', factura.numeroFactura, false, e.message);
        }
        hechas++;
        await sleep(150);
        if (hechas === 5 && exitos === 0) {
            log('VII-ANULACION', 'CORTE', false, 'Las primeras 5 anulaciones fallaron igual - deteniendo para revisar manualmente');
            break;
        }
    }
    return anuladas;
}

async function etapaReversion(anuladas) {
    let hechas = 0;
    for (const factura of anuladas) {
        try {
            const r = await sin.reversionAnulacion({
                cuf: factura.cuf, cufd: factura.cufdCodigo, codigoPuntoVenta: factura.pv, cuis: factura.cuis,
            });
            const ok = !!r.transaccion;
            log('REVERSION', factura.numeroFactura, ok, ok ? `estado=${r.codigoEstado}` : r.xml.slice(0, 400));
        } catch (e) {
            log('REVERSION', factura.numeroFactura, false, e.message);
        }
        hechas++;
        await sleep(150);
    }
}

(async () => {
    console.log('=== Preparación: CUIS y CUFD frescos para pv=1 y pv=null ===');
    const cuisPv1r = await sin.solicitarCuis(1);
    const cuisPv1 = cuisPv1r.codigo;
    const cuisPv0 = process.env.SIN_CUIS;
    await new Promise((r) => setTimeout(r, 300));
    const cufdPv1 = await sin.solicitarCufd(cuisPv1, 1);
    const cufdPv0 = await sin.solicitarCufd(cuisPv0, null);
    console.log('cuisPv1=', cuisPv1, 'cufdPv1=', cufdPv1.codigo);
    console.log('cuisPv0=', cuisPv0, 'cufdPv0=', cufdPv0.codigo);

    console.log('=== ETAPA II: SINCRONIZACION completa (18 catálogos x 100) ===');
    await etapaII_Sincronizacion(cuisPv1, cuisPv0);

    console.log('=== ETAPA V: EVENTOS SIGNIFICATIVOS (14 casos base x 5 = 70) ===');
    const eventos = await etapaV_Eventos(cuisPv1, cuisPv0, cufdPv1, cufdPv0);

    console.log('=== ETAPA VI: ENVIO POR PAQUETES (tar.gz + validación) ===');
    await etapaVI_Paquetes(cuisPv1, cuisPv0);

    console.log('=== ETAPA VII: ANULACION (reintento con CUFD fresco, hasta 250) ===');
    const facturasPrevias = JSON.parse(fs.readFileSync(path.join(__dirname, 'sinFase1FacturasEmitidas.json'), 'utf-8'));
    const anuladas = await etapaVII_Anulacion(facturasPrevias, cuisPv1, cuisPv0, cufdPv1, cufdPv0);

    console.log('=== REVERSION DE ANULACION (sobre lo que sí se haya anulado) ===');
    await etapaReversion(anuladas);

    console.log('=== LISTO. Ver resultados en scripts/sinFase1Parte2Resultados.jsonl ===');
    process.exit(0);
})().catch((e) => {
    console.error('ERROR FATAL:', e);
    process.exit(1);
});
