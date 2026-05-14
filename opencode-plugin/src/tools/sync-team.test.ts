import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, readFile, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { writeMarkerSection, fetchTeamAgents } from "./sync-team"
import type { FysoConfig } from "../config"

const START = "<!-- FYSO TEAM START -->"
const END = "<!-- FYSO TEAM END -->"

describe("writeMarkerSection", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fyso-sync-team-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("creates a new file with the marker section when the file does not exist", async () => {
    const file = join(dir, "new.md")
    await writeMarkerSection(file, "team prompt body")
    const out = await readFile(file, "utf-8")
    expect(out).toBe(`${START}\nteam prompt body\n${END}\n`)
  })

  it("appends a marker section when the file exists without markers", async () => {
    const file = join(dir, "existing.md")
    await writeFile(file, "# Project\n\nIntro paragraph.")
    await writeMarkerSection(file, "team body")
    const out = await readFile(file, "utf-8")
    expect(out).toBe(`# Project\n\nIntro paragraph.\n\n${START}\nteam body\n${END}\n`)
  })

  it("replaces content between markers when both are present", async () => {
    const file = join(dir, "with-markers.md")
    const before = `# Title\n\n${START}\nold body\n${END}\n\nTrailing text.\n`
    await writeFile(file, before)
    await writeMarkerSection(file, "new body")
    const out = await readFile(file, "utf-8")
    expect(out).toBe(`# Title\n\n${START}\nnew body\n${END}\n\nTrailing text.\n`)
    expect(out.match(new RegExp(START, "g"))!.length).toBe(1)
    expect(out.match(new RegExp(END, "g"))!.length).toBe(1)
  })
})

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

describe("fetchTeamAgents", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch")
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("normalizes agents and applies defaults for missing fields", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        data: {
          items: [
            {
              _agent: {
                name: "cero",
                display_name: "Cero",
                role: "developer",
                soul: "alma",
                system_prompt: "sp",
              },
            },
            { _agent: { name: "vigia" } },
            { _agent: { display_name: "Solo Display" } },
          ],
        },
      }),
    )

    const result = await fetchTeamAgents(config, "team_1")
    expect(result).toEqual([
      {
        name: "cero",
        display_name: "Cero",
        role: "developer",
        soul: "alma",
        system_prompt: "sp",
      },
      {
        name: "vigia",
        display_name: "vigia",
        role: "assistant",
        soul: "",
        system_prompt: "",
      },
      {
        name: "unnamed",
        display_name: "Solo Display",
        role: "assistant",
        soul: "",
        system_prompt: "",
      },
    ])
  })

  it("filters out items without an _agent", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        data: {
          items: [
            { _agent: { name: "keeper" } },
            {},
            { _agent: null },
            { not_agent: { name: "x" } },
          ],
        },
      }),
    )

    const result = await fetchTeamAgents(config, "team_1")
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe("keeper")
  })

  it("returns an empty array when the API returns no items", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJson({ data: { items: [] } }))
    expect(await fetchTeamAgents(config, "team_1")).toEqual([])
  })

  it("returns an empty array when the API response has no data", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJson({}))
    expect(await fetchTeamAgents(config, "team_1")).toEqual([])
  })
})
