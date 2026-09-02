// backend/services/sinCuf.js
//
// Algoritmo de Generación del CUF (Código Único de Factura) según especificación
// oficial del SIN (siatinfo.impuestos.gob.bo > Algoritmos Utilizados > Generación CUF /
// Algoritmo Módulo 11 / Base 16). Verificado el 2026-09-02 reproduciendo exactamente el
// ejemplo oficial de la documentación (mismo dígito verificador y mismo resultado hexadecimal).

// Módulo 11: dígito autoverificador. Parámetros fijos según el ejemplo de consumo oficial:
// calculaDigitoMod11(cadena, numDig=1, limMult=9, x10=false)
function calculaDigitoMod11(cadenaInicial, numDig = 1, limMult = 9, x10 = false) {
    let cadena = cadenaInicial;
    for (let n = 1; n <= numDig; n++) {
        let suma = 0;
        let mult = 2;
        for (let i = cadena.length - 1; i >= 0; i--) {
            suma += mult * parseInt(cadena[i], 10);
            mult++;
            if (mult > limMult) mult = 2;
        }
        let dig;
        if (x10) {
            dig = ((suma * 10) % 11) % 10;
        } else {
            dig = suma % 11;
        }
        if (dig === 10) cadena += '1';
        else if (dig === 11) cadena += '0';
        else cadena += String(dig);
    }
    return cadena.slice(-numDig);
}

function pad(valor, longitud) {
    return String(valor).padStart(longitud, '0');
}

// Base 16: la cadena de 54 dígitos se interpreta como un número decimal (BigInt) y se
// convierte a hexadecimal en mayúsculas (equivalente a BigInteger.ToString("X") en C#).
function base16DesdeDecimal(cadenaDecimal) {
    return BigInt(cadenaDecimal).toString(16).toUpperCase();
}

// fecha: instancia de Date (hora local del emisor). Devuelve yyyyMMddHHmmssSSS (17 dígitos).
function formatoFechaCuf(fecha) {
    const yyyy = fecha.getFullYear();
    const MM = pad(fecha.getMonth() + 1, 2);
    const dd = pad(fecha.getDate(), 2);
    const HH = pad(fecha.getHours(), 2);
    const mm = pad(fecha.getMinutes(), 2);
    const ss = pad(fecha.getSeconds(), 2);
    const SSS = pad(fecha.getMilliseconds(), 3);
    return `${yyyy}${MM}${dd}${HH}${mm}${ss}${SSS}`;
}

// Genera el CUF completo. `fecha` debe ser la MISMA fecha/hora usada en <fechaEmision> del XML.
// `codigoControl` viene de la respuesta del servicio CUFD (RespuestaCufd.codigoControl).
function generarCuf({ nit, fecha, sucursal, modalidad, tipoEmision, tipoFacturaDocumento, tipoDocumentoSector, numeroFactura, puntoVenta, codigoControl }) {
    const campos =
        pad(nit, 13) +
        formatoFechaCuf(fecha) +
        pad(sucursal, 4) +
        pad(modalidad, 1) +
        pad(tipoEmision, 1) +
        pad(tipoFacturaDocumento, 1) +
        pad(tipoDocumentoSector, 2) +
        pad(numeroFactura, 10) +
        pad(puntoVenta, 4);

    if (campos.length !== 53) {
        throw new Error(`Cadena base del CUF debe tener 53 dígitos, tiene ${campos.length}`);
    }

    const digitoVerificador = calculaDigitoMod11(campos, 1, 9, false);
    const cadenaConDigito = campos + digitoVerificador;
    const hex = base16DesdeDecimal(cadenaConDigito);

    return hex + codigoControl;
}

module.exports = {
    calculaDigitoMod11,
    base16DesdeDecimal,
    formatoFechaCuf,
    generarCuf,
};
