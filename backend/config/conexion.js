const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  // En Render/producción se recomienda el puerto 6543 (Pooler)
  port: parseInt(process.env.DB_PORT) || 6543,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000, // Tiempo antes de cerrar conexiones inactivas
  max: 10, // Máximo de conexiones en el pool
});

// Manejador global de errores del Pool (CRÍTICO para evitar que la app crashee en Render)
pool.on('error', (err, client) => {
  console.error('⚠️ Error inesperado en el pool de conexiones:', err.message);
});

// Prueba de conexión inicial y Auto-Migración
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Error de conexión inicial:', err.message);
  } else {
    console.log('✅ ¡CONEXIÓN EXITOSA! MokaPOS está conectado a Supabase.');
        try {
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

            console.log('✅ Base de Datos Optimizada y marca Café La Paz aplicada.');
        } catch(e) {
            console.log('Info Sistema:', e.message); 
        }
  }
});

module.exports = pool;