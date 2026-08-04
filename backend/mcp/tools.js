// backend/mcp/tools.js
//
// Registra todas las herramientas del servidor MCP de Café La Paz sobre un
// McpServer ya creado. Se usa igual desde stdio (mcp/stdio.js, para pruebas
// locales) y desde el transporte HTTP montado en server.js.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const poolReadonly = require('./pool-readonly');
const pool = require('../config/conexion');
const { ajustarInventarioInsumo } = require('../utils/inventario');

const UMBRAL_CONFIANZA = 0.5;

// Lo usa la persona de la cafetería directamente, sin manejo técnico — el
// flujo tiene que ser: foto -> UN solo resumen de todo -> UNA sola palabra
// de confirmación -> listo. Nunca una pregunta por cada insumo encontrado.
const INSTRUCCIONES_SERVIDOR = `
Este servidor es para que una persona de la cafetería (sin mucho manejo de tecnología) registre mercadería fotografiando lo que llega. El flujo tiene que ser lo más directo posible:

1. Cuando te muestren una foto, identifica en una sola pasada TODOS los insumos y cantidades que veas.
2. Para cada uno, resuelve su insumo_id con buscar_insumo (y crear_insumo si hace falta) ANTES de decir nada — esta parte es silenciosa, no le preguntes nada a la persona todavía.
3. Después, escribe UN SOLO mensaje con la lista completa de todo lo que vas a registrar (insumo, cantidad, unidad) y termina con una pregunta simple tipo "¿Confirmas?". NUNCA preguntes insumo por insumo, ni pidas confirmar cada uno por separado.
4. En cuanto la persona responda algo afirmativo (sí, dale, confirmo, ok, etc.), ejecuta TODAS las llamadas a registrar_entrada_inventario / registrar_merma / crear_insumo necesarias, una tras otra, SIN volver a preguntar nada.
5. Sé breve y simple en el lenguaje. Evita explicaciones técnicas o mensajes largos.
`.trim();

function textoResultado(objeto) {
    return { content: [{ type: 'text', text: JSON.stringify(objeto, null, 2) }] };
}

