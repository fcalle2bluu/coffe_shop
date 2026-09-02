// backend/services/sinFacturacion.js
//
// Cliente para los servicios web (SOAP) de Facturación Computarizada en Línea del SIN
// (Servicio de Impuestos Nacionales de Bolivia). Ambiente controlado por SIN_CODIGO_AMBIENTE
// en .env (2 = Pruebas/Piloto, 1 = Producción).
//
// Autenticación: header HTTP "apikey: TokenApi <token>" (confirmado contra el servicio real
// de PRUEBAS el 2026-09-02; no usa Authorization ni Bearer, y el prefijo "TokenApi " con
// espacio es obligatorio). El token se obtiene y se renueva manualmente desde el portal SIAT
// en "Gestor Token Delegado (Piloto/Producción)".

const BASE_URL = 'https://pilotosiatservicios.impuestos.gob.bo/v2';

const RUTAS = {
    codigos: `${BASE_URL}/FacturacionCodigos`,
    operaciones: `${BASE_URL}/FacturacionOperaciones`,
    sincronizacion: `${BASE_URL}/FacturacionSincronizacion`,
    compraVenta: `${BASE_URL}/ServicioFacturacionCompraVenta`,
};

const NS = 'https://siat.impuestos.gob.bo/';

function envolverSoap(operacion, xmlInterior) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fac="${NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <fac:${operacion}>${xmlInterior}</fac:${operacion}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Extrae el primer valor de una etiqueta XML por nombre simple (sin namespace), suficiente
// para las respuestas planas que devuelve el SIN. Evita traer una librería XML solo para esto.
function extraerTag(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return m ? m[1] : null;
}

function extraerMensajesError(xml) {
    const mensajes = [];
    const re = /<mensajesList>\s*<codigo>([^<]*)<\/codigo>\s*<descripcion>([^<]*)<\/descripcion>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        mensajes.push({ codigo: m[1], descripcion: m[2] });
    }
    return mensajes;
}

async function llamarSoap(ruta, operacion, xmlInterior) {
    const token = process.env.SIN_API_TOKEN;
    if (!token) throw new Error('SIN_API_TOKEN no está configurado en .env');

    const body = envolverSoap(operacion, xmlInterior);

    const res = await fetch(ruta, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': '""',
            'apikey': `TokenApi ${token}`,
        },
        body,
    });

    const texto = await res.text();

    if (texto.includes('<soap:Fault>')) {
        const faultString = extraerTag(texto, 'faultstring') || 'Error SOAP desconocido';
        const err = new Error(`SIN [${operacion}]: ${faultString}`);
        err.soapFault = true;
        err.httpStatus = res.status;
        throw err;
    }

    return {
        httpStatus: res.status,
        xml: texto,
        transaccion: extraerTag(texto, 'transaccion') === 'true',
        mensajes: extraerMensajesError(texto),
    };
}

// Config base compartida por las solicitudes de Códigos (cuis/cufd)
function datosBase() {
    return {
        codigoAmbiente: process.env.SIN_CODIGO_AMBIENTE || '2',
        codigoModalidad: process.env.SIN_CODIGO_MODALIDAD || '2',
        codigoSistema: process.env.SIN_CODIGO_SISTEMA,
        codigoSucursal: process.env.SIN_CODIGO_SUCURSAL || '0',
        nit: process.env.SIN_NIT,
    };
}

// Prueba de conectividad pura (sin parámetros) contra un servicio SIN.
async function verificarComunicacion(ruta = RUTAS.sincronizacion) {
    const r = await llamarSoap(ruta, 'verificarComunicacion', '');
    return r;
}

// Solicita el CUIS (Código Único de Inicio de Sistema). Se pide UNA sola vez por
// sucursal/punto de venta: es de larga duración (alrededor de 1 año) y debe guardarse
// (hoy vive en SIN_CUIS del .env) para reutilizarse en cada solicitud de CUFD.
async function solicitarCuis() {
    const d = datosBase();
    const xml = `
      <SolicitudCuis>
        <codigoAmbiente>${d.codigoAmbiente}</codigoAmbiente>
        <codigoModalidad>${d.codigoModalidad}</codigoModalidad>
        <codigoSistema>${d.codigoSistema}</codigoSistema>
        <codigoSucursal>${d.codigoSucursal}</codigoSucursal>
        <nit>${d.nit}</nit>
      </SolicitudCuis>`;
    const r = await llamarSoap(RUTAS.codigos, 'cuis', xml);
    return {
        ...r,
        codigo: extraerTag(r.xml, 'codigo'),
        fechaVigencia: extraerTag(r.xml, 'fechaVigencia'),
    };
}

// Solicita el CUFD (Código Único de Facturación Diaria), válido ~24 horas. Hay que pedir
// uno nuevo cuando el anterior venza (fechaVigencia). No hay que llamarlo por cada factura,
// solo cuando el CUFD en uso ya caducó.
async function solicitarCufd(cuis = process.env.SIN_CUIS) {
    if (!cuis) throw new Error('Falta el CUIS (pedirlo una vez con solicitarCuis() y guardarlo)');
    const d = datosBase();
    const xml = `
      <SolicitudCufd>
        <codigoAmbiente>${d.codigoAmbiente}</codigoAmbiente>
        <codigoModalidad>${d.codigoModalidad}</codigoModalidad>
        <codigoSistema>${d.codigoSistema}</codigoSistema>
        <codigoSucursal>${d.codigoSucursal}</codigoSucursal>
        <cuis>${cuis}</cuis>
        <nit>${d.nit}</nit>
      </SolicitudCufd>`;
    const r = await llamarSoap(RUTAS.codigos, 'cufd', xml);
    return {
        ...r,
        codigo: extraerTag(r.xml, 'codigo'),
        codigoControl: extraerTag(r.xml, 'codigoControl'),
        direccion: extraerTag(r.xml, 'direccion'),
        fechaVigencia: extraerTag(r.xml, 'fechaVigencia'),
    };
}

module.exports = {
    RUTAS,
    llamarSoap,
    datosBase,
    verificarComunicacion,
    solicitarCuis,
    solicitarCufd,
};
