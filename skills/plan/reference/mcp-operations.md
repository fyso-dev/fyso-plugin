# Fyso MCP Operations -- Quick Reference

Complete reference of grouped MCP tools available for planning and execution.
Fyso exposes **10 grouped tools** via MCP. Each accepts an `action` parameter.

## Tenant Management (fyso_auth)

### select_tenant
Select a tenant to operate on. **Must be called before any other operation.**
```
fyso_auth({ action: "select_tenant", tenantSlug: "mi-consultorio" })
```

### list_tenants
List available tenants.
```
fyso_auth({ action: "list_tenants" })
```

### create_tenant
Create a new app (enforces plan limits).
```
fyso_auth({ action: "create_tenant", name: "Mi App", description: "..." })
```

## Entity Operations (fyso_schema)

### generate (create entity)
Create an entity with all its fields in one call.
```
fyso_schema({
  action: "generate",
  definition: {
    entity: {
      name: "invoices",           // lowercase, plural
      displayName: "Invoices",    // human-readable
      description: "Client invoices with tax calculation"
    },
    fields: [
      {
        name: "Customer",
        fieldKey: "customer",
        fieldType: "relation",
        isRequired: true,
        config: {
          entity: "customers",
          displayField: "name"
        }
      },
      {
        name: "Date",
        fieldKey: "date",
        fieldType: "date",
        isRequired: true
      },
      {
        name: "Subtotal",
        fieldKey: "subtotal",
        fieldType: "number",
        isRequired: true,
        config: { decimals: 2 }
      },
      {
        name: "Status",
        fieldKey: "status",
        fieldType: "select",
        config: {
          options: ["draft", "sent", "paid", "overdue"]
        }
      }
    ]
  },
  auto_publish: false,
  version_message: "Create invoices entity"
})
```

### list
List all entities in the tenant.
```
fyso_schema({ action: "list", include_drafts: true })
```

### get
Get field details for an entity.
```
fyso_schema({ action: "get", entityName: "invoices" })
```

### add_field
Add a field to a published entity.
```
fyso_schema({ action: "add_field", entityName: "invoices", name: "Notes", fieldKey: "notes", fieldType: "textarea" })
```

### publish
Publish a draft entity.
```
fyso_schema({
  action: "publish",
  entityName: "invoices",
  version_message: "Initial publish with all fields"
})
```

### discard
Discard pending draft changes.
```
fyso_schema({ action: "discard", entityName: "invoices" })
```

### delete
Delete an entity.
```
fyso_schema({ action: "delete", entityName: "invoices", confirm: true })
```

### list_changes
See pending changes across entities.
```
fyso_schema({ action: "list_changes", include_published: false })
```

### list_presets
List available industry presets.
```
fyso_schema({ action: "list_presets" })
```

### install_preset
Install a complete industry preset (entities + fields + rules).
```
fyso_schema({ action: "install_preset", preset_name: "clinica" })
```
Available presets: `taller`, `tienda`, `clinica`, `freelancer`.

## Field Types

| Type | Config | Example |
|------|--------|---------|
| `text` | -- | names, titles, codes |
| `textarea` | -- | long descriptions |
| `number` | `{ decimals: 0 }` | quantities, stock |
| `number` | `{ decimals: 2 }` | prices, totals, money |
| `email` | -- | email addresses |
| `phone` | -- | phone numbers |
| `date` | -- | dates |
| `boolean` | -- | yes/no flags |
| `select` | `{ options: ["a", "b"] }` | status, type, category |
| `relation` | `{ entity: "...", displayField: "..." }` | foreign keys |
| `file` | -- | file uploads |
| `location` | -- | geographic coordinates |

## Business Rule Operations (fyso_rules)

### create
Create a rule with explicit DSL.
```
fyso_rules({
  action: "create",
  entityName: "invoices",
  name: "Calculate tax and total",
  description: "Compute tax from subtotal * rate, then total",
  triggerType: "field_change",
  triggerFields: ["subtotal", "tax_rate"],
  ruleDsl: {
    compute: {
      tax: { type: "formula", expression: "subtotal * tax_rate / 100" },
      total: { type: "formula", expression: "subtotal + tax" }
    },
    validate: [
      {
        id: "positive_subtotal",
        condition: "subtotal >= 0",
        message: "Subtotal must be non-negative",
        severity: "error"
      }
    ],
    transform: {
      email: { type: "lowercase" }
    }
  },
  auto_publish: false
})
```

### list
List rules for an entity.
```
fyso_rules({ action: "list", entityName: "invoices", include_drafts: true })
```

### get
Get rule details.
```
fyso_rules({ action: "get", entityName: "invoices", ruleId: "uuid" })
```

### test
Test a rule with sample data.
```
fyso_rules({
  action: "test",
  entityName: "invoices",
  ruleId: "uuid",
  testData: {
    subtotal: 1000,
    tax_rate: 21
  }
})
// Expected: { tax: 210, total: 1210 }
```

### publish
Publish a draft rule.
```
fyso_rules({ action: "publish", entityName: "invoices", ruleId: "uuid" })
```

### delete
Delete a rule.
```
fyso_rules({ action: "delete", entityName: "invoices", ruleId: "uuid" })
```

### logs
View rule execution history.
```
fyso_rules({ action: "logs", entityName: "invoices", ruleId: "uuid", limit: 20 })
```

## Record Operations (fyso_data)

### create
Create a new record.
```
fyso_data({
  action: "create",
  entity: "invoices",
  data: {
    customer: "customer-uuid",
    date: "2026-02-25",
    subtotal: 1000,
    tax_rate: 21,
    status: "draft"
  }
})
```

