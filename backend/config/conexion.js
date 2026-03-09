const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 6543,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000, // Máximo 5 segundos de espera
});

// Prueba con log forzado para ver qué host está usando REALMENTE
console.log('--- Intento de Conexión ---');
console.log('Host:', process.env.DB_HOST);
console.log('Puerto:', process.env.DB_PORT);

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error de conexión:', err.message);
  } else {
    console.log('✅ CONEXIÓN EXITOSA A SUPABASE');
  }
});

module.exports = pool;