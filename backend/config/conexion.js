const { Pool } = require('pg');

// Configuración limpia usando las variables de Render
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT, 
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool:', err);
});

// Prueba de conexión
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error de conexión a Supabase:', err.message);
  } else {
    console.log('✅ CONEXIÓN EXITOSA: Base de datos vinculada correctamente');
  }
});

module.exports = pool;