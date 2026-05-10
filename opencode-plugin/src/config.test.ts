import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { apiRequest, ApiRequestError, type FysoConfig } from "./config"

const config: FysoConfig = {
  token: "t",
  tenant_id: "tenant",
  api_url: "https://api.test",
}

describe("apiRequest response validation", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("throws ApiRequestError with the status code on non-ok responses", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(apiRequest(config, "GET", "/api/entities/teams/records")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 401,
    })
  })

  it("includes a body snippet truncated to 500 chars", async () => {
    const longBody = "x".repeat(800)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(longBody, { status: 500 }),
    )

    let caught: unknown
    try {
      await apiRequest(config, "POST", "/api/entities/tracking/records", { foo: 1 })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(ApiRequestError)
    const err = caught as ApiRequestError
    expect(err.status).toBe(500)
    expect(err.bodySnippet.length).toBeLessThanOrEqual(501)
    expect(err.bodySnippet.endsWith("…")).toBe(true)
    expect(err.message).toContain("HTTP 500")
  })

  it("returns parsed JSON on 2xx responses", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const result = await apiRequest(config, "GET", "/api/entities/teams/records")
    expect(result).toEqual({ data: { items: [] } })
  })
})
