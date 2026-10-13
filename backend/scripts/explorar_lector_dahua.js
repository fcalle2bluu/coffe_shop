// Explora qué permite el lector de asistencia Dahua (DHI-ASI3204E-DW).
// No cambia nada en el aparato: solo pregunta y muestra lo que responde.
// Credenciales: en el .env de la raíz (LECTOR_HOST, LECTOR_USUARIO, LECTOR_PASSWORD).
//
//   node backend/scripts/explorar_lector_dahua.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const http = require('http');
const crypto = require('crypto');

const HOST = process.env.LECTOR_HOST;
const USUARIO = process.env.LECTOR_USUARIO || 'admin';
const PASSWORD = process.env.LECTOR_PASSWORD;

if (!HOST || !PASSWORD) {
    console.error('Falta LECTOR_HOST o LECTOR_PASSWORD en el .env de la raíz del proyecto.');
    process.exit(1);
}

// El aparato pide autenticación Digest (no basta con usuario:contraseña simple).
function pedir(ruta, { timeout = 15000, maxBytes = 4000 } = {}) {
    return new Promise((resolve) => {
        const primera = http.get({ host: HOST, path: ruta, timeout }, (r1) => {
            r1.resume();
            if (r1.statusCode !== 401) return resolve({ estado: r1.statusCode, cuerpo: '' });

            const reto = r1.headers['www-authenticate'] || '';
            const val = (k) => (new RegExp(k + '="?([^",]+)"?').exec(reto) || [])[1];
            const realm = val('realm'), nonce = val('nonce'), opaque = val('opaque'), qop = val('qop');
            const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
            const cnonce = crypto.randomBytes(8).toString('hex');
            const nc = '00000001';
            const ha1 = md5(`${USUARIO}:${realm}:${PASSWORD}`);
            const ha2 = md5(`GET:${ruta}`);
            const respuesta = qop
                ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
                : md5(`${ha1}:${nonce}:${ha2}`);
            let auth = `Digest username="${USUARIO}", realm="${realm}", nonce="${nonce}", uri="${ruta}", response="${respuesta}"`;
            if (qop) auth += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
            if (opaque) auth += `, opaque="${opaque}"`;

            const segunda = http.get({ host: HOST, path: ruta, timeout, headers: { Authorization: auth } }, (r2) => {
                let datos = '';
                r2.on('data', (c) => {
                    datos += c;
                    if (datos.length > maxBytes) { datos = datos.slice(0, maxBytes) + '\n…(cortado)'; r2.destroy(); }
                });
                r2.on('close', () => resolve({ estado: r2.statusCode, cuerpo: datos.trim() }));
            });
            segunda.on('timeout', () => { segunda.destroy(); resolve({ estado: 'timeout', cuerpo: '' }); });
            segunda.on('error', (e) => resolve({ estado: 'error', cuerpo: e.message }));
        });
        primera.on('timeout', () => { primera.destroy(); resolve({ estado: 'timeout', cuerpo: '' }); });
        primera.on('error', (e) => resolve({ estado: 'error', cuerpo: e.message }));
    });
}

const PRUEBAS = [
    ['Tipo de aparato', '/cgi-bin/magicBox.cgi?action=getDeviceType'],
    ['Versión de firmware', '/cgi-bin/magicBox.cgi?action=getSoftwareVersion'],
    ['Número de serie', '/cgi-bin/magicBox.cgi?action=getSerialNo'],
    ['Hora del aparato', '/cgi-bin/global.cgi?action=getCurrentTime'],
    ['Config de red', '/cgi-bin/configManager.cgi?action=getConfig&name=Network'],
    ['¿Tiene "registro activo" (push a un servidor)?', '/cgi-bin/configManager.cgi?action=getConfig&name=RegisterServer'],
    ['¿Tiene servidor de alarmas?', '/cgi-bin/configManager.cgi?action=getConfig&name=AlarmServer'],
    ['Cuántos registros de acceso hay', '/cgi-bin/recordFinder.cgi?action=getQuerySize&name=AccessControlCardRec'],
    ['Lista de usuarios del lector', '/cgi-bin/AccessUser.cgi?action=list&count=3'],
];

(async () => {
    console.log(`Lector en ${HOST} — usuario "${USUARIO}"\n${'='.repeat(60)}`);
    for (const [titulo, ruta] of PRUEBAS) {
        const r = await pedir(ruta);
        const ok = r.estado === 200;
        console.log(`\n${ok ? '✅' : '❌'} ${titulo}   [HTTP ${r.estado}]`);
        if (r.cuerpo) console.log(r.cuerpo.split('\n').map((l) => '   ' + l).join('\n'));
    }

    // Últimas marcaciones: lo que realmente necesitamos para la asistencia
    console.log(`\n${'='.repeat(60)}\nÚLTIMAS MARCACIONES`);
    const abrir = await pedir('/cgi-bin/recordFinder.cgi?action=factory&name=AccessControlCardRec');
    const idObj = (/result=(\d+)/.exec(abrir.cuerpo || '') || [])[1];
    if (!idObj) {
        console.log('   No se pudo abrir el buscador de registros:', abrir.estado, abrir.cuerpo.slice(0, 120));
    } else {
        await pedir(`/cgi-bin/recordFinder.cgi?action=startFind&object=${idObj}&count=5`);
        const lote = await pedir(`/cgi-bin/recordFinder.cgi?action=doFind&object=${idObj}&count=5`, { maxBytes: 3000 });
        console.log(lote.cuerpo ? lote.cuerpo.split('\n').map((l) => '   ' + l).join('\n') : '   (vacío)');
        await pedir(`/cgi-bin/recordFinder.cgi?action=destroy&object=${idObj}`);
    }
})();
