require('dotenv').config({path: './backend/.env'});
const pool = require('./backend/config/conexion');

async function addColumn() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='insumos' AND column_name='imagen_url'");
    if(res.rowCount === 0) {
      await pool.query('ALTER TABLE insumos ADD COLUMN imagen_url TEXT;');
      console.log('Columna imagen_url agregada exitosamente.');
    } else {
      console.log('La columna imagen_url ya existe en insumos.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

addColumn();
