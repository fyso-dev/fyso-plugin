---
name: fyso-api
description: "Expose your Fyso app data via channels for agents, and generate REST API documentation and client code for external apps."
argument-hint: "[expose [entity|all] | spec | examples [entity] | client [ts|py] [entity]]"
---

# Fyso API — Channels & REST API

Create channels for agent-to-agent discovery, and generate REST API docs and client code for external consumption.

## Subcommands

```
/fyso:api expose pacientes          # Create channel tools for one entity
/fyso:api expose all                # Create channel tools for all published entities
/fyso:api spec                      # Show complete REST API specification
/fyso:api examples products         # Show curl examples for an entity
/fyso:api client typescript products # Generate TypeScript client
/fyso:api client python products    # Generate Python client
```

---

## Mode: EXPOSE — Channel & Tool Creation

Create **channels** that expose your app's data as discoverable tools. Other agents (Claude, bots, apps) can find your channel and execute operations via MCP.

### Step 1: Assess What's Available

```
select_tenant({ tenantSlug: "..." })
list_entities()
```

Only published entities can be exposed. Warn if entities are in draft.

### Step 2: Design the Channel

Ask or infer:
1. **Channel name**: "Consultorio API", "Mi Tienda", etc.
2. **Description**: What this channel does
3. **Tags**: For discovery (e.g., "health", "clinic")
4. **Scope**: Which entities to expose
5. **Operations per entity**: Which CRUD operations

Default operations per entity:
- `buscar-{entity}` — semantic search / query
- `crear-{entity}` — create record
- `listar-{entity}` — list with filters
- `obtener-{entity}` — get by ID
- `actualizar-{entity}` — update record
- `eliminar-{entity}` — delete record

### Step 3: Create Channel

```
publish_channel({
  name: "Consultorio API",
  description: "API del consultorio...",
  tags: ["health", "clinic"]
})
```

### Step 4: Define Tools

```
define_channel_tool({
  channelId: "<id>",
  toolName: "buscar-pacientes",
  description: "Search patients by name or any field",
  parameters: { query: { type: "string", required: true } },
  entityMapping: { entity: "pacientes", operation: "semantic_search" }
})
```

### Step 5: Set Permissions

```
set_channel_permissions({
  channelId: "<id>",
  config: {
    public: true,
    allowedOperations: ["query", "create", "read", "update"]
  }
})
```

### Step 6: Verify and Report

Test each tool, then report:
```
Channel created: "Consultorio API"
Tools exposed: 5
Access: search_channels({ query: "consultorio" })
```

### Best Practices
1. **Tool names are verbs**: "buscar-pacientes", not "pacientes-search"
2. **Descriptions are for agents**: Write as if explaining to an AI
3. **Don't expose everything**: Only what external consumers need
4. **Slugs are global**: Once deleted, can't be reused

---

## Mode: SPEC — REST API Documentation

### Process

Use MCP tool `get_rest_api_spec`:
```typescript
get_rest_api_spec({ entities: ["products"], includeExamples: true })
```

### Main Endpoints

```
GET    /entities                          # List entities
GET    /entities/{entity}                 # Entity schema
GET    /entities/{entity}/records         # List records
POST   /entities/{entity}/records         # Create record
GET    /entities/{entity}/records/{id}    # Get record
PUT    /entities/{entity}/records/{id}    # Update record
DELETE /entities/{entity}/records/{id}    # Delete record
```

### Authentication

**Admin Token** (admin operations):
```bash
curl -H "X-API-Key: {admin-api-key}" http://localhost:3001/api/entities
```

**Tenant User Token** (app users):
```bash
curl -H "X-API-Key: {session-token}" -H "X-Tenant-ID: {slug}" \
  http://localhost:3001/api/entities/products/records
```

### Tenant User Auth Flow

```
POST /api/auth/tenant/login    # Login (public, needs X-Tenant-ID)
POST /api/auth/tenant/logout   # Logout (needs token)
GET  /api/auth/tenant/me       # Current user info
```

### Query Parameters

| Param | Description | Example |
|-------|-------------|---------|
| `page` | Page number (1-indexed) | `?page=2` |
| `limit` | Items per page (max 100) | `?limit=50` |
| `sort` | Sort field | `?sort=price` |
| `order` | `asc` or `desc` | `?order=desc` |
| `search` | Full text search | `?search=laptop` |
| `resolve` | Expand relations | `?resolve=true` |
| `filter.{field}` | Filter by value | `?filter.status=active` |

### Record Structure

Fields are nested inside `data`:
```json
{
  "id": "uuid",
  "entityId": "uuid",
  "name": "Record Name",
  "data": {
    "name": "Record Name",
    "email": "email@example.com"
  },
  "createdAt": "2026-02-03T12:51:15.352Z",
  "updatedAt": "2026-02-03T12:51:15.352Z"
}
```

Access fields: `record.data.email` (NOT `record.email`).

### Roles & Permissions

| Role | Permissions |
|------|------------|
| `owner` | Full tenant control |
| `admin` | Manage users and config |
| `member` | Create and edit records |
| `viewer` | Read only |

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| NOT_FOUND | 404 | Entity or record not found |
| VALIDATION_ERROR | 400 | Invalid data |
| BUSINESS_RULE_ERROR | 400 | Business rule blocked operation |
| UNAUTHORIZED | 401 | Missing or invalid API key |
| FORBIDDEN | 403 | No permission |

---

## Mode: CLIENT — Code Generation

Generate idiomatic HTTP clients for the requested language.

### TypeScript Client

```typescript
class FysoClient {
  constructor(
    private apiKey: string,
    private tenantId: string,
    private baseUrl = 'http://localhost:3001/api'
  ) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'X-API-Key': this.apiKey,
        'X-Tenant-ID': this.tenantId,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API Error');
    }
    return response.json();
  }

  // Generate CRUD methods per entity...
}
```

### Python Client

```python
class FysoClient:
    def __init__(self, api_key, tenant_id="", base_url="http://localhost:3001/api"):
        self.session = requests.Session()
        headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
        if tenant_id:
            headers["X-Tenant-ID"] = tenant_id
        self.session.headers.update(headers)
        self.base_url = base_url

    # Generate CRUD methods per entity...
```

### Best Practices for Generated Clients
1. Use environment variables for API keys
2. Include error handling
3. Implement retry logic for network errors
4. Use `record.data.{field}` to access entity fields

---

## When NOT to use this skill

- For MCP operations from Claude: use MCP tools directly
- For entity schema: use `/fyso:entity`
- For creating/modifying data from Claude: use MCP tools