### query
Query records with filters, pagination, and semantic search.
```
fyso_data({
  action: "query",
  entity: "invoices",
  filters: "status = paid AND date >= 2026-01-01",
  sort: "date",
  order_dir: "desc",
  limit: 10,
  offset: 0,
  resolve_depth: 1
})
```

Semantic search:
```
fyso_data({
  action: "query",
  entity: "invoices",
  semantic: "facturas pendientes del ultimo mes",
  min_similarity: 0.5
})
```

Filter operators: =, !=, >, <, >=, <=, contains
Compound: AND only (OR not supported server-side)
Example: fyso_data({ action: "query", entity: "productos", filters: "nombre contains cafe" })

### update
Update a record.
```
fyso_data({ action: "update", entity: "invoices", id: "record-uuid", data: { status: "paid" } })
```

### delete
Delete a record.
```
fyso_data({ action: "delete", entity: "invoices", id: "record-uuid" })
```

### Bookings
```
fyso_data({ action: "get_slots", professional_id: "uuid", date: "2026-03-15" })
fyso_data({ action: "create_booking", professional_id: "uuid", patient_id: "uuid", date: "2026-03-15", time: "10:00", duration: 30 })
```

## Metadata & API (fyso_meta)

### api_spec
Get REST API documentation.
```
fyso_meta({ action: "api_spec", entities: ["invoices"], includeExamples: true })
```

### api_client
Generate typed API client code.
```
fyso_meta({ action: "api_client", entities: ["invoices"], framework: "react" })
```

### export / import
```
fyso_meta({ action: "export", tenantId: "mi-consultorio" })
fyso_meta({ action: "import", tenantId: "mi-consultorio", data: "<JSON string>" })
```

### usage
View billing and usage metrics.
```
fyso_meta({ action: "usage" })
```

### Secrets
```
fyso_meta({ action: "set_secret", key: "OPENAI_API_KEY", value: "sk-..." })
fyso_meta({ action: "delete_secret", key: "OPENAI_API_KEY" })
```

### feedback
Report bugs or suggestions directly from MCP.
```
fyso_meta({ action: "feedback", feedback_type: "bug", title: "Short summary", description: "Details...", context: "fyso_data query" })
```

## AI Agents (fyso_agents)

### Create and manage agents
```
fyso_agents({ action: "list" })
fyso_agents({ action: "create", name: "Support Bot", system_prompt: "You are a helpful assistant...", fallback_mode: "llm", tools_scope: { clients: ["query"], invoices: ["query", "create"] }, knowledge_enabled: true })
fyso_agents({ action: "update", slug: "support-bot", system_prompt: "Updated prompt..." })
fyso_agents({ action: "delete", slug: "support-bot" })
```

### Run and test agents
```
fyso_agents({ action: "run", agent_slug: "support-bot", message: "How many open invoices?", session_id: "optional-session" })
fyso_agents({ action: "test", agent_slug: "support-bot", message: "Test query" })  // dry-run
```

### Version management
```
fyso_agents({ action: "list_versions", agent_id: "uuid" })
fyso_agents({ action: "rollback", agent_id: "uuid", version: 2 })
```

### Execution history
```
fyso_agents({ action: "list_runs", agent_id: "uuid", status: "success", limit: 50 })
```

### Templates
```
fyso_agents({ action: "list_templates" })
fyso_agents({ action: "from_template", template_id: "support", name: "My Support Bot" })
```

## AI Providers & Templates (fyso_ai)

### Provider management
```
fyso_ai({ action: "list_providers" })
fyso_ai({ action: "add_provider", name: "OpenAI", base_url: "https://api.openai.com/v1", api_key: "sk-...", default_model: "gpt-4o" })
fyso_ai({ action: "configure_provider", name: "OpenAI", type: "openai", base_url: "...", api_key: "...", default_model: "gpt-4o" })
fyso_ai({ action: "remove_provider", provider_id: "uuid" })
```

### Test calls
```
fyso_ai({ action: "test_call", prompt: "Hello", model: "gpt-4o", max_tokens: 256, temperature: 0.7 })
```

### Call logs
```
fyso_ai({ action: "call_logs", provider: "OpenAI", status: "success", limit: 50 })
fyso_ai({ action: "debug_log", log_id: "uuid" })
```

### Prompt templates
```
fyso_ai({ action: "list_templates" })
fyso_ai({ action: "create_template", name: "Greeting", slug: "greeting", type: "prompt", content: "Hello {{name}}, welcome to {{company}}", variables: ["name", "company"] })
fyso_ai({ action: "update_template", id: "uuid", content: "Updated template..." })
```

## Views (fyso_views)

```
fyso_views({ action: "create", entitySlug: "invoices", slug: "overdue-invoices", name: "Overdue", filterDsl: { validate: [{ condition: "status == overdue" }] } })
fyso_views({ action: "list" })
fyso_views({ action: "update", slug: "overdue-invoices", isActive: false })
fyso_views({ action: "delete", slug: "overdue-invoices" })
```

## Knowledge Base (fyso_knowledge)

```
fyso_knowledge({ action: "search", query: "politica de reembolsos", limit: 5, threshold: 0.3 })
fyso_knowledge({ action: "stats" })
fyso_knowledge({ action: "search_docs", query: "how to create entity", topic: "entities" })
```

## Deploy (fyso_deploy)

```
fyso_deploy({ action: "deploy", subdomain: "mi-app", path: "/path/to/dist" })
fyso_deploy({ action: "list" })
fyso_deploy({ action: "delete", subdomain: "mi-app" })
fyso_deploy({ action: "set_domain", subdomain: "mi-app", domain: "app.miempresa.com" })
fyso_deploy({ action: "generate_token", subdomain: "mi-app", name: "GitHub Actions", framework: "astro" })
```
