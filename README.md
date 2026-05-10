# @fyso/plugin

Universal Fyso plugin for AI coding agents. Build complete business apps from conversation using the Fyso BaaS platform.

**Works with:** Claude Code, OpenCode

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skills** | 16 | Slash commands (`/fyso:plan`, `/fyso:build`, etc.) — shared across both platforms |
| **Agents** | 5 | Specialized subagents (architect, designer, builder, verifier, ui-architect) |
| **Team Sync** | 1 | Sync Fyso agent teams to local directories |
| **Tracking** | hooks | Session tracking, agent dispatch, heartbeat |
| **Reference** | 3-tier | Auto-synced docs for the Fyso platform |
| **MCP** | 10 | Fyso MCP server: 10 grouped tools with 80+ actions |

## Installation

### Claude Code

#### From Marketplace (Recommended)

```bash
/plugin marketplace add fyso-dev/fyso-plugin
/plugin install fyso@fyso-plugins
```

#### Team Auto-Install

Add to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "fyso-plugins": {
      "source": {
        "source": "github",
        "repo": "fyso-dev/fyso-plugin"
      }
    }
  },
  "enabledPlugins": {
    "fyso@fyso-plugins": true
  }
}
```

### OpenCode

Run the setup command in your project directory:

**macOS / Linux:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/fyso-dev/fyso-plugin/main/setup-opencode.sh)
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/fyso-dev/fyso-plugin/main/setup-opencode.ps1 | iex
```

This automatically:
- Copies agents to `.opencode/agents/` (5 subagents)
- Copies skills to `.opencode/skills/` (16 skills)
- Copies `FYSO-REFERENCE.md` to your project
- Updates `opencode.json` with the plugin and Fyso MCP server

Skills are available via the `skill` tool, agents via `@` mentions.

## Setup

### 1. Restart your coding agent

After installing, restart Claude Code or OpenCode. Skills become available immediately.

### 2. Connect your Fyso account

On first use, the MCP server opens an OAuth flow to connect your Fyso account.

### 3. Sync your team (optional)

- **Claude Code:** `/fyso:sync-team`
- **OpenCode:** ask the agent to use the `fyso-sync-team` tool, or invoke the `sync-team` skill

## Available Skills

### GSD Pipeline (Plan, Build, Verify)

```
/fyso:plan new "Dental clinic ERP"
/fyso:plan phase 1
/fyso:build phase 1
/fyso:verify phase 1
```

### UI Generation Pipeline

```
/fyso:ui all
/fyso:ui infer "Admin panel for my business"
/fyso:ui audit
```

### Full Skill List

All 16 skills are top-level slash commands. Several skills accept subcommands (shown in the second column).

| Skill | Subcommands | Description |
|-------|-------------|-------------|
| `fyso` | — | Main orchestrator -- routes your request |
| `plan` | `new`, `phase` | Design complete apps: requirements, roadmap, phases |
| `build` | `phase` | Execute plans: create entities, rules, data via MCP |
| `verify` | `phase` | Verify tenant matches plan requirements |
| `inspect` | `status`, `scan`, `audit` | Tenant observability: status dashboard, full scan, deep audit |
| `entity` | `create`, `add`, `list`, `modify`, `fields` | Manage entities and their fields (incl. custom fields) |
| `rules` | — | Create business rules |
| `ui` | `plan`, `infer`, `mockup`, `contracts`, `build`, `audit` | UI generation pipeline: discovery, mockups, contracts, code |
| `api` | `expose`, `spec`, `examples`, `client` | Channels for agents + REST API docs and clients |
| `setup` | `init`, `mcp` | Initialize a new project and configure MCP |
| `release` | `deploy`, `publish` | Deploy frontend to sites.fyso.dev or publish to catalog |
| `new-app` | — | Wizard for new apps with pre-built templates |
| `listen` | — | Real-time data monitoring |
| `test` | — | Test runner for rules |
| `welcome` | — | Guided onboarding |
| `sync-team` | — | Sync Fyso agent teams to local directories |

## Agents

Five specialized subagents with focused MCP access:

| Agent | Role |
|-------|------|
| **architect** | Analyzes requirements, proposes entity schemas |
| **designer** | Plans roadmaps and phases |
| **builder** | Executes MCP operations |
| **verifier** | Validates tenant state against plans |
| **ui-architect** | Generates React + @fyso/ui frontends |

- **Claude Code**: agents are in `agents/` (used via Agent tool)
- **OpenCode**: agents are in `.opencode/agents/` (used via `@architect`, `@builder`, etc.)

## Team Sync

Sync agent teams defined in Fyso to your local environment:

1. Run sync-team
2. Enter your API token from https://agent-ui-sites.fyso.dev/
3. Pick a team
4. Agent files are created for both platforms:
   - Claude Code: `.claude/agents/{name}.md`
   - OpenCode: `.opencode/agents/{name}.md`

## Tracking

Session lifecycle hooks track usage and send events to the Fyso API:

- **Session start/stop** with token consumption summary
- **Agent dispatch** tracking with token breakdown
- **Heartbeat** every 5 minutes with activity summary and cost estimate

**Claude Code**: via bash hooks in `hooks/hooks.json`
**OpenCode**: via the `@fyso/opencode-plugin` npm package (TypeScript hooks)

Tracking requires `~/.fyso/config.json` credentials. Without them, hooks exit silently.

## Plugin Structure

```
fyso-plugin/
+-- .claude-plugin/          # Claude Code plugin manifest
+-- skills/                  # Shared skills (SKILL.md files)
+-- agents/                  # Claude Code agents
+-- hooks/                   # Claude Code hooks (bash)
+-- .opencode/
|   +-- agents/              # OpenCode agents (markdown)
|   +-- skills/              # Symlinks to shared skills/
+-- opencode-plugin/         # OpenCode plugin package (TypeScript)
|   +-- src/
|   |   +-- index.ts         # Plugin entry: hooks + sync-team tool
|   |   +-- tracking.ts      # Session tracking
|   |   +-- config.ts        # Fyso config reader
|   |   +-- tools/
|   |       +-- sync-team.ts # Team sync logic
|   +-- package.json         # @fyso/opencode-plugin
+-- FYSO-REFERENCE.md        # Consolidated platform reference
+-- README.md
```

## MCP Tools (v2.0)

The plugin connects to Fyso's MCP server via OAuth. Ten grouped tools:

| Tool | Actions | Purpose |
|------|---------|---------|
| `fyso_data` | 6 | Records CRUD, bookings, scheduling |
| `fyso_schema` | 11 | Entities, fields, presets |
| `fyso_rules` | 7 | Business rules with DSL, testing, logs |
| `fyso_auth` | 13 | Users, roles, tenants, invitations |
| `fyso_views` | 4 | Filtered entity views |
| `fyso_knowledge` | 3 | Knowledge base search, docs search |
| `fyso_deploy` | 5 | Static sites, custom domains, CI/CD tokens |
| `fyso_meta` | 8 | API docs, metadata, secrets, usage, feedback |
| `fyso_agents` | 11 | AI agents: create, run, version, templates |
| `fyso_ai` | 10 | Multi-provider AI, prompt templates, call logs |

## Requirements

- [Claude Code](https://claude.ai/code) v1.0.33+ **or** [OpenCode](https://opencode.ai)
- Fyso account at [fyso.dev](https://fyso.dev)

## License

MIT -- Fyso Software
