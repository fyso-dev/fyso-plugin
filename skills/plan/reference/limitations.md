# Fyso Limitations — Known Issues & Workarounds

This document lists known Fyso platform limitations that affect planning, building, and verification. The designer, builder, and verifier agents MUST read this before operating.

## Critical Limitations

### 1. field_change triggers don't fire from updateDataDirect

**Impact:** High
**Affects:** Business rules with `triggerType: "field_change"`

When a `after_save` action uses `updateDataDirect` to modify a record, `field_change` triggers on the target entity do NOT fire. This means computed fields won't update.

**Workaround:**
- Use `before_save` triggers for critical validations
- For compute chains, put all computations in a single rule that fires `before_save`
- If you need cross-entity updates, use `after_save` actions but be aware that computed fields on the target entity won't recalculate automatically

**Planning impact:** When designing business rules, prefer `before_save` for validations. Only use `field_change` for UI-triggered computations where the user directly edits the field.

### 2. MCP session can lose tenant context

**Impact:** Medium
**Affects:** All MCP operations

The MCP session may lose the selected tenant between calls, especially in long-running sessions or after errors.

**Workaround:**
- Always call `select_tenant` at the start of each task
- If an operation fails with a "no tenant selected" error, re-select and retry once

**Planning impact:** Every plan task should start with `select_tenant` as its first operation.

### 3. Semantic search requires OPENAI_API_KEY + embedding worker

**Impact:** Medium
**Affects:** Channel tools using `operation: "semantic_search"`

Semantic search won't work unless:
1. `OPENAI_API_KEY` is set in the environment
2. The embedding worker is running and has indexed the entity's records

**Workaround:**
- Use `operation: "query"` with text filters instead of semantic search
- Or confirm embeddings are configured before planning semantic search tools

**Planning impact:** Don't plan semantic search channel tools without confirming the prerequisites.

### 4. Channel slugs are global and non-reusable

**Impact:** Medium
**Affects:** Channel creation and naming

Once a channel slug is used and then deleted, that slug cannot be reused. It's burned forever.

**Workaround:**
- Choose channel names carefully
- Use descriptive, specific names (e.g., "consultorio-fono-api" not "api")
- Don't create test channels with production names

**Planning impact:** Plan channel names as part of the design phase. Don't use temporary names.

### 5. Published entities with data resist schema changes

**Impact:** High
**Affects:** Entity modification after data exists

Once an entity is published and has records, modifying its schema (adding required fields, changing types, removing fields) becomes risky:
- Adding a required field will fail if existing records don't have a value
- Changing field types can corrupt existing data
- Removing fields loses data

**Workaround:**
- Design fields completely before publishing
- Use the "create draft → configure → test → publish" flow
- If you must modify a published entity, export data first, then modify, then re-import

**Planning impact:** Plans should create all fields before publishing. Business rules should be created and tested before publishing the entity.

### 6. Compute chains must be in correct order within a single rule

**Impact:** Medium
**Affects:** Business rules with multiple computed fields

If field B depends on field A (e.g., `tax = subtotal * 0.21`, `total = subtotal + tax`), both computations must be in the same rule DSL, and `subtotal` must be defined before `tax`, and `tax` before `total` in the `compute` object.

**Workaround:**
- Always order compute fields by dependency in the DSL
- Test the compute chain with `test_business_rule` to verify order

**Planning impact:** When designing rules with compute chains, specify the exact field order in the plan.

### 7. fyso_schema: generate vs add_field

**Impact:** Low
**Affects:** Entity creation approach

`fyso_schema({ action: "generate" })` creates an entity with all fields in one call. Use `fyso_schema({ action: "add_field" })` to add individual fields to an existing (draft or published) entity.

**Workaround:** Use `generate` with the complete field list for initial creation. Use `add_field` for incremental additions.

**Planning impact:** Plans should use `generate` with the full field definition for new entities, and `add_field` for subsequent field additions.

### 8. Business rule DSL expression limitations

**Impact:** Low
**Affects:** Complex expressions in rules

The expression parser has some limitations:
- No string interpolation (use concatenation if available)
- Limited date arithmetic (prefer simple comparisons)
- No array operations
- No external API calls from expressions

**Workaround:**
- Keep expressions simple
- Break complex logic into multiple simpler rules
- Use `conditional` type for branching logic

**Planning impact:** Design rules with simple, testable expressions. Avoid complex date math.

### 9. deploy_static_site response `url` field is wrong

**Impact:** High
**Affects:** Static site deployment

The `deploy` action response `url` field returns `{slug}.fyso.dev` (without `-sites`). The real URL is `{slug}-sites.fyso.dev`.

**Workaround:** Always use `{slug}-sites.fyso.dev` as the actual URL. Ignore the response `url` field.

### 10. Fyso static hosting ignores `_redirects` — SPA routes 404

**Impact:** High
**Affects:** Single-page apps using BrowserRouter

Fyso static hosting does not process `_redirects` files. BrowserRouter SPA routes return 404 on direct access or refresh.

**Workaround:** Use Astro (generates per-route `index.html`) or HashRouter for SPAs.

### 11. OR filters not supported server-side

**Impact:** Medium
**Affects:** Data queries requiring OR conditions

The REST API and fyso_data `query` action only support AND compound filters. There is no server-side OR operator.

**Workaround:** Fetch records with the broadest applicable filter and apply OR conditions client-side after receiving results.

### 12. resolve_depth only works on list endpoints

**Impact:** Low
**Affects:** Single record fetches with related entity resolution

`resolve_depth` only works on `GET /records` (list) and `fyso_data({ action: "query" })`. It does NOT work on `GET /records/:id` (single record fetch).

**Workaround:** After fetching a single record, make separate `GET /records/:id` calls for each related entity UUID you need to resolve.

### 13. No aggregation queries (SUM, COUNT, AVG)

**Impact:** Medium
**Affects:** Dashboard KPIs, totals, statistical summaries

Fyso has no server-side aggregation. There are no SUM, COUNT, AVG, GROUP BY query operations.

**Workaround:** Fetch all relevant records (using pagination if needed) and compute aggregations client-side.

### 14. Agent REST endpoint returns 401 with user tokens

**Impact:** High
**Affects:** Calling `/api/agents/{slug}/run` from client-side code

`POST /api/agents/{slug}/run` exists but rejects user session tokens with
`401 UNAUTHORIZED`, regardless of the user's role (owner / admin / member /
viewer). The endpoint is not a public REST surface in current builds — it is
only reachable via MCP.

**What fails:**
```bash
curl -X POST "https://app.fyso.dev/api/agents/waiter/run" \
  -H "X-API-Key: $USER_SESSION_TOKEN" \
  -H "X-Tenant-ID: mi-tenant" \
  -d '{"message":"hola"}'
# → 401 { "success": false, "error": { "code": "UNAUTHORIZED", ... } }
```

**Workaround:**
- From Claude / agent code: use MCP `fyso_agents({ action: "run", agent_slug: "...", message: "..." })`.
- From a browser / mobile client: add a thin backend endpoint that invokes the
  MCP tool server-side and forwards the response. Do **not** embed admin API
  keys in client bundles.

**Planning impact:** Do not design flows that call `/api/agents/{slug}/run`
directly from client code. If a UI must invoke an agent, plan a backend proxy
in the same task.

### 15. `contains` filter behavior partially specified

**Impact:** Medium
**Affects:** Text search queries using the `contains` operator

The `contains` operator performs a substring match on text fields, but its
case sensitivity, accent / Unicode collation, and behavior on non-text fields
are not formally specified by the platform and may vary by storage backend.

**Usage (REST + MCP):**
```bash
# REST
curl -G ".../entities/productos/records" \
  --data-urlencode "filters=nombre contains cafe"

# MCP
fyso_data({ action: "query", entity: "productos",
  filters: "nombre contains cafe" })

# Combined (AND only — OR is not supported server-side)
filters=nombre contains cafe AND precio >= 100
```

**Known caveats:**
- Treat as case-insensitive for ASCII in current builds, but verify against
  your own data — there is no platform contract here.
- No wildcard / regex syntax. `%`, `*`, `_` are matched as literal characters.
- Accent-insensitive matching (e.g. `cafe` ↔ `café`) is not guaranteed.
- Only meaningful on text-typed fields.
- Cannot be combined with `OR` (limitation #11).

**Workaround for reliable text search:**
- Use semantic search (`operation: "semantic_search"`) when embeddings are
  configured.
- Fetch with a broader filter and refine client-side.
- Normalize the field on write (e.g. store a lowercased copy in a sibling
  field) and `contains` against the normalized field.

**Planning impact:** Do not promise exact case / accent semantics in user
stories that depend on `contains`. If the requirement is "find by name
regardless of accents and case," plan a normalized-field approach or semantic
search up front.

## Non-Issues (Things That Work Fine)

- Creating multiple entities in sequence — works reliably
- Creating business rules after entity is published — works
- Relations between published entities — work correctly
- `query_records` with filters — works as expected
- `export_metadata` / `import_metadata` — reliable for snapshots
- Custom fields survive metadata imports — preserved correctly
