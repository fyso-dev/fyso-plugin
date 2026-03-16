#!/usr/bin/env bun
/**
 * sync-reference.ts — Regenerates FYSO-REFERENCE.md from individual reference files.
 *
 * Usage:
 *   bun bin/sync-reference.ts           # Regenerate FYSO-REFERENCE.md
 *   bun bin/sync-reference.ts --check   # Check if it's up to date (exit 1 if stale)
 *
 * Source files (Tier 3):
 *   skills/entity/reference/field-types.md
 *   skills/plan/reference/mcp-operations.md
 *   skills/plan/reference/limitations.md
 *   skills/plan/reference/domain-patterns.md
 *   skills/rules/reference/dsl-reference.md
 *   skills/ui/reference/auth-patterns.md
 *   skills/ui/reference/ui-patterns.md
 *   skills/ui/reference/fyso-ui-components.md
 *
 * Output (Tier 2):
 *   FYSO-REFERENCE.md
 */

import { Glob } from "bun";

const ROOT = import.meta.dir + "/..";
const OUTPUT = `${ROOT}/FYSO-REFERENCE.md`;

// Ordered sections: each maps a reference file to a section in the consolidated doc
const SECTIONS = [
  {
    number: 1,
    title: "Field Types",
    source: "skills/entity/reference/field-types.md",
    extract: extractFieldTypes,
  },
  {
    number: 2,
    title: "MCP Operations",
    source: "skills/plan/reference/mcp-operations.md",
    extract: extractMCPOps,
  },
  {
    number: 3,
    title: "REST API Reference",
    source: "skills/api/reference/rest-api.md",
    extract: extractRESTAPI,
  },
  {
    number: 4,
    title: "Business Rules DSL",
    source: "skills/rules/reference/dsl-reference.md",
    extract: extractDSL,
  },
  {
    number: 5,
    title: "Limitations",
    source: "skills/plan/reference/limitations.md",
    extract: extractLimitations,
  },
  {
    number: 6,
    title: "Domain Patterns",
    source: "skills/plan/reference/domain-patterns.md",
    extract: extractDomainPatterns,
  },
  {
    number: 7,
    title: "Auth & Roles",
    source: "skills/ui/reference/auth-patterns.md",
    extract: extractAuth,
  },
  {
    number: 8,
    title: "UI Components (@fyso/ui)",
    source: "skills/ui/reference/fyso-ui-components.md",
    extract: extractUIComponents,
  },
  {
    number: 9,
    title: "UI Patterns",
    source: "skills/ui/reference/ui-patterns.md",
    extract: extractUIPatterns,
  },
  {
    number: 10,
    title: "Agents",
    source: "skills/plan/reference/agents.md",
    extract: extractAgents,
  },
];

// --- Extractors: each reads the full file and returns a compact summary ---

function extractFieldTypes(content: string): string {
  return `| Type | Config | Use For |
|------|--------|---------|
| \`text\` | — | names, titles, codes, descriptions |
| \`number\` | \`{ decimals: 0 }\` | quantities, stock, counts |
| \`number\` | \`{ decimals: 2 }\` | prices, totals, money, percentages |
| \`email\` | — | email addresses (auto-validated) |
| \`phone\` | — | phone numbers |
| \`date\` | — | dates (no time) |
| \`boolean\` | — | flags (activo, disponible) |
| \`select\` | \`{ options: ["a","b"] }\` | status, type, category |
| \`relation\` | \`{ entity: "x", displayField: "nombre" }\` | foreign keys |

**Validations:** \`required: true\`, \`unique: true\`, \`{ min, max }\` (numbers), \`{ minLength, maxLength }\` (text), \`{ pattern: "regex" }\`.

**Conventions:** Entity names: lowercase plural Spanish. Field keys: snake_case. Money: always \`number\` with \`decimals: 2\`. Relations: always need \`displayField\`.`;
}

