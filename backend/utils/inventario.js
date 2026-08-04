// backend/utils/inventario.js
//
// Lógica de ajuste de stock compartida entre el endpoint del dashboard
// (POST /api/almacen/ajuste) y las herramientas de escritura del servidor
// MCP, para que ambos caminos validen y registren exactamente igual.
const pool = require('../config/conexion');

// Ajusta el stock de un insumo (+ para entradas/compras, - para mermas) y
// deja el movimiento registrado en movimientos_inventario, con auditoría de
// quién lo hizo, desde dónde (dashboard, foto vía MCP, etc.) y una nota
// opcional. Lanza un Error con mensaje claro si el insumo no existe o si el
// ajuste dejaría el stock en negativo — no inserta nada en esos casos.
async function ajustarInventarioInsumo({ insumo_id, tipo, cantidad, usuario_id = null, origen = null, nota = null }) {
    if (!insumo_id || !tipo || !cantidad || cantidad <= 0) {
        throw new Error('Datos inválidos: se requiere insumo_id, tipo y una cantidad mayor a cero.');
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        const cantidadReal = tipo === 'MERMA' ? -Math.abs(cantidad) : Math.abs(cantidad);

        const updateResult = await cliente.query(`
            UPDATE insumos
            SET stock_actual = stock_actual + $1
            WHERE id = $2
            RETURNING id, nombre, stock_actual
        `, [cantidadReal, insumo_id]);

        if (updateResult.rowCount === 0) {
            throw new Error(`No existe ningún insumo con id ${insumo_id}.`);
        }
        if (updateResult.rows[0].stock_actual < 0) {
            throw new Error('Stock insuficiente para esa merma.');
        }

        const movimiento = await cliente.query(`
            INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, fecha, usuario_id, origen, nota)
            VALUES ($1, $2, $3, NOW(), $4, $5, $6)
            RETURNING id
        `, [insumo_id, tipo, Math.abs(cantidad), usuario_id, origen, nota]);

        await cliente.query('COMMIT');
        return {
            movimientoId: movimiento.rows[0].id,
            insumo: updateResult.rows[0].nombre,
            stockResultante: updateResult.rows[0].stock_actual,
        };
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = { ajustarInventarioInsumo };
