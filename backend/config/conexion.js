const { Pool } = require('pg');
const path = require('path');

// Cargar .env por si acaso (para local y pruebas)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL.trim(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
} : {
  user: (process.env.DB_USER || '').trim(),
  host: (process.env.DB_HOST || '').trim(),
  database: (process.env.DB_NAME || '').trim(),
  password: (process.env.DB_PASSWORD || '').trim(),
  port: parseInt(process.env.DB_PORT) || 6543,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
};

const pool = new Pool(poolConfig);

// Manejador global de errores del Pool (CRÍTICO para evitar que la app crashee en Render)
pool.on('error', (err, client) => {
  console.error('⚠️ Error inesperado en el pool de conexiones:', err.message);
});

// Prueba de conexión inicial y Auto-Migración
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Error de conexión inicial:', err.message);
  } else {
    console.log('✅ ¡CONEXIÓN EXITOSA! MokaPOS está conectado a la base de datos.');
    try {
        // Asegurarse de que la tabla de usuarios exista
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                username VARCHAR(255) UNIQUE NOT NULL,
                pin VARCHAR(255) NOT NULL,
                rol VARCHAR(255) NOT NULL,
                activo BOOLEAN DEFAULT TRUE
            );
        `);

        // 1. Migraciones de Compras
        await pool.query('ALTER TABLE compras ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255);');
        
        // 2. Migraciones críticas para Usuarios (Consolidadas)
        await pool.query(`
            ALTER TABLE usuarios ALTER COLUMN nombre TYPE TEXT;
            ALTER TABLE usuarios ALTER COLUMN rol TYPE TEXT;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username TEXT;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin TEXT;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
        `);

        // 3. Auditoría y Rendimiento
        await pool.query('ALTER TABLE historial_accesos ADD COLUMN IF NOT EXISTS ubicacion TEXT;');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_accesos(fecha DESC);');
        
        // 4. Branding Global
        await pool.query("UPDATE parametros SET nombre_empresa = 'Café La Paz' WHERE id = 1;");

        // Crear un usuario administrador por defecto si no existe ninguno
        const userCheck = await pool.query('SELECT COUNT(*) FROM usuarios');
        if (parseInt(userCheck.rows[0].count) === 0) {
            console.log('👤 Creando usuario administrador por defecto (admin / 1234)...');
            await pool.query(`
                INSERT INTO usuarios (nombre, username, pin, rol, activo)
                VALUES ('Administrador', 'admin', '1234', 'ADMINISTRADOR', true);
            `);
        }

        console.log('✅ Base de Datos Optimizada y marca Café La Paz aplicada.');
    } catch(e) {
        console.log('Info Sistema (Migración):', e.message); 
    }
  }
});

module.exports = pool;