# @fyso/claude-plugin

Build complete business apps from conversation. This plugin extends Claude Code with skills, agents, and reference docs for the Fyso platform.

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skills** | 19 | Slash commands (`/fyso:plan`, `/fyso:build`, `/fyso:ui`, etc.) |
| **Agents** | 5 | Specialized AI agents (architect, designer, builder, verifier, ui-architect) |
| **Reference** | 3-tier | Auto-synced docs: CLAUDE.md (always loaded) → FYSO-REFERENCE.md (1 read) → deep dives |
| **MCP** | 1 | Fyso MCP server for metadata operations |
| **Hooks** | 1 | Auto-sync reference when docs change |

## Installation

### From Marketplace (Recommended)

```bash
# 1. Add the Fyso marketplace
/plugin marketplace add fyso-dev/claude-plugin

# 2. Install the plugin
/plugin install fyso@fyso-plugins
```

### Team Auto-Install

Add to your project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "fyso-plugins": {
      "source": {
        "source": "github",
        "repo": "fyso-dev/claude-plugin"
      }
    }
  },
  "enabledPlugins": {
    "fyso@fyso-plugins": true
  }
}
```

Team members will be prompted to install automatically.

### Manual Install (Legacy)

```bash
bunx @fyso/claude-plugin install
```

## Setup

### 1. Restart Claude Code

After installing, restart Claude Code. Skills are available with `/fyso:` prefix.

### 2. Connect your Fyso account

On first use, the MCP server will open an OAuth flow to connect your Fyso account. No API key needed — authentication is handled automatically.

## Available Skills

### GSD Pipeline (Plan → Build → Verify)

```
/fyso:plan new "Sistema para consultorio dental"
/fyso:plan phase 1
/fyso:build phase 1
/fyso:verify phase 1
```

### UI Generation Pipeline

```
# Option A: AI asks questions
/fyso:ui all

# Option B: AI infers everything
/fyso:ui infer "Panel admin para mi negocio"

# After generating
/fyso:ui audit
```

### Full Skill List

| Skill | Description |
|-------|-------------|
| `/fyso:fyso` | Main orchestrator — routes your request |
| `/fyso:plan` | Design complete apps: requirements, roadmap, phases |
| `/fyso:build` | Execute plans: create entities, rules, data via MCP |
| `/fyso:verify` | Verify tenant matches plan requirements |
| `/fyso:scan` | Scan tenant and generate status report |
| `/fyso:expose` | Create channels and API tools |
| `/fyso:status` | View project status |
| `/fyso:ui plan` | Discovery: ask about objective, roles, style |
| `/fyso:ui infer` | Fast-track: AI infers everything from description |
| `/fyso:ui mockup` | Generate ASCII wireframes for validation |
| `/fyso:ui contracts` | Document API contracts, roles, auth |
| `/fyso:ui build` | Generate React + @fyso/ui code |
| `/fyso:ui audit` | Audit security, domain, permissions, UX |
| `/fyso:new-app` | Wizard for new apps with pre-built templates |
| `/fyso:add-entity` | Create entities with guided prompts |
| `/fyso:entity` | Advanced entity management |
| `/fyso:rules` | Create business rules |
| `/fyso:api` | REST API docs and clients |
| `/fyso:deploy` | Deploy to sites.fyso.dev |

## Documentation Tiers

The plugin uses a 3-tier documentation system for efficient AI context:

| Tier | File | When Loaded | Content |
|------|------|-------------|---------|
| 1 | `CLAUDE.md` | Always (auto) | Fyso mental model in 20 lines |
| 2 | `FYSO-REFERENCE.md` | 1 read per skill | Everything consolidated: types, MCP, DSL, patterns |
| 3 | `skills/*/reference/*.md` | On-demand | Full docs with examples |

Reference auto-syncs via a Claude Code hook when any Tier 3 file changes.

## Development

### Building for Distribution

From the monorepo:

```bash
bun packages/claude-plugin/bin/build.ts
```

This creates a self-contained `dist/` directory with:
- Symlinks resolved to real files
- Skills renamed (strips `fyso-` prefix for clean namespacing)
- All manifests, hooks, and MCP config included

### CLI Commands (Legacy)

```bash
fyso-plugin install       # Install skills, agents, hooks, reference
fyso-plugin status        # Check what's installed
fyso-plugin uninstall     # Remove everything
fyso-plugin sync          # Regenerate FYSO-REFERENCE.md
```

## Requirements

- [Claude Code](https://claude.ai/code) v1.0.33+
- Fyso account at [fyso.dev](https://fyso.dev)

## License

MIT — Fyso Software
