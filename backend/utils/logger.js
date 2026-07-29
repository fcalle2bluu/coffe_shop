// backend/utils/logger.js
//
// Render (plan gratuito) borra los logs de consola cada vez que la instancia
// duerme o se reinicia. Este módulo intercepta console.error y los errores
// fatales del proceso para guardarlos también en la tabla logs_sistema, que
// sobrevive cualquier reinicio porque vive en la base de datos.
//
// No reemplaza console.error, solo lo complementa: la consola sigue
// funcionando igual, y además queda guardado.
const pool = require('../config/conexion');

const consoleErrorOriginal = console.error.bind(console);

function aTexto(valor) {
    if (valor instanceof Error) return valor.stack || valor.message;
    if (typeof valor === 'object' && valor !== null) {
        try { return JSON.stringify(valor); } catch { return String(valor); }
    }
    return String(valor);
}

function persistirLog(nivel, mensaje) {
    // Fire-and-forget: si falla el guardado del log, no debe tumbar la app
    // ni volver a pasar por console.error (evitaría un bucle infinito).
    pool.query(
        'INSERT INTO logs_sistema (nivel, mensaje) VALUES ($1, $2)',
        [nivel, mensaje.slice(0, 8000)]
    ).catch(() => {});
}

console.error = function (...args) {
    consoleErrorOriginal(...args);
    try {
        persistirLog('ERROR', args.map(aTexto).join(' '));
    } catch (e) {
        consoleErrorOriginal('Error interno del logger:', e.message);
    }
};

// Una excepción no capturada dejaría el proceso en un estado desconocido, así
// que se guarda el log y se cierra a propósito (Render lo reinicia solo,
// igual que haría por defecto sin este manejador, pero ahora con el log
// guardado antes de morir).
process.on('uncaughtException', async (err) => {
    consoleErrorOriginal('uncaughtException:', err);
    try {
        await pool.query(
            'INSERT INTO logs_sistema (nivel, mensaje) VALUES ($1, $2)',
            ['FATAL', `uncaughtException: ${aTexto(err)}`.slice(0, 8000)]
        );
    } catch (e) {}
    process.exit(1);
});

// Una promesa rechazada sin .catch() no deja el proceso en un estado
// necesariamente inválido (a diferencia de uncaughtException), así que solo
// se registra sin forzar un reinicio.
process.on('unhandledRejection', (reason) => {
    consoleErrorOriginal('unhandledRejection:', reason);
    persistirLog('FATAL', `unhandledRejection: ${aTexto(reason)}`);
});
