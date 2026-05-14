/**
 * Pure helpers extracted from channel-server.ts so they can be unit tested.
 *
 * channel-server.ts is a top-level Bun script with side effects (env reads,
 * mcp.connect, process.exit) that runs on import — these helpers live here
 * to keep them importable without triggering that startup.
 */

export type SseBlock = { event: string; data: string; id?: string };

export type ThreadMessage = {
  from: string;
  subject?: string;
  payload: any;
  created_at: string;
};

export type FetchThreadOptions = {
  apiUrl: string;
  tenantSlug: string;
  apiKey: string;
  /** Override fetch (mainly for tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Max chain depth before truncation. Defaults to 10. */
  maxDepth?: number;
};

/**
 * Parse a single SSE event block into { event, data, id }.
 * Returns null if the block contains no `data:` line.
 *
 * Per the SSE spec, an absent or empty `event:` field defaults to "message".
 * Lines starting with `:` are comments and ignored.
 */
export function parseSseBlock(block: string): SseBlock | null {
  let event = 'message';
  let data = '';
  let id: string | undefined;

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      // SSE comment line — ignore
      continue;
    }
    if (line.startsWith('event:')) {
      const value = line.slice(6).trim();
      // Empty event field falls back to default per SSE spec
      if (value) event = value;
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
 * Fetch a message by ID and follow the in_reply_to chain to build thread context.
 * Returns oldest-first. Truncates at maxDepth (default 10) and breaks on cycles.
 *
 * Cycle protection: a Set of visited IDs prevents A→B→A loops from producing
 * duplicated thread entries that would corrupt MCP notification context.
 */
export async function fetchThread(
  messageId: string,
  options: FetchThreadOptions,
): Promise<ThreadMessage[]> {
  const { apiUrl, tenantSlug, apiKey, fetchImpl = fetch, maxDepth = 10 } = options;
  const thread: ThreadMessage[] = [];
  const visited = new Set<string>();
  let currentId: string | null = messageId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    try {
      const res = await fetchImpl(
        `${apiUrl}/api/tenants/${tenantSlug}/agent-messages/${currentId}/read`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!res.ok) break;
      const data = (await res.json()) as any;
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
