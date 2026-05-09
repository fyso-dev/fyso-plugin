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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = (process.env.FYSO_API_URL ?? 'https://api.fyso.dev').replace(/\/$/, '');
const TENANT_SLUG = process.env.FYSO_TENANT_SLUG ?? '';
const API_KEY = process.env.FYSO_API_KEY ?? '';
const ENTITIES = process.env.FYSO_ENTITIES ?? '';
const EVENTS = process.env.FYSO_EVENTS ?? '';
const AGENT_NAME = process.env.FYSO_AGENT_NAME ?? '';

// Sender gating (#17): only forward message.received from these agents. Empty = allow all.
const ALLOWED_SENDERS_RAW = process.env.FYSO_ALLOWED_SENDERS ?? '';
const ALLOWED_SENDERS: Set<string> | null = ALLOWED_SENDERS_RAW
  ? new Set(ALLOWED_SENDERS_RAW.split(',').map((s) => s.trim()).filter(Boolean))
  : null;

// Resolve agent_id: env var → .fyso-agent file → auto-register
let AGENT_ID = process.env.FYSO_AGENT_ID ?? '';

// 1. Try .fyso-agent file
if (!AGENT_ID) {
  try {
    const agentFile = await Bun.file(`${process.cwd()}/.fyso-agent`).text();
    const agentData = JSON.parse(agentFile);
    if (agentData.agent_id) AGENT_ID = agentData.agent_id;
  } catch {}
}

// 2. Auto-register if we have a name but no ID
if (!AGENT_ID && AGENT_NAME && TENANT_SLUG && API_KEY) {
  console.error(`[fyso-channel] No agent_id found. Auto-registering "${AGENT_NAME}"...`);
  try {
    const regRes = await fetch(`${API_URL}/api/v1/tenants/${TENANT_SLUG}/agents/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ agent_name: AGENT_NAME }),
    });
    if (regRes.ok) {
      const regData = (await regRes.json()) as any;
      const reg = regData.data ?? regData;
      AGENT_ID = reg.agent_id;
      // Write .fyso-agent for next time
      const agentFile = {
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        tenant: TENANT_SLUG,
        registered_at: new Date().toISOString(),
      };
      try {
        await Bun.write(`${process.cwd()}/.fyso-agent`, JSON.stringify(agentFile, null, 2) + '\n');
        console.error(`[fyso-channel] Registered as ${AGENT_ID}, saved .fyso-agent`);
      } catch {
        console.error(`[fyso-channel] Registered as ${AGENT_ID} (could not write .fyso-agent)`);
      }
    } else {
      const body = await regRes.text().catch(() => '');
      console.error(`[fyso-channel] Registration failed (${regRes.status}): ${body}`);
    }
  } catch (err: any) {
    console.error(`[fyso-channel] Registration error: ${err?.message}`);
  }
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
      tools: {},
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
// Reply Tool (#16)
// ---------------------------------------------------------------------------

const REPLY_TOOL = {
  name: 'reply',
  description:
    'Send a message to another agent via the Fyso messaging system. ' +
    'Use this to reply to incoming messages or initiate conversations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      to_agent: { type: 'string', description: 'Recipient agent name or slug' },
      message: { type: 'string', description: 'Message text to send' },
      in_reply_to: { type: 'string', description: 'UUID of the message being replied to (for threading)' },
      subject: { type: 'string', description: 'Optional subject line' },
      priority: { type: 'string', enum: ['normal', 'high', 'urgent'], description: 'Message priority (default: normal)' },
    },
    required: ['to_agent', 'message'],
  },
};

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [REPLY_TOOL],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'reply') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  const { to_agent, message, in_reply_to, subject, priority } = args as any;

  if (!to_agent || !message) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: '`to_agent` and `message` are required' }) }],
      isError: true,
    };
  }

  const body: Record<string, unknown> = {
    from_agent: AGENT_NAME || 'mcp-caller',
    to_agent,
    payload: { message },
  };
  if (in_reply_to) body.in_reply_to = in_reply_to;
  if (subject) body.subject = subject;
  if (priority) body.priority = priority;

  try {
    const res = await fetch(`${API_URL}/api/tenants/${TENANT_SLUG}/agent-messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;

    if (!res.ok || !data.success) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: data.error ?? `HTTP ${res.status}` }) }],
        isError: true,
      };
    }

    const sent = data.data ?? data;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, message_id: sent.id, to_agent: sent.to_agent, priority: sent.priority ?? 'normal' }),
      }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err?.message ?? 'Unknown error' }) }],
      isError: true,
    };
  }
});

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
  if (EVENTS) params.set('events', EVENTS);
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
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: `\u274c Auth failed (${response.status}). Check FYSO_API_KEY and FYSO_TENANT_SLUG.`,
            meta: { event_type: 'error', entity: 'channel', http_status: String(response.status) },
          },
        });
        return;
      }
      if (response.status === 429) {
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: `\u26a0\ufe0f Max connections reached. Close other sessions and retry.`,
            meta: { event_type: 'error', entity: 'channel', http_status: '429' },
          },
        });
      }
      await scheduleReconnect(attempt);
      return;
    }

    // Successful connection
    console.error(`[fyso-channel] SSE connected${AGENT_ID ? ` as ${AGENT_NAME || AGENT_ID}` : ''}`);
    const agent = AGENT_NAME || 'anon';
    const lines = [
      `\u2705 ${agent} online | ${TENANT_SLUG}`,
    ];
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: lines.join('\n'),
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

            // Sender gating (#17): drop message.received from disallowed senders
            if (parsed.event === 'message.received' && ALLOWED_SENDERS) {
              const sender = payload.from_agent ?? '';
              if (!ALLOWED_SENDERS.has(sender)) {
                console.error(`[fyso-channel] Dropped message from unlisted sender: ${sender}`);
                continue;
              }
            }

            // Format message.received events for readability
            if (parsed.event === 'message.received' && payload.message_id) {
              // Fetch thread context
              let thread: Array<{ from: string; subject?: string; payload: any; created_at: string }> = [];
              try {
                thread = await fetchThread(payload.message_id);
                if (thread.length > 0) {
                  payload.thread = thread;
                  payload.thread_length = thread.length;
                }
              } catch {}

              // Build compact header + full payload for Claude
              const pri = payload.priority === 'urgent' ? '\ud83d\udd34' : payload.priority === 'high' ? '\ud83d\udfe0' : '';
              const subj = payload.subject ? ` — ${payload.subject}` : '';
              const header = `\ud83d\udce9 ${payload.from_agent}${subj}${pri ? ' ' + pri : ''}`;

              const lines = [header];

              if (thread.length > 1) {
                lines.push(`\ud83e\uddf5 ${thread.length} msgs in thread`);
                for (const msg of thread) {
                  const text = msg.payload?.message || msg.payload?.text || JSON.stringify(msg.payload);
                  const preview = text.length > 80 ? text.slice(0, 80) + '...' : text;
                  lines.push(`  ${msg.from}: ${preview}`);
                }
              }

              lines.push(JSON.stringify(payload, null, 2));
              content = lines.join('\n');
            } else if (parsed.event === 'connected') {
              // Skip the raw connected event — we already sent a formatted one
              continue;
            } else {
              // Other events: pretty-print JSON
              content = JSON.stringify(payload, null, 2);
            }
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
        content: '\ud83d\udd0c Disconnected. Reconnecting...',
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
