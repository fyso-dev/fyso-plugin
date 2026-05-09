# REST API Reference

## Base URL
```
https://app.fyso.dev/api
```

## Headers (every request)
```
X-API-Key: {admin_api_key or user_session_token}
X-Tenant-ID: {tenant_slug}
```

## CRUD Endpoints
```
GET    /api/entities/{entity}/records          # List (paginated)
GET    /api/entities/{entity}/records/:id      # Single record
POST   /api/entities/{entity}/records          # Create
PUT    /api/entities/{entity}/records/:id      # Update
DELETE /api/entities/{entity}/records/:id      # Delete
```

## Query Parameters
```
?limit=50              # max 200, default 50
?page=1                # pagination
?sort=createdAt        # field to sort by
?order=desc            # asc or desc
?filters=field = value              # single filter
?filters=field = value AND other = x  # compound (AND only, no OR)
?resolve_depth=1       # inline related objects (max 2 on list, max 3 on single record)
```

## Filter Operators
```
=, !=, >, <, >=, <=, contains
Combine with AND (OR not supported server-side)
```

### `contains` operator

Substring match against text fields. Format: `?filters=field contains value`.

```bash
# Single contains
curl -G "https://app.fyso.dev/api/entities/productos/records" \
  -H "X-API-Key: $KEY" -H "X-Tenant-ID: mi-tienda" \
  --data-urlencode "filters=nombre contains cafe"

# Combined with another filter (AND only)
curl -G ".../records" --data-urlencode \
  "filters=nombre contains cafe AND precio >= 100"

# MCP equivalent
fyso_data({ action: "query", entity: "productos",
  filters: "nombre contains cafe" })
```

**Case sensitivity:** behavior is not formally specified by the platform and may
vary by storage backend / column type. Treat `contains` as **case-insensitive**
for ASCII text in current builds, but **always test against your own data**
before relying on it. For guaranteed-correct text search prefer:
- Semantic search (`operation: "semantic_search"`) when embeddings are configured
- Client-side filtering after fetching with a broader filter
- Normalizing the field on write (e.g. store lowercase + original)

**Limitations:**
- Only meaningful on text-typed fields
- No wildcard / regex syntax — `%`, `*`, `_` are treated as literal characters
- Unicode collation / accent-insensitive matching is not guaranteed
- Cannot be combined with `OR` (server-side AND only)

## Response Envelope (v1.26.0+ flat format)
```json
// List:
{ "success": true, "data": { "items": [...], "total": 10, "page": 1, "limit": 50, "totalPages": 1 } }
// Each item is flat: { "id": "...", "fieldKey": "value", "createdAt": "...", ... }

// Single record:
{ "success": true, "data": { "id": "...", "fieldKey": "value", ... } }

// Error:
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

## MCP vs REST Comparison
| Aspect | MCP Tool | REST API |
|--------|----------|----------|
| Filters | `filters: { field: "value" }` (object) | `?filters=field = value` (string) |
| Relation resolution | `resolve_depth: 1` (param) | `?resolve_depth=1` (query string) |
| Response shape | Direct data | Wrapped in `{ success, data }` |
| List items key | `records` array | `data.items` array |
| Record fields | Flat | Flat (since v1.26.0) |
| Tenant context | `select_tenant()` (session) | `X-Tenant-ID` header (per-request) |
| Auth | OAuth session | `X-API-Key` header |

## Auth Endpoints
```
POST /api/auth/tenant/login    → { success, data: { token, user } }
POST /api/auth/tenant/register → { success, data: { token, user } }
GET  /api/auth/tenant/me       → { success, data: { user } }
POST /api/auth/tenant/logout
```

## WebSocket (v1.28.0+)
```
ws://app.fyso.dev/ws?token={api_key}&tenantId={slug}

// Subscribe:
{ "type": "subscribe", "entityId": "uuid" }

// Events received:
{ "type": "record_created|record_updated|record_deleted", "entityId": "...", "record": {...} }
```
Per-entity toggle: `realtimeEnabled` in entity metadata.

## resolve_depth behavior
- List endpoints (GET /records): max depth 2
- Single record (GET /records/:id): max depth 3
- MCP `fyso_data({ action: "query" })`: max depth 3
- Transforms relation fields from UUID strings to full objects

## Agents endpoint — MCP only

`POST /api/agents/{slug}/run` exists but **rejects user session tokens with
`401 UNAUTHORIZED`**, regardless of the user's role (owner/admin/member). It is
not a public REST surface in current builds.

```bash
# DOES NOT WORK — returns 401 even with a valid user session token
curl -X POST "https://app.fyso.dev/api/agents/waiter/run" \
  -H "X-API-Key: $USER_SESSION_TOKEN" \
  -H "X-Tenant-ID: $TENANT_SLUG" \
  -d '{"message": "hola"}'
```

**Use the MCP tool instead:**
```
fyso_agents({ action: "run", agent_slug: "waiter", message: "hola" })
```

**For browser / mobile clients** that need to invoke an agent, route the call
through your own backend, which calls the MCP tool server-side and forwards the
response. Do not embed admin API keys in client bundles.
