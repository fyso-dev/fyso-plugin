---
name: fyso-release
description: "Deploy your frontend to sites.fyso.dev or publish your app schema to the public catalog."
argument-hint: "[deploy [subdomain] | publish]"
disable-model-invocation: true
---

# Fyso Release — Deploy & Publish

Deploy your frontend to Fyso's static hosting, or publish your app schema to the catalog for others to install.

## Subcommands

```
/fyso:release deploy              # Deploy frontend to sites.fyso.dev
/fyso:release deploy mi-taller    # Deploy with specific subdomain
/fyso:release publish             # Publish app schema to catalog
```

---

## Mode: DEPLOY — Deploy to sites.fyso.dev

### Step 1: Check for existing site

```
list_static_sites()
```

If a site exists, ask if user wants to update or deploy to a new subdomain.

### Step 2: Find build output

Look for common build directories:
- `dist/` (Vite, Astro)
- `out/` (Next.js static export)
- `build/` (Create React App)

If no build output, ask about framework and run build.

### Step 3: Build (if needed)

```bash
bun run build
```

### Step 4: Choose subdomain

Rules: lowercase letters, numbers, hyphens only. Must be unique.

```
Your app will be available at: https://{subdomain}-sites.fyso.dev
```

### Step 5: Deploy

```
deploy_static_site({
  subdomain: "mi-taller",
  path: "/absolute/path/to/dist"
})
```

**Handle two responses:**

**A) Success** (MCP uploaded directly):
```json
{ "success": true, "url": "..." }
```

**CRITICAL:** Ignore the `url` in response. Always construct:
```
Real URL = https://{subdomain}-sites.fyso.dev
```

**B) Shell command** (remote mode, can't access local files):
```json
{ "success": false, "command": "curl -X POST https://..." }
```

Show the curl command to the user. Do NOT run it yourself.

### Step 6: Confirm

```
Deployed! Live at: https://{subdomain}-sites.fyso.dev
To update: run /fyso:release deploy again
```

---

## Mode: PUBLISH — Publish to Catalog

Publish your app schema so other builders can install it as a prebuild template.

### Step 1: Validate

```
list_entities()
```

- No published entities? Stop and suggest creating some first.
- Draft entities? Warn and offer to publish them.

### Step 2: Generate description

```
get_entity_schema({ entityName: "..." })  # For each entity
list_business_rules({ entityName: "..." }) # For each entity
```

Propose a catalog entry:
```
App: "Dental Clinic Manager"
Description: Complete management system for dental clinics...
Entities: patients, treatments, appointments, invoices
Business Rules: 2
Category: Healthcare
Tags: clinic, patients, billing
```

Ask user to confirm or edit.

### Step 3: Export metadata

```
export_metadata({ tenantId: "current-tenant-slug" })
```

Creates a JSON snapshot of the entire app schema (entities, fields, rules).

### Step 4: Report

```
Your app "Dental Clinic Manager" is ready to share!

Any builder can install this app using:
  /fyso:new-app -> select your prebuild

To share manually:
  1. Save the exported metadata JSON
  2. Share with other builders
  3. They import with: import_metadata({ metadata: "...", tenantId: "their-tenant" })

Includes:
  - 4 entities with all fields and validations
  - 2 business rules
  - Ready to use after import
```

### Notes

- Publishing exports schema only, not data (records)
- Business rules are included
- Custom fields are NOT included (only system fields)
- Re-publish anytime to update the catalog entry
