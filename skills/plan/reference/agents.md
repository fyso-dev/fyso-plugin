# Agents

AI-powered agents that interact with tenant entities via conversation.

## Prerequisites

Configure an AI provider before creating agents:
```
fyso_ai({ action: "configure_provider", type: "openai", base_url: "https://api.openai.com/v1", api_key: "sk-...", default_model: "gpt-4o-mini", name: "OpenAI" })
```
Supported: OpenAI, Anthropic, Groq, any OpenAI-compatible endpoint.

## Lifecycle

```
fyso_agents({ action: "create", name: "Waiter Bot", slug: "waiter", system_prompt: "...", tools_scope: {...}, fallback_mode: "message" })
fyso_agents({ action: "run", agent_slug: "waiter", message: "Mesa 3 quiere la cuenta", session_id: "optional-uuid" })
fyso_agents({ action: "test", agent_slug: "waiter", message: "..." })  // dry-run, no side effects
fyso_agents({ action: "update", slug: "waiter", system_prompt: "..." })
fyso_agents({ action: "delete", slug: "waiter" })
fyso_agents({ action: "list" })
fyso_agents({ action: "list_templates" })  // pre-built: support, appointments, sales
fyso_agents({ action: "from_template", template_id: "...", name: "My Agent" })
fyso_agents({ action: "list_runs", agent_id: "...", status: "completed" })
fyso_agents({ action: "list_versions", agent_id: "..." })
fyso_agents({ action: "rollback", agent_id: "...", version: 2 })
```

## tools_scope

Maps entity names to allowed operations:
```json
{
  "productos": ["query"],
  "pedidos": ["query", "create", "update"],
  "mesas": ["query", "update"]
}
```
Valid operations: `query`, `create`, `update`, `delete`.

## Model Compatibility

| Model | Tool calling | Notes |
|-------|-------------|-------|
| gpt-4o-mini | Reliable | Recommended for cost/quality balance |
| gpt-4o / gpt-4.1 | Reliable | Higher quality, higher cost |
| claude-sonnet-4-6 | Reliable | Via Anthropic adapter |
| llama-3.3-70b (Groq) | Works | Sometimes sends numbers as strings |
| llama-3.1-8b | Broken | Ignores tools, hallucinates responses |

## Prompt Tips

- Include entity schema in system prompt (field names, types, relations)
- Describe multi-step flows explicitly ("to create an order: 1. create pedido, 2. create detalle_pedido for each item, 3. update mesa estado")
- Don't filter by name in tool calls — fetch all records and match in-context
- Include business logic ("pick smallest available table for party size")
- Keep prompts under 2000 tokens for faster response

## Prompt Versioning

Every `update` creates a new version. Use `list_versions` and `rollback` to manage:
```
fyso_agents({ action: "list_versions", agent_id: "uuid" })
fyso_agents({ action: "rollback", agent_id: "uuid", version: 3 })
```

## Channels

Agents can connect to multiple channels simultaneously:
- Web widget (SSE streaming)
- Telegram (typing indicators)
- Custom channels via integration SDK

## Limitations

- Agent REST endpoint (`/api/agents/{slug}/run`) not accessible with user tokens — use MCP `fyso_agents({ action: "run" })` instead
- No automatic rate limit retry — implement client-side backoff
- Session may corrupt after consecutive tool call errors — start a new session_id
- `fallback_mode: "llm"` requires a configured provider; `"message"` returns static text
