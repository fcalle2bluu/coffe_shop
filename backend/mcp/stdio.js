#!/usr/bin/env node
// backend/mcp/stdio.js
//
// Entrypoint para correr el servidor MCP en modo local (stdio), para probarlo
// con Claude Desktop o Claude Code mientras se desarrolla. Ver mcp/README.md.
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
