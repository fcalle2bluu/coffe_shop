// PUENTE DEL LECTOR DE ASISTENCIA (Dahua DHI-ASI3204E-DW)
//
// Corre en una PC de la cafetería, en la MISMA red wifi que el lector.
// Cada cierto tiempo le pregunta al lector si alguien marcó y manda lo nuevo al
// sistema. No toca la base de datos: habla con el sistema, igual que el navegador.
//
// Configuración: en un archivo .env al lado de este script, o en el .env de la
// raíz del proyecto. En Linux, el servicio lo lee de /etc/puente-lector.env.
//   LECTOR_HOST=192.168.0.31
//   LECTOR_USUARIO=admin
//   LECTOR_PASSWORD=...
//   LECTOR_API_KEY=...            <- la misma que esté puesta en el servidor
//   SISTEMA_URL=https://coffe-shop-4ffg.onrender.com   (opcional)
//   LECTOR_INTERVALO_SEG=30                            (opcional)
//   LECTOR_ESTADO_ARCHIVO=/var/lib/puente-lector/estado.json  (opcional)
//
// Para arrancarlo:   node backend/scripts/puente_lector_asistencia.js
// Para probar sin mandar nada:   node backend/scripts/puente_lector_asistencia.js --simular

const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// A propósito no usa dotenv ni ninguna librería de afuera: así este archivo se
// puede copiar solo a la PC de la cafetería (con su .env al lado) y funciona
// con Node recién instalado, sin "npm install" ni el resto del proyecto.
// Busca el .env primero al lado de este archivo, y si no, en la raíz del repo.
(function cargarEnv() {
    const candidatos = [
        path.join(__dirname, '.env'),
        path.join(__dirname, '../../.env'),
    ];
    const archivo = candidatos.find((f) => fs.existsSync(f));
    if (!archivo) return;
    for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linea);
        if (!m) continue;                       // comentarios y líneas vacías
        let valor = m[2].trim();
        if (/^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
    }
})();

const HOST = process.env.LECTOR_HOST;
const USUARIO = process.env.LECTOR_USUARIO || 'admin';
const PASSWORD = process.env.LECTOR_PASSWORD;
const API_KEY = process.env.LECTOR_API_KEY;
const SISTEMA = (process.env.SISTEMA_URL || 'https://coffe-shop-4ffg.onrender.com').replace(/\/+$/, '');
const INTERVALO = (parseInt(process.env.LECTOR_INTERVALO_SEG, 10) || 30) * 1000;
const SIMULAR = process.argv.includes('--simular');

// Recuerda hasta qué registro del lector ya se mandó, para no repetir trabajo
// después de un reinicio o un corte de luz. Por defecto queda al lado de este
// archivo; LECTOR_ESTADO_ARCHIVO lo mueve (lo usa el servicio de Linux, que
// guarda en /var/lib y no puede escribir en /opt).
const ARCHIVO_ESTADO = process.env.LECTOR_ESTADO_ARCHIVO
    || path.join(__dirname, '.puente_lector_estado.json');

function log(...args) {
    console.log(new Date().toLocaleString('es-BO', { hour12: false }), '·', ...args);
}

function leerEstado() {
    try { return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8')); } catch { return { ultimoRecNo: 0 }; }
}
function guardarEstado(e) {
    try { fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify(e)); } catch (err) { log('No se pudo guardar el estado:', err.message); }
}

// El lector pide autenticación Digest, que es de dos pasos: primero responde
// "401 + desafío" y recién con eso se arma la credencial correcta.
function pedirAlLector(ruta, maxBytes = 200000) {
    return new Promise((resolve, reject) => {
        const lanzar = (headers) => {
            const req = http.get({ host: HOST, path: ruta, timeout: 20000, headers }, (r) => {
                if (r.statusCode === 401 && !headers.Authorization) {
                    const reto = r.headers['www-authenticate'] || '';
                    r.resume();
                    const v = (k) => (new RegExp(k + '="?([^",]+)"?').exec(reto) || [])[1];
                    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
                    const cnonce = crypto.randomBytes(8).toString('hex'), nc = '00000001';
                    const ha1 = md5(`${USUARIO}:${v('realm')}:${PASSWORD}`);
                    const ha2 = md5(`GET:${ruta}`);
                    const resp = v('qop')
                        ? md5(`${ha1}:${v('nonce')}:${nc}:${cnonce}:auth:${ha2}`)
                        : md5(`${ha1}:${v('nonce')}:${ha2}`);
                    let auth = `Digest username="${USUARIO}", realm="${v('realm')}", nonce="${v('nonce')}", uri="${ruta}", response="${resp}"`;
                    if (v('qop')) auth += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
                    if (v('opaque')) auth += `, opaque="${v('opaque')}"`;
                    return lanzar({ Authorization: auth });
                }
                if (r.statusCode !== 200) { r.resume(); return reject(new Error('El lector respondió HTTP ' + r.statusCode)); }
                let d = '';
                r.on('data', (c) => { d += c; if (d.length > maxBytes) r.destroy(); });
                r.on('close', () => resolve(d));
            });
            req.on('timeout', () => { req.destroy(); reject(new Error('el lector no respondió a tiempo')); });
            req.on('error', reject);
        };
        lanzar({});
    });
}

