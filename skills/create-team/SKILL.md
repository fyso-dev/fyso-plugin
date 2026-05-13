---
name: create-team
description: Create a new Fyso agent team from the plugin. Collects name, prompt, description, and initial agents, persists via the Fyso API, then runs sync-team so the new team is immediately available locally.
user-invocable: true
---

# Create a Fyso Team

Follow these steps to create a new agent team in Fyso and make it available in the current project.

## Config

Reuses the same credentials as `sync-team`:

- `~/.fyso/config.json` -- global credentials (`token`, `tenant_id`, `api_url`)

If the file does not exist, send the user through Step 1 of the `sync-team` skill to set it up, then come back.

## Step 1 -- Confirm credentials

Read `~/.fyso/config.json`. If missing or `token` is empty, tell the user:

> No encontre tus credenciales de Fyso en `~/.fyso/config.json`. Corre primero `/fyso:sync-team` para guardar tu token, despues volve a este wizard.

Stop. Do not proceed without a token.

## Step 2 -- Collect team details

Ask the user, one prompt at a time, in Spanish:

1. **Nombre del equipo** (required). Slug-friendly, e.g. `developer-team`, `support-squad`.
2. **Descripcion corta** (optional). One-line summary shown in the dashboard.
3. **Prompt del equipo** (optional). Shared system prompt for every agent in the team. Tell the user they can paste a multi-line prompt or type `skip`.

Validate that the name is non-empty before continuing. If the user types `skip` for an optional field, store an empty value and move on.

## Step 3 -- List available agents

Fetch existing agents the user can assign to the team:

```
curl -s "https://api.fyso.dev/api/entities/agents/records" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "X-Tenant-ID: fyso-world-fcecd"
```

Records live at `data.items`. Each item exposes at least `id`, `name`, `display_name`, `role`.

Present them as a numbered list, e.g.:

```
1. **Cero** (developer) -- ID: 9f0c...
2. **Unitas** (qa) -- ID: 7ab1...
3. **Vigia** (security) -- ID: 41ed...
```

Ask the user which agents to assign. Accept:

- a comma-separated list of numbers (`1,3`)
- a comma-separated list of agent names
- `none` to create the team with zero agents (they can add later from the dashboard)

If the list is empty, tell the user no agents exist in their account and that they can create the team anyway and assign agents later.

## Step 4 -- Confirm before creating

Show a summary of what is about to be created:

```
Voy a crear el equipo:
  Nombre: {name}
  Descripcion: {description or "(sin descripcion)"}
  Prompt: {first 80 chars of prompt or "(sin prompt)"}
  Agentes: {comma-separated display names, or "ninguno"}
```

Ask for confirmation. Only proceed on an explicit yes.

## Step 5 -- Create the team

POST to the teams endpoint:

```
curl -s -X POST "https://api.fyso.dev/api/entities/teams/records" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "X-Tenant-ID: fyso-world-fcecd" \
  -H "Content-Type: application/json" \
  -d '{"name":"{NAME}","prompt":"{PROMPT}","description":"{DESCRIPTION}"}'
```

Omit `prompt` and `description` from the JSON body when empty. The response contains the new team in `data` (or at the top level) with an `id` field. Save the `id` -- you need it for the next step.

If the API returns a non-2xx response, surface the status code and body snippet to the user, then stop.

## Step 6 -- Assign agents

For each agent ID the user picked, POST one record to `team_agents`:

```
curl -s -X POST "https://api.fyso.dev/api/entities/team_agents/records" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "X-Tenant-ID: fyso-world-fcecd" \
  -H "Content-Type: application/json" \
  -d '{"team":"{TEAM_ID}","agent":"{AGENT_ID}"}'
```

If a single assignment fails, report the failure and keep going with the rest. At the end, tell the user how many succeeded and which (if any) failed.

If the user picked `none`, skip this step.

## Step 7 -- Sync the team locally

The team only exists in the dashboard until it is synced. Run the `sync-team` skill with the newly created `team_id` so the agent files are written to:

- Claude Code: `.claude/agents/{name}.md`
- OpenCode: `.opencode/agents/{name}.md`
- Team prompt: `.claude/CLAUDE.md` and `opencode.md` (between the `<!-- FYSO TEAM START -->` markers)

If the team has zero agents, skip the sync and tell the user the team is empty -- they can add agents in the dashboard and rerun `/fyso:sync-team` later.

## Step 8 -- Report results

Print a final summary:

- Team name and ID
- Description and prompt (or "no configurado")
- Number of agents assigned (and any failures)
- The local files written during sync, if any
- The dashboard URL: `https://agent-ui-sites.fyso.dev/`

## OpenCode shortcut

In OpenCode the same flow is available via the `fyso-create-team` tool. The tool exposes two modes:

- Called without `name`: returns the list of available agents.
- Called with `name` (and optional `prompt`, `description`, `agent_ids`): creates the team in one call.

The skill is preferred when the user wants the wizard experience; the tool is preferred when the agent already has all the inputs in hand.
