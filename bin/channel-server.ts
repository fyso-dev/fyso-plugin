#!/usr/bin/env bun
/**
 * Fyso SSE Channel Server
 *
 * Bridges the Fyso SSE event stream into a Claude Code Channel.
 * Runs as a stdio subprocess spawned by Claude Code via --channels.
 *
 * Configuration via environment variables (set by /fyso:listen or manually):
 *   FYSO_API_URL      - Backend URL, defaults to https://app.fyso.dev
 *   FYSO_TENANT_SLUG  - Tenant slug to listen on
 *   FYSO_API_KEY      - Bearer token (API key or JWT)
 *   FYSO_ENTITIES     - Comma-separated entity filter, e.g. "invoices,clients"
 *
 * Claude Code invocation:
 *   claude --dangerously-load-development-channels server:fyso-channel
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = (process.env.FYSO_API_URL ?? 'https://api.fyso.dev').replace(/\/$/, '');
const TENANT_SLUG = process.env.FYSO_TENANT_SLUG ?? '';
const API_KEY = process.env.FYSO_API_KEY ?? '';
const ENTITIES = process.env.FYSO_ENTITIES ?? '';
const AGENT_NAME = process.env.FYSO_AGENT_NAME ?? '';

// Resolve agent_id: env var first, then .fyso-agent file
let AGENT_ID = process.env.FYSO_AGENT_ID ?? '';

if (!AGENT_ID) {
  try {
    const agentFile = await Bun.file(`${process.cwd()}/.fyso-agent`).text();
    const agentData = JSON.parse(agentFile);
    if (agentData.agent_id) AGENT_ID = agentData.agent_id;
  } catch {}
}

console.error(`[fyso-channel] Agent: ${AGENT_ID || 'none (no messaging)'}, cwd: ${process.cwd()}`);

// Reconnect delay starts at 1s and backs off exponentially up to 60s
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

// ---------------------------------------------------------------------------
// MCP Channel Server
// ---------------------------------------------------------------------------

const mcp = new Server(
  { name: 'fyso-channel', version: '1.0.0' },
  {
    capabilities: {
      // This key is what registers the notification listener in Claude Code
      experimental: { 'claude/channel': {} },
    },
    instructions: [
      'You are connected to the Fyso real-time event stream.',
      `Communication tenant: "${TENANT_SLUG || '<not configured>'}". This tenant is ONLY for messaging between agents. Do NOT use it for work (entities, rules, etc). Do NOT use select_tenant with your agent name.`,
      '',
      '## On startup',
      `1. Select the communication tenant: fyso_agents or fyso_auth(action: "select_tenant", tenantSlug: "${TENANT_SLUG}")`,
      AGENT_ID
        ? `2. Check your inbox for pending messages: fyso_agents(action: "inbox", agent_name: "${AGENT_NAME || 'unknown'}")`
        : '2. No agent identity — skip inbox check.',
      '3. Process any pending messages before waiting for new events.',
      '',
      '## Messaging',
      AGENT_ID
        ? [
            `Agent identity: ${AGENT_NAME || 'unknown'} (${AGENT_ID}).`,
            'You will receive message.received events addressed to you.',
            `Reply using: fyso_agents(action: "send_message", to_agent: "<sender>", payload: {message: "your reply"}, in_reply_to: "<original_message_id>")`,
            'IMPORTANT: Use "payload" (object) for message content, NOT "message" (string). The "message" param is for the "run" action only.',
            '',
            '## Threading',
            'When you receive a message with in_reply_to, read the parent to get context:',
            '  fyso_agents(action: "read_message", message_id: "<in_reply_to>")',
            'Follow the in_reply_to chain to reconstruct the full conversation thread before responding.',
          ].join('\n')
        : 'No agent identity configured — messaging events will not arrive. Use /fyso:listen --name <name> to register.',
      '',
      '## Events',
      'Events arrive as <channel source="fyso-channel" entity="..." event_type="..." record_id="..."> tags with a JSON payload.',
      ENTITIES
        ? `Active entity filter: ${ENTITIES}. Only events for these entities will arrive.`
        : 'No entity filter active — all tenant events will arrive.',
    ].join('\n'),
  },
);

// ---------------------------------------------------------------------------
// SSE Client with auto-reconnect
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE event block into { event, data, id }.
 * Returns null if the block contains no data line.
 */
function parseSseBlock(block: string): { event: string; data: string; id?: string } | null {
  let event = 'message';
  let data = '';
  let id: string | undefined;

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += (data ? '\n' : '') + line.slice(5).trim();
    } else if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    }
  }

  if (!data) return null;
  return { event, data, id };
}

/**
 * Fetch a message by ID and follow in_reply_to chain to build thread context.
 * Returns array from oldest to newest. Max 10 messages to avoid runaway chains.
 */
async function fetchThread(messageId: string): Promise<Array<{ from: string; subject?: string; payload: any; created_at: string }>> {
  const thread: Array<{ from: string; subject?: string; payload: any; created_at: string }> = [];
  let currentId: string | null = messageId;
  let depth = 0;

  while (currentId && depth < 10) {
    try {
      const res = await fetch(`${API_URL}/api/tenants/${TENANT_SLUG}/agent-messages/${currentId}/read`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) break;
      const data = await res.json() as any;
      const msg = data.data ?? data.message ?? data;
      thread.unshift({
        from: msg.from_agent,
        subject: msg.subject,
        payload: msg.payload,
        created_at: msg.created_at,
      });
      currentId = msg.in_reply_to ?? null;
    } catch {
      break;
    }
    depth++;
  }

  return thread;
}