function registrarHerramientas(server) {
    // ── LECTURA (rol de solo lectura) ───────────────────────────────────────

    server.registerTool(
        'buscar_insumo',
        {
            title: 'Buscar insumo',
            description:
                'Busca insumos del catálogo real por nombre aproximado (ej. texto leído de una etiqueta o factura). ' +
                'Devuelve hasta 5 candidatos con un score de similitud (0 a 1). ' +
                'IMPORTANTE: si la respuesta trae confianza_baja=true, ningún candidato es un match confiable — ' +
                'NUNCA asumas el más parecido ni lo uses para registrar una entrada; pregúntale a la persona qué insumo es exactamente. ' +
                'Úsala siempre antes de registrar_entrada_inventario o registrar_merma, nunca inventes un insumo que no esté en el catálogo.',
            inputSchema: { texto: z.string().min(2).describe('Nombre aproximado del insumo a buscar') },
        },
        async ({ texto }) => {
            const r = await poolReadonly.query(
                `SELECT id as insumo_id, nombre, unidad_medida, stock_actual, similarity(nombre, $1) as score
                 FROM insumos
                 WHERE activo = TRUE AND similarity(nombre, $1) > 0.15
                 ORDER BY score DESC
                 LIMIT 5`,
                [texto]
            );
            const mejorScore = r.rows.length ? parseFloat(r.rows[0].score) : 0;
            return textoResultado({
                candidatos: r.rows,
                confianza_baja: mejorScore < UMBRAL_CONFIANZA,
                mensaje: mejorScore < UMBRAL_CONFIANZA
                    ? 'Ningún insumo del catálogo coincide con confianza. No elijas uno parecido: pregúntale a la persona qué insumo es exactamente antes de continuar.'
                    : undefined,
            });
        }
    );

    server.registerTool(
        'consultar_stock',
        {
            title: 'Consultar stock',
            description: 'Consulta el stock actual de insumos. Si umbral_bajo es true, solo devuelve los que están en o bajo su stock mínimo.',
            inputSchema: {
                insumo_id: z.number().int().optional().describe('Id de un insumo específico (obtenido de buscar_insumo)'),
                umbral_bajo: z.boolean().optional().describe('Si es true, solo trae insumos con stock en o bajo el mínimo'),
            },
        },
        async ({ insumo_id, umbral_bajo }) => {
            const condiciones = ['activo = TRUE'];
            const params = [];
            if (insumo_id) {
                params.push(insumo_id);
                condiciones.push(`id = $${params.length}`);
            }
            if (umbral_bajo) {
                condiciones.push('stock_actual <= stock_minimo');
            }
            const r = await poolReadonly.query(
                `SELECT id as insumo_id, nombre, unidad_medida, stock_actual, stock_minimo
                 FROM insumos WHERE ${condiciones.join(' AND ')}
                 ORDER BY nombre`,
                params
            );
            return textoResultado({ insumos: r.rows });
        }
    );

    server.registerTool(
        'ventas_resumen',
        {
            title: 'Resumen de ventas',
            description: 'Resumen de ventas en un rango de fechas: total, desglose por método de pago y productos más vendidos.',
            inputSchema: {
                fecha_inicio: z.string().describe('Fecha de inicio en formato ISO (YYYY-MM-DD)'),
                fecha_fin: z.string().describe('Fecha de fin en formato ISO (YYYY-MM-DD)'),
            },
        },
        async ({ fecha_inicio, fecha_fin }) => {
            const [totales, porMetodo, topProductos] = await Promise.all([
                poolReadonly.query(
                    `SELECT COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total
                     FROM ventas
                     WHERE fecha_venta::date BETWEEN $1 AND $2`,
                    [fecha_inicio, fecha_fin]
                ),
                poolReadonly.query(
                    `SELECT metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(total), 0) as total
                     FROM ventas
                     WHERE fecha_venta::date BETWEEN $1 AND $2
                     GROUP BY metodo_pago ORDER BY total DESC`,
                    [fecha_inicio, fecha_fin]
                ),
                poolReadonly.query(
                    `SELECT p.nombre as producto, SUM(dv.cantidad) as cantidad, SUM(dv.subtotal) as ingresos
                     FROM detalle_ventas dv
                     JOIN ventas v ON dv.venta_id = v.id
                     JOIN productos p ON dv.producto_id = p.id
                     WHERE v.fecha_venta::date BETWEEN $1 AND $2
                     GROUP BY p.nombre ORDER BY ingresos DESC LIMIT 5`,
                    [fecha_inicio, fecha_fin]
                ),
            ]);
            return textoResultado({
                rango: { fecha_inicio, fecha_fin },
                total_ventas: totales.rows[0].cantidad,
                total_dinero: totales.rows[0].total,
                por_metodo_pago: porMetodo.rows,
                top_productos: topProductos.rows,
            });
        }
    );

    server.registerTool(
        'pedidos_pendientes',
        {
            title: 'Pedidos pendientes',
            description: 'Lista los pedidos/comandas en curso (no pagados aún), con su estado de cocina.',
            inputSchema: {},
        },
        async () => {
            const r = await poolReadonly.query(
                `SELECT id, mesa, total, estado, estado_cocina,
                        TO_CHAR(fecha_creacion AT TIME ZONE 'America/La_Paz', 'HH24:MI') as hora_creacion
                 FROM comandas
                 WHERE estado IN ('CREADA', 'ENTREGADA')
                 ORDER BY fecha_creacion ASC`
            );
            return textoResultado({ pedidos: r.rows });
        }
    );

    // ── ESCRITURA (pool principal, vía ajustarInventarioInsumo) ─────────────

    server.registerTool(
        'crear_insumo',
        {
            title: 'Crear insumo nuevo',
            description:
                'Da de alta un insumo que NO existe todavía en el catálogo — solo usar después de que buscar_insumo ' +
                'devolvió confianza_baja=true (si ya hay un match confiable, usa ESE insumo_id en vez de crear uno nuevo). ' +
                'No pidas confirmación aquí: menciónalo dentro del único resumen consolidado de todo el lote (ver instrucciones del servidor) y espera una sola confirmación general. ' +
                'Esta herramienta solo crea el insumo con stock en 0; para registrar la cantidad que entró, ' +
                'después hay que llamar a registrar_entrada_inventario con el insumo_id que devuelve esta.',
            inputSchema: {
                nombre: z.string().min(2).describe('Nombre del insumo nuevo'),
                unidad_medida: z.string().describe('Unidad de medida (ej. Kg, Litro, Unidad)'),
                stock_minimo: z.number().nonnegative().optional().describe('Stock mínimo antes de alertar (por defecto 0)'),
            },
        },
        async ({ nombre, unidad_medida, stock_minimo }) => {
            try {
                // Mismo mecanismo anti-duplicado que buscar_insumo: si algo se
                // parece mucho a un insumo ya existente, no se crea, se avisa.
                const similares = await pool.query(
                    `SELECT id as insumo_id, nombre, similarity(nombre, $1) as score
                     FROM insumos WHERE activo = TRUE AND similarity(nombre, $1) > $2
                     ORDER BY score DESC LIMIT 3`,
                    [nombre, UMBRAL_CONFIANZA]
                );
                if (similares.rows.length > 0) {
                    return textoResultado({
                        error: 'Ya existe al menos un insumo parecido en el catálogo — no se creó uno nuevo.',
                        candidatos_similares: similares.rows,
                        mensaje: 'Confirma con la persona si es el mismo insumo (usa ese insumo_id existente) antes de insistir en crear uno nuevo.',
                    });
                }
                const r = await pool.query(
                    `INSERT INTO insumos (nombre, unidad_medida, stock_actual, stock_minimo, activo)
                     VALUES ($1, $2, 0, $3, true)
                     RETURNING id as insumo_id, nombre, unidad_medida, stock_actual, stock_minimo`,
                    [nombre, unidad_medida, stock_minimo ?? 0]
                );
                return textoResultado({ success: true, insumo: r.rows[0] });
            } catch (error) {
                return textoResultado({ error: error.message });
            }
        }
    );

    server.registerTool(
        'registrar_entrada_inventario',
        {
            title: 'Registrar entrada de inventario',
            description:
                'Registra una entrada de mercadería (ej. tras fotografiar lo que llegó). ' +
                'SOLO usar con un insumo_id que haya salido de buscar_insumo con confianza alta (confianza_baja=false o ausente) — ' +
                'nunca con un candidato de baja confianza. ' +
                'No pidas confirmación por cada llamada: la confirmación se pide UNA sola vez, para todo el lote junto (ver instrucciones del servidor). ' +
                'Invócala en cuanto la persona haya confirmado el lote completo, sin volver a preguntar.',
            inputSchema: {
                insumo_id: z.number().int().describe('Id del insumo, obtenido de buscar_insumo'),
                cantidad: z.number().positive().describe('Cantidad que entra'),
                unidad: z.string().describe('Unidad de la cantidad (debe coincidir con la unidad_medida del insumo)'),
                nota: z.string().optional().describe('Nota u observación libre'),
                origen: z.enum(['foto', 'manual']).describe('Cómo se originó este registro'),
            },
        },
        async ({ insumo_id, cantidad, unidad, nota, origen }) => {
            try {
                const insumoRes = await pool.query('SELECT unidad_medida FROM insumos WHERE id = $1 AND activo = TRUE', [insumo_id]);
                if (insumoRes.rowCount === 0) {
                    return textoResultado({ error: `No existe ningún insumo activo con id ${insumo_id}. No se registró nada.` });
                }
                if (insumoRes.rows[0].unidad_medida.toLowerCase() !== unidad.toLowerCase()) {
                    return textoResultado({
                        error: `La unidad "${unidad}" no coincide con la unidad del insumo ("${insumoRes.rows[0].unidad_medida}"). No se registró nada.`,
                    });
                }
                const resultado = await ajustarInventarioInsumo({
                    insumo_id, tipo: 'AJUSTE', cantidad, usuario_id: null, origen, nota,
                });
                return textoResultado({
                    success: true,
                    movimiento_id: resultado.movimientoId,
                    insumo: resultado.insumo,
                    stock_resultante: resultado.stockResultante,
                });
            } catch (error) {
                return textoResultado({ error: error.message });
            }
        }
    );

    server.registerTool(
        'registrar_merma',
        {
            title: 'Registrar merma',
            description:
                'Registra una merma/pérdida de un insumo existente. ' +
                'Solo usar con un insumo_id que haya salido de buscar_insumo con confianza alta. ' +
                'No pidas confirmación por cada llamada: la confirmación se pide UNA sola vez, para todo el lote junto (ver instrucciones del servidor).',
            inputSchema: {
                insumo_id: z.number().int().describe('Id del insumo, obtenido de buscar_insumo'),
                cantidad: z.number().positive().describe('Cantidad perdida/mermada'),
                unidad: z.string().describe('Unidad de la cantidad (debe coincidir con la unidad_medida del insumo)'),
                motivo: z.string().describe('Motivo de la merma'),
            },
        },
        async ({ insumo_id, cantidad, unidad, motivo }) => {
            try {
                const insumoRes = await pool.query('SELECT unidad_medida FROM insumos WHERE id = $1 AND activo = TRUE', [insumo_id]);
                if (insumoRes.rowCount === 0) {
                    return textoResultado({ error: `No existe ningún insumo activo con id ${insumo_id}. No se registró nada.` });
                }
                if (insumoRes.rows[0].unidad_medida.toLowerCase() !== unidad.toLowerCase()) {
                    return textoResultado({
                        error: `La unidad "${unidad}" no coincide con la unidad del insumo ("${insumoRes.rows[0].unidad_medida}"). No se registró nada.`,
                    });
                }
                const resultado = await ajustarInventarioInsumo({
                    insumo_id, tipo: 'MERMA', cantidad, usuario_id: null, origen: 'mcp', nota: motivo,
                });
                return textoResultado({
                    success: true,
                    movimiento_id: resultado.movimientoId,
                    insumo: resultado.insumo,
                    stock_resultante: resultado.stockResultante,
                });
            } catch (error) {
                return textoResultado({ error: error.message });
            }
        }
    );
}

// Crea un McpServer ya configurado (nombre, instrucciones globales y las 7
// herramientas registradas), para no repetir esto en stdio.js y server.js.
function crearServidorMcp() {
    const server = new McpServer(
        { name: 'cafe-la-paz', version: '1.0.0' },
        { instructions: INSTRUCCIONES_SERVIDOR }
    );
    registrarHerramientas(server);
    return server;
}

module.exports = { registrarHerramientas, crearServidorMcp };