function extractMCPOps(content: string): string {
  return `Fyso exposes **10 grouped MCP tools**. Each tool uses an \`action\` parameter to select the operation.

### fyso_auth — Tenants & Users
\`\`\`
fyso_auth({ action: "select_tenant", tenantSlug: "slug" })     # ALWAYS first
fyso_auth({ action: "list_tenants" })
fyso_auth({ action: "create_tenant", name: "My App", description: "..." })
fyso_auth({ action: "create_user", email, name, password, role })
fyso_auth({ action: "list_users" })
fyso_auth({ action: "update_password", userId, password })
fyso_auth({ action: "create_role", name, permissions, description })
fyso_auth({ action: "list_roles" })
fyso_auth({ action: "assign_role", userId, roleId })
fyso_auth({ action: "revoke_role", userId, roleId })
fyso_auth({ action: "login", tenantSlug, email, password })
fyso_auth({ action: "generate_invitation", note?, maxUses?, expiresAt? })
fyso_auth({ action: "list_invitations" })
\`\`\`

### fyso_schema — Entities & Presets
\`\`\`
fyso_schema({ action: "generate", definition: { entity: { name, displayName, description }, fields: [...] }, auto_publish: false })
fyso_schema({ action: "list", include_drafts: true })
fyso_schema({ action: "get", entityName: "...", version?: "draft"|"published"|number })
fyso_schema({ action: "add_field", entityName, name, fieldKey, fieldType, ... })
fyso_schema({ action: "publish", entityName: "...", version_message: "..." })
fyso_schema({ action: "discard", entityName })
fyso_schema({ action: "delete", entityName, confirm: true })
fyso_schema({ action: "list_changes", include_published? })
fyso_schema({ action: "list_presets" })                    # available industry presets
fyso_schema({ action: "install_preset", preset_name })     # install complete preset (taller, tienda, clinica, freelancer)
\`\`\`

### fyso_rules — Business Rules
\`\`\`
fyso_rules({ action: "create", entityName, name, description, triggerType, triggerFields, ruleDsl: { compute, validate, transform }, priority?, auto_publish? })
fyso_rules({ action: "get", entityName, ruleId })
fyso_rules({ action: "list", entityName, include_drafts? })
fyso_rules({ action: "test", entityName, ruleId, testData: { field: value } })
fyso_rules({ action: "publish", entityName, ruleId })
fyso_rules({ action: "delete", entityName, ruleId })
fyso_rules({ action: "logs", entityName, ruleId, limit? })
\`\`\`

### fyso_data — Records & Bookings
\`\`\`
fyso_data({ action: "create", entity, data: { field: value } })
fyso_data({ action: "query", entity, filters?, sort?, order_dir?, limit?, offset?, semantic?, min_similarity?, resolve_depth? })
fyso_data({ action: "update", entity, id, data: { field: newValue } })
fyso_data({ action: "delete", entity, id })
fyso_data({ action: "create_booking", professional_id, patient_id, date, time, duration, notes? })
fyso_data({ action: "get_slots", professional_id, date?, from?, to? })
\`\`\`

### fyso_views — Entity Views
\`\`\`
fyso_views({ action: "create", entitySlug, slug, name, description?, filterDsl? })
fyso_views({ action: "list" })
fyso_views({ action: "update", slug, name?, description?, filterDsl?, isActive? })
fyso_views({ action: "delete", slug })
\`\`\`

### fyso_knowledge — Knowledge Base
\`\`\`
fyso_knowledge({ action: "search", query, limit?, threshold?, document_ids?, one_per_document?, metadata_filter? })
fyso_knowledge({ action: "stats" })
fyso_knowledge({ action: "search_docs", query, topic?, limit? })
\`\`\`

### fyso_deploy — Static Sites
\`\`\`
fyso_deploy({ action: "deploy", subdomain, path?, bundle_base64? })
fyso_deploy({ action: "list" })
fyso_deploy({ action: "delete", subdomain })
fyso_deploy({ action: "set_domain", subdomain, domain, domain_action?: "add"|"verify"|"status"|"remove" })
fyso_deploy({ action: "generate_token", subdomain, name?, expires_in_days?, framework? })
\`\`\`

### fyso_meta — API, Metadata, Secrets, Usage, Feedback
\`\`\`
fyso_meta({ action: "api_spec", entities?, includeExamples? })
fyso_meta({ action: "api_client", entities?, format?, framework? })
fyso_meta({ action: "export", tenantId? })
fyso_meta({ action: "import", tenantId?, data })
fyso_meta({ action: "usage" })
fyso_meta({ action: "set_secret", key, value })
fyso_meta({ action: "delete_secret", key })
fyso_meta({ action: "feedback", feedback_type, title, description?, context? })
\`\`\`

### fyso_agents — AI Agents
\`\`\`
fyso_agents({ action: "list" })
fyso_agents({ action: "create", name, system_prompt, fallback_mode?, tools_scope?, knowledge_enabled? })
fyso_agents({ action: "update", id?, slug?, name?, system_prompt?, fallback_mode?, tools_scope?, knowledge_enabled? })
fyso_agents({ action: "delete", slug })
fyso_agents({ action: "run", agent_slug, message, session_id? })
fyso_agents({ action: "test", agent_slug, message })
fyso_agents({ action: "list_runs", agent_id?, session_id?, status?, date_from?, date_to?, limit? })
fyso_agents({ action: "list_versions", agent_id })
fyso_agents({ action: "rollback", agent_id, version })
fyso_agents({ action: "list_templates" })
fyso_agents({ action: "from_template", template_id, name?, description? })
\`\`\`

### fyso_ai — AI Providers & Templates
\`\`\`
fyso_ai({ action: "configure_provider", name, type, base_url, api_key, default_model })
fyso_ai({ action: "list_providers" })
fyso_ai({ action: "add_provider", name, base_url, api_key, default_model, is_active? })
fyso_ai({ action: "remove_provider", provider_id })
fyso_ai({ action: "test_call", prompt, system_prompt?, model?, max_tokens?, temperature? })
fyso_ai({ action: "call_logs", provider?, model?, status?, date_from?, date_to?, source_type?, source_id?, limit?, offset? })
fyso_ai({ action: "debug_log", log_id })
fyso_ai({ action: "create_template", name, slug, type: "prompt"|"system", content, variables? })
fyso_ai({ action: "list_templates" })
fyso_ai({ action: "update_template", id, name?, slug?, type?, content?, variables? })
\`\`\``;
}

function extractRESTAPI(_content: string): string {
  return `### Base URL
\`\`\`
https://app.fyso.dev/api
\`\`\`

### Headers (every request)
\`\`\`
X-API-Key: {admin_api_key or user_session_token}
X-Tenant-ID: {tenant_slug}
\`\`\`

### CRUD Endpoints
\`\`\`
GET    /api/entities/{entity}/records          # List (paginated)
GET    /api/entities/{entity}/records/:id      # Single record
POST   /api/entities/{entity}/records          # Create
PUT    /api/entities/{entity}/records/:id      # Update
DELETE /api/entities/{entity}/records/:id      # Delete
\`\`\`

### Query Parameters
\`\`\`
?limit=50              # max 200, default 50
?page=1                # pagination
?sort=createdAt        # field to sort by
?order=desc            # asc or desc
?filters=field = value              # single filter
?filters=field = value AND other = x  # compound (AND only, no OR)
?resolve_depth=1       # inline related objects (max 2, list endpoints only)
\`\`\`

### Filter Operators
\`\`\`
=, !=, >, <, >=, <=, contains
Combine with AND (OR not supported server-side)
\`\`\`

### Response Envelope (v1.26.0+ flat format)
\`\`\`json
// List:
{ "success": true, "data": { "items": [...], "total": 10, "page": 1, "limit": 50, "totalPages": 1 } }
// Each item is flat: { "id": "...", "fieldKey": "value", "createdAt": "...", ... }

// Single record:
{ "success": true, "data": { "id": "...", "fieldKey": "value", ... } }

// Error:
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
\`\`\`

### MCP vs REST Comparison
| Aspect | MCP Tool | REST API |
|--------|----------|----------|
| Filters | \`filters: { field: "value" }\` (object) | \`?filters=field = value\` (string) |
| Relation resolution | \`resolve_depth: 1\` (param) | \`?resolve_depth=1\` (query string) |
| Response shape | Direct data | Wrapped in \`{ success, data }\` |
| List items key | \`records\` array | \`data.items\` array |
| Record fields | Flat | Flat (since v1.26.0) |
| Tenant context | \`select_tenant()\` (session) | \`X-Tenant-ID\` header (per-request) |
| Auth | OAuth session | \`X-API-Key\` header |

### Auth Endpoints
\`\`\`
POST /api/auth/tenant/login    → { success, data: { token, user } }
POST /api/auth/tenant/register → { success, data: { token, user } }
GET  /api/auth/tenant/me       → { success, data: { user } }
POST /api/auth/tenant/logout
\`\`\`

### WebSocket (v1.28.0+)
\`\`\`
ws://app.fyso.dev/ws?token={api_key}&tenantId={slug}

// Subscribe:
{ "type": "subscribe", "entityId": "uuid" }

// Events received:
{ "type": "record_created|record_updated|record_deleted", "entityId": "...", "record": {...} }
\`\`\`
Per-entity toggle: \`realtimeEnabled\` in entity metadata.

### resolve_depth behavior
- Only works on list endpoints (GET /records), NOT on single record (GET /records/:id)
- Max depth: 2
- Transforms relation fields from UUID strings to full objects`;
}

function extractDSL(content: string): string {
  return `### Structure
\`\`\`json
{ "compute": { }, "validate": [ ], "transform": { } }
\`\`\`

### Compute
\`\`\`json
"field": { "type": "formula", "expression": "a * b" }
"field": { "type": "conditional", "conditions": [{ "when": "x > 10", "then": "x * 0.1" }], "default": "0" }
\`\`\`
Fields execute in order — later fields can reference earlier ones.

### Validate
\`\`\`json
{ "id": "unique_id", "condition": "price >= 0", "message": "Error msg", "severity": "error|warning|info" }
\`\`\`

### Transform
\`\`\`json
"field": { "type": "uppercase|lowercase|trim" }
"field": { "type": "round", "decimals": 2 }
"field": { "type": "default", "value": "pendiente" }
\`\`\`

### Operators
- Arithmetic: \`+ - * / % ^\`
- Comparison: \`> < >= <= == !=\`
- Logical: \`and or not\`
- Inline conditional: \`if(cond, true_val, false_val)\`

### Functions
- Math: \`floor(n) ceil(n) abs(n) min(a,b) max(a,b)\`
- Text: \`upper(s) lower(s) trim(s) len(s)\`
- Utility: \`coalesce(a, b, ...)\`

### Trigger Types
- \`field_change\` — fires when specified fields change in UI (NOT from updateDataDirect)
- \`before_save\` — fires before record is saved (best for validations)
- \`after_save\` — fires after record is saved (for cross-entity updates)`;
}

function extractLimitations(content: string): string {
  return `| # | Limitation | Impact | Workaround |
|---|-----------|--------|------------|
| 1 | \`field_change\` triggers don't fire from \`updateDataDirect\` | High | Use \`before_save\` for critical validations |
| 2 | MCP session loses tenant context | Medium | Always \`select_tenant\` first in every task |
| 3 | Semantic search requires OPENAI_API_KEY + embedding worker | Medium | Use \`query\` with text filters instead |
| 4 | Channel slugs globally non-reusable once deleted | Medium | Choose names carefully, don't use temp names |
| 5 | Published entities with data resist schema changes | High | Design all fields before publishing |
| 6 | Compute chains must be in correct order | Medium | Order compute fields by dependency in DSL |
| 7 | \`fyso_schema\` \`generate\` creates all fields at once; use \`add_field\` for individual additions | Low | \`generate\` for new entities, \`add_field\` for additions |
| 8 | DSL: no string interpolation, limited date math, no arrays, no API calls | Low | Keep expressions simple, use multiple rules |
| 9 | \`deploy\` response \`url\` field is wrong — returns \`{slug}.fyso.dev\` without \`-sites\` | High | Always use \`{slug}-sites.fyso.dev\` as the real URL |
| 10 | Fyso static hosting ignores \`_redirects\` — BrowserRouter SPA routes 404 on direct access | High | Use Astro (generates per-route index.html) or HashRouter for SPAs |
| 11 | OR filters not supported server-side | Medium | Client-side filter for OR conditions |
| 12 | resolve_depth only on list endpoints | Low | Separate GET /records/:id call per related entity |
| 13 | No aggregation queries (SUM, COUNT, AVG) | Medium | Fetch all records + compute client-side |
| 14 | Agent REST endpoint returns 401 with user tokens | High | Use MCP \`fyso_agents({ action: "run" })\` instead |
| 15 | \`contains\` filter behavior undocumented | Medium | Test with your data; case sensitivity varies |

**Things that work fine:** Multiple entity creation, rules after publish, relations, \`fyso_data({ action: "query" })\`, metadata import/export.`;
}

function extractDomainPatterns(content: string): string {
  // Parse domain sections from content
  const domains: string[] = [];
  const sections = content.split(/^## /m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0]?.trim();
    if (!title) continue;
    // Skip non-domain sections
    if (title.startsWith("Domain") || title.startsWith("Universal") || title.startsWith("#")) continue;
    // Skip sections without entity definitions
    if (!section.includes("### Entities") && !lines.some(l => l.startsWith("- **"))) continue;

    // Extract entities from the section
    const entityLines = lines.filter(l => l.startsWith("- **"));
    const entities = entityLines.map(l => {
      const match = l.match(/\*\*(\w+)\*\*/);
      return match ? match[1] : "";
    }).filter(Boolean);

    // Extract relations
    const relations = entityLines
      .filter(l => l.includes("rel→"))
      .map(l => {
        const entity = l.match(/\*\*(\w+)\*\*/)?.[1] || "";
        const rels = [...l.matchAll(/rel→(\w+)/g)].map(m => m[1]);
        return rels.map(r => `${entity}→${r}`).join(", ");
      })
      .filter(Boolean);

    // Extract rules
    const ruleLines = lines.filter(l => l.startsWith("- Compute:") || l.startsWith("- Validate:") || l.startsWith("- Transform:"));
    const rules = ruleLines.map(l => l.replace("- ", "")).join(", ");

    domains.push(
      `### ${title}\n- **Entities:** ${entities.join(", ")}\n- **Key relations:** ${relations.join(", ")}\n- **Rules:** ${rules}`
    );
  }

  return domains.join("\n\n");
}

function extractAuth(content: string): string {
  return `### Role Hierarchy
\`owner > admin > member > viewer > public\`

| Role | CRUD | Users | Config |
|------|------|-------|--------|
| owner | All entities, all ops | Create/manage all | Full |
| admin | All entities, all ops | Create/manage | Limited |
| member | Assigned entities, create/edit | Own profile only | None |
| viewer | Assigned entities, read-only | Own profile only | None |
| public | Public endpoints only | None | None |

### Auth Endpoints
\`\`\`
POST /api/auth/tenant/login    → { success, data: { token, user } }
POST /api/auth/tenant/register → { success, data: { token, user } }
GET  /api/auth/tenant/me       → { success, data: { user } }
POST /api/auth/tenant/logout
\`\`\`

### Headers
\`\`\`
X-API-Key: {user-token}
X-Tenant-ID: {tenant-slug}
\`\`\`

### Token Types
| Type | Scope | Storage |
|------|-------|---------|
| Admin API key | All ops, server only | \`.env\` (NEVER in browser) |
| User session token | Single tenant, role-based | Cookie or localStorage |
| OAuth access token | MCP operations | Memory |`;
}

function extractUIComponents(content: string): string {
  return `### Core Components
- **FysoProvider** — wraps app, provides API client + translations
- **DataGrid** — auto-columns from entity metadata, pagination, sort, mobile cards
- **DynamicForm** — auto-generated form from entity schema, validation, relation dropdowns
- **RecordDetail** — master-detail with child entity records
- **UI primitives** — Button, Input, Label, Table, Calendar (shadcn-based)

### Key Hooks
\`\`\`tsx
useFysoEntity('entity')   → { entity, loading, error }
useFysoClient()           → client (records.list/get/create/update/delete)
useFyso()                 → { client, translations, entityCache }
\`\`\`

### Record Data Shape (v1.26.0+ flat format)
\`\`\`
record.{fieldKey}         # Flat — fields directly on record object
record.data.{fieldKey}    # WRONG — no longer nested under .data
\`\`\``;
}

function extractUIPatterns(content: string): string {
  return `### Layouts
- **Sidebar** — admin panels (240px sidebar, collapsible on mobile)
- **TopNav** — simple apps, client portals
- **Landing + App** — public pages + authenticated area

### Page Types
- **Entity List** — DataGrid + search + filters + pagination + [+ New] button
- **Entity Detail** — RecordDetail + child entity tables
- **Entity Form** — DynamicForm (create/edit modes)
- **Dashboard** — KPI cards + recent activity + quick actions
- **Login/Register** — centered form
- **User Management** — admin: list + create/edit users

### Style Presets
| Preset | Primary | Background | Use For |
|--------|---------|------------|---------|
| Minimal | near-black | white | clean, simple apps |
| Professional | dark blue | white | admin panels, business |
| Modern | purple | white | client-facing, colorful |
| Dark | light text | near-black bg | dark mode default |`;
}

