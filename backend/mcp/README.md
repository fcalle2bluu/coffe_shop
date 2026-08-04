# Servidor MCP — Café La Paz

Expone el inventario y las ventas de Café La Paz como herramientas para Claude, con el caso de uso principal de **registrar mercadería entrante fotografiándola** desde el chat.

## Herramientas disponibles

| Herramienta | Tipo | Qué hace |
|---|---|---|
| `buscar_insumo` | lectura | Busca insumos del catálogo por nombre aproximado (difuso, tolera typos y variaciones) |
| `consultar_stock` | lectura | Stock actual, opcionalmente solo los que están bajo su mínimo |
| `ventas_resumen` | lectura | Totales de ventas en un rango de fechas, por método de pago y top productos |
| `pedidos_pendientes` | lectura | Comandas en curso (no pagadas), con su estado de cocina |
| `registrar_entrada_inventario` | escritura | Registra una entrada de mercadería (sube el stock) |
| `registrar_merma` | escritura | Registra una pérdida/merma (baja el stock) |

Las de escritura **siempre requieren confirmación humana antes de invocarse** (así está indicado en su `description`, que Claude lee para decidir cómo comportarse) y validan todo del lado del servidor de todas formas.

## Variables de entorno

Agregar al `.env`:

```
# Opcional: si no se configura, las herramientas de lectura usan el mismo
# usuario principal de la app (DB_USER/DB_PASSWORD).
DB_READONLY_USER=supabase_read_only_user
DB_READONLY_PASSWORD=

# Solo necesarias para la Etapa B (transporte HTTP remoto)
MCP_HTTP_ENABLED=false
MCP_AUTH_TOKEN=
```

`MCP_AUTH_TOKEN` puede ser cualquier cadena larga y aleatoria, por ejemplo generada con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Etapa A — Probarlo local (stdio)

Con Claude Code, desde la carpeta del proyecto:

```bash
node backend/mcp/stdio.js
```

Para Claude Desktop, en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cafe-la-paz": {
      "command": "node",
      "args": ["/Users/agz/Documents/coffe_shop/backend/mcp/stdio.js"]
    }
  }
}
```

Reiniciar Claude Desktop y probar pidiendo, por ejemplo: *"busca el insumo harina"* o *"qué insumos están bajo su stock mínimo"*.

## Etapa B — Conector remoto en claude.ai / celular

1. En el `.env` de producción (Render): `MCP_HTTP_ENABLED=true` y `MCP_AUTH_TOKEN=<token largo generado>`.
2. Desplegar (`git push`, Render lo levanta solo).
3. En claude.ai → Configuración → Conectores → Agregar conector personalizado:
   - URL: `https://coffe-shop-4ffg.onrender.com/mcp`
   - Autenticación: Bearer token, pegar el mismo `MCP_AUTH_TOKEN`.
4. Probar: fotografiar una caja/factura y pedirle a Claude que identifique el insumo y registre la entrada — va a confirmar antes de escribir nada.

## Qué NO hace (a propósito)

- No crea/edita insumos nuevos, no cambia precios, no toca usuarios ni permisos.
- No tiene una herramienta de SQL libre.
- No registra en `compras`/`lotes_insumos` (esas requieren proveedor y costo, que no vienen de una foto) ni en `inventario_almacen` (desconectada del flujo real hoy) — solo ajusta `insumos.stock_actual` y dejar rastro en `movimientos_inventario`, igual que el botón de "Ajuste Rápido" del dashboard.
