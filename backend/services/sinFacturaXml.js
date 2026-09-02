// backend/services/sinFacturaXml.js
//
// Construye el XML de "Factura Computarizada Compra Venta" siguiendo exactamente el
// XSD y el ejemplo oficial del SIN (facturaComputarizadaCompraVenta.xsd/.xml, descargado
// de siatinfo.impuestos.gob.bo). codigoDocumentoSector es fijo en 1 para este tipo de factura.

function escaparXml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// campo nulo según convención del SIN: <tag xsi:nil="true"/>
function tagONil(nombre, valor) {
    if (valor === null || valor === undefined || valor === '') {
        return `<${nombre} xsi:nil="true"/>`;
    }
    return `<${nombre}>${escaparXml(valor)}</${nombre}>`;
}

function tag(nombre, valor) {
    return `<${nombre}>${escaparXml(valor)}</${nombre}>`;
}

// fecha: Date. Devuelve "yyyy-MM-ddTHH:mm:ss.SSS" (mismo formato del ejemplo oficial,
// sin zona horaria, hora local del emisor).
function formatoFechaEmision(fecha) {
    const pad = (n, l = 2) => String(n).padStart(l, '0');
    const yyyy = fecha.getFullYear();
    const MM = pad(fecha.getMonth() + 1);
    const dd = pad(fecha.getDate());
    const HH = pad(fecha.getHours());
    const mm = pad(fecha.getMinutes());
    const ss = pad(fecha.getSeconds());
    const SSS = pad(fecha.getMilliseconds(), 3);
    return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}.${SSS}`;
}

// detalles: array de { actividadEconomica, codigoProductoSin, codigoProducto, descripcion,
//   cantidad, unidadMedida, precioUnitario, montoDescuento, subTotal }
function construirFacturaComputarizadaXml({
    nitEmisor, razonSocialEmisor, municipio, telefono,
    numeroFactura, cuf, cufd, codigoSucursal, direccion, codigoPuntoVenta,
    fechaEmision, nombreRazonSocial, codigoTipoDocumentoIdentidad, numeroDocumento,
    complemento, codigoCliente, codigoMetodoPago, numeroTarjeta,
    montoTotal, montoTotalSujetoIva, codigoMoneda, tipoCambio, montoTotalMoneda,
    montoGiftCard, descuentoAdicional, codigoExcepcion, cafc, leyenda, usuario,
    detalles,
}) {
    const cabecera = `<cabecera>
        ${tag('nitEmisor', nitEmisor)}
        ${tag('razonSocialEmisor', razonSocialEmisor)}
        ${tag('municipio', municipio)}
        ${tagONil('telefono', telefono)}
        ${tag('numeroFactura', numeroFactura)}
        ${tag('cuf', cuf)}
        ${tag('cufd', cufd)}
        ${tag('codigoSucursal', codigoSucursal)}
        ${tag('direccion', direccion)}
        ${tagONil('codigoPuntoVenta', codigoPuntoVenta)}
        ${tag('fechaEmision', formatoFechaEmision(fechaEmision))}
        ${tagONil('nombreRazonSocial', nombreRazonSocial)}
        ${tag('codigoTipoDocumentoIdentidad', codigoTipoDocumentoIdentidad)}
        ${tag('numeroDocumento', numeroDocumento)}
        ${tagONil('complemento', complemento)}
        ${tag('codigoCliente', codigoCliente)}
        ${tag('codigoMetodoPago', codigoMetodoPago)}
        ${tagONil('numeroTarjeta', numeroTarjeta)}
        ${tag('montoTotal', montoTotal)}
        ${tag('montoTotalSujetoIva', montoTotalSujetoIva)}
        ${tag('codigoMoneda', codigoMoneda)}
        ${tag('tipoCambio', tipoCambio)}
        ${tag('montoTotalMoneda', montoTotalMoneda)}
        ${tagONil('montoGiftCard', montoGiftCard)}
        ${tagONil('descuentoAdicional', descuentoAdicional)}
        ${tagONil('codigoExcepcion', codigoExcepcion)}
        ${tagONil('cafc', cafc)}
        ${tag('leyenda', leyenda)}
        ${tag('usuario', usuario)}
        ${tag('codigoDocumentoSector', 1)}
    </cabecera>`;

    const detalleXml = detalles.map(d => `<detalle>
        ${tag('actividadEconomica', d.actividadEconomica)}
        ${tag('codigoProductoSin', d.codigoProductoSin)}
        ${tag('codigoProducto', d.codigoProducto)}
        ${tag('descripcion', d.descripcion)}
        ${tag('cantidad', d.cantidad)}
        ${tag('unidadMedida', d.unidadMedida)}
        ${tag('precioUnitario', d.precioUnitario)}
        ${tagONil('montoDescuento', d.montoDescuento ?? 0)}
        ${tag('subTotal', d.subTotal)}
        ${tagONil('numeroSerie', d.numeroSerie)}
        ${tagONil('numeroImei', d.numeroImei)}
    </detalle>`).join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<facturaComputarizadaCompraVenta xsi:noNamespaceSchemaLocation="facturaComputarizadaCompraVenta.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    ${cabecera}
    ${detalleXml}
</facturaComputarizadaCompraVenta>`;
}

module.exports = {
    construirFacturaComputarizadaXml,
    formatoFechaEmision,
};
