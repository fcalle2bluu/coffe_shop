// Tar POSIX/USTAR mínimo (sin dependencias) para paquetes SIAT.
// El ambiente PILOTO responde 901 con tar.gz y 920 con zip/gzip(zip).

function padOctal(n, width) {
    const s = n.toString(8);
    return s.padStart(width - 1, '0') + '\0';
}

function checksum(header) {
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    return sum;
}

function headerUstar(name, size) {
    const buf = Buffer.alloc(512, 0);
    buf.write(name, 0, 100, 'utf-8');
    buf.write(padOctal(0o644, 8), 100, 8, 'ascii'); // mode
    buf.write(padOctal(0, 8), 108, 8, 'ascii'); // uid
    buf.write(padOctal(0, 8), 116, 8, 'ascii'); // gid
    buf.write(padOctal(size, 12), 124, 12, 'ascii');
    buf.write(padOctal(Math.floor(Date.now() / 1000), 12), 136, 12, 'ascii');
    buf.write('        ', 148, 8, 'ascii'); // checksum placeholder (spaces)
    buf.write('0', 156, 1, 'ascii'); // regular file
    buf.write('ustar', 257, 5, 'ascii');
    buf.write('\0', 262, 1, 'ascii');
    buf.write('00', 263, 2, 'ascii');
    const sum = checksum(buf);
    buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    return buf;
}

// entries: [{ name: '1.xml', data: Buffer }]
function crearTar(entries) {
    const parts = [];
    for (const { name, data } of entries) {
        parts.push(headerUstar(name, data.length));
        parts.push(data);
        const pad = (512 - (data.length % 512)) % 512;
        if (pad) parts.push(Buffer.alloc(pad, 0));
    }
    parts.push(Buffer.alloc(1024, 0));
    return Buffer.concat(parts);
}

module.exports = { crearTar };