/**
 * Build the SSE URL for the given tenant + optional entity filter.
 */
function buildSseUrl(): string {
  const base = `${API_URL}/api/v1/tenants/${TENANT_SLUG}/events/stream`;
  const params = new URLSearchParams();
  if (ENTITIES) params.set('entities', ENTITIES);
  if (AGENT_ID) params.set('agent_id', AGENT_ID);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Connect to the Fyso SSE endpoint and push events into the Claude Code channel.
 * Returns a cleanup function that stops reconnection.
 */
async function startSseBridge(): Promise<() => void> {
  let stopped = false;
  let currentController: AbortController | null = null;

  async function connect(attempt: number): Promise<void> {
    if (stopped) return;

    const url = buildSseUrl();
    console.error(`[fyso-channel] Connecting to SSE (attempt ${attempt}): ${url}`);

    const controller = new AbortController();
    currentController = controller;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${API_KEY}`,
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      if (stopped) return;
      console.error(`[fyso-channel] Fetch error: ${err?.message}`);
      await scheduleReconnect(attempt);
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[fyso-channel] SSE HTTP ${response.status}: ${body}`);
      if (response.status === 401 || response.status === 403) {
        // Auth failure — no point retrying, surface a clear error channel message
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: `Authentication failed (HTTP ${response.status}). Check FYSO_API_KEY and FYSO_TENANT_SLUG configuration.`,
            meta: { event_type: 'error', entity: 'channel', http_status: String(response.status) },
          },
        });
        return; // stop reconnect loop
      }
      await scheduleReconnect(attempt);
      return;
    }

    // Successful connection — notify Claude Code
    console.error(`[fyso-channel] SSE connected${AGENT_ID ? ` as ${AGENT_NAME || AGENT_ID}` : ''}`);
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: `Fyso event stream connected. Listening on tenant "${TENANT_SLUG}"${ENTITIES ? ` (entities: ${ENTITIES})` : ''}${AGENT_ID ? `. Agent: ${AGENT_NAME || AGENT_ID}` : ''}.`,
        meta: { event_type: 'connected', entity: 'channel' },
      },
    });

    // Stream parsing: accumulate lines into blocks separated by blank lines
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const blocks = buffer.split(/\n\n/);
        // Keep the last (potentially incomplete) block in the buffer
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          const parsed = parseSseBlock(block);
          if (!parsed) continue;

          // Skip keepalive / comment-only blocks
          if (parsed.event === 'ping' || parsed.event === 'heartbeat') continue;

          // Extract meta from the JSON payload when possible
          let meta: Record<string, string> = { event_type: parsed.event };
          let content = parsed.data;

          try {
            const payload = JSON.parse(parsed.data);
            // Enrich meta from well-known Fyso event fields
            if (payload.entity) meta.entity = String(payload.entity);
            if (payload.entitySlug) meta.entity = String(payload.entitySlug);
            if (payload.recordId) meta.record_id = String(payload.recordId);
            if (payload.id) meta.record_id = String(payload.id);
            if (payload.action) meta.action = String(payload.action);
            if (payload.tenantSlug) meta.tenant = String(payload.tenantSlug);

            // For message.received events, fetch thread context
            if (parsed.event === 'message.received' && payload.message_id) {
              try {
                const thread = await fetchThread(payload.message_id);
                if (thread.length > 0) {
                  payload.thread = thread;
                  payload.thread_length = thread.length;
                }
              } catch {
                // Thread fetch failed — send without context
              }
            }

            // Pretty-print the payload for Claude readability
            content = JSON.stringify(payload, null, 2);
          } catch {
            // Non-JSON payload — forward as-is
          }

          if (parsed.id) meta.event_id = parsed.id;

          await mcp.notification({
            method: 'notifications/claude/channel',
            params: { content, meta },
          });
        }
      }
    } catch (err: any) {
      if (stopped) return;
      console.error(`[fyso-channel] Stream read error: ${err?.message}`);
    } finally {
      reader.releaseLock();
    }

    if (stopped) return;

    // Connection dropped — reconnect
    console.error('[fyso-channel] SSE connection closed, reconnecting...');
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: 'Fyso event stream disconnected. Reconnecting...',
        meta: { event_type: 'disconnected', entity: 'channel' },
      },
    });
    await scheduleReconnect(attempt);
  }

  async function scheduleReconnect(attempt: number): Promise<void> {
    if (stopped) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
    console.error(`[fyso-channel] Reconnecting in ${delay}ms...`);
    await new Promise((r) => setTimeout(r, delay));
    await connect(attempt + 1);
  }

  // Start connection in background — do not await so server stays responsive
  connect(1).catch((err) => {
    console.error('[fyso-channel] Fatal SSE error:', err);
  });

  return () => {
    stopped = true;
    currentController?.abort();
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (!TENANT_SLUG) {
  console.error('[fyso-channel] ERROR: FYSO_TENANT_SLUG is required. Set it via /fyso:listen or the environment.');
  process.exit(1);
}

if (!API_KEY) {
  console.error('[fyso-channel] ERROR: FYSO_API_KEY is required. Set it via /fyso:listen or the environment.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// Connect to Claude Code over stdio first, then start SSE bridge
await mcp.connect(new StdioServerTransport());
const stopSse = await startSseBridge();

// Graceful shutdown
const shutdown = () => {
  console.error('[fyso-channel] Shutting down...');
  stopSse();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
