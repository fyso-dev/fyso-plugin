---
name: fyso-mcp
description: Configurar Claude Desktop o Claude Code para conectar con el servidor MCP de Fyso.
argument-hint: [setup|status|test]
disable-model-invocation: true
allowed-tools: Bash(cat *), Bash(echo *), Bash(mkdir *)
---

# Configuracion MCP - Fyso

Configura tu cliente Claude para usar las herramientas MCP de Fyso.

## Que es MCP?

Model Context Protocol (MCP) permite que Claude acceda a herramientas externas. Con Fyso MCP puedes:

- Crear y gestionar entidades, campos y presets de industria
- Crear reglas de negocio con DSL
- Consultar y modificar datos con filtros y busqueda semantica
- Gestionar usuarios, roles e invitaciones
- Crear y ejecutar agentes de IA con versionado de prompts
- Configurar proveedores de IA multi-provider y templates de prompts
- Administrar knowledge base y documentos
- Desplegar sitios estaticos con dominios custom
- Importar/exportar metadata, gestionar secretos y ver metricas de uso

## Herramientas MCP (v1.33)

Fyso expone **10 herramientas agrupadas** via MCP. Cada una acepta un parametro `action` que selecciona la operacion:

| Tool | Actions | Description |
|------|---------|-------------|
| `fyso_data` | create, query, update, delete, create_booking, get_slots | CRUD de registros y turnos |
| `fyso_schema` | list, get, add_field, generate, publish, discard, delete, list_changes, install_preset, list_presets | Entidades, campos y presets de industria |
| `fyso_rules` | create, get, list, publish, delete, test, logs | Reglas de negocio: crear, testear, publicar |
| `fyso_auth` | create_user, list_users, update_password, create_role, list_roles, assign_role, revoke_role, login, list_tenants, select_tenant, create_tenant, generate_invitation, list_invitations | Usuarios, roles, tenants, invitaciones |
| `fyso_views` | create, list, update, delete | Vistas filtradas de entidades |
| `fyso_knowledge` | search, stats, search_docs | Knowledge base y documentacion |
| `fyso_deploy` | deploy, list, delete, set_domain, generate_token | Sitios estaticos, dominios, tokens CI/CD |
| `fyso_meta` | api_spec, api_client, export, import, usage, set_secret, delete_secret, feedback | API docs, metadata, secretos, metricas, feedback |
| `fyso_agents` | list, create, update, delete, run, test, list_runs, list_versions, rollback, list_templates, from_template | Agentes de IA con versionado y templates |
| `fyso_ai` | configure_provider, list_providers, add_provider, remove_provider, test_call, call_logs, debug_log, create_template, list_templates, update_template | Proveedores de IA, logs, templates de prompts |

Ademas: `fyso_welcome` (onboarding interactivo).

## Configuracion

### Para Claude Code (Recomendado — OAuth automatico)

El plugin incluye `.mcp.json` que conecta via OAuth:

```json
{
  "mcpServers": {
    "fyso": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://app.fyso.dev/mcp"]
    }
  }
}
```

Al usar cualquier herramienta por primera vez, se abre un flujo OAuth para autenticar tu cuenta Fyso. No necesitas API key.

### Para Claude Desktop

1. **Ubicar archivo de configuracion:**

   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Agregar configuracion de Fyso:**

```json
{
  "mcpServers": {
    "fyso": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://app.fyso.dev/mcp"]
    }
  }
}
```

3. **Reiniciar Claude Desktop**

### Local Development (opcional)

```json
{
  "mcpServers": {
    "fyso": {
      "command": "bun",
      "args": ["run", "/path/to/fyso/packages/mcp-server/src/index.ts"],
      "env": {
        "API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Verificar Conexion

### 1. Ver herramientas disponibles

Pregunta a Claude:
```
Que herramientas de Fyso tienes disponibles?
```

Deberia listar 10 herramientas agrupadas:
- `fyso_data`, `fyso_schema`, `fyso_rules`, `fyso_auth`, `fyso_views`
- `fyso_knowledge`, `fyso_deploy`, `fyso_meta`, `fyso_agents`, `fyso_ai`

### 2. Probar una herramienta

```
Lista las entidades disponibles en Fyso
```

Deberia ejecutar `fyso_schema({ action: "list" })` y mostrar las entidades existentes.

### 3. Test completo

```
Crea una entidad de prueba llamada "Test" con un campo "nombre"
```

## Troubleshooting

### Error: "MCP server not found"

1. Verificar que `npx` este instalado: `npx --version`
2. Verificar conexion: `curl https://app.fyso.dev/mcp/health`

### Error: "Authentication failed"

1. Reiniciar Claude Code para repetir el flujo OAuth
2. Verificar que tu cuenta Fyso este activa en [fyso.dev](https://fyso.dev)

### Error: "Unknown action"

Verificar que la accion sea valida para la herramienta. Cada herramienta tiene un `action` enum — usar acciones exactas listadas arriba.
