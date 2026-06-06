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
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perm_informe BOOLEAN DEFAULT FALSE;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ci VARCHAR(50);',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS salario NUMERIC(10, 2) DEFAULT 0.00;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_url TEXT;'
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

    // Migración de ubicaciones antiguas con formato "📍 Lat: X, Lon: Y" al nuevo formato "📍 Lugar de Acceso | X,Y"
    try {
        await pool.query(`
            UPDATE historial_accesos 
            SET ubicacion = '📍 Lugar de Acceso | ' || regexp_replace(ubicacion, '.*Lat:[[:space:]]*([0-9.-]+),[[:space:]]*Lon:[[:space:]]*([0-9.-]+).*', '\\1,\\2')
            WHERE ubicacion LIKE '%Lat:%' OR ubicacion LIKE '%Lon:%';
        `);
        console.log('✅ Migración de ubicaciones antiguas completada.');
    } catch (migUbicacionErr) {
        console.log('Info Migración Ubicaciones Historial:', migUbicacionErr.message);
    }
    
    // 5. Branding Global
    try {
        await pool.query("UPDATE parametros SET nombre_empresa = 'Café La Paz' WHERE id = 1;");
    } catch (paramErr) {
        console.log('Info Migración Parametros:', paramErr.message);
    }

    // Migración de Parametros para Salarios y Descuentos
    const paramMigrations = [
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS hora_entrada_patron TIME DEFAULT \'08:30:00\';',
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS descuento_minuto_retraso NUMERIC(10, 2) DEFAULT 1.00;',
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS descuento_falta_dia NUMERIC(10, 2) DEFAULT 50.00;',
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS dias_laborables INT DEFAULT 26;'
    ];
    for (const sql of paramMigrations) {
        try {
            await pool.query(sql);
        } catch (migErr) {
            console.log('Info Migración Parametros Sueldos:', migErr.message);
        }
    }

    // Tabla Pagos de Salarios
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pagos_salarios (
                id SERIAL PRIMARY KEY,
                usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                mes INT NOT NULL,
                anio INT NOT NULL,
                salario_base NUMERIC(10, 2) NOT NULL,
                descuento_retrasos NUMERIC(10, 2) NOT NULL,
                descuento_faltas NUMERIC(10, 2) NOT NULL,
                salario_neto NUMERIC(10, 2) NOT NULL,
                fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                glosa TEXT NOT NULL,
                UNIQUE (usuario_id, mes, anio)
            );
        `);
        console.log('✅ Tabla pagos_salarios verificada/creada.');
    } catch (pagoSalErr) {
        console.log('Info Tabla Pagos Salarios:', pagoSalErr.message);
    }

    // 5.5 Migración de Proveedores
    try {
        await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS lugar TEXT;');
        await pool.query('ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS otros TEXT;');
    } catch (provErr) {
        console.log('Info Migración Proveedores:', provErr.message);
    }

    // 5.8 Creación de tabla de Gastos de Caja
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS gastos_caja (
                id SERIAL PRIMARY KEY,
                caja_id INT NOT NULL,
                usuario_id INT NOT NULL,
                monto NUMERIC(10, 2) NOT NULL,
                descripcion TEXT NOT NULL,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla gastos_caja verificada/creada.');
    } catch (gastoCajaErr) {
        console.log('Info Tabla Gastos Caja:', gastoCajaErr.message);
    }

    // 5.85 Creación de tabla de Gastos Generales (para el Libro Diario)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS gastos_generales (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                descripcion TEXT NOT NULL,
                monto NUMERIC(10, 2) NOT NULL,
                categoria VARCHAR(100) NOT NULL,
                metodo_pago VARCHAR(50) NOT NULL DEFAULT 'BANCO BISA'
            );
        `);
        console.log('✅ Tabla gastos_generales verificada/creada.');
    } catch (gastoGenErr) {
        console.log('Info Tabla Gastos Generales:', gastoGenErr.message);
    }

    // 5.9 Creación de tabla de Dispositivos Tokens (FCM)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dispositivo_tokens (
                id SERIAL PRIMARY KEY,
                usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla dispositivo_tokens verificada/creada.');
    } catch (tokenErr) {
        console.log('Info Tabla Dispositivo Tokens:', tokenErr.message);
    }

    // 5.95 Creación de tabla de Asistencia (QR)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS asistencia (
                id SERIAL PRIMARY KEY,
                usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                fecha DATE NOT NULL DEFAULT CURRENT_DATE,
                hora_entrada TIMESTAMP NOT NULL,
                hora_salida TIMESTAMP,
                horas_trabajadas NUMERIC(5, 2),
                UNIQUE (usuario_id, fecha)
            );
        `);
        console.log('✅ Tabla asistencia verificada/creada.');
    } catch (asistenciaErr) {
        console.log('Info Tabla Asistencia:', asistenciaErr.message);
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