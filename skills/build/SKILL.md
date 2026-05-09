---
name: fyso-build
description: "Execute a planned phase by running MCP operations against the tenant. Creates entities, fields, business rules, publishes, seeds data, and verifies each step. The GSD executor for Fyso."
argument-hint: "phase <N> [plan <M>]"
---

# Fyso Build — GSD Execution Pipeline

You are the **builder orchestrator** for Fyso apps. You execute plans created by `/fyso:plan` by running MCP operations against the tenant.

This is the Fyso-native equivalent of GSD's `execute-phase`.

## Usage

```
/fyso:build phase 1          # Execute all plans in phase 1
/fyso:build phase 2 plan 1   # Execute only plan 1 of phase 2
```

## Execution Flow

### Step 1: Load Context

1. Read `.planning/STATE.md` — current position and tenant info
2. Read `.planning/ROADMAP.md` — phase overview
3. Find plans in `.planning/phases/{phase-name}/`
4. Sort plans by wave number (wave 1 first, then wave 2, etc.)
5. Within each wave, plans can run in parallel

### Step 2: Pre-flight Check

Before executing anything:

1. **Select tenant**: `select_tenant({ tenantSlug: "..." })`
   - If this fails, STOP. The tenant must exist first.

2. **Check current state**: `list_entities()`, `list_business_rules()`
   - Verify the tenant state matches what STATE.md says
   - If entities from a previous phase are missing, STOP and report

3. **Check plan dependencies**:
   - If plan depends on another plan, verify that plan's SUMMARY.md exists
   - If dependency not met, STOP and report

### Step 3: Execute Plans

For each plan (in wave order):

#### 3a. Read the Plan

Read `{phase}-{plan}-PLAN.md` completely. Understand:
- All tasks and their MCP operations
- Verification steps for each task
- Must-haves that must be true at the end

#### 3b. Execute Tasks Sequentially

For each `<task>` in the plan:

1. **Log start**: "Executing Task N: {name}"

2. **Run MCP operations** in the order specified in `<action>`:
   - Always start with `select_tenant` if the plan says so
   - Execute each operation and check the result
   - If an operation fails, apply deviation rules (see below)

3. **Verify**: Run the `<verify>` checks
   - Use MCP tools to query state and confirm
   - If verification fails, attempt to fix and re-verify once
   - If still failing, log the gap and continue to next task

4. **Log completion**: "{done message}"

#### 3c. Deviation Rules

When something goes wrong during execution:

**Rule 1: Business rule test fails**
→ Read the error, adjust the DSL expression, re-create the rule, re-test.
→ Max 2 retries, then log as gap.

**Rule 2: Missing field referenced by a rule**
→ Create the missing field with a sensible default type.
→ Log the deviation in the summary.

**Rule 3: Entity not published but plan assumes it is**
→ Publish the entity first.
→ Log the deviation.

**Rule 4: Schema change on published entity with data**
→ STOP. Do not modify published entities with existing data without user confirmation.
→ Log as blocker.

**Rule 5: Tenant not selected / MCP connection lost**
→ Re-select the tenant and retry the operation once.
→ If still failing, STOP and report.

**Rule 6: Duplicate entity/field/rule name**
→ Check if the existing one matches what the plan needs.
→ If yes, skip creation (idempotent). If no, log as conflict.

### Step 4: Export Snapshot

After all tasks in a plan complete:

```
export_metadata({ tenantId: "..." })
```

Save the exported metadata to `.planning/snapshots/{phase}-{plan}.json`

This is the Fyso equivalent of a git commit — an atomic snapshot of tenant state.

### Step 5: Write Summary

Create `{phase}-{plan}-SUMMARY.md`:

```markdown
---
phase: {phase}
plan: {plan}
status: complete | partial | blocked
executed_at: {timestamp}
---

# Summary: {plan name}

## Completed
- Task 1: {done message}
- Task 2: {done message}
- Task 3: {done message}

## Entities Created/Modified
| Entity | Action | Fields | Rules | Status |
|--------|--------|--------|-------|--------|
| pacientes | created | 9 | 2 | published |
| sesiones | created | 7 | 0 | published |

## Business Rules
| Rule | Entity | Type | Test Result |
|------|--------|------|-------------|
| Validar email | pacientes | validate | pass |
| Calcular edad | pacientes | compute | pass |

## Deviations
- (none, or list deviations from plan)

## Gaps
- (none, or list failed verifications)

## Snapshot
- `.planning/snapshots/{phase}-{plan}.json`
```

### Step 6: Update State

Update `.planning/STATE.md`:
- Current phase/plan position
- Entity status table
- Business rules status table
- Last activity timestamp

### Step 7: Commit to Git

```bash
git add .planning/
git commit -m "feat({phase}-{plan}): {short description of what was built}"
```

### Step 8: Report

After all plans in the phase complete:

```
Phase {N} execution complete.

Results:
  - Plans executed: M/M
  - Entities created: X
  - Business rules created: Y (Z tested)
  - Seed records created: W

Gaps: (none or list)

Next steps:
  - Verify: /fyso:verify phase N
  - Continue: /fyso:plan phase N+1
  - Check state: /fyso:inspect status
```

## Critical Rules

1. **ALWAYS verify tenant selection** before any MCP operation
2. **ALWAYS test business rules** after creating them with `test_business_rule`
3. **NEVER modify published entities with data** without user confirmation
4. **ALWAYS export metadata** after completing a plan
5. **ALWAYS write SUMMARY.md** — even for partial/blocked executions
6. **ALWAYS update STATE.md** after execution
7. **Follow plan order** — don't skip tasks or reorder without good reason
