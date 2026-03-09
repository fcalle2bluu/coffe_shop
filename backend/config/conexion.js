const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Cargar .env
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  // Prioridad 1: Usar la URL completa (útil para tu local)
  // Prioridad 2: Usar variables sueltas (útil para Render)
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ ERROR DE CONEXIÓN:', err.message);
    console.log('Intento de conexión con:', {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT
    });
  } else {
    console.log('✅ CONEXIÓN EXITOSA A SUPABASE');
  }
});

module.exports = pool;