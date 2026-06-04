const { Pool } = require('pg');
const path = require('path');

// Cargar .env por si acaso (para local y pruebas)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();

const poolConfig = connectionString ? {
  connectionString: connectionString,
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
    
    // 1. Asegurarse de que la tabla de usuarios exista
    try {
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
    } catch (createErr) {
        console.log('Info Tabla Usuarios:', createErr.message);
    }

    // 2. Migraciones críticas para Usuarios (Ejecutadas una a una de forma segura)
    const userMigrations = [
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre TEXT;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT;',
        'ALTER TABLE usuarios ALTER COLUMN nombre TYPE TEXT;',
        'ALTER TABLE usuarios ALTER COLUMN rol TYPE TEXT;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username TEXT;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin TEXT;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_stock BOOLEAN DEFAULT FALSE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_compras BOOLEAN DEFAULT FALSE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_proveedores BOOLEAN DEFAULT FALSE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_auditoria BOOLEAN DEFAULT FALSE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_parametros BOOLEAN DEFAULT FALSE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_informe BOOLEAN DEFAULT FALSE;'
    ];

    for (const sql of userMigrations) {
        try {
            await pool.query(sql);
        } catch (migErr) {
            console.log(`Info Migración Usuarios (${sql.trim()}):`, migErr.message);
        }
    }

    // 3. Migraciones de Compras
    try {
        await pool.query('ALTER TABLE compras ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255);');
    } catch (compraErr) {
        console.log('Info Migración Compras:', compraErr.message);
    }

    // 3.5. Migraciones de Productos y Pedidos Internos (Fotos)
    try {
        await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url TEXT;');
        await pool.query('ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS imagen_url TEXT;');
    } catch (fotoErr) {
        console.log('Info Migración Fotos:', fotoErr.message);
    }

    // 4. Auditoría y Rendimiento
    try {
        await pool.query('ALTER TABLE historial_accesos ADD COLUMN IF NOT EXISTS ubicacion TEXT;');
    } catch (histErr1) {
        console.log('Info Migración Historial 1:', histErr1.message);
    }
    try {
        await pool.query('CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_accesos(fecha DESC);');
    } catch (histErr2) {
        console.log('Info Migración Historial 2:', histErr2.message);
    }
    
    // 5. Branding Global
    try {
        await pool.query("UPDATE parametros SET nombre_empresa = 'Café La Paz' WHERE id = 1;");
    } catch (paramErr) {
        console.log('Info Migración Parametros:', paramErr.message);
    }

    // 5.5 Migración de Proveedores
    try {
        await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS lugar TEXT;');
        await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS otros TEXT;');
    } catch (provErr) {
        console.log('Info Migración Proveedores:', provErr.message);
    }

    // 6. Crear un usuario administrador por defecto si no existe ninguno
    try {
        const userCheck = await pool.query('SELECT COUNT(*) FROM usuarios');
        if (parseInt(userCheck.rows[0].count) === 0) {
            console.log('👤 Creando usuario administrador por defecto (admin / 1234)...');
            await pool.query(`
                INSERT INTO usuarios (nombre, username, pin, rol, activo)
                VALUES ('Administrador', 'admin', '1234', 'ADMINISTRADOR', true);
            `);
        }
    } catch (seedErr) {
        console.log('Info Seed Usuarios:', seedErr.message);
    }

    console.log('✅ Base de Datos Optimizada y marca Café La Paz aplicada.');
  }
});

module.exports = pool;