const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Cargar .env solo para local
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

const pool = new Pool({
  // Construye la conexión usando variables individuales limpias de espacios
  user: (process.env.DB_USER || '').trim(),
  host: (process.env.DB_HOST || '').trim(),
  database: (process.env.DB_NAME || '').trim(),
  password: (process.env.DB_PASSWORD || '').trim(),
  port: parseInt(process.env.DB_PORT) || 6543, 
  ssl: {
    rejectUnauthorized: false
  }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ ERROR DE CONEXIÓN:', err.message);
    console.log('Datos usados:', {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT
    });
  } else {
    console.log('✅ CONEXIÓN EXITOSA A SUPABASE DESDE MOKAPOS');
  }
});

module.exports = pool;