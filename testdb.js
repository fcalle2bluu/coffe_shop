require('dotenv').config();
const pool = require('./backend/config/conexion');

async function checkSchema() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ventas';");
        console.log("Columnas ventas:", res.rows);
        const res2 = await pool.query("SELECT * FROM ventas ORDER BY id DESC LIMIT 1;");
        console.log("Data:", res2.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
checkSchema();