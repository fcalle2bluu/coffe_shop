const { Pool, types } = require('pg');
const path = require('path');

// Cargar .env por si acaso (para local y pruebas)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Varias columnas de fecha en el sistema (comandas.fecha_creacion, gastos_caja.fecha,
// asistencia.hora_entrada, etc.) son TIMESTAMP sin zona horaria, y siempre se llenan
// con CURRENT_TIMESTAMP en una sesión de Postgres que corre en UTC — o sea, el valor
// crudo guardado ES una hora UTC real, aunque la columna no lo diga. El driver 'pg'
// por defecto reconstruye esos valores usando la zona horaria del sistema operativo
// del proceso Node que los lee, no UTC — así que el mismo dato podía interpretarse
// distinto según en qué máquina/servidor corriera el código, corriendo el riesgo de
// mostrar horas desfasadas. Esto fuerza a interpretarlos siempre como UTC real, sin
// importar el entorno, para que las horas sean siempre las mismas en todos lados.
types.setTypeParser(1114, (val) => (val ? new Date(val + 'Z') : null));

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

// Se conecta a Supabase a través de su pooler PgBouncer (modo transacción, puerto 6543),
// que reutiliza conexiones físicas entre distintos clientes lógicos. Se detectó que una
// conexión nueva puede heredar un search_path vacío/roto dejado por otra sesión anterior
// en ese mismo pool compartido — con search_path vacío, CUALQUIER query sin calificar el
// esquema (ej. "SELECT * FROM usuarios", que es como está escrito TODO este proyecto)
// falla con "relation ... does not exist", aunque la tabla exista perfectamente. Esto no
// rompe nada mientras el proceso siga vivo con sus conexiones ya buenas, pero cualquier
// conexión nueva (bajo más carga, o tras un reinicio/cold-start en Render) podría tocarle
// una física ya contaminada. Se fuerza el search_path correcto en cada conexión nueva del
// pool para blindarnos de esto sin depender de la configuración del pooler de Supabase.
// IMPORTANTE: incluye "extensions" además de "public" — Supabase instala ahí pgcrypto
// (la función crypt() que usa el login para verificar el PIN) y uuid-ossp, no en public.
// Un primer intento que dejó el search_path solo en "public" rompió el login en producción.
pool.on('connect', (client) => {
  client.query('SET search_path TO public, extensions').catch((err) => {
    console.error('⚠️ No se pudo fijar search_path en una conexión nueva:', err.message);
  });
});

