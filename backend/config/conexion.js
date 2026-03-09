const { Pool } = require('pg');

// En Render, process.env ya tiene los datos del panel, no necesitas cargar el archivo .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 6543, // Cambiamos a 6543 para mayor estabilidad
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('❌ Error en el pool:', err);
});

// Prueba de conexión inmediata
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error crítico de conexión a la BD:', err.message);
  } else {
    console.log('✅ Conexión establecida con Supabase desde Render');
  }
});

module.exports = pool;