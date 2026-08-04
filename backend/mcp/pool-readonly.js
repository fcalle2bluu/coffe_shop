// backend/mcp/pool-readonly.js
//
// Conexión separada para las herramientas de LECTURA del servidor MCP, usando
// el rol supabase_read_only_user (ya existe en la base, con SELECT confirmado
// sobre insumos/movimientos_inventario/productos). Las herramientas de
// escritura NO usan este pool: pasan por backend/utils/inventario.js con el
// pool normal de la aplicación.
const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const host = (process.env.DB_HOST || '').trim();
const database = (process.env.DB_NAME || '').trim();
const port = parseInt(process.env.DB_PORT) || 6543;
const passwordReadonly = (process.env.DB_READONLY_PASSWORD || '').trim();

// Mientras no se configure DB_READONLY_PASSWORD, se usa el mismo usuario
// principal de la app como respaldo (las herramientas de lectura solo hacen
// SELECT de todos modos). En cuanto esa variable exista, se cambia solo al
// rol supabase_read_only_user sin tocar código.
const user = passwordReadonly
    ? (process.env.DB_READONLY_USER || 'supabase_read_only_user').trim()
    : (process.env.DB_USER || '').trim();
const password = passwordReadonly || (process.env.DB_PASSWORD || '').trim();

if (!passwordReadonly) {
    console.log('Info MCP: DB_READONLY_PASSWORD no configurada, las herramientas de lectura usan el usuario principal por ahora.');
}

const poolReadonly = new Pool({
    user,
    host,
    database,
    password,
    port,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 5,
});

poolReadonly.on('error', (err) => {
    console.error('⚠️ Error inesperado en el pool de solo lectura del MCP:', err.message);
});

module.exports = poolReadonly;
