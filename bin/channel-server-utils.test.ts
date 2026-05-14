import { describe, it, expect, vi } from 'vitest';
import { parseSseBlock, fetchThread } from './channel-server-utils';

// ---------------------------------------------------------------------------
// parseSseBlock
// ---------------------------------------------------------------------------

describe('parseSseBlock', () => {
  it('parses a block with event, data and id', () => {
    const block = 'event: message.received\ndata: {"hello":"world"}\nid: abc-123';
    expect(parseSseBlock(block)).toEqual({
      event: 'message.received',
      data: '{"hello":"world"}',
      id: 'abc-123',
    });
  });

  it('returns null when the block has no data line', () => {
    const block = 'event: ping\nid: 42';
    expect(parseSseBlock(block)).toBeNull();
  });

  it('concatenates multiple data lines with \\n', () => {
    const block = 'event: message\ndata: line1\ndata: line2\ndata: line3';
    const parsed = parseSseBlock(block);
    expect(parsed).not.toBeNull();
    expect(parsed!.data).toBe('line1\nline2\nline3');
  });

  it('keeps the default "message" event when event: line is empty', () => {
    const block = 'event: \ndata: payload';
    const parsed = parseSseBlock(block);
    expect(parsed).not.toBeNull();
    expect(parsed!.event).toBe('message');
  });

  it('ignores SSE comment lines starting with ":"', () => {
    const block = ': this is a comment\n:another comment\ndata: real-data';
    const parsed = parseSseBlock(block);
    expect(parsed).not.toBeNull();
    expect(parsed!.event).toBe('message');
    expect(parsed!.data).toBe('real-data');
  });

  it('does not pick up event/data prefixes inside comment lines', () => {
    // ":event: spoof" starts with ":" so it must be ignored, not parsed as event
    const block = ':event: spoof\ndata: ok';
    const parsed = parseSseBlock(block);
    expect(parsed!.event).toBe('message');
    expect(parsed!.data).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// fetchThread
// ---------------------------------------------------------------------------

type StoredMessage = {
  id: string;
  from_agent: string;
  subject?: string;
  payload: any;
  created_at: string;
  in_reply_to?: string | null;
};

function makeFetchImpl(
  store: Record<string, StoredMessage>,
  opts: { failingIds?: Set<string> } = {},
): typeof fetch {
  const failingIds = opts.failingIds ?? new Set<string>();
  return vi.fn(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const m = url.match(/agent-messages\/([^/]+)\/read/);
    const id = m ? m[1] : '';
    if (failingIds.has(id)) {
      return new Response('boom', { status: 500 });
    }
    const msg = store[id];
    if (!msg) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ data: msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const baseOpts = {
  apiUrl: 'https://api.test',
  tenantSlug: 'acme',
  apiKey: 'k',
};

describe('fetchThread', () => {
  it('walks a 3-message linear chain and returns oldest-first', async () => {
    const store: Record<string, StoredMessage> = {
      A: { id: 'A', from_agent: 'alice', payload: { message: 'hi' }, created_at: '2026-01-01T00:00:00Z', in_reply_to: null },
      B: { id: 'B', from_agent: 'bob', payload: { message: 'hello' }, created_at: '2026-01-01T00:01:00Z', in_reply_to: 'A' },
      C: { id: 'C', from_agent: 'alice', payload: { message: 'how are you' }, created_at: '2026-01-01T00:02:00Z', in_reply_to: 'B' },
    };

    const thread = await fetchThread('C', { ...baseOpts, fetchImpl: makeFetchImpl(store) });

    expect(thread.map((m) => m.from)).toEqual(['alice', 'bob', 'alice']);
    expect(thread.map((m) => m.payload.message)).toEqual(['hi', 'hello', 'how are you']);
  });

  it('breaks on a circular chain (A→B→A) without producing duplicates', async () => {
    // Cycle: A.in_reply_to = B, B.in_reply_to = A
    const store: Record<string, StoredMessage> = {
      A: { id: 'A', from_agent: 'alice', payload: { message: 'a' }, created_at: '2026-01-01T00:00:00Z', in_reply_to: 'B' },
      B: { id: 'B', from_agent: 'bob', payload: { message: 'b' }, created_at: '2026-01-01T00:01:00Z', in_reply_to: 'A' },
    };
    const fetchImpl = makeFetchImpl(store);

    const thread = await fetchThread('A', { ...baseOpts, fetchImpl });

    // Each message must appear at most once
    const ids = thread.map((m) => `${m.from}:${m.payload.message}`);
    expect(new Set(ids).size).toBe(ids.length);
    // And we should have walked exactly the two unique nodes
    expect(thread).toHaveLength(2);
    expect(thread.map((m) => m.from).sort((a, b) => a.localeCompare(b))).toEqual(['alice', 'bob']);
    // Cycle detection should stop the loop early — well below the depth cap
    expect((fetchImpl as any).mock.calls.length).toBe(2);
  });

  it('stops the chain when the HTTP response is not ok', async () => {
    const store: Record<string, StoredMessage> = {
      A: { id: 'A', from_agent: 'alice', payload: { message: 'a' }, created_at: '2026-01-01T00:00:00Z', in_reply_to: null },
      B: { id: 'B', from_agent: 'bob', payload: { message: 'b' }, created_at: '2026-01-01T00:01:00Z', in_reply_to: 'A' },
    };
    // Make the first read (B) fail — no thread should be returned
    const fetchImpl = makeFetchImpl(store, { failingIds: new Set(['B']) });

    const thread = await fetchThread('B', { ...baseOpts, fetchImpl });
    expect(thread).toEqual([]);
  });

  it('truncates a chain that exceeds maxDepth', async () => {
    // Build a 15-deep linear chain m14 → m13 → ... → m0
    const store: Record<string, StoredMessage> = {};
    for (let i = 0; i < 15; i++) {
      store[`m${i}`] = {
        id: `m${i}`,
        from_agent: `agent-${i}`,
        payload: { message: `msg-${i}` },
        created_at: `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        in_reply_to: i === 0 ? null : `m${i - 1}`,
      };
    }
    const fetchImpl = makeFetchImpl(store);

    const thread = await fetchThread('m14', { ...baseOpts, fetchImpl });
    // Default maxDepth = 10
    expect(thread).toHaveLength(10);
    expect((fetchImpl as any).mock.calls.length).toBe(10);
  });
});
