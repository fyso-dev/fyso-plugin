# Freelancer App - Entity Examples

Complete entity set for a freelancer/consultant business app.

## Clients

```json
{
  "entity": { "name": "clients", "displayName": "Clients", "description": "Client contact information" },
  "fields": [
    { "name": "Name", "fieldKey": "name", "fieldType": "text", "isRequired": true },
    { "name": "Company", "fieldKey": "company", "fieldType": "text" },
    { "name": "Email", "fieldKey": "email", "fieldType": "email", "isRequired": true },
    { "name": "Phone", "fieldKey": "phone", "fieldType": "phone" },
    { "name": "Address", "fieldKey": "address", "fieldType": "text" },
    { "name": "Notes", "fieldKey": "notes", "fieldType": "text" }
  ]
}
```

## Projects

```json
{
  "entity": { "name": "projects", "displayName": "Projects", "description": "Client projects with budget tracking" },
  "fields": [
    { "name": "Name", "fieldKey": "name", "fieldType": "text", "isRequired": true },
    { "name": "Client", "fieldKey": "client", "fieldType": "relation", "isRequired": true, "config": { "entity": "clients", "displayField": "name" } },
    { "name": "Description", "fieldKey": "description", "fieldType": "text" },
    { "name": "Start Date", "fieldKey": "start_date", "fieldType": "date" },
    { "name": "End Date", "fieldKey": "end_date", "fieldType": "date" },
    { "name": "Budget", "fieldKey": "budget", "fieldType": "number", "config": { "decimals": 2 } },
    { "name": "Status", "fieldKey": "status", "fieldType": "select", "config": { "options": ["proposal", "active", "completed", "cancelled"] } }
  ]
}
```

## Invoices

```json
{
  "entity": { "name": "invoices", "displayName": "Invoices", "description": "Client invoices with tax" },
  "fields": [
    { "name": "Invoice Number", "fieldKey": "invoice_number", "fieldType": "text", "isRequired": true, "isUnique": true },
    { "name": "Client", "fieldKey": "client", "fieldType": "relation", "isRequired": true, "config": { "entity": "clients", "displayField": "name" } },
    { "name": "Project", "fieldKey": "project", "fieldType": "relation", "config": { "entity": "projects", "displayField": "name" } },
    { "name": "Date", "fieldKey": "date", "fieldType": "date", "isRequired": true },
    { "name": "Subtotal", "fieldKey": "subtotal", "fieldType": "number", "isRequired": true, "config": { "decimals": 2 } },
    { "name": "Tax Rate", "fieldKey": "tax_rate", "fieldType": "number", "config": { "decimals": 2 } },
    { "name": "Tax", "fieldKey": "tax", "fieldType": "number", "config": { "decimals": 2 } },
    { "name": "Total", "fieldKey": "total", "fieldType": "number", "config": { "decimals": 2 } },
    { "name": "Status", "fieldKey": "status", "fieldType": "select", "config": { "options": ["draft", "sent", "paid", "overdue"] } }
  ]
}
```

## Business Rules

- **Invoices**: When subtotal or tax_rate changes, calculate tax = subtotal * tax_rate / 100 and total = subtotal + tax
- **Projects**: When status changes to completed, set end_date to today if not already set
