---
name: fyso-listen
description: "Activate a real-time event channel that bridges Fyso SSE events into this Claude Code session. Events from your tenant arrive as channel messages and Claude can react to them automatically."
argument-hint: "[--tenant <slug>] [--entities <e1,e2>] [--name <agent>] [--stop]"
disable-model-invocation: true
---

# /fyso:listen — Fyso SSE Channel Bridge

Connect this Claude Code session to the Fyso real-time event stream. Events from your tenant (record created, updated, deleted, rule triggered) arrive as channel messages that Claude can act on immediately. With agent identity configured, agents can also exchange persistent messages through Fyso.

## Requirements

- Claude Code v2.1.80 or later
- `bun` installed (`bun --version` to check, https://bun.sh if not)
- A valid Fyso API key or JWT for the target tenant
- The Fyso plugin installed (`/plugin install fyso@fyso-marketplace`)

## Usage

```
/fyso:listen                              # interactive setup + show launch command
/fyso:listen --tenant acme               # pre-fill tenant slug
/fyso:listen --entities invoices,clients # filter to specific entities
/fyso:listen --name cero                 # register agent identity for messaging
/fyso:listen --stop                      # show how to stop the channel
```

## What This Skill Does

This skill does NOT directly activate the channel (channels require a subprocess spawned by Claude Code at startup). Instead it:

1. Reads existing configuration (tenant slug from current session, API key from env)
2. Validates the configuration is complete
3. Resolves agent identity (from `.fyso-agent` file or `--name` argument)
4. Writes a `.env` file for the channel server if needed
5. Outputs the exact `claude --dangerously-load-development-channels` command to run
6. Optionally writes a helper script `fyso-listen.sh` for convenience

## Instructions

Parse the user's arguments:
- `--tenant <slug>` — target tenant slug (overrides active session tenant)
- `--entities <list>` — comma-separated entity slugs to filter (optional)
- `--name <agent>` — agent name for first-time registration (optional)
- `--stop` — show stop instructions instead of start

### Step 1: Determine configuration

Collect the following values. Use what's already available before asking the user:

| Value | Source (in priority order) |
|-------|---------------------------|
| `FYSO_TENANT_SLUG` | `--tenant` arg → active session tenant (from `select_tenant`) → ask user |
| `FYSO_API_KEY` | env var `FYSO_API_KEY` → ask user |
| `FYSO_API_URL` | env var `FYSO_API_URL` → default `https://app.fyso.dev` |
| `FYSO_ENTITIES` | `--entities` arg → env var `FYSO_ENTITIES` → empty (all events) |
| `FYSO_AGENT_NAME` | `--name` arg → `.fyso-agent` file → omit (anonymous connection) |

### Step 2: Validate

- `FYSO_TENANT_SLUG` must not be empty
- `FYSO_API_KEY` must not be empty
- If either is missing, tell the user what's needed and stop

### Step 3: Find the channel server path

The channel server is `channel-server.ts` inside the Fyso plugin. Locate it with:

```bash
# Try common locations in order
CHANNEL_SERVER=$(
  ls ~/.claude/plugins/cache/fyso-plugins/fyso/*/bin/channel-server.ts 2>/dev/null | head -1 || \
  ls ~/.claude/plugins/*/fyso/packages/mcp-server/src/channel-server.ts 2>/dev/null | head -1 || \
  echo "NOT_FOUND"
)
```

If not found, tell the user: "Could not locate channel-server.ts. Run `/plugin update fyso` to get the latest version."

### Step 4: Write `.mcp.json` in current directory

Create or merge `fyso-channel` into the project's `.mcp.json` (current working directory). If `.mcp.json` already exists, merge the new server entry into `mcpServers` — do NOT overwrite existing servers.

The entry should be:

```json
{
  "mcpServers": {
    "fyso-channel": {
      "command": "bun",
      "args": ["<CHANNEL_SERVER_PATH>"],
      "env": {
        "FYSO_API_URL": "<api_url>",
        "FYSO_TENANT_SLUG": "<tenant_slug>",
        "FYSO_API_KEY": "<api_key>",
        "FYSO_ENTITIES": "<entities or empty>",
        "FYSO_AGENT_NAME": "<agent_name if provided>"
      }
    }
  }
}
```

Only include `FYSO_AGENT_NAME` if a name was provided via `--name` or resolved from `.fyso-agent`.

This ensures Claude Code finds the MCP server when launched from this directory with `--dangerously-load-development-channels server:fyso-channel`.

### Step 5: Output summary

Show the user:

```
Fyso Channel configured

Tenant:   <slug>
Entities: <list or "all">
Agent:    <name or "anonymous">
API URL:  <url>
Config:   .mcp.json (this directory)

To start listening:
  Exit this session, then run from this directory:

  claude --dangerously-load-development-channels server:fyso-channel

Once running, Fyso events will arrive as <channel source="fyso-channel"> messages in your session.
Claude will react to them automatically.

To stop: Ctrl+C in the terminal where the channel is running.
```

### --stop mode

If the user ran `/fyso:listen --stop`, show:

```
To stop the Fyso channel:
  Press Ctrl+C in the terminal where "claude --dangerously-load-development-channels" is running.
  The channel server shuts down gracefully and stops receiving events.

Config file remains at ~/.claude/channels/fyso/.env for next time.
To delete it: rm -rf ~/.claude/channels/fyso/
```

## Agent Identity (v1.38.0+)

Each directory maps to one agent identity. The channel server supports agent registration during the handshake:

- **Existing identity**: If `.fyso-agent` exists in the current directory, the agent reconnects with its saved identity automatically.
- **New registration**: Pass `--name <agent_name>` on first connection. Fyso generates an `agent_id` like `cero-a3f2c1` and saves it to `.fyso-agent`.
- **Anonymous**: If no name is provided and no `.fyso-agent` exists, the agent connects anonymously (CRUD events only, no messaging).

The `.fyso-agent` file contains:

```json
{
  "agent_id": "cero-a3f2c1",
  "agent_name": "cero",
  "tenant": "demo-company",
  "registered_at": "2026-03-22T10:00:00Z"
}
```

## Channel Event Format

Once active, events arrive in the session as:

```xml
<channel source="fyso-channel" event_type="record.created" entity="invoices" record_id="rec_xyz789">
{
  "id": "evt_abc123",
  "type": "record.created",
  "timestamp": "2026-03-21T14:30:00Z",
  "tenant": "demo-company",
  "entity": "invoices",
  "record_id": "rec_xyz789",
  "data": {
    "fields": { "client": "Acme", "total": 1500.00 },
    "triggered_by": "mcp"
  }
}
</channel>
```

For `record.updated` events, the payload includes a `changes` field with previous and new values:

```json
{
  "id": "evt_def456",
  "type": "record.updated",
  "timestamp": "2026-03-21T14:35:00Z",
  "tenant": "demo-company",
  "entity": "invoices",
  "record_id": "rec_xyz789",
  "data": {
    "fields": { "client": "Acme", "total": 1500.00 },
    "changes": { "total": { "old": 1000.00, "new": 1500.00 } },
    "triggered_by": "rest"
  }
}
```

### `triggered_by` values

| Value | Origin |
|-------|--------|
| `mcp` | Operation via MCP tool |
| `rest` | Operation via REST API |
| `ui` | Operation via web UI |
| `rule` | Operation triggered by a business rule |
| `system` | Internal system operation |

Useful for filtering or ignoring events generated by the agent itself (avoid feedback loops).

### Meta attributes

- `event_type` — event name from the SSE stream (e.g. `record.created`, `record.updated`, `record.deleted`)
- `entity` — entity slug the event belongs to
- `record_id` — affected record ID when applicable
- `tenant` — tenant slug

### Connection lifecycle events

- `event_type="connected"` — stream established
- `event_type="disconnected"` — stream dropped, auto-reconnect in progress
- `event_type="error"` — auth or fatal error

## Messaging (v1.38.0+)

With agent identity configured, agents can send and receive persistent messages through Fyso.

### Sending and managing messages

Use the `fyso_agents` MCP tool with these actions:

| Action | Description |
|--------|-------------|
| `send_message` | Send a message to another agent (`to_agent`, `subject`, `payload`, `priority`, `in_reply_to`, `auto_run`) |
| `inbox` | List inbox messages (`agent_name`, `status`: pending/read/all, `limit`, `offset`) |
| `read_message` | Read a message and mark it as `read` (`message_id`) |
| `archive_message` | Mark a message as `archived` (`message_id`) |
| `count_unread` | Count pending messages for an agent (`agent_name`) |

### Receiving messages

Messages from other agents arrive as `message.received` channel events:

```xml
<channel source="fyso-channel" event_type="message.received" entity="_agent_messages" record_id="msg_abc123">
{
  "from_agent": "triage",
  "to_agent": "soporte",
  "subject": "Cliente reclama factura",
  "priority": "high",
  "auto_run": false,
  "triggered_by": "mcp"
}
</channel>
```

### Persistence

Messages are stored in the `_agent_messages` system entity. If the agent is offline when a message arrives, it waits in the inbox until the agent reconnects and reads it. No messages are lost due to disconnection.

### Anti-loop protection

Maximum 5 auto-runs chained per original message. If exceeded, the message remains in `pending` status without auto-run and a `message.chain_limit` event is emitted.

## Error Handling

| Problem | Solution |
|---------|----------|
| Auth failed (401) | Check `FYSO_API_KEY` in `~/.claude/channels/fyso/.env` |
| Tenant not found (404) | Check `FYSO_TENANT_SLUG` |
| Channel not registering | Make sure `bun` is installed and you used `--dangerously-load-development-channels` |
| No events arriving | Verify entity filter isn't too narrow; try without `--entities` |
| "blocked by org policy" | Your Team/Enterprise admin must enable channels at claude.ai/admin-settings |
| Agent name conflict | Another agent with the same name exists; use a different `--name` |
