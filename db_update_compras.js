require('dotenv').config();
const pool = require('./backend/config/conexion');

async function updateDB() {
  try {
    await pool.query('ALTER TABLE compras ADD COLUMN foto_url VARCHAR(255);');
    console.log("Columna agregada exitosamente a Supabase.");
  } catch (e) {
    if(e.code === '42701') console.log("La columna ya existe.");
    else console.error(e);
  } finally { pool.end(); }
}
updateDB();