// Convierte la respuesta del lector (líneas "records[0].Campo=valor") en objetos
function parsearRegistros(texto) {
    const porIndice = {};
    texto.split('\n').forEach((linea) => {
        const m = /records\[(\d+)\]\.(\w+)=(.*)/.exec(linea.trim());
        if (m) { (porIndice[m[1]] = porIndice[m[1]] || {})[m[2]] = m[3]; }
    });
    return Object.values(porIndice);
}

function mandarAlSistema(marcaciones) {
    return new Promise((resolve, reject) => {
        const cuerpo = JSON.stringify({ marcaciones });
        const url = new URL(SISTEMA + '/api/asistencia/dispositivo');
        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname, method: 'POST', timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(cuerpo),
                'x-lector-key': API_KEY,
            },
        }, (r) => {
            let d = '';
            r.on('data', (c) => d += c);
            r.on('end', () => {
                if (r.statusCode !== 200) return reject(new Error(`el sistema respondió HTTP ${r.statusCode}: ${d.slice(0, 200)}`));
                try { resolve(JSON.parse(d)); } catch { reject(new Error('respuesta ilegible del sistema')); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('el sistema no respondió a tiempo')); });
        req.on('error', reject);
        req.write(cuerpo);
        req.end();
    });
}

async function unaVuelta(estado) {
    const ahora = Math.floor(Date.now() / 1000);
    // Se pide una ventana amplia y después se filtra por número de registro: así
    // no se pierde nada si el reloj del lector y el de la PC no están iguales.
    const desde = ahora - 2 * 86400;
    const texto = await pedirAlLector(
        `/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&count=200&StartTime=${desde}&EndTime=${ahora}`);

    const nuevas = parsearRegistros(texto)
        .map((r) => ({
            rec_no: parseInt(r.RecNo, 10),
            user_id: r.UserID ? parseInt(r.UserID, 10) : null,
            nombre: r.CardName || null,
            fecha_hora: new Date(parseInt(r.CreateTime, 10) * 1000).toISOString(),
            // Status=1 es reconocido; 0 es un intento fallido (cara desconocida)
            reconocido: r.Status === '1' && !!r.UserID,
        }))
        .filter((r) => Number.isInteger(r.rec_no) && r.rec_no > estado.ultimoRecNo)
        .sort((a, b) => a.rec_no - b.rec_no);

    if (nuevas.length === 0) return estado;

    const utiles = nuevas.filter((r) => r.reconocido);
    log(`${nuevas.length} marcación(es) nueva(s) en el lector, ${utiles.length} reconocida(s)`);

    if (SIMULAR) {
        nuevas.forEach((r) => log(`   [simulación] #${r.rec_no} ${r.nombre || '(no reconocido)'} ${new Date(r.fecha_hora).toLocaleString('es-BO', { hour12: false })}`));
    } else if (utiles.length > 0) {
        const r = await mandarAlSistema(utiles);
        r.resultados.forEach((x) => log(`   #${x.rec_no} ${x.empleado || ''} -> ${x.resultado}`));
    }

    // Solo se avanza la marca si todo salió bien: si falló el envío, la próxima
    // vuelta lo reintenta (y el servidor ignora lo que ya estaba registrado).
    estado.ultimoRecNo = nuevas[nuevas.length - 1].rec_no;
    guardarEstado(estado);
    return estado;
}

(async () => {
    if (!HOST || !PASSWORD) { console.error('Falta LECTOR_HOST o LECTOR_PASSWORD en el .env'); process.exit(1); }
    if (!API_KEY && !SIMULAR) { console.error('Falta LECTOR_API_KEY en el .env (o usá --simular para probar sin mandar)'); process.exit(1); }

    let estado = leerEstado();
    log(`Puente iniciado. Lector ${HOST} -> ${SIMULAR ? '(simulación, no manda nada)' : SISTEMA}`);
    log(`Reviso cada ${INTERVALO / 1000} segundos. Último registro procesado: #${estado.ultimoRecNo}`);

    // Primera vuelta: si nunca corrió, se pone al día desde la marcación MÁS NUEVA,
    // para no volver a procesar meses de historial.
    // Ojo: el lector devuelve los registros desde el más viejo, así que pedir
    // "count=1" trae el primero de todos, no el último: hay que traer un lote y
    // quedarse con el número más alto.
    if (estado.ultimoRecNo === 0) {
        try {
            const ahora = Math.floor(Date.now() / 1000);
            const texto = await pedirAlLector(
                `/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&count=500&StartTime=${ahora - 30 * 86400}&EndTime=${ahora}`);
            let ultimo = Math.max(0, ...parsearRegistros(texto).map((r) => parseInt(r.RecNo, 10) || 0));
            if (ultimo === 0) {
                // Sin marcaciones en el último mes: se usa el total que informa el aparato.
                const tot = await pedirAlLector('/cgi-bin/recordFinder.cgi?action=getQuerySize&name=AccessControlCardRec');
                ultimo = parseInt((/Size=(\d+)/.exec(tot) || [])[1], 10) || 0;
            }
            estado.ultimoRecNo = ultimo;
            guardarEstado(estado);
            log(`Primera vez: arranco desde el registro #${ultimo} (lo anterior queda como historial).`);
        } catch (e) { log('No pude leer el punto de partida:', e.message); }
    }

    const vuelta = async () => {
        try { estado = await unaVuelta(estado); }
        catch (e) { log('⚠️ ', e.message); }
    };
    await vuelta();
    setInterval(vuelta, INTERVALO);
})();
