// conexion.js
require('dotenv').config();
const { Pool } = require('pg');

// Configuramos la conexión usando la variable de tu archivo .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        // Supabase requiere SSL para conexiones externas
        rejectUnauthorized: false 
    }
});

// Probamos la conexión al iniciar
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a la base de datos Supabase:', err.stack);
    } else {
        console.log('✅ Conexión exitosa a la base de datos de MokaPOS');
        release(); // Liberamos el cliente
    }
});

module.exports = pool;