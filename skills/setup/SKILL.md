---
name: fyso-setup
description: "Initialize a new Fyso project and configure MCP connection. Project setup, dependencies, database, and Claude MCP configuration."
argument-hint: "[init [project-name] | mcp [setup|status|test]]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(bun *), Bash(mkdir *), Bash(cp *), Bash(cd *), Bash(cat *), Bash(echo *)
---

# Fyso Setup — Project Init & MCP Configuration

One command for all setup tasks: initialize a new Fyso project and configure MCP connection.

## Subcommands

```
/fyso:setup init my-project     # Clone, install, configure DB, generate CLAUDE.md
/fyso:setup mcp                 # Configure Claude to use Fyso MCP server
/fyso:setup mcp status          # Check MCP connection status
/fyso:setup mcp test            # Test MCP tools are working
```

---

## Mode: INIT — Initialize Project

### 1. Create project directory

```bash
mkdir -p ~/$ARGUMENTS
cd ~/$ARGUMENTS
```

### 2. Clone Fyso

```bash
git clone https://github.com/fyso/fyso.git .
```

### 3. Install dependencies

```bash
bun install
```

### 4. Configure database

Create `.env`:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/$ARGUMENTS
API_PORT=3001
MCP_PORT=3002
WEB_PORT=5173
```

### 5. Create database and run migrations

```bash
createdb $ARGUMENTS 2>/dev/null || echo "DB already exists"
cd packages/db && bun run migrate
```

### 6. Generate CLAUDE.md

```markdown
# $ARGUMENTS - ERP Project

## Stack
- Runtime: Bun
- Database: PostgreSQL
- API: Hono
- Frontend: React + Vite

## Commands
bun run dev          # Start everything
bun run dev:api      # API only
bun run dev:web      # Frontend only
bun run dev:mcp      # MCP server only

## Database
cd packages/db && bun run migrate    # Run migrations
cd packages/db && bun run seed       # Load test data

## Tests
cd packages/api && bun test          # API tests

## MCP Server
Available at http://localhost:3002/mcp
```

### 7. Verify installation

```bash
bun run dev &
sleep 3
curl http://localhost:3001/api/health
```

### Next step after init

Suggest creating first entities:
```
Project ready. Now create your entities.
What kind of business is this? I'll suggest common entities.
```

---

## Mode: MCP — Configure MCP Connection

Configura tu cliente Claude para usar las herramientas MCP de Fyso.

### Que es MCP?

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

### Herramientas MCP (v1.33)

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

### Para Claude Code (Recomendado — OAuth automatico)

El plugin incluye `.mcp.json` que conecta via OAuth:

```json
{
  "mcpServers": {
    "fyso": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.fyso.dev/mcp"]
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
      "args": ["-y", "mcp-remote", "https://mcp.fyso.dev/mcp"]
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

### Verificar Conexion

1. Ask Claude: "Que herramientas de Fyso tienes disponibles?"
2. Should list 10 grouped tools (`fyso_data`, `fyso_schema`, `fyso_rules`, `fyso_auth`, `fyso_views`, `fyso_knowledge`, `fyso_deploy`, `fyso_meta`, `fyso_agents`, `fyso_ai`)
3. Test: "Lista las entidades disponibles en Fyso" — should run `fyso_schema({ action: "list" })`

### Troubleshooting

| Error | Fix |
|-------|-----|
| MCP server not found | Verificar que `npx` este instalado: `npx --version`. Probar `curl https://mcp.fyso.dev/mcp` (debe responder 401 con `WWW-Authenticate: Bearer`) |
| Authentication failed | Reiniciar Claude Code para repetir flujo OAuth. Verificar cuenta activa en [fyso.dev](https://fyso.dev) |
| Unknown action | Verificar que la accion sea valida para la herramienta — usar acciones exactas listadas arriba |
