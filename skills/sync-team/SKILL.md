---
name: sync-team
description: Sync a Fyso agent team to local agent directories. Downloads agent definitions and creates files for Claude Code and OpenCode.
user-invocable: true
---

# Sync Fyso Team Agents

Follow these steps exactly to sync a Fyso team's agents into local agent directories and the team prompt into the project instructions file.

## Platform detection

This skill outputs files for **both** supported platforms:

| Platform | Agent files | Team prompt | Instructions |
|----------|------------|-------------|--------------|
| **Claude Code** | `.claude/agents/{name}.md` | `.claude/CLAUDE.md` | Frontmatter-based agents |
| **OpenCode** | `.opencode/commands/agents/{name}.md` | `opencode.md` | Markdown command files |

Always generate output for **both** platforms so the project works regardless of which coding agent the user runs.

## Config structure

This plugin uses two config files:

- `~/.fyso/config.json` — **global** (user credentials, shared across all projects)
- `.fyso/team.json` — **local** (team info, per project directory)

## Step 1 — Get the API key

First, check if a saved key exists at `~/.fyso/config.json`. If it does, read it and use the stored `token` and `tenant_id` values. Tell the user you found saved credentials and ask if they want to use them or enter new ones.

If no saved config exists, ask the user for their **Token** (Bearer token for API access).

Tell the user:

> Para obtener tu token, anda a https://agent-ui-sites.fyso.dev/ , ingresa con tu email y contrasena, y copia el token que aparece en pantalla.

The tenant ID is always `fyso-world-fcecd`. Do NOT ask the user for it.

The API URL is always `https://api.fyso.dev`. Do NOT ask the user for it.

## Step 2 — Save global credentials

Save to `~/.fyso/config.json` (global, user-level):

```bash
mkdir -p ~/.fyso
```

Write the file with the Write tool:

```json
{
  "token": "{TOKEN}",
  "tenant_id": "fyso-world-fcecd",
  "api_url": "https://api.fyso.dev",
  "user_email": "{EMAIL_IF_KNOWN}",
  "saved_at": "{ISO_TIMESTAMP}"
}
```

If you can validate the token by calling `GET /api/auth/me`, do it and save the `user_email`. If the endpoint returns an error, skip it and save without email.

## Step 3 — List teams

Fetch all teams:

```
curl -s "https://api.fyso.dev/api/entities/teams/records" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "X-Tenant-ID: fyso-world-fcecd"
```

Parse the JSON response. The records are in `data.items`. Each team has at least `id`, `name`, and optionally `prompt`.

## Step 4 — Let the user pick a team

Present the list of teams to the user in a numbered list, showing each team's name. Ask them to pick one by number or name. Wait for their response before continuing.

Save the selected team info to `.fyso/team.json` in the **current working directory** (local, per project):

```bash
mkdir -p .fyso
```

```json
{
  "team_id": "{TEAM_ID}",
  "team_name": "{TEAM_NAME}",
  "synced_at": "{ISO_TIMESTAMP}"
}
```

## Step 5 — Write team prompt

If the selected team has a `prompt` field (non-empty), write it to **both** instruction files:

### Claude Code — `.claude/CLAUDE.md`

If the file already exists, replace the section between `<!-- FYSO TEAM START -->` and `<!-- FYSO TEAM END -->` markers. If no markers exist, append the section at the end.

```markdown
<!-- FYSO TEAM START -->
{team prompt content}
<!-- FYSO TEAM END -->
```

### OpenCode — `opencode.md`

Same marker-based approach. If the file already exists, replace between markers. If not, append.

```markdown
<!-- FYSO TEAM START -->
{team prompt content}
<!-- FYSO TEAM END -->
```

If the team has no prompt, skip this step and inform the user.

## Step 6 — Fetch team agents

Using the selected team's `id`, fetch the agents assigned to that team:

```
curl -s "https://api.fyso.dev/api/entities/team_agents/records?resolve=true&filter.team={TEAM_ID}" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "X-Tenant-ID: fyso-world-fcecd"
```

The response contains records where each entry has an `_agent` field (resolved to a full agent object because of `resolve=true`). Extract the agent details from each record. Key fields on each agent:

- `name` — slug/identifier
- `display_name` — human-readable name
- `role` — the agent's role (developer, qa, reviewer, coordinator, writer, security, etc.)
- `soul` — the agent's soul text (personality and principles)
- `system_prompt` — the agent's system prompt (instructions, rules, workflow)

If any field is missing, use a sensible default (empty string for text fields, "assistant" for role).

## Step 7 — Clean existing agent files

Before creating new files, remove any existing agent files that will be overwritten:

```bash
# Claude Code
rm -f .claude/agents/{name}.md
# OpenCode
rm -f .opencode/commands/agents/{name}.md
```

This ensures a clean sync without stale data from previous runs.

## Step 8 — Create agent files

Create agent files for **both** platforms.

### 8a — Claude Code agents

```bash
mkdir -p .claude/agents
```

For each agent, create `.claude/agents/{name}.md`:

```markdown
---
name: {name}
description: {role} -- {display_name}. {first_line_of_soul}
tools: Read, Write, Edit, Bash, Grep, Glob
color: {color}
---

# {display_name}

**Role:** {role}

## Soul
{soul}

## System Prompt
{system_prompt}
```

### 8b — OpenCode commands

```bash
mkdir -p .opencode/commands/agents
```

For each agent, create `.opencode/commands/agents/{name}.md`. OpenCode commands are plain markdown (no frontmatter) that get sent as a prompt when invoked via `Ctrl+K`:

```markdown
# {display_name}

You are **{display_name}**, a specialized agent with the role of **{role}**.

## Soul
{soul}

## System Prompt
{system_prompt}
```

### Common rules for both formats

IMPORTANT: Include the FULL content of `soul` and `system_prompt` fields. Do NOT truncate, summarize, or abbreviate them. These are the agent's complete instructions and must be preserved exactly as received from the API.

Map the `color` field (Claude Code only) based on the agent's role:

| Role contains | Color  |
|---------------|--------|
| developer     | green  |
| qa or tester  | yellow |
| reviewer      | purple |
| coordinator   | blue   |
| writer        | cyan   |
| security      | red    |
| triage        | orange |
| (anything else) | gray |

The match should be case-insensitive and partial (e.g. "Senior Developer" matches "developer" and gets green).

For `first_line_of_soul`: take the first non-empty line of the `soul` field, trimmed. If soul is empty, use the display_name instead.

## Step 9 — Report results

After creating all files, print a summary:

- Whether the team prompt was written to `.claude/CLAUDE.md` and `opencode.md`
- How many agent files were created (for each platform)
- The full path of each file created
- That global credentials were saved to `~/.fyso/config.json`
- That team info was saved to `.fyso/team.json`
- A reminder that the user can now use these agents:
  - **Claude Code**: as subagents via the Agent tool or by referencing them
  - **OpenCode**: via `Ctrl+K` → `project:agents:{name}`

If no agents were found for the selected team, inform the user and suggest they check the team configuration in the Fyso dashboard at https://agent-ui-sites.fyso.dev.
