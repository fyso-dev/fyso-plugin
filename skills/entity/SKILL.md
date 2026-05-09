---
name: fyso-entity
description: Create and manage entities, fields, and custom fields. Use when the user wants to create tables, add fields, modify data structure, or manage custom fields.
argument-hint: "[create|add|list|modify|fields] [entity-name] [fields...]"
---

# Entity Management - Fyso

Create and manage entities (tables), their fields, and custom fields.

## Subcommands

```
/fyso:entity create Productos con nombre, precio, stock     # Create entity
/fyso:entity add invoices                                    # Guided entity creation
/fyso:entity list                                            # List all entities
/fyso:entity modify Productos agregar campo categoria        # Modify entity
/fyso:entity fields list productos                           # List fields
/fyso:entity fields add notas_internas a productos           # Add custom field
/fyso:entity fields update notas_internas en productos       # Update custom field
/fyso:entity fields delete notas_internas de productos       # Delete custom field
```

---

## Mode: CREATE — Direct entity creation

### 1. Analyze the request

Extract:
- Entity name (singular, PascalCase)
- Fields with inferred types

### 2. Map field types

| User says | Fyso type | Config |
|-----------|-----------|--------|
| name, title, code | `text` | — |
| description, notes, comments | `text` | — |
| price, cost, total, amount | `number` | `{ decimals: 2 }` |
| quantity, stock, count | `number` | `{ decimals: 0 }` |
| email | `email` | — |
| phone | `phone` | — |
| date, start_date, due_date | `date` | — |
| active, published, paid | `boolean` | — |
| status, type, category | `select` | `{ options: [...] }` |
| customer, project, invoice | `relation` | `{ entity: "..." }` |

### 3. Call MCP Tool

```typescript
generate_entity({
  definition: {
    entity: {
      name: "productos",
      displayName: "Productos",
      description: "Product catalog"
    },
    fields: [
      { name: "Name", fieldKey: "nombre", fieldType: "text", isRequired: true },
      { name: "Price", fieldKey: "precio", fieldType: "number", isRequired: true, config: { decimals: 2 } },
      { name: "Stock", fieldKey: "stock", fieldType: "number", config: { decimals: 0 } }
    ]
  },
  auto_publish: true,
  version_message: "Create productos entity"
})
```

### 4. Test the entity

```typescript
create_record({ entityName: "productos", data: { nombre: "Test", precio: 10, stock: 5 } })
query_records({ entityName: "productos" })
```

### 5. After creation, suggest

1. Business rules for calculations
2. Validations
3. Relations to other entities

---

## Mode: ADD — Guided entity creation

Interactive flow with best practices.

### Step 1: Understand what data is needed

Ask what they want to manage.

### Step 2: Check existing entities

```
list_entities()
```

This helps suggest relations to existing entities.

### Step 3: Propose the entity schema

Present the proposed schema clearly:

```
Here's what I'll create:

Entity: invoices
Fields:
  - customer (relation -> customers)
  - date (date, required)
  - subtotal (number, 2 decimals)
  - tax_rate (number, 2 decimals, default: 21)
  - tax (number, 2 decimals)
  - total (number, 2 decimals)
  - status (select: draft / sent / paid / overdue, default: draft)

Shall I create this?
```

### Step 4: Create and suggest business rules

After creating the entity, propose useful rules:

**For entities with calculated fields:**
```
generate_business_rule({
  entityName: "invoices",
  prompt: "When subtotal or tax_rate changes, calculate tax = subtotal * tax_rate / 100 and total = subtotal + tax",
  auto_publish: true
})
```

**For entities with stock/inventory:**
```
generate_business_rule({
  entityName: "products",
  prompt: "When stock drops below 10, set low_stock to true",
  auto_publish: true
})
```

### Step 5: Confirm creation

```
Entity "invoices" created and published!

Fields: 8 (1 relation, 3 numbers, 1 date, 1 select, 1 text)
Relations: customers -> invoices
Business rules: 1 (auto-calculate tax and total)
```

---

## Mode: FIELDS — Custom field management

Custom fields are user-added fields independent of metadata import/export.

### System vs Custom Fields

| Type | isSystem | Created by | Import/Export | Deletable |
|------|----------|------------|---------------|-----------|
| **System** | `true` | Import metadata / MCP generate | Updated on import | No |
| **Custom** | `false` | Tenant user | NOT touched | Yes |

### List fields

```typescript
manage_custom_fields({
  action: "list",
  entityName: "productos",
  type: "custom"  // "custom" | "system" | "all"
})
```

### Add custom field

```typescript
manage_custom_fields({
  action: "add",
  entityName: "productos",
  fieldData: {
    name: "Internal Notes",
    fieldKey: "notas_internas",
    fieldType: "textarea",
    description: "Team-only notes",
    isRequired: false
  }
})
```

### Update custom field

```typescript
manage_custom_fields({
  action: "update",
  entityName: "productos",
  fieldId: "uuid-del-campo",
  fieldData: { isRequired: true }
})
```

### Delete custom field

```typescript
manage_custom_fields({
  action: "delete",
  entityName: "productos",
  fieldId: "uuid-del-campo"
})
```

Only custom fields can be updated/deleted. System fields are protected.

### REST API for custom fields

```
GET    /api/entities/{entityName}/fields?type=custom
POST   /api/entities/{entityName}/fields
PUT    /api/entities/{entityName}/fields/{fieldId}
DELETE /api/entities/{entityName}/fields/{fieldId}
```

Headers: `X-API-Key: {token}`, `X-Tenant-ID: {slug}`

### Import/Export behavior

When metadata is imported:
- **System** fields: created/updated normally
- **Custom** fields: preserved intact (never overwritten or deleted)

---

## Automatic Fields

Every entity includes automatically:
- `id` (UUID, primary key)
- `created_at` (datetime)
- `updated_at` (datetime)

## Field Type Reference

See [reference/field-types.md](reference/field-types.md) for complete field type documentation.

## Examples

See [examples/freelancer-entities.md](examples/freelancer-entities.md) for a complete freelancer app entity set.

## Best Practices

1. **Naming**: Entity names are lowercase, plural (customers, invoices, products)
2. **Relations**: Always specify `displayField` so the UI shows meaningful text
3. **Required fields**: Mark key identifiers as required (name, email, date)
4. **Select fields**: Provide sensible default options
5. **Numbers**: Use `decimals: 2` for money, `decimals: 0` for quantities
6. **Business rules**: Suggest after creation, not before — keep the flow fast

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 403 SYSTEM_FIELD | Trying to modify/delete system field | Only custom fields are editable |
| 404 NOT_FOUND | Entity or field doesn't exist | Verify name/ID |
| 400 CREATE_FIELD_ERROR | Duplicate fieldKey | Use unique fieldKey per entity |