// Prueba de conexión inicial y Auto-Migración
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Error de conexión inicial:', err.message);
  } else {
    console.log('✅ ¡CONEXIÓN EXITOSA! MokaPOS está conectado a la base de datos.');
    
    // 0. Migraciones de Catálogo de WhatsApp
    try {
        await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS meta_catalog_synced_at TIMESTAMP;');
        await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS meta_catalog_id VARCHAR(255);');
        await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS meta_catalog_error TEXT;');
        await pool.query('ALTER TABLE parametros ADD COLUMN IF NOT EXISTS ultima_sincronizacion_catalogo TIMESTAMP;');
        console.log('✅ Migraciones de WhatsApp Catálogo en BD completadas.');
    } catch (metaCatalogErr) {
        console.log('Info Migración WhatsApp Catálogo:', metaCatalogErr.message);
    }

    // 0b. Migración: ampliar constraint de metodo_pago en ventas para incluir BILLETERA MOVIL
    try {
        await pool.query(`ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;`);
        await pool.query(`
            ALTER TABLE ventas ADD CONSTRAINT ventas_metodo_pago_check
            CHECK (metodo_pago IN (
                'EFECTIVO',
                'QR', 'QR DIGITAL',
                'TARJETA', 'TARJETA DE DÉBITO/CRÉDITO',
                'CONSUME_LO_NUESTRO', 'CONSUME LO NUESTRO',
                'BILLETERA MOVIL'
            ));
        `);
        console.log('✅ Constraint ventas_metodo_pago_check actualizado con BILLETERA MOVIL.');
    } catch (constraintErr) {
        console.log('Info Migración constraint ventas:', constraintErr.message);
    }


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
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_url TEXT;',
        'ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;',
        "ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('ADMINISTRADOR', 'ADMIN', 'CAJERO', 'MESERO', 'ALMACEN', 'PASTELERA', 'COCINERO', 'BARISTA'));"
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
    
    // 4.9. Asegurar que exista la fila de configuración (id = 1). Sin esto, todas
    // las UPDATE ... WHERE id = 1 de esta sección (branding, descuentos de
    // salarios, etc.) afectan 0 filas y nada se llega a persistir nunca.
    try {
        await pool.query('INSERT INTO parametros (id) VALUES (1) ON CONFLICT (id) DO NOTHING;');
    } catch (paramSeedErr) {
        console.log('Info Seed fila Parametros:', paramSeedErr.message);
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
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS descuento_falta_dia NUMERIC(10, 2) DEFAULT 200.00;',
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS dias_laborables INT DEFAULT 26;',
        'ALTER TABLE parametros ADD COLUMN IF NOT EXISTS descuento_retraso_bloque NUMERIC(10, 2) DEFAULT 10.00;',
        'ALTER TABLE parametros ALTER COLUMN descuento_falta_dia SET DEFAULT 200.00;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dias_trabajados INT DEFAULT 27;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS horas_laborales NUMERIC(4, 2) DEFAULT 8.00;',
        'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS hora_entrada TIME DEFAULT \'08:30:00\';',
        'ALTER TABLE usuarios ALTER COLUMN salario SET DEFAULT 3300.00;'
    ];
    for (const sql of paramMigrations) {
        try {
            await pool.query(sql);
        } catch (migErr) {
            console.log('Info Migración Parametros Sueldos:', migErr.message);
        }
    }

    // Backfill: nuevo esquema simplificado de Salarios (solo para valores nunca configurados)
    try {
        await pool.query("UPDATE usuarios SET salario = 3300.00 WHERE salario IS NULL OR salario = 0;");
        await pool.query("UPDATE parametros SET descuento_falta_dia = 200.00 WHERE id = 1 AND descuento_falta_dia = 50.00;");
        console.log('✅ Backfill de Salarios (salario base, descuento falta) completado.');
    } catch (backfillErr) {
        console.log('Info Backfill Salarios:', backfillErr.message);
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

    // 5.97 Creación de tabla de Comandas y Detalle de Comandas
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS comandas (
                id SERIAL PRIMARY KEY,
                mesa VARCHAR(50) NOT NULL,
                usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                caja_id INT,
                estado VARCHAR(50) DEFAULT 'CREADA',
                total NUMERIC(10, 2) DEFAULT 0.00,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        try {
            await pool.query('ALTER TABLE comandas ALTER COLUMN mesa TYPE VARCHAR(50);');
        } catch (alterErr) {
            // Silencioso
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS detalle_comandas (
                id SERIAL PRIMARY KEY,
                comanda_id INT NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
                producto_id INT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
                cantidad INT NOT NULL,
                precio_unitario NUMERIC(10, 2) NOT NULL,
                subtotal NUMERIC(10, 2) NOT NULL
            );
        `);
        console.log('✅ Tablas comandas y detalle_comandas verificadas/creadas.');
    } catch (comandasErr) {
        console.log('Info Tablas Comandas:', comandasErr.message);
    }

    // 5.97b Migración: estado de cocina independiente del estado de cobro (para app de Cocina)
    try {
        await pool.query("ALTER TABLE comandas ADD COLUMN IF NOT EXISTS estado_cocina VARCHAR(20) DEFAULT 'PENDIENTE';");
        console.log('✅ Columna estado_cocina en comandas verificada/creada.');
    } catch (estadoCocinaErr) {
        console.log('Info Migración estado_cocina:', estadoCocinaErr.message);
    }

    // 5.97b-2 Migración: marcas de tiempo de cada transición de estado_cocina, para
    // el contador de espera en Venta por Mesa y para poder reportar más adelante
    // cuánto tarda cocina y cuánto espera una mesa ya lista antes de cobrarse.
    try {
        await pool.query('ALTER TABLE comandas ADD COLUMN IF NOT EXISTS fecha_pendiente_desde TIMESTAMP;');
        await pool.query('ALTER TABLE comandas ADD COLUMN IF NOT EXISTS fecha_completada_desde TIMESTAMP;');
        console.log('✅ Columnas fecha_pendiente_desde/fecha_completada_desde en comandas verificadas/creadas.');
    } catch (fechasCocinaErr) {
        console.log('Info Migración fechas de cocina:', fechasCocinaErr.message);
    }

    // 5.97c Migración: fecha/hora del pedido tal como la envía el navegador del mesero
    try {
        await pool.query('ALTER TABLE comandas ADD COLUMN IF NOT EXISTS fecha_hora_cliente TIMESTAMP;');
        console.log('✅ Columna fecha_hora_cliente en comandas verificada/creada.');
    } catch (fechaClienteErr) {
        console.log('Info Migración fecha_hora_cliente:', fechaClienteErr.message);
    }

    // 5.98 Creación de tabla de Mesas y Poblamiento Inicial
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mesas (
                id SERIAL PRIMARY KEY,
                numero VARCHAR(50) UNIQUE NOT NULL,
                piso VARCHAR(50) NOT NULL DEFAULT 'PLANTA_BAJA',
                pos_x DOUBLE PRECISION DEFAULT 10.0,
                pos_y DOUBLE PRECISION DEFAULT 10.0,
                activo BOOLEAN DEFAULT TRUE
            );
        `);
        console.log('✅ Tabla mesas verificada/creada.');

        const checkMesas = await pool.query('SELECT COUNT(*) FROM mesas');
        if (parseInt(checkMesas.rows[0].count) === 0) {
            console.log('🍽️ Poblando mesas por defecto (1-10)...');
            const defaultMesas = [
                { num: '1', piso: 'PLANTA_BAJA', x: 15, y: 20 },
                { num: '2', piso: 'PLANTA_BAJA', x: 45, y: 20 },
                { num: '3', piso: 'PLANTA_BAJA', x: 75, y: 20 },
                { num: '4', piso: 'PLANTA_BAJA', x: 30, y: 60 },
                { num: '5', piso: 'PLANTA_BAJA', x: 60, y: 60 },
                { num: '6', piso: 'PLANTA_ALTA', x: 15, y: 20 },
                { num: '7', piso: 'PLANTA_ALTA', x: 45, y: 20 },
                { num: '8', piso: 'PLANTA_ALTA', x: 75, y: 20 },
                { num: '9', piso: 'PLANTA_ALTA', x: 30, y: 60 },
                { num: '10', piso: 'PLANTA_ALTA', x: 60, y: 60 }
            ];
            for (let m of defaultMesas) {
                await pool.query(
                    'INSERT INTO mesas (numero, piso, pos_x, pos_y) VALUES ($1, $2, $3, $4)',
                    [m.num, m.piso, m.x, m.y]
                );
            }
        }
    } catch (mesasErr) {
        console.log('Info Tabla Mesas:', mesasErr.message);
    }

    // === MIGRACIONES MULTIDEPÓSITO Y PRODUCCIÓN ===
    try {
        // 1. Crear tabla de almacenes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS almacenes (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) UNIQUE NOT NULL,
                descripcion TEXT
            );
        `);
        
        // Sembrar almacenes por defecto
        await pool.query(`
            INSERT INTO almacenes (nombre, descripcion) VALUES 
            ('Almacén Central', 'Depósito general de insumos y compras de proveedores'),
            ('Almacén Pastelería', 'Inventario de insumos en mesa de trabajo para producción')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // 2. Crear tabla de inventario por almacén
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventario_almacen (
                id SERIAL PRIMARY KEY,
                almacen_id INT NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
                insumo_id INT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
                stock_actual NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                UNIQUE (almacen_id, insumo_id)
            );
        `);

        // Migrar stock lineal existente al Almacén Central e inicializar Pastelería en 0.00
        await pool.query(`
            INSERT INTO inventario_almacen (almacen_id, insumo_id, stock_actual)
            SELECT (SELECT id FROM almacenes WHERE nombre = 'Almacén Central' LIMIT 1), id, COALESCE(stock_actual, 0.00)
            FROM insumos
            ON CONFLICT (almacen_id, insumo_id) DO NOTHING;
        `);
        await pool.query(`
            INSERT INTO inventario_almacen (almacen_id, insumo_id, stock_actual)
            SELECT (SELECT id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1), id, 0.00
            FROM insumos
            ON CONFLICT (almacen_id, insumo_id) DO NOTHING;
        `);

        // 3. Crear tablas de órdenes de producción
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ordenes_produccion (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
                estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
                observaciones TEXT
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS detalle_orden (
                id SERIAL PRIMARY KEY,
                orden_id INT NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
                receta_id INT NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
                cantidad NUMERIC(10, 2) NOT NULL
            );
        `);

        // 4. Crear tablas de auditoría de pastelería
        await pool.query(`
            CREATE TABLE IF NOT EXISTS auditorias_pasteleria (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
                observaciones TEXT
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS detalle_auditoria_pasteleria (
                id SERIAL PRIMARY KEY,
                auditoria_id INT NOT NULL REFERENCES auditorias_pasteleria(id) ON DELETE CASCADE,
                insumo_id INT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
                cantidad_teorica NUMERIC(10, 2) NOT NULL,
                cantidad_real NUMERIC(10, 2) NOT NULL,
                diferencia NUMERIC(10, 2) NOT NULL
            );
        `);

        // 5. Crear Triggers de sincronización bidireccional segura
        // Función sync_almacen_to_insumo
        await pool.query(`
            CREATE OR REPLACE FUNCTION sync_almacen_to_insumo()
            RETURNS TRIGGER AS $$
            DECLARE
                total NUMERIC;
                ins_id INT;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    ins_id := OLD.insumo_id;
                ELSE
                    ins_id := NEW.insumo_id;
                END IF;

                SELECT COALESCE(SUM(stock_actual), 0) INTO total 
                FROM inventario_almacen 
                WHERE insumo_id = ins_id;

                PERFORM set_config('app.sync_lock', 'true', true);

                UPDATE insumos 
                SET stock_actual = total 
                WHERE id = ins_id AND stock_actual <> total;

                PERFORM set_config('app.sync_lock', 'false', true);

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Función sync_insumo_to_almacen
        await pool.query(`
            CREATE OR REPLACE FUNCTION sync_insumo_to_almacen()
            RETURNS TRIGGER AS $$
            DECLARE
                central_id INT;
                pasteleria_id INT;
                diff NUMERIC;
            BEGIN
                IF current_setting('app.sync_lock', true) = 'true' THEN
                    RETURN NEW;
                END IF;

                SELECT id INTO central_id FROM almacenes WHERE nombre = 'Almacén Central' LIMIT 1;
                SELECT id INTO pasteleria_id FROM almacenes WHERE nombre = 'Almacén Pastelería' LIMIT 1;

                IF TG_OP = 'INSERT' THEN
                    INSERT INTO inventario_almacen (almacen_id, insumo_id, stock_actual)
                    VALUES (central_id, NEW.id, NEW.stock_actual)
                    ON CONFLICT (almacen_id, insumo_id) DO UPDATE 
                    SET stock_actual = EXCLUDED.stock_actual;

                    INSERT INTO inventario_almacen (almacen_id, insumo_id, stock_actual)
                    VALUES (pasteleria_id, NEW.id, 0.00)
                    ON CONFLICT (almacen_id, insumo_id) DO NOTHING;
                    
                ELSIF TG_OP = 'UPDATE' THEN
                    diff := NEW.stock_actual - OLD.stock_actual;
                    IF diff <> 0 THEN
                        INSERT INTO inventario_almacen (almacen_id, insumo_id, stock_actual)
                        VALUES (central_id, NEW.id, 0.00)
                        ON CONFLICT (almacen_id, insumo_id) DO NOTHING;

                        INSERT INTO inventario_almacen (almacen_id, insumo_id, stock_actual)
                        VALUES (pasteleria_id, NEW.id, 0.00)
                        ON CONFLICT (almacen_id, insumo_id) DO NOTHING;

                        UPDATE inventario_almacen
                        SET stock_actual = stock_actual + diff
                        WHERE almacen_id = central_id AND insumo_id = NEW.id;
                    END IF;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Crear/Registrar Triggers
        await pool.query(`
            DROP TRIGGER IF EXISTS tg_inventario_almacen_sync ON inventario_almacen;
            CREATE TRIGGER tg_inventario_almacen_sync
            AFTER INSERT OR UPDATE OR DELETE ON inventario_almacen
            FOR EACH ROW
            EXECUTE FUNCTION sync_almacen_to_insumo();
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS tg_insumos_stock_sync ON insumos;
            CREATE TRIGGER tg_insumos_stock_sync
            AFTER INSERT OR UPDATE OF stock_actual ON insumos
            FOR EACH ROW
            EXECUTE FUNCTION sync_insumo_to_almacen();
        `);

        console.log('✅ Base de Datos Multidepósito y disparadores creados/verificados.');
    } catch (dbMultiErr) {
        console.error('Error al configurar base de datos Multidepósito:', dbMultiErr.message);
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

    // 7. Asegurar número de teléfono para administradores (78777010)
    try {
        await pool.query(`
            UPDATE usuarios 
            SET telefono = '78777010' 
            WHERE username = 'admin' OR rol = 'ADMINISTRADOR' OR rol = 'ADMIN';
        `);
        console.log('✅ Teléfono de administradores actualizado a 78777010.');
    } catch (telErr) {
        console.log('Info Actualización Teléfono Admin:', telErr.message);
    }

    // 8. Crear tablas de Recetas e Ingredientes de Recetas
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS recetas (
                id SERIAL PRIMARY KEY,
                producto_id INT REFERENCES productos(id) ON DELETE SET NULL,
                nombre VARCHAR(255) UNIQUE NOT NULL,
                preparacion TEXT,
                porciones VARCHAR(100)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ingrediente_recetas (
                id SERIAL PRIMARY KEY,
                receta_id INT REFERENCES recetas(id) ON DELETE CASCADE,
                insumo_id INT REFERENCES insumos(id) ON DELETE SET NULL,
                nombre_ingrediente VARCHAR(255) NOT NULL,
                cantidad NUMERIC(10, 2) NOT NULL,
                unidad_medida VARCHAR(50) NOT NULL
            );
        `);
        console.log('✅ Tablas recetas e ingrediente_recetas creadas/verificadas.');
    } catch (recetaSchemaErr) {
        console.log('Info Tabla Recetas Schema:', recetaSchemaErr.message);
    }

    // 9. Sembrar productos de coctelería faltantes
    try {
        const cocteles = [
            { nombre: 'Mojito', precio: 25.00, categoria_id: 15 },
            { nombre: 'Sex on the beach', precio: 25.00, categoria_id: 15 },
            { nombre: 'Chuflay', precio: 25.00, categoria_id: 15 },
            { nombre: 'Te con te', precio: 25.00, categoria_id: 15 },
            { nombre: 'Sucumbe', precio: 25.00, categoria_id: 15 },
            { nombre: 'Laguna azul', precio: 25.00, categoria_id: 15 },
            { nombre: 'Luz de luna', precio: 25.00, categoria_id: 15 },
            { nombre: 'Coquito spring', precio: 25.00, categoria_id: 15 },
            { nombre: 'Illimani', precio: 25.00, categoria_id: 15 },
            { nombre: 'Bailey de café', precio: 25.00, categoria_id: 15 }
        ];
        for (const c of cocteles) {
            const check = await pool.query('SELECT id FROM productos WHERE LOWER(nombre) = LOWER($1)', [c.nombre]);
            if (check.rows.length === 0) {
                await pool.query('INSERT INTO productos (nombre, precio_venta, categoria_id, activo) VALUES ($1, $2, $3, true)', [c.nombre, c.precio, c.categoria_id]);
                console.log(`🍹 Producto de coctelería creado: ${c.nombre}`);
            }
        }
    } catch (coctelErr) {
        console.log('Error al sembrar cocteles:', coctelErr.message);
    }

    // 10. (Eliminado) Antes acá se sembraban ~50 insumos de repostería/coctelería
    // en cada arranque del servidor si no existían por nombre. Se sacó porque
    // resucitaba insumos que se habían borrado a propósito (control de stock
    // simplificado a solo carnes) cada vez que se reiniciaba/desplegaba el server.

    // 11. Sembrar recetas y sus ingredientes
    try {
        const checkCount = await pool.query('SELECT COUNT(*) FROM recetas');
        if (parseInt(checkCount.rows[0].count) === 0) {
            console.log('📖 Sembrando recetas de productos y cócteles...');
            const recetasData = [
                {
                    nombre: 'Torta Red velvet',
                    productoNombre: 'Porcion de torta de Red Velvet',
                    productoNombreAlt: 'Torta Entera Red Velvet',
                    preparacion: 'Biscocho: Mezclar harina, cocoa, polvo de hornear y sal. Batir huevos, azúcar y agregar leche, colorante red velvet y esencia de frutilla. Incorporar secos y hornear a 180°C. Relleno y Cobertura: Batir queso crema, crema de leche (animal y vegetal) y azúcar.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 400, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Cocoa', cantidad: 2, unidad: 'cucharadas', insumoNombre: 'Cocoa' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 240, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Esencia de frutilla', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Esencia de frutilla' },
                        { nombre: 'Colorante red velvet', cantidad: 10, unidad: 'ml.', insumoNombre: 'Colorante red velvet' },
                        { nombre: 'Queso crema', cantidad: 200, unidad: 'gr.', insumoNombre: 'Queso crema' },
                        { nombre: 'Crema de leche (animal)', cantidad: 200, unidad: 'ml.', insumoNombre: 'Crema de leche' }
                    ]
                },
                {
                    nombre: 'Torta de chocolate',
                    productoNombre: 'Porción de Torta Chocolate',
                    productoNombreAlt: 'Torta Entera Chocolate',
                    preparacion: 'Biscocho: Mezclar secos. Batir huevos con azúcar, agregar leche y caramelina. Incorporar secos y hornear. Ganash: Derretir chocolate cobertura con crema de leche animal y mantequilla.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 350, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Cocoa', cantidad: 4, unidad: 'cucharadas', insumoNombre: 'Cocoa' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 300, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Caramelina', cantidad: 30, unidad: 'gr.', insumoNombre: 'Caramelina' },
                        { nombre: 'Chocolate cobertura', cantidad: 1000, unidad: 'gr.', insumoNombre: 'Chocolate cobertura' },
                        { nombre: 'Crema de leche (animal)', cantidad: 1500, unidad: 'ml.', insumoNombre: 'Crema de leche' },
                        { nombre: 'Mantequilla', cantidad: 100, unidad: 'gr.', insumoNombre: 'Mantequilla' }
                    ]
                },
                {
                    nombre: 'Torta de vainilla',
                    productoNombre: 'Mini Torta',
                    productoNombreAlt: null,
                    preparacion: 'Mezclar harina, polvo de hornear y sal. Batir huevos, azúcar y esencia de vainilla. Agregar leche e incorporar harina. Hornear.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 400, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 240, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Esencia de vainilla', cantidad: 2, unidad: 'cucharaditas', insumoNombre: 'Esencia de vainilla' }
                    ]
                },
                {
                    nombre: 'Torta de moka',
                    productoNombre: 'Porcion de Torta de Moka',
                    productoNombreAlt: 'Torta Entera Moka',
                    preparacion: 'Mezclar harina, polvo de hornear y sal. Batir huevos, azúcar, agregar café destilado y leche. Incorporar secos y hornear.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 400, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 240, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Café destilado', cantidad: 60, unidad: 'gr.', insumoNombre: 'Café en grano' }
                    ]
                },
                {
                    nombre: 'Torta de frutilla',
                    productoNombre: 'Porcion de Torta de Frutilla',
                    productoNombreAlt: null,
                    preparacion: 'Batir los huevos con azúcar y esencia de frutilla. Incorporar leche y harina con polvo de hornear. Hornear. Rellenar con mermelada de frutilla y crema batida.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 400, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 240, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Esencia de frutilla', cantidad: 2, unidad: 'cucharaditas', insumoNombre: 'Esencia de frutilla' },
                        { nombre: 'Mermelada de frutilla', cantidad: 150, unidad: 'gr.', insumoNombre: 'Mermelada' }
                    ]
                },
                {
                    nombre: 'Torta de zanahoria',
                    productoNombre: 'Porcion de Torta de Zanahoria',
                    productoNombreAlt: 'Torta Entera Zanahoria',
                    preparacion: 'Mezclar harina, polvo de hornear, sal, canela, nuez moscada y almendras trituradas. Batir huevos con azúcar morena, agregar aceite y zanahoria rallada. Unir todo y hornear. Relleno: Batir queso crema y crema de leche.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 200, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 2, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 0.5, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Canela molida', cantidad: 2, unidad: 'cucharaditas', insumoNombre: 'Canela' },
                        { nombre: 'Nuez moscada molida', cantidad: 0.25, unidad: 'cucharadita', insumoNombre: 'Nuez moscada molida' },
                        { nombre: 'Almendra triturada', cantidad: 35, unidad: 'gr.', insumoNombre: 'Almendra triturada' },
                        { nombre: 'Azúcar morena', cantidad: 150, unidad: 'gr.', insumoNombre: 'Azúcar morena' },
                        { nombre: 'Aceite', cantidad: 200, unidad: 'ml.', insumoNombre: 'Aceite' },
                        { nombre: 'Huevo', cantidad: 3, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Zanahoria rallada', cantidad: 250, unidad: 'gr.', insumoNombre: 'Zanahoria rallada' },
                        { nombre: 'Queso crema', cantidad: 1, unidad: 'bote', insumoNombre: 'Queso crema' },
                        { nombre: 'Crema de leche', cantidad: 500, unidad: 'ml.', insumoNombre: 'Crema de leche' }
                    ]
                },
                {
                    nombre: 'Torta de arándano',
                    productoNombre: 'Porcion de Torta Arandanos',
                    productoNombreAlt: 'Torta Entera Arándano',
                    preparacion: 'Mezclar harina, bicarbonato y sal. Batir aceite, azúcar y huevos. Incorporar leche entera, vinagre, vainilla, ralladura de limón y arándanos. Hornear. Cobertura: Batir mantequilla con azúcar impalpable.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 300, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Bicarbonato', cantidad: 6, unidad: 'gr.', insumoNombre: 'Bicarbonato' },
                        { nombre: 'Vinagre blanco', cantidad: 20, unidad: 'gr.', insumoNombre: 'Vinagre blanco' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'pizca', insumoNombre: 'Sal' },
                        { nombre: 'Leche entera', cantidad: 250, unidad: 'ml.', insumoNombre: 'Leche entera' },
                        { nombre: 'Esencia de vainilla', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Esencia de vainilla' },
                        { nombre: 'Ralladura de limón', cantidad: 5, unidad: 'unidades', insumoNombre: 'Limon' },
                        { nombre: 'Aceite', cantidad: 120, unidad: 'ml.', insumoNombre: 'Aceite' },
                        { nombre: 'Arándanos', cantidad: 200, unidad: 'gr.', insumoNombre: 'Arándanos' },
                        { nombre: 'Azúcar', cantidad: 250, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Huevo', cantidad: 3, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Mantequilla regia', cantidad: 200, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Azúcar en polvo', cantidad: 200, unidad: 'gr.', insumoNombre: 'Azucar Impalpable' }
                    ]
                },
                {
                    nombre: 'Torta de oreo',
                    productoNombre: 'Porción de Torta Chocolate',
                    productoNombreAlt: null,
                    preparacion: 'Preparar bizcocho de chocolate. Rellenar y cubrir con crema de oreo y decorar con galletas oreo.',
                    porciones: '12 y 20 personas',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 350, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Cocoa', cantidad: 4, unidad: 'cucharadas', insumoNombre: 'Cocoa' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 300, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Caramelina', cantidad: 40, unidad: 'gr.', insumoNombre: 'Caramelina' },
                        { nombre: 'Galletas de oreo', cantidad: 8, unidad: 'unidades', insumoNombre: 'Galletas de oreo' }
                    ]
                },
                {
                    nombre: 'Torta de 3 leches',
                    productoNombre: 'Porcion de Torta de Tres Leches',
                    productoNombreAlt: 'Torta Entera 3 leches',
                    preparacion: 'Bizcocho: Batir huevos con azúcar y vainilla. Agregar leche e incorporar harina y hornear. Humedecer: Mezclar leche condensada, leche evaporada y leche entera. Bañar el bizcocho.',
                    porciones: '12 unidades',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 400, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 4, unidad: 'cucharaditas', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 10, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 1240, unidad: 'ml.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 300, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Esencia de vainilla', cantidad: 2, unidad: 'cucharaditas', insumoNombre: 'Esencia de vainilla' },
                        { nombre: 'Leche condensada', cantidad: 0.5, unidad: 'unidades', insumoNombre: 'Leche condensada' },
                        { nombre: 'Leche evaporada', cantidad: 0.5, unidad: 'unidades', insumoNombre: 'Leche evaporada' }
                    ]
                },
                {
                    nombre: 'Muffin',
                    productoNombre: 'Galleta',
                    productoNombreAlt: null,
                    preparacion: 'Batir mantequilla con azúcar. Añadir huevos y batir bien. Agregar harina tamizada con polvo de hornear, crema de leche y esencia de vainilla. Hornear en pirotines.',
                    porciones: '12 unidades',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 250, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 15, unidad: 'gr.', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'pizca', insumoNombre: 'Sal' },
                        { nombre: 'Azúcar', cantidad: 100, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Huevo', cantidad: 4, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Mantequilla', cantidad: 100, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Crema de leche', cantidad: 200, unidad: 'ml.', insumoNombre: 'Crema de leche' },
                        { nombre: 'Esencia de vainilla', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Esencia de vainilla' }
                    ]
                },
                {
                    nombre: 'Cheescake de maracuyá',
                    productoNombre: 'Chescake de Maracuya',
                    productoNombreAlt: 'Torta Entera Maracuya',
                    preparacion: 'Base: Mezclar galletas María trituradas con mantequilla. Relleno: Batir crema de leche, queso crema y leche condensada. Incorporar gelatina hidratada y extracto de maracuyá. Enmoldar y refrigerar. Cobertura: Decorar con maracuyá con semilla.',
                    porciones: 'Pequeño y grande',
                    ingredientes: [
                        { nombre: 'Galletas maría', cantidad: 300, unidad: 'gr.', insumoNombre: 'Galletas maría' },
                        { nombre: 'Mantequilla', cantidad: 200, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Crema de leche', cantidad: 350, unidad: 'ml.', insumoNombre: 'Crema de leche' },
                        { nombre: 'Queso crema', cantidad: 1, unidad: 'bote', insumoNombre: 'Queso crema' },
                        { nombre: 'Leche condensada', cantidad: 1, unidad: 'caja', insumoNombre: 'Leche condensada' },
                        { nombre: 'Gelatina sin sabor', cantidad: 150, unidad: 'gr.', insumoNombre: 'Gelatina sin sabor' },
                        { nombre: 'Maracuyá (extracto)', cantidad: 150, unidad: 'gr.', insumoNombre: 'Maracuyá (extracto)' },
                        { nombre: 'Maracuyá con semilla', cantidad: 3, unidad: 'unidades', insumoNombre: 'Maracuyá con semilla' },
                        { nombre: 'Azúcar', cantidad: 150, unidad: 'gr.', insumoNombre: 'Azucar Blanca' }
                    ]
                },
                {
                    nombre: 'Pie de limón',
                    productoNombre: 'Pie de Limon',
                    productoNombreAlt: null,
                    preparacion: 'Masa: Mezclar mantequilla regia, azúcar impalpable, harina de trigo y huevos. Forrar el molde. Relleno: Batir leche condensada con zumo de limón, verter sobre la masa. Decorar con merengue y tiras de limón.',
                    porciones: 'Preparación entera',
                    ingredientes: [
                        { nombre: 'Mantequilla regia', cantidad: 800, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Azúcar impalpable', cantidad: 500, unidad: 'gr.', insumoNombre: 'Azucar Impalpable' },
                        { nombre: 'Harina de trigo', cantidad: 1250, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Huevo', cantidad: 3, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche condensada', cantidad: 1, unidad: 'caja', insumoNombre: 'Leche condensada' },
                        { nombre: 'Zumo de limón', cantidad: 150, unidad: 'ml.', insumoNombre: 'Limon' }
                    ]
                },
                {
                    nombre: 'Cuñapé',
                    productoNombre: 'Cuñape',
                    productoNombreAlt: null,
                    preparacion: 'Mezclar la fécula de yuca con el queso chaqueño rallado. Añadir margarina, azúcar, sal y polvo de hornear. Incorporar el huevo y la leche de a poco. Formar bolitas y hornear a alta temperatura.',
                    porciones: '12 unidades',
                    ingredientes: [
                        { nombre: 'Fécula de yuca', cantidad: 400, unidad: 'gr.', insumoNombre: 'Fécula de yuca' },
                        { nombre: 'Queso chaqueño', cantidad: 400, unidad: 'gr.', insumoNombre: 'Queso chaqueño' },
                        { nombre: 'Margarina', cantidad: 30, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Azúcar', cantidad: 15, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Sal', cantidad: 5, unidad: 'gr.', insumoNombre: 'Sal' },
                        { nombre: 'Polvo de hornear', cantidad: 10, unidad: 'gr.', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Huevo', cantidad: 1, unidad: 'unidad', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 60, unidad: 'ml.', insumoNombre: 'Leche entera' }
                    ]
                },
                {
                    nombre: 'Empanadas de queso',
                    productoNombre: 'Empanada de Queso',
                    productoNombreAlt: null,
                    preparacion: 'Masa: Mezclar harina, polvo de hornear, sal, azúcar y mantequilla. Agregar huevos e incorporar leche hasta lograr masa homogénea. Relleno: Mezclar queso criollo picado con huevo y rellenar.',
                    porciones: '12 unidades',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 700, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 15, unidad: 'gr.', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 5, unidad: 'gr.', insumoNombre: 'Sal' },
                        { nombre: 'Azúcar', cantidad: 100, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Mantequilla', cantidad: 100, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Huevo', cantidad: 3, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Queso criollo', cantidad: 240, unidad: 'gr.', insumoNombre: 'Queso criollo' }
                    ]
                },
                {
                    nombre: 'Rollos de queso',
                    productoNombre: 'Rollo de Queso',
                    productoNombreAlt: null,
                    preparacion: 'Preparar la masa de empanadas. Rellenar con queso criollo abundante. Enrollar, cortar, pintar con huevo y hornear.',
                    porciones: '12 unidades',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 700, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Polvo de hornear', cantidad: 15, unidad: 'gr.', insumoNombre: 'Polvo de hornear' },
                        { nombre: 'Sal', cantidad: 5, unidad: 'gr.', insumoNombre: 'Sal' },
                        { nombre: 'Azúcar', cantidad: 100, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Mantequilla', cantidad: 100, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Huevo', cantidad: 3, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Queso criollo', cantidad: 300, unidad: 'gr.', insumoNombre: 'Queso criollo' }
                    ]
                },
                {
                    nombre: 'Pan de canela',
                    productoNombre: 'Rollo de Queso',
                    productoNombreAlt: null,
                    preparacion: 'Hacer masa levada con harina, sal, huevo, leche entera, azúcar, mantequilla y levadura. Estirar en rectángulo, pintar con mantequilla, espolvorear canela y azúcar morena. Enrollar, cortar y hornear. Frossing: Mezclar queso crema y crema de leche.',
                    porciones: '10 unidades',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 600, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Sal', cantidad: 2, unidad: 'gr.', insumoNombre: 'Sal' },
                        { nombre: 'Huevo', cantidad: 2, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Leche entera', cantidad: 250, unidad: 'gr.', insumoNombre: 'Leche entera' },
                        { nombre: 'Azúcar', cantidad: 50, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Mantequilla', cantidad: 270, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Levadura seca', cantidad: 10, unidad: 'gr.', insumoNombre: 'Levadura' },
                        { nombre: 'Canela molida', cantidad: 16, unidad: 'gr.', insumoNombre: 'Canela' },
                        { nombre: 'Azúcar morena', cantidad: 90, unidad: 'gr.', insumoNombre: 'Azúcar morena' }
                    ]
                },
                {
                    nombre: 'Brownie',
                    productoNombre: 'Brownie de Chocolate',
                    productoNombreAlt: null,
                    preparacion: 'Derretir mantequilla con chocolate cobertura. Incorporar azúcar morena y azúcar blanca, luego los huevos y batir. Incorporar la harina de trigo, cocoa y sal. Hornear.',
                    porciones: '6 unidades',
                    ingredientes: [
                        { nombre: 'Azúcar morena', cantidad: 150, unidad: 'gr.', insumoNombre: 'Azúcar morena' },
                        { nombre: 'Azúcar blanca', cantidad: 150, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Huevo', cantidad: 4, unidad: 'unidades', insumoNombre: 'Huevos' },
                        { nombre: 'Esencia de vainilla', cantidad: 0.5, unidad: 'cucharadita', insumoNombre: 'Esencia de vainilla' },
                        { nombre: 'Chocolate cobertura', cantidad: 100, unidad: 'gr.', insumoNombre: 'Chocolate cobertura' },
                        { nombre: 'Mantequilla', cantidad: 250, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Harina de trigo', cantidad: 120, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Cocoa', cantidad: 50, unidad: 'gr.', insumoNombre: 'Cocoa' },
                        { nombre: 'Sal', cantidad: 1, unidad: 'cucharadita', insumoNombre: 'Sal' }
                    ]
                },
                {
                    nombre: 'Croissant',
                    productoNombre: 'Rollo de Queso',
                    productoNombreAlt: null,
                    preparacion: 'Amasar harina, sal, azúcar, mantequilla, levadura fresca y agua. Laminar con pliegues sucesivos usando mantequilla extra fría. Formar cuernos y hornear.',
                    porciones: '12 unidades',
                    ingredientes: [
                        { nombre: 'Harina de trigo', cantidad: 500, unidad: 'gr.', insumoNombre: 'Harina' },
                        { nombre: 'Sal', cantidad: 10, unidad: 'gr.', insumoNombre: 'Sal' },
                        { nombre: 'Azúcar', cantidad: 60, unidad: 'gr.', insumoNombre: 'Azucar Blanca' },
                        { nombre: 'Mantequilla', cantidad: 350, unidad: 'gr.', insumoNombre: 'Mantequilla' },
                        { nombre: 'Levadura fresca', cantidad: 20, unidad: 'gr.', insumoNombre: 'Levadura' },
                        { nombre: 'Agua', cantidad: 240, unidad: 'ml.', insumoNombre: 'Agua' }
                    ]
                },
                {
                    nombre: 'Mojito',
                    productoNombre: 'Mojito',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso de mojito colocar la hierba buena, almibar y el zumo de limon. Machacar, agregar 5 o 6 cubos de hielo, vodka y agua gaseada. Decorar con rodaja de limon.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Hielo', cantidad: 6, unidad: 'cubos', insumoNombre: 'Hielo' },
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Hierba buena', cantidad: 2, unidad: 'ramas', insumoNombre: 'Hierba buena' },
                        { nombre: 'Agua con gas', cantidad: 150, unidad: 'ml.', insumoNombre: 'Agua Con Gas 500ml' },
                        { nombre: 'Almibar de azucar', cantidad: 1, unidad: 'onzas', insumoNombre: 'Almibar' },
                        { nombre: 'Zumo de limon', cantidad: 1, unidad: 'onzas', insumoNombre: 'Limon' }
                    ]
                },
                {
                    nombre: 'Sex on the beach',
                    productoNombre: 'Sex on the beach',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso con hielo agregar la granadina, vodka y jugo de naranja. Decorar con ramita de menta.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Granadina', cantidad: 0.5, unidad: 'onzas', insumoNombre: 'Granadina' },
                        { nombre: 'Jugo de naranja', cantidad: 150, unidad: 'ml.', insumoNombre: 'Jugo de naranja' },
                        { nombre: 'Hielo', cantidad: 5, unidad: 'cubos', insumoNombre: 'Hielo' }
                    ]
                },
                {
                    nombre: 'Chuflay',
                    productoNombre: 'Chuflay',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso con hielo, agregar vodka y completar con ginger ale cantidad necesaria.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Hielo', cantidad: 5, unidad: 'cubos', insumoNombre: 'Hielo' },
                        { nombre: 'Ginger ale', cantidad: 200, unidad: 'ml.', insumoNombre: 'Ginger ale' }
                    ]
                },
                {
                    nombre: 'Te con te',
                    productoNombre: 'Te con te',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso agregar el vodka, zumo de limon, almibar y sultana infusionada. Servir caliente.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Zumo de limon', cantidad: 0.5, unidad: 'unidades', insumoNombre: 'Limon' },
                        { nombre: 'Almibar', cantidad: 1, unidad: 'onzas', insumoNombre: 'Almibar' },
                        { nombre: 'Sultana infusionada', cantidad: 10, unidad: 'gr.', insumoNombre: 'Sultana' }
                    ]
                },
                {
                    nombre: 'Sucumbe',
                    productoNombre: 'Sucumbe',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso añadir leche, canela, vodka y azúcar. Calentar con la lanceta hasta disolver el azúcar. Servir y decorar con espuma de leche y canela en polvo.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Leche entera', cantidad: 200, unidad: 'ml.', insumoNombre: 'Leche entera' },
                        { nombre: 'Canela', cantidad: 1, unidad: 'unidad', insumoNombre: 'Canela' },
                        { nombre: 'Azúcar', cantidad: 2, unidad: 'cucharadas', insumoNombre: 'Azucar Blanca' }
                    ]
                },
                {
                    nombre: 'Laguna azul',
                    productoNombre: 'Laguna azul',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso con hielo agregar el vodka, blue curacao, zumo de limon, azúcar y llenar con agua gaseada. Decorar con rodaja de limon.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Blue curacao', cantidad: 1, unidad: 'onzas', insumoNombre: 'Blue curacao' },
                        { nombre: 'Hielo', cantidad: 6, unidad: 'cubos', insumoNombre: 'Hielo' },
                        { nombre: 'Agua con gas', cantidad: 150, unidad: 'ml.', insumoNombre: 'Agua Con Gas 500ml' },
                        { nombre: 'Zumo de limon', cantidad: 0.5, unidad: 'onzas', insumoNombre: 'Limon' }
                    ]
                },
                {
                    nombre: 'Luz de luna',
                    productoNombre: 'Luz de luna',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso con hielo agregar vodka y menta tres plumas. Llenar con agua gaseada. Decorar con rodaja de limon.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Vodka', cantidad: 2, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Tres plumas menta', cantidad: 1, unidad: 'onzas', insumoNombre: 'Menta Tres Plumas' },
                        { nombre: 'Agua con gas', cantidad: 150, unidad: 'ml.', insumoNombre: 'Agua Con Gas 500ml' },
                        { nombre: 'Hielo', cantidad: 6, unidad: 'cubos', insumoNombre: 'Hielo' }
                    ]
                },
                {
                    nombre: 'Coquito spring',
                    productoNombre: 'Coquito spring',
                    productoNombreAlt: null,
                    preparacion: 'En un vaso con hielo verter el almíbar de maracuyá, granadina, blue curacao, vodka y llenar con agua carbonatada.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Almíbar de maracuyá', cantidad: 1, unidad: 'onzas', insumoNombre: 'Almibar' },
                        { nombre: 'Granadina', cantidad: 0.5, unidad: 'onzas', insumoNombre: 'Granadina' },
                        { nombre: 'Blue curacao', cantidad: 0.5, unidad: 'onzas', insumoNombre: 'Blue curacao' },
                        { nombre: 'Vodka', cantidad: 1, unidad: 'onzas', insumoNombre: 'Vodka' },
                        { nombre: 'Agua carbonatada', cantidad: 150, unidad: 'ml.', insumoNombre: 'Agua Con Gas 500ml' },
                        { nombre: 'Hielo', cantidad: 6, unidad: 'cubos', insumoNombre: 'Hielo' }
                    ]
                },
                {
                    nombre: 'Illimani',
                    productoNombre: 'Illimani',
                    productoNombreAlt: null,
                    preparacion: 'En un shaker verter hielo, ron, leche evaporada, espresso y baileys de café. Agitar durante 5 a 7 minutos. Verter en vaso de Martini y decorar con tres granos de café.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Leche evaporada', cantidad: 1.5, unidad: 'onzas', insumoNombre: 'Leche evaporada' },
                        { nombre: 'Ron blanco', cantidad: 1, unidad: 'onzas', insumoNombre: 'Ron blanco' },
                        { nombre: 'Espresso', cantidad: 10, unidad: 'gr.', insumoNombre: 'Café en grano' },
                        { nombre: 'Baileys', cantidad: 1, unidad: 'onzas', insumoNombre: 'Baileys' },
                        { nombre: 'Hielo', cantidad: 5, unidad: 'cubos', insumoNombre: 'Hielo' }
                    ]
                },
                {
                    nombre: 'Bailey de café',
                    productoNombre: 'Bailey de café',
                    productoNombreAlt: null,
                    preparacion: 'En un shaker verter leche evaporada, ron blanco, expreso doble, almíbar, leche entera y hielos. Agitar de 5 a 7 minutos y verter en el vaso. Decorar con granos de café.',
                    porciones: '1 persona',
                    ingredientes: [
                        { nombre: 'Leche evaporada', cantidad: 1, unidad: 'onzas', insumoNombre: 'Leche evaporada' },
                        { nombre: 'Ron blanco', cantidad: 1, unidad: 'onzas', insumoNombre: 'Ron blanco' },
                        { nombre: 'Leche entera', cantidad: 0.5, unidad: 'onzas', insumoNombre: 'Leche entera' },
                        { nombre: 'Expreso doble', cantidad: 20, unidad: 'gr.', insumoNombre: 'Café en grano' },
                        { nombre: 'Almíbar', cantidad: 1, unidad: 'onzas', insumoNombre: 'Almibar' },
                        { nombre: 'Hielo', cantidad: 5, unidad: 'cubos', insumoNombre: 'Hielo' }
                    ]
                }
            ];

            for (const r of recetasData) {
                let productoId = null;
                if (r.productoNombre) {
                    const prodRes = await pool.query(
                        'SELECT id FROM productos WHERE LOWER(nombre) = LOWER($1) OR LOWER(nombre) = LOWER($2)',
                        [r.productoNombre, r.productoNombreAlt || r.productoNombre]
                    );
                    if (prodRes.rows.length > 0) {
                        productoId = prodRes.rows[0].id;
                    }
                }

                const recipeRes = await pool.query(
                    'INSERT INTO recetas (producto_id, nombre, preparacion, porciones) VALUES ($1, $2, $3, $4) RETURNING id',
                    [productoId, r.nombre, r.preparacion, r.porciones]
                );
                const recetaId = recipeRes.rows[0].id;

                for (const ing of r.ingredientes) {
                    const insRes = await pool.query(
                        'SELECT id FROM insumos WHERE LOWER(nombre) = LOWER($1)',
                        [ing.insumoNombre]
                    );
                    let insumoId = null;
                    if (insRes.rows.length > 0) {
                        insumoId = insRes.rows[0].id;
                    }

                    await pool.query(
                        'INSERT INTO ingrediente_recetas (receta_id, insumo_id, nombre_ingrediente, cantidad, unidad_medida) VALUES ($1, $2, $3, $4, $5)',
                        [recetaId, insumoId, ing.nombre, ing.cantidad, ing.unidad]
                    );
                }
            }
            console.log('✅ Recetas y sus ingredientes sembrados con éxito.');
        }
    } catch (recetaSeedErr) {
        console.log('Error al sembrar recetas:', recetaSeedErr.message);
    }

    // Tablas de WhatsApp (Webhook y Pedidos)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos_whatsapp (
                id SERIAL PRIMARY KEY,
                telefono_cliente VARCHAR(50) NOT NULL,
                producto VARCHAR(255) NOT NULL,
                cantidad INT NOT NULL,
                estado VARCHAR(50) DEFAULT 'PENDIENTE',
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_estados (
                telefono VARCHAR(50) PRIMARY KEY,
                estado VARCHAR(100) NOT NULL,
                producto_seleccionado VARCHAR(255),
                categoria_seleccionada VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query('ALTER TABLE whatsapp_estados ADD COLUMN IF NOT EXISTS categoria_seleccionada VARCHAR(255);');
        try {
            await pool.query('ALTER TABLE whatsapp_estados ALTER COLUMN producto_seleccionado TYPE TEXT;');
        } catch (alterPErr) {
            // Silencioso
        }
        await pool.query('ALTER TABLE whatsapp_estados ADD COLUMN IF NOT EXISTS foto_referencia_url TEXT;');
        await pool.query('ALTER TABLE pedidos_whatsapp ADD COLUMN IF NOT EXISTS foto_referencia_url TEXT;');
        console.log('✅ Tablas pedidos_whatsapp y whatsapp_estados creadas/verificadas.');
    } catch (waTableErr) {
        console.error('Error al crear tablas de WhatsApp:', waTableErr.message);
    }

    // Migración de Ventas para Ventas Históricas
    try {
        await pool.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS es_historica BOOLEAN DEFAULT false;');
        console.log('✅ Columna es_historica en tabla ventas verificada/creada.');
    } catch (ventasMigErr) {
        console.error('Error al migrar ventas para es_historica:', ventasMigErr.message);
    }

    // Tabla de Configuración de Menú PDF
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS config_menu_pdf (
                id SERIAL PRIMARY KEY,
                producto_id INT UNIQUE REFERENCES productos(id) ON DELETE CASCADE,
                incluido BOOLEAN DEFAULT TRUE,
                orden INT DEFAULT 0,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla config_menu_pdf creada/verificada.');
    } catch (menuPdfTableErr) {
        console.error('Error al crear tabla config_menu_pdf:', menuPdfTableErr.message);
    }

    // Tabla de Mensajes de WhatsApp
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
                id SERIAL PRIMARY KEY,
                telefono VARCHAR(50) NOT NULL,
                mensaje TEXT NOT NULL,
                remitente VARCHAR(20) NOT NULL, -- 'CLIENTE' o 'ADMIN'
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabla whatsapp_mensajes creada/verificada.');
    } catch (waMsgTableErr) {
        console.error('Error al crear tabla whatsapp_mensajes:', waMsgTableErr.message);
    }

    // Tabla de Control Diario de Cocina
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS control_diario_cocina (
                id SERIAL PRIMARY KEY,
                fecha DATE NOT NULL,
                insumo_id INT REFERENCES insumos(id) ON DELETE SET NULL,
                nombre_insumo VARCHAR(255) NOT NULL,
                cantidad NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                unidad_medida VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (fecha, nombre_insumo)
            );
        `);
        console.log('✅ Tabla control_diario_cocina creada/verificada.');
    } catch (cdcErr) {
        console.error('Error al crear tabla control_diario_cocina:', cdcErr.message);
    }

    // Migración: detalles/notas de comandas (para que el mesero agregue notas al pedido y por producto)
    try {
        await pool.query('ALTER TABLE comandas ADD COLUMN IF NOT EXISTS notas TEXT;');
        await pool.query('ALTER TABLE detalle_comandas ADD COLUMN IF NOT EXISTS notas TEXT;');
        console.log('✅ Columnas notas en comandas/detalle_comandas verificadas/creadas.');
    } catch (notasComandaErr) {
        console.error('Error al migrar notas de comandas:', notasComandaErr.message);
    }

    // Migración: contador de versión de la comanda (se incrementa al editar o pedir reimpresión),
    // para que la app de cocina detecte cambios y reimprima marcando explícitamente que es una edición.
    try {
        await pool.query('ALTER TABLE comandas ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;');
        console.log('✅ Columna version en comandas verificada/creada.');
    } catch (versionComandaErr) {
        console.error('Error al migrar version de comandas:', versionComandaErr.message);
    }

    // Migración: pg_trgm para búsqueda de texto por similitud (sugerencias de
    // gastos parecidos al registrar uno nuevo, y así evitar duplicados). El
    // índice GIN es lo que mantiene esa búsqueda liviana con muchos registros.
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_gastos_generales_descripcion_trgm ON gastos_generales USING gin (descripcion gin_trgm_ops);');
        console.log('✅ pg_trgm y índice de similitud de gastos_generales verificados/creados.');
    } catch (trgmErr) {
        console.log('Info Migración pg_trgm:', trgmErr.message);
    }

    // Migración: tabla de logs del sistema. Render (plan gratuito) borra los
    // logs de consola al reiniciar/dormir la instancia, así que los errores
    // reales (console.error, excepciones no capturadas) se guardan aquí para
    // no perderlos.
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS logs_sistema (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMPTZ DEFAULT NOW(),
                nivel TEXT DEFAULT 'ERROR',
                mensaje TEXT
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_logs_sistema_fecha ON logs_sistema(fecha DESC);');
        console.log('✅ Tabla logs_sistema verificada/creada.');
    } catch (logsErr) {
        console.log('Info Migración logs_sistema:', logsErr.message);
    }

    // Migración: auditoría de movimientos de inventario (usuario, origen, nota)
    // y búsqueda por similitud sobre insumos, para el servidor MCP de registro
    // de inventario por foto.
    try {
        await pool.query('ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS usuario_id INT;');
        await pool.query('ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS origen TEXT;');
        await pool.query('ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS nota TEXT;');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_insumos_nombre_trgm ON insumos USING gin (nombre gin_trgm_ops);');
        console.log('✅ Auditoría de movimientos_inventario e índice de similitud de insumos verificados/creados.');
    } catch (mcpInvErr) {
        console.log('Info Migración auditoría inventario/MCP:', mcpInvErr.message);
    }

    // Seguridad: activar Row-Level Security en todas las tablas públicas.
    // Sin esto, la API REST pública que Supabase genera sola para cada tabla
    // queda accesible con solo tener la "anon key" del proyecto — cualquiera
    // podría leer/editar/borrar todo sin pasar por el backend. El rol con el
    // que se conecta esta app (postgres) bypassea RLS automáticamente, así
    // que esto no afecta en nada el funcionamiento normal del sistema.
    try {
        const tablasPublicas = await pool.query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        );
        for (const { tablename } of tablasPublicas.rows) {
            await pool.query(`ALTER TABLE public."${tablename}" ENABLE ROW LEVEL SECURITY;`);
        }
        console.log(`✅ Row-Level Security activado en ${tablasPublicas.rows.length} tablas públicas.`);
    } catch (rlsErr) {
        console.log('Info Migración RLS:', rlsErr.message);
    }

    // Migración: enriquecer la bitácora de accesos con modelo/SO del
    // dispositivo y versión de la app (antes solo se guardaba el User-Agent
    // genérico que mandan las apps móviles, que no distingue equipos).
    try {
        await pool.query('ALTER TABLE historial_accesos ADD COLUMN IF NOT EXISTS modelo_dispositivo TEXT;');
        await pool.query('ALTER TABLE historial_accesos ADD COLUMN IF NOT EXISTS so_dispositivo TEXT;');
        await pool.query('ALTER TABLE historial_accesos ADD COLUMN IF NOT EXISTS version_app TEXT;');
        console.log('✅ Columnas de dispositivo/versión en historial_accesos verificadas/creadas.');
    } catch (histErr) {
        console.log('Info Migración historial_accesos dispositivo:', histErr.message);
    }

    // Migración: número de comanda de control, correlativo por turno de caja
    // (antes solo existía el id interno de la BD, que nunca se reinicia y no
    // sirve para que cocina/mesero controlen el orden de pedidos del turno).
    try {
        await pool.query('ALTER TABLE comandas ADD COLUMN IF NOT EXISTS numero_comanda INT;');
        console.log('✅ Columna numero_comanda en comandas verificada/creada.');
    } catch (numComandaErr) {
        console.log('Info Migración numero_comanda:', numComandaErr.message);
    }

    // Migración: marca por producto de si fue agregado en la última edición
    // de la comanda (para que cocina distinga en pantalla/ticket lo recién
    // añadido de lo que ya estaba en el pedido). Por defecto false: no afecta
    // comandas existentes ni el flujo normal de creación.
    try {
        await pool.query('ALTER TABLE detalle_comandas ADD COLUMN IF NOT EXISTS es_nuevo BOOLEAN DEFAULT FALSE;');
        console.log('✅ Columna es_nuevo en detalle_comandas verificada/creada.');
    } catch (esNuevoErr) {
        console.log('Info Migración es_nuevo:', esNuevoErr.message);
    }

    // Migración: vínculo opcional de una venta hacia la comanda que la originó.
    // Necesario para el cobro dividido (varias filas en 'ventas', una por cada
    // método de pago usado) para poder reconstruir el total y el desglose real
    // al imprimir el comprobante. NULL para ventas del POS directo (sin mesa).
    try {
        await pool.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comanda_id INT REFERENCES comandas(id);');
        console.log('✅ Columna comanda_id en ventas verificada/creada.');
    } catch (comandaIdVentaErr) {
        console.log('Info Migración comanda_id en ventas:', comandaIdVentaErr.message);
    }

    // Bitácora: registro cronológico de acciones (quién, cuándo, qué) para poder
    // reconstruir después qué pasó con una comanda/venta/asistencia/etc. cuando algo
    // sale raro (ej. un cobro que no cuadra) sin depender de adivinar por los datos
    // finales. Visible en la pestaña "Bitácora" del panel (solo administradores).
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bitacora (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMPTZ DEFAULT NOW(),
                usuario_id INT,
                usuario_nombre TEXT,
                accion TEXT NOT NULL,
                entidad_tipo TEXT,
                entidad_id INT,
                detalle TEXT
            );
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(fecha DESC);');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_bitacora_entidad ON bitacora(entidad_tipo, entidad_id);');
        console.log('✅ Tabla bitacora verificada/creada.');
    } catch (bitacoraErr) {
        console.log('Info Migración bitacora:', bitacoraErr.message);
    }

    // Garantía a nivel de base de datos: nunca puede haber dos comandas activas
    // (CREADA/ENTREGADA) para la misma mesa al mismo tiempo. Antes esto solo se
    // validaba con un SELECT-antes-de-INSERT desde el backend, que no es atómico:
    // si dos meseros mandaban un pedido a la misma mesa casi al mismo tiempo (o uno
    // intentaba agregar a una comanda que su app todavía no sabía que existía),
    // ambos pasaban la validación y quedaban dos comandas "paralelas" para la misma
    // mesa en vez de fusionarse en una sola. Este índice único parcial hace que la
    // propia base de datos rechace la segunda inserción, sin importar qué app o
    // qué carrera de tiempos la origine.
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_comandas_mesa_activa_unica
            ON comandas (mesa) WHERE estado IN ('CREADA', 'ENTREGADA');
        `);
        console.log('✅ Restricción de comanda única por mesa activa verificada/creada.');
    } catch (comandaUnicaErr) {
        console.log('Info Migración comanda única por mesa:', comandaUnicaErr.message);
    }

    console.log('✅ Base de Datos Optimizada y marca Café La Paz aplicada.');
  }
});

module.exports = pool;