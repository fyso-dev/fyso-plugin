# API Contracts Template

Use this template when creating `.planning/UI-CONTRACTS.md`.

---

```markdown
# UI → API Contracts: {App Name}

## Base Configuration

| Key | Value |
|-----|-------|
| API Base URL | `{url}/api` |
| Tenant ID | `{tenant-slug}` |
| Auth mode | Tenant user tokens |

## Authentication

### Login

```http
POST /api/auth/tenant/login
Content-Type: application/json
X-Tenant-ID: {tenant-slug}

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "token": "uuid-session-token",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "member"
    }
  }
}
```

**Response 401:**
```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials" }
}
```

> **Envelope rule (applies to ALL responses below):** every REST response is `{ success: boolean, data?: ..., error?: ... }`. Always unwrap `json.data` before use. See `reference/auth-patterns.md` → "REST API Response Patterns".

### Register (if self-registration enabled)

```http
POST /api/auth/tenant/users
Content-Type: application/json
X-Tenant-ID: {tenant-slug}

{
  "email": "newuser@example.com",
  "password": "password123",
  "name": "New User"
}
```

**Response 201:** Same as login response (auto-login after register)

### Current User

```http
GET /api/auth/tenant/me
X-API-Key: {token}
X-Tenant-ID: {tenant-slug}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "member",
    "permissions": { ... }
  }
}
```

### Logout

```http
POST /api/auth/tenant/logout
X-API-Key: {token}
X-Tenant-ID: {tenant-slug}
```

**Response 200:** `{ "success": true }`

---

## Entity Contracts

(Repeat this section for each entity exposed in the UI)

### {Entity Name} (`{entity_slug}`)

**Schema:**

| Field | Key | Type | Required | Unique | Default | Notes |
|-------|-----|------|----------|--------|---------|-------|
| {display} | {key} | {type} | {yes/no} | {yes/no} | {value} | {notes} |

**Record shape (flat, since v1.26.0):**
```json
{
  "id": "uuid",
  "entityId": "uuid",
  "{field_key_1}": "{value}",
  "{field_key_2}": "{value}",
  "{relation_key}": "uuid-of-related-record",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**IMPORTANT:** Record fields are flat — read them as `record.{fieldKey}`. There is no `record.data` nesting (the old nested format was removed in v1.26.0).

**List:**
```http
GET /api/entities/{entity}/records?page=1&limit=20&sort={field}&order=asc
X-API-Key: {token}
X-Tenant-ID: {tenant-slug}
```

Response:
```json
{
  "success": true,
  "data": {
    "items": [ { "id": "...", "...": "..." } ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

> Read the array from `json.data.items` — NOT `json.data` and NOT `json.data.data`.

**Get One:**
```http
GET /api/entities/{entity}/records/{id}
```

Response:
```json
{ "success": true, "data": { "id": "...", "...": "..." } }
```

> Read the record from `json.data`. `resolve_depth` is NOT supported here — use the list endpoint with `?filters=id = {id}&resolve_depth=1` if you need expanded relations.

**Create:**
```http
POST /api/entities/{entity}/records
Content-Type: application/json

{ "{field_key_1}": "value1", "{field_key_2}": "value2" }
```

Response 201: `{ "success": true, "data": Record }`

**Update:**
```http
PUT /api/entities/{entity}/records/{id}
Content-Type: application/json

{ "{field_key}": "new_value" }
```

Response: `{ "success": true, "data": Record }`

**Delete:**
```http
DELETE /api/entities/{entity}/records/{id}
```

Response: `{ "success": true }`

**Search:**
```http
GET /api/entities/{entity}/records?search={query}
```

**Filters (server-side, AND only):**
```http
GET /api/entities/{entity}/records?filters=estado = activo AND monto > 1000
```

For OR conditions, fetch with the AND subset and filter `json.data.items` client-side.

**Expand relations (list endpoint only):**
```http
GET /api/entities/{entity}/records?resolve_depth=1
```

When `resolve_depth=1`, every relation field on each item becomes a full nested object instead of a UUID string — use this whenever the UI needs to show a related entity's name (so you don't render UUIDs). For entities listed below with relations, ALWAYS request `resolve_depth=1` on list views.

---

## Role → Permission Matrix

| Action | owner | admin | member | viewer | public |
|--------|-------|-------|--------|--------|--------|
(fill per entity and action)

## User Management (Admin Only)

### List Users

```http
GET /api/auth/tenant/users
X-API-Key: {admin-token}
X-Tenant-ID: {tenant-slug}
```

### Create User

```http
POST /api/auth/tenant/users
Content-Type: application/json
X-API-Key: {admin-token}
X-Tenant-ID: {tenant-slug}

{
  "email": "new@example.com",
  "password": "password",
  "name": "New User",
  "role": "member"
}
```

### Update User

```http
PUT /api/auth/tenant/users/{id}
Content-Type: application/json
X-API-Key: {admin-token}
X-Tenant-ID: {tenant-slug}

{ "name": "Updated Name", "role": "admin" }
```

### Change Password

```http
PUT /api/auth/tenant/users/{id}/password
Content-Type: application/json

{ "password": "new-password" }
```

### Delete User

```http
DELETE /api/auth/tenant/users/{id}
```

---

## API Keys & Security

| Token Type | Scope | TTL | Storage | Notes |
|-----------|-------|-----|---------|-------|
| Admin API key | All operations, all tenants | Permanent | `.env` server only | NEVER in browser |
| User session token | Single tenant, role-based | 7 days | {cookie/localStorage} | Per user |
| OAuth access token | MCP operations | 1 hour | MCP client memory | For AI agents |

## Error Codes

| Code | HTTP | UI Action |
|------|------|-----------|
| UNAUTHORIZED | 401 | Clear token, redirect to /login |
| FORBIDDEN | 403 | Show "No tiene permisos" message |
| NOT_FOUND | 404 | Show "No encontrado" page |
| VALIDATION_ERROR | 400 | Show field errors on form |
| BUSINESS_RULE_ERROR | 400 | Show rule message as toast/alert |
| INTERNAL_ERROR | 500 | Show "Error del servidor" message |

## Dashboard Queries

| KPI | Endpoint | Parse |
|-----|----------|-------|
(list each dashboard KPI with the exact API call and how to extract the value)
```
