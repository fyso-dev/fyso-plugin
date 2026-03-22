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

const API_URL = (process.env.FYSO_API_URL ?? 'https://app.fyso.dev').replace(/\/$/, '');
const TENANT_SLUG = process.env.FYSO_TENANT_SLUG ?? '';
const API_KEY = process.env.FYSO_API_KEY ?? '';
const ENTITIES = process.env.FYSO_ENTITIES ?? '';

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
      `Events from tenant "${TENANT_SLUG || '<not configured>'}" arrive as <channel source="fyso-channel" entity="..." event_type="..." record_id="..."> tags.`,
      'Each event carries a JSON payload in the tag body with the record data that changed.',
      'React to events as appropriate: query for more context using fyso_data, alert the user, or take automated action.',
      'No reply tool is needed — this is a one-way event channel.',
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
 * Build the SSE URL for the given tenant + optional entity filter.
 */
function buildSseUrl(): string {
  const base = `${API_URL}/api/v1/tenants/${TENANT_SLUG}/events/stream`;
  if (!ENTITIES) return base;
  return `${base}?entities=${encodeURIComponent(ENTITIES)}`;
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
    console.error('[fyso-channel] SSE connected');
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: `Fyso event stream connected. Listening on tenant "${TENANT_SLUG}"${ENTITIES ? ` (entities: ${ENTITIES})` : ''}.`,
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
