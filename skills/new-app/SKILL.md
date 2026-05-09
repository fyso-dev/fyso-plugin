---
name: fyso-new-app
description: Create a new business app on Fyso. Guides through prebuild selection, tenant creation, and initial setup.
disable-model-invocation: true
---

# New App Wizard - Fyso

Conversational wizard that creates a fully functional business app in under 2 minutes.

## Flow

### Step 1: Understand the business

Ask the builder what kind of app they need. Examples:

- "I need to manage clients, invoices, and payments for my freelance work"
- "I run a repair shop and need to track jobs, parts, and customers"
- "I have a small store and need inventory and sales tracking"

### Step 2: Suggest a prebuild (if applicable)

Fyso has ready-made templates. Match the builder's description to one:

| Prebuild | Best for | Entities |
|----------|----------|----------|
| `freelancer` | Freelancers, consultants, agencies | clients, projects, invoices, payments |
| `taller` | Repair shops, service businesses | customers, jobs, parts, invoices |
| `tienda` | Retail, e-commerce, inventory | products, customers, sales, inventory |

If none fits perfectly, ask: "I can start from scratch, or use [closest match] as a starting point and customize it. What do you prefer?"

If the builder wants something completely different, skip to Step 4 (blank tenant).

### Step 3: Create the tenant

Ask the builder for an app name (slug format: lowercase, hyphens).

```
select_tenant({ tenantSlug: "builder-chosen-name" })
```

If the tenant doesn't exist yet, guide them to create one first via the Fyso dashboard or API.

### Step 4: Import prebuild or start blank

**With prebuild:**

```
import_metadata({
  metadata: "<prebuild JSON>",
  tenantId: "builder-chosen-name"
})
```

The prebuild JSON for each template is available in the `packages/api/src/prebuilds/` directory:
- `freelancer.json` — metadata (entities, fields, rules)
- `freelancer.seed.json` — example data
- `taller.json` + `taller.seed.json`
- `tienda.json` + `tienda.seed.json`

After importing metadata, publish all entities:

```
list_entities({ include_drafts: true })
# For each draft entity:
publish_entity({ entityName: "...", version_message: "Initial import from prebuild" })
```

**Without prebuild (blank):**

The tenant starts empty. Suggest using `/fyso:entity add` to create the first entity.

### Step 5: Show summary

After setup, show the builder what was created:

```
list_entities()
# For each entity:
get_entity_schema({ entityName: "..." })
```

Present a clear summary:

```
Your app "mi-taller" is ready!

Entities created:
  - customers (5 fields: name, email, phone, address, notes)
  - jobs (7 fields: customer, description, status, start_date, end_date, cost, notes)
  - parts (4 fields: name, sku, price, stock)
  - invoices (6 fields: customer, job, date, subtotal, tax, total)

Business rules:
  - invoices: auto-calculate total = subtotal + tax

Example data loaded: 3 customers, 5 jobs, 10 parts, 2 invoices

Next steps:
  - /fyso:entity add to add more entities
  - /fyso:release deploy to publish your app
```

## Important

- Always confirm with the builder before importing/creating anything
- If the builder changes their mind mid-flow, adapt gracefully
- Use `list_entities` to verify what was actually created, don't assume
- Prebuild seed data is optional — ask if the builder wants example data loaded
