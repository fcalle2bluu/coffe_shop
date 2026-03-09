const { Pool } = require('pg');
const path = require('path');

// Carga el .env si existe (útil para tu local)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const poolConfig = {
    // Si tienes DATABASE_URL (en local), la usa. 
    // Si no (en Render), usa las variables separadas.
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    ssl: {
        rejectUnauthorized: false
    }
};

const pool = new Pool(poolConfig);

// Prueba de conexión
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error conectando a Supabase:', err.message);
    } else {
        console.log('✅ Conexión exitosa a la base de datos de MokaPOS');
    }
});

module.exports = pool;