import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { listAgents, createTeam, assignAgents } from "./create-team"
import { ApiRequestError, type FysoConfig } from "../config"

const config: FysoConfig = {
  token: "t",
  tenant_id: "tenant",
  api_url: "https://api.test",
}

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("listAgents", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch")
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("normalizes agent records and skips entries without an id", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        data: {
          items: [
            { id: "a1", name: "cero", display_name: "Cero", role: "developer" },
            { name: "ghost" },
            { id: "a2", name: "vigia" },
          ],
        },
      }),
    )

    const result = await listAgents(config)
    expect(result).toEqual([
      { id: "a1", name: "cero", display_name: "Cero", role: "developer" },
      { id: "a2", name: "vigia", display_name: "vigia", role: "assistant" },
    ])
  })

  it("returns an empty array when the API returns no items", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJson({ data: { items: [] } }))
    expect(await listAgents(config)).toEqual([])
  })
})

describe("createTeam", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch")
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("POSTs only the provided fields and returns the created team", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({ data: { id: "team_1", name: "devs", prompt: "hi" } }),
    )

    const team = await createTeam(config, { name: "devs", prompt: "hi" })

    expect(team).toEqual({ id: "team_1", name: "devs", prompt: "hi", description: undefined })
    const call = vi.mocked(globalThis.fetch).mock.calls[0]!
    const init = call[1] as RequestInit
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ name: "devs", prompt: "hi" })
  })

  it("throws when the API response is missing the team id", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJson({ data: {} }))
    await expect(createTeam(config, { name: "x" })).rejects.toThrow(/missing team id/)
  })

  it("surfaces ApiRequestError from the underlying request", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("bad", { status: 422 }))
    await expect(createTeam(config, { name: "x" })).rejects.toBeInstanceOf(ApiRequestError)
  })
})

describe("assignAgents", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch")
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates one team_agents record per agent id and returns their ids", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockJson({ data: { id: "ta_1" } }))
      .mockResolvedValueOnce(mockJson({ data: { id: "ta_2" } }))

    const ids = await assignAgents(config, "team_1", ["agent_a", "agent_b"])
    expect(ids).toEqual(["ta_1", "ta_2"])

    const bodies = vi
      .mocked(globalThis.fetch)
      .mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string))
    expect(bodies).toEqual([
      { team: "team_1", agent: "agent_a" },
      { team: "team_1", agent: "agent_b" },
    ])
  })
})
