#!/usr/bin/env node
// backend/mcp/stdio.js
//
// Entrypoint para correr el servidor MCP en modo local (stdio), para probarlo
// con Claude Desktop o Claude Code mientras se desarrolla. Ver mcp/README.md.
//
// El protocolo MCP por stdio usa stdout EXCLUSIVAMENTE para los mensajes
// JSON-RPC. Este proyecto (dotenv, las migraciones de conexion.js) usa
// console.log para avisos normales, y eso también sale por stdout — mezclado
// con el protocolo, lo rompe. Se redirige console.log/console.info a stderr
// para toda la vida del proceso (no es un problema de timing: las migraciones
// pueden tardar bastante en imprimir todo). Esto no toca process.stdout.write,
// que es lo que el SDK usa directamente para hablar el protocolo real.
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { registrarHerramientas } = require('./tools');

async function main() {
    const server = new McpServer({ name: 'cafe-la-paz', version: '1.0.0' });
    registrarHerramientas(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error('Error al iniciar el servidor MCP (stdio):', error);
    process.exit(1);
});
