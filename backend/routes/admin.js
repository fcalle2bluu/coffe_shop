// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const pool = require('../config/conexion');
const ExcelJS = require('exceljs');
const QueryStream = require('pg-query-stream');

// Helper to sanitize sheet names (truncate to 31 chars, replace invalid characters with underscore)
function sanitizeSheetName(name) {
    let sanitized = name.replace(/[:\\/\?\*\[\]]/g, '_');
    if (sanitized.length > 31) {
        sanitized = sanitized.substring(0, 31);
    }
    return sanitized;
}

// Helper to format Date objects as YYYY-MM-DD HH:mm:ss or YYYY-MM-DD
function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    
    if (hh === '00' && min === '00' && ss === '00') {
        return `${yyyy}-${mm}-${dd}`;
    }
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

// Global format value function to convert raw database values (especially timestamps) to Excel-friendly representations
function formatValue(val) {
    if (val === null || val === undefined) {
        return '';
    }
    if (val instanceof Date) {
        return formatDate(val);
    }
    if (typeof val === 'string') {
        // If it looks like an ISO timestamp string, try formatting it to be readable
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                return formatDate(date);
            }
        }
    }
    return val;
}

// Middleware to authorize administrator access based on database query
const checkAdminRole = async (req, res, next) => {
    try {
        const usuario_id = req.query.usuario_id || req.headers['x-usuario-id'];
        if (!usuario_id) {
            return res.status(401).json({ error: 'Acceso no autorizado: se requiere ID de usuario.' });
        }
        
        const query = `
            SELECT rol, activo 
            FROM usuarios 
            WHERE id = $1
        `;
        const { rows } = await pool.query(query, [usuario_id]);
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado.' });
        }
        
        const user = rows[0];
        if (!user.activo) {
            return res.status(403).json({ error: 'Usuario inactivo.' });
        }
        
        const roleUpper = (user.rol || '').toUpperCase();
        if (roleUpper !== 'ADMIN' && roleUpper !== 'ADMINISTRADOR' && roleUpper !== 'GERENTE') {
            return res.status(403).json({ error: 'Acceso denegado: se requieren privilegios de administrador.' });
        }
        
        next();
    } catch (error) {
        console.error('Error en validación de rol admin:', error);
        res.status(500).json({ error: 'Error interno en la validación de permisos.' });
    }
};

// Configuration array with the 29 table names to back up
const TABLES = [
    'usuarios',
    'historial_accesos',
    'cajas',
    'ventas',
    'detalle_ventas',
    'gastos_caja',
    'comandas',
    'detalle_comandas',
    'mesas',
    'gastos_generales',
    'pagos_salarios',
    'productos',
    'categorias',
    'compras',
    'detalle_compras',
    'insumos',
    'proveedores',
    'pedidos_compra',
    'lotes_insumos',
    'almacenes',
    'inventario_almacen',
    'recetas',
    'ingrediente_recetas',
    'ordenes_produccion',
    'detalle_orden',
    'asistencia',
    'auditorias_pasteleria',
    'detalle_auditoria_pasteleria',
    'parametros'
];

router.get('/backup/excel', checkAdminRole, async (req, res) => {
    console.log('🔄 Iniciando generación de backup completo en Excel...');
    
    // Set headers to trigger a streaming Excel file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="backup_cafelapaz_${fecha}.xlsx"`);
    
    // Initialize WorkbookWriter to stream response directly to the HTTP write stream
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        useSharedStrings: true
    });

    let client;
    try {
        // Obtain a single client connection from the pool
        client = await pool.connect();
        
        for (const tableName of TABLES) {
            console.log(`📊 Procesando tabla: ${tableName}`);
            try {
                // Fetch columns of the table from metadata (important to obtain headers even for empty tables)
                const colRes = await client.query(
                    `SELECT column_name FROM information_schema.columns 
                     WHERE table_name = $1 AND table_schema = 'public' 
                     ORDER BY ordinal_position`,
                    [tableName]
                );
                const headers = colRes.rows.map(r => r.column_name);

                if (headers.length === 0) {
                    console.warn(`⚠️ Tabla ${tableName} no tiene columnas en el esquema public o no existe.`);
                    continue;
                }

                // Add worksheet using sanitized name (max 31 characters, clean formatting)
                const sheetName = sanitizeSheetName(tableName);
                const worksheet = workbook.addWorksheet(sheetName);

                // Add header row and style it as bold
                worksheet.addRow(headers);
                worksheet.getRow(1).font = { bold: true };

                // Stream rows from the table using pg-query-stream to avoid loading the whole table in memory
                const queryStream = new QueryStream(`SELECT * FROM ${tableName}`);
                const stream = client.query(queryStream);

                for await (const row of stream) {
                    const rowValues = headers.map(h => formatValue(row[h]));
                    worksheet.addRow(rowValues).commit();
                }

                // Commit the worksheet to write its data to the stream
                worksheet.commit();
                console.log(`✅ Tabla ${tableName} exportada correctamente.`);
            } catch (tableError) {
                // If a single table query fails, we log the error but proceed with other tables
                console.error(`❌ Error exportando tabla ${tableName}:`, tableError.message);
            }
        }

        // Commit workbook to finalize Excel structure writing
        await workbook.commit();
        console.log('🎉 Backup en Excel finalizado y transmitido con éxito.');
    } catch (err) {
        console.error('🚨 Error crítico en el endpoint de backup:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error interno del servidor al procesar el backup', detalle: err.message });
        }
    } finally {
        if (client) {
            client.release();
            console.log('🔌 Conexión a la base de datos liberada.');
        }
    }
});

module.exports = router;