function extractAgents(_content: string): string {
  return `### Prerequisites
Configure an AI provider before creating agents:
\`\`\`
fyso_ai({ action: "configure_provider", type: "openai", base_url: "https://api.openai.com/v1", api_key: "sk-...", default_model: "gpt-4o-mini", name: "OpenAI" })
\`\`\`
Supported: OpenAI, Anthropic, Groq, any OpenAI-compatible endpoint.

### Lifecycle Commands
\`\`\`
fyso_agents({ action: "create", name: "Waiter Bot", slug: "waiter", system_prompt: "...", tools_scope: {...}, fallback_mode: "message" })
fyso_agents({ action: "run", agent_slug: "waiter", message: "...", session_id: "optional-uuid" })
fyso_agents({ action: "test", agent_slug: "waiter", message: "..." })  // dry-run, no side effects
fyso_agents({ action: "update", slug: "waiter", system_prompt: "..." })
fyso_agents({ action: "delete", slug: "waiter" })
fyso_agents({ action: "list" })
fyso_agents({ action: "list_templates" })
fyso_agents({ action: "from_template", template_id: "...", name: "My Agent" })
fyso_agents({ action: "list_runs", agent_id: "...", status: "completed" })
fyso_agents({ action: "list_versions", agent_id: "..." })
fyso_agents({ action: "rollback", agent_id: "...", version: 2 })
\`\`\`

### tools_scope
Maps entity names to allowed operations: \`query\`, \`create\`, \`update\`, \`delete\`.
\`\`\`json
{ "productos": ["query"], "pedidos": ["query", "create", "update"], "mesas": ["query", "update"] }
\`\`\`

### Model Compatibility
| Model | Tool calling | Notes |
|-------|-------------|-------|
| gpt-4o-mini | Reliable | Recommended for cost/quality balance |
| gpt-4o / gpt-4.1 | Reliable | Higher quality, higher cost |
| claude-sonnet-4-6 | Reliable | Via Anthropic adapter |
| llama-3.3-70b (Groq) | Works | Sometimes sends numbers as strings |
| llama-3.1-8b | Broken | Ignores tools, hallucinates responses |

### Key Prompt Tips
- Include entity schema in system prompt (field names, types, relations)
- Describe multi-step flows explicitly
- Don't filter by name in tool calls — fetch all records and match in-context
- Keep prompts under 2000 tokens for faster response
- Every \`update\` creates a new version; use \`list_versions\` + \`rollback\` to manage

### Limitations
- Agent REST endpoint (\`/api/agents/{slug}/run\`) returns 401 with user tokens — use MCP \`fyso_agents({ action: "run" })\`
- No automatic rate limit retry — implement client-side backoff
- Session may corrupt after consecutive tool call errors — start a new \`session_id\`
- \`fallback_mode: "llm"\` requires a configured provider; \`"message"\` returns static text`;
}

// --- Main ---

async function getSourceHash(): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const section of SECTIONS) {
    const path = `${ROOT}/${section.source}`;
    const file = Bun.file(path);
    if (await file.exists()) {
      hasher.update(await file.text());
    }
  }
  return hasher.digest("hex");
}

async function generate(): Promise<string> {
  const now = new Date().toISOString().split("T")[0];
  const parts: string[] = [];

  parts.push(`# Fyso Platform — Consolidated Reference`);
  parts.push(`<!-- AUTO-GENERATED by scripts/sync-reference.ts — DO NOT EDIT MANUALLY -->`);
  parts.push(`<!-- Source: skills/*/reference/*.md — Last sync: ${now} -->`);
  parts.push(``);
  parts.push(
    `Quick-reference for all Fyso concepts. Read this ONE file instead of ${SECTIONS.length} individual reference files. For deep dives, read the source files in \`skills/*/reference/\`.`
  );

  for (const section of SECTIONS) {
    const path = `${ROOT}/${section.source}`;
    const file = Bun.file(path);

    parts.push(``);
    parts.push(`---`);
    parts.push(``);
    parts.push(`## ${section.number}. ${section.title}`);
    parts.push(``);

    if (await file.exists()) {
      const content = await file.text();
      parts.push(section.extract(content));
    } else {
      parts.push(`> Source file not found: \`${section.source}\``);
    }

    parts.push(``);
    parts.push(`Source: \`${section.source}\``);
  }

  return parts.join("\n") + "\n";
}

async function main() {
  const checkOnly = process.argv.includes("--check");

  const output = await generate();

  if (checkOnly) {
    const existing = Bun.file(OUTPUT);
    if (await existing.exists()) {
      const current = await existing.text();
      // Compare ignoring the date line
      const normalize = (s: string) =>
        s.replace(/Last sync: \d{4}-\d{2}-\d{2}/, "Last sync: DATE");
      if (normalize(current) === normalize(output)) {
        console.log("FYSO-REFERENCE.md is up to date.");
        process.exit(0);
      }
    }
    console.log("FYSO-REFERENCE.md is OUT OF DATE. Run: bun scripts/sync-reference.ts");
    process.exit(1);
  }

  await Bun.write(OUTPUT, output);
  console.log(`Synced FYSO-REFERENCE.md (${SECTIONS.length} sections)`);
}

main();
