---
name: fyso-inspect
description: "Inspect your Fyso tenant state. Quick status dashboard, full tenant scan, or deep audit with severity levels and actionable fixes."
argument-hint: "[status [--live] | scan [tenant-slug] | audit [security|practices|integrity|consistency|all]]"
---

# Fyso Inspect — Tenant Observability

One command for all tenant observability: quick status checks, full discovery scans, and deep security/health audits.

## Subcommands

```
/fyso:inspect status             # Fast: read STATE.md (offline)
/fyso:inspect status --live      # Fast + query real tenant to compare
/fyso:inspect scan               # Full: map all entities, rules, channels
/fyso:inspect scan mi-tenant     # Full: scan specific tenant
/fyso:inspect audit              # Deep: all 4 audit dimensions
/fyso:inspect audit security     # Deep: channel exposure, permissions
/fyso:inspect audit practices    # Deep: naming, missing rules, bad patterns
/fyso:inspect audit integrity    # Deep: broken relations, orphans, drafts
/fyso:inspect audit consistency  # Deep: plan vs tenant state mismatches
```

---

## Mode: STATUS — Quick Project Dashboard

Read `.planning/STATE.md` and `.planning/ROADMAP.md` and display:

```markdown
# Project Status: {app-name}

## Position
- **Tenant:** {slug}
- **Current Phase:** {phase-name}
- **Current Plan:** {plan-id}
- **Last Activity:** {date}

## Roadmap Progress
| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | Core entities | 4 | DONE |
| 2 | Business rules | 3 | IN PROGRESS (2/3) |
| 3 | Channels | 2 | PENDING |

## Entities ({count})
| Entity | Status | Fields | Rules | Records |
|--------|--------|--------|-------|---------|
| pacientes | published | 9 | 2 | 15 |

## Next Steps
- {Based on current position, suggest the next action}
```

### Live Mode (`--live`)

Everything from offline mode, plus:

1. Select tenant and query actual state
2. Compare planned (STATE.md) vs actual (tenant):
   - Entities in plan but not tenant → MISSING
   - Entities in tenant but not plan → UNPLANNED
   - Published entities still in draft → DRIFT

```markdown
## Drift Report
| Item | Planned | Actual | Status |
|------|---------|--------|--------|
| pacientes | published | published | OK |
| facturas | published | draft | DRIFT |

### Recommendation
- Publish facturas: `publish_entity({ entityName: "facturas" })`
```

### When to use STATUS
- **Start of session**: Quick context recovery
- **After a build**: See what changed
- **Before planning next phase**: Know where you stand

---

## Mode: SCAN — Full Tenant Discovery

The Fyso equivalent of `map-codebase` — maps entities, fields, rules, and channels.

### Scan Flow

#### Step 1: Connect

```
select_tenant({ tenantSlug: "..." })
```

#### Step 2: Discover Entities

```
list_entities({ include_drafts: true })
```

For each entity:
```
get_entity_schema({ entityName: "..." })
```

Collect: name, status, field count, field types, required/unique fields, relations.

#### Step 3: Discover Business Rules

For each entity:
```
list_business_rules({ entityName: "..." })
get_business_rule({ entityName: "...", ruleId: "..." })
```

Collect: rule name, type, trigger, status, DSL content.

#### Step 4: Count Records

For each published entity:
```
query_records({ entityName: "...", limit: 1 })
```

Get total record count from pagination metadata.

#### Step 5: Discover Channels

```
search_channels({ query: "" })
get_channel_tools({ channelId: "..." })
```

#### Step 6: Generate Report

```markdown
# Tenant Scan: {slug}

**Scanned:** {timestamp}

## Entities ({count})
| Entity | Status | Fields | Rules | Records |
|--------|--------|--------|-------|---------|
| pacientes | published | 9 | 2 | 15 |

### pacientes (published, 9 fields, 2 rules, 15 records)
| Field | Type | Required | Unique | Default |
|-------|------|----------|--------|---------|
| nombre | text | yes | no | — |

Rules:
  - **Validar email** (validate, before_save) — Published

## Health Check
- Entities: {X} published, {Y} draft
- Rules: {A} published, {B} draft
- Data: {D} total records
- Channels: {E} active
```

#### Step 7: Update STATE.md (Optional)

If `.planning/STATE.md` exists, offer to update it with scan results.

### When to use SCAN
- **Before starting a new project** — see what's already in the tenant
- **After a build** — quick check that everything was created
- **Onboarding** — understand an existing tenant you didn't build

---

## Mode: AUDIT — Deep Health & Security Audit

### Step 1: Connect and Scan

Build a complete in-memory map of the tenant (same as SCAN mode) before running checks.

### Dimension 1: SECURITY

| Check | What to Look For | Severity |
|-------|-----------------|----------|
| Public channels with sensitive data | Channels exposing PII (email, DNI, phone) with public access | CRITICAL |
| Overly permissive channel tools | DELETE or bulk operations without role restriction | HIGH |
| No auth on write operations | Create/update/delete tools with no role requirement | HIGH |
| Rules that bypass validation | Transform rules overwriting validated fields | HIGH |
| Rules in draft on published entities | Critical business logic not running | HIGH |
| Infinite loops | Compute rule A triggers rule B triggers rule A | HIGH |

### Dimension 2: BAD PRACTICES

| Check | What to Look For | Severity |
|-------|-----------------|----------|
| Entities with no required fields | Records can be created empty | HIGH |
| No unique constraint on natural keys | email, dni, codigo without unique | HIGH |
| Boolean fields without defaults | Reads as null, not false | MEDIUM |
| Text fields for structured data | telefono/email typed as text instead of phone/email | MEDIUM |
| Relation without display field | UI won't show meaningful text | MEDIUM |
| Entities with no description | Makes maintenance harder | LOW |
| Mixed languages in naming | clientes + orders | LOW |

### Dimension 3: DATA INTEGRITY

| Check | What to Look For | Severity |
|-------|-----------------|----------|
| Broken relation targets | Relation pointing to non-existent entity | CRITICAL |
| Draft entity referenced by published entity | Published entity relates to draft | HIGH |
| Draft entity with records | Data in limbo | HIGH |
| Published entity with 0 records | Possibly unseeded setup entity | LOW |

### Dimension 4: CONSISTENCY

| Check | What to Look For | Severity |
|-------|-----------------|----------|
| Entity in plan but not tenant | REQUIREMENTS.md defines it but doesn't exist | HIGH |
| Entity in tenant but not plan | Exists but not in any planning doc | MEDIUM |
| Phase marked done but entities draft | STATE.md says complete but entity still draft | HIGH |
| STATE.md out of sync | Doesn't match actual tenant state | MEDIUM |

### Step 2: Generate Report

Write `.planning/AUDIT.md`:

```markdown
# Fyso Tenant Audit: {slug}

**Date:** {date}
**Scope:** {full / security / practices / integrity / consistency}

## Summary
| Dimension | Critical | High | Medium | Low |
|-----------|----------|------|--------|-----|
| Security | {n} | {n} | {n} | {n} |
| Bad Practices | {n} | {n} | {n} | {n} |
| Data Integrity | {n} | {n} | {n} | {n} |
| Consistency | {n} | {n} | {n} | {n} |
| **TOTAL** | **{n}** | **{n}** | **{n}** | **{n}** |

## Critical Issues
### [SECURITY] Public channel exposes PII
- **Where:** Channel `api` -> tool `list_patients`
- **Problem:** Tool has `roles: ['public']` and returns sensitive fields
- **Fix:** Restrict to `roles: ['member', 'admin']`
- **Effort:** 5 min

## Passed Checks
- All relation fields point to existing entities
- Consistent naming convention
```

### Step 3: Present Results

Show concise summary inline. If user wants fixes, apply them using MCP operations.

### Scope by Subcommand

| Subcommand | Dimensions | Focus |
|------------|------------|-------|
| `audit` (full) | All 4 | Everything |
| `audit security` | Security | Channels, rules, permissions |
| `audit practices` | Bad Practices | Data model, rules, naming |
| `audit integrity` | Data Integrity | Relations, orphans, draft/published |
| `audit consistency` | Consistency | Plan vs tenant, STATE.md accuracy |

---

## Reference

- `FYSO-REFERENCE.md` — Field types, MCP operations, DSL syntax, limitations
- Run `/fyso:inspect scan` first if you want a full tenant map before auditing
