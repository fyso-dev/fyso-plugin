import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, readdir, stat } from "fs/promises"
import { existsSync } from "fs"
import { tmpdir } from "os"
import { join, resolve, sep } from "path"

vi.mock("../config", () => ({
  readConfig: vi.fn(),
  readTeamConfig: vi.fn(),
  apiRequest: vi.fn(),
  debugLog: vi.fn(),
}))

import { isSafeAgentName, resolveAgentFilePath, syncAgentsToDirectory } from "./sync-team"

describe("isSafeAgentName", () => {
  it("accepts simple alphanumeric names", () => {
    expect(isSafeAgentName("developer")).toBe(true)
    expect(isSafeAgentName("qa-bot")).toBe(true)
    expect(isSafeAgentName("agent_1")).toBe(true)
    expect(isSafeAgentName("Agent42")).toBe(true)
  })

  it("rejects names with path separators", () => {
    expect(isSafeAgentName("../evil")).toBe(false)
    expect(isSafeAgentName("../../etc/passwd")).toBe(false)
    expect(isSafeAgentName("a/b")).toBe(false)
    expect(isSafeAgentName("a\\b")).toBe(false)
  })

  it("rejects names with traversal sequences or dots", () => {
    expect(isSafeAgentName("..")).toBe(false)
    expect(isSafeAgentName(".")).toBe(false)
    expect(isSafeAgentName("..hidden")).toBe(false)
    expect(isSafeAgentName(".bashrc")).toBe(false)
    expect(isSafeAgentName("name.with.dot")).toBe(false)
  })

  it("rejects empty, whitespace, or oversized names", () => {
    expect(isSafeAgentName("")).toBe(false)
    expect(isSafeAgentName(" ")).toBe(false)
    expect(isSafeAgentName("a".repeat(65))).toBe(false)
  })

  it("rejects names with null bytes or control characters", () => {
    expect(isSafeAgentName("agent\u0000")).toBe(false)
    expect(isSafeAgentName("agent\n")).toBe(false)
  })

  it("rejects non-string inputs", () => {
    expect(isSafeAgentName(undefined as unknown as string)).toBe(false)
    expect(isSafeAgentName(null as unknown as string)).toBe(false)
  })
})

describe("resolveAgentFilePath", () => {
  it("returns a path inside the target directory for safe names", () => {
    const dir = "/tmp/agents"
    const result = resolveAgentFilePath(dir, "developer")
    expect(result).toBe(join(dir, "developer.md"))
  })

  it("returns null for unsafe names", () => {
    const dir = "/tmp/agents"
    expect(resolveAgentFilePath(dir, "../evil")).toBeNull()
    expect(resolveAgentFilePath(dir, "../../etc/cron.d/x")).toBeNull()
    expect(resolveAgentFilePath(dir, "/absolute/path")).toBeNull()
  })
})

describe("syncAgentsToDirectory path traversal protection", () => {
  let workDir: string
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "fyso-sync-test-"))
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(async () => {
    warnSpy.mockRestore()
    await rm(workDir, { recursive: true, force: true })
  })

  it("does not write outside the agents directory for malicious names", async () => {
    const malicious = [
      {
        name: "../../malicious",
        display_name: "Evil",
        role: "developer",
        soul: "",
        system_prompt: "",
      },
      {
        name: "../../../etc/cron.d/x",
        display_name: "Evil2",
        role: "developer",
        soul: "",
        system_prompt: "",
      },
    ]

    const created = await syncAgentsToDirectory(malicious, workDir)

    expect(created).toEqual([])

    // Confirm no file escaped the workDir.
    const parent = resolve(workDir, "..")
    const siblings = await readdir(parent)
    const stray = siblings.find((entry) => entry.includes("malicious"))
    expect(stray).toBeUndefined()

    // Confirm the agent dirs exist but are empty.
    const claudeDir = join(workDir, ".claude", "agents")
    const opencodeDir = join(workDir, ".opencode", "agents")
    expect(existsSync(claudeDir)).toBe(true)
    expect(existsSync(opencodeDir)).toBe(true)
    expect((await readdir(claudeDir)).length).toBe(0)
    expect((await readdir(opencodeDir)).length).toBe(0)

    expect(warnSpy).toHaveBeenCalled()
  })

  it("writes safe agents and skips unsafe ones in the same batch", async () => {
    const agents = [
      {
        name: "developer",
        display_name: "Dev",
        role: "developer",
        soul: "soul text",
        system_prompt: "prompt",
      },
      {
        name: "../escape",
        display_name: "Escape",
        role: "developer",
        soul: "",
        system_prompt: "",
      },
    ]

    const created = await syncAgentsToDirectory(agents, workDir)

    const claudeFile = join(workDir, ".claude", "agents", "developer.md")
    const opencodeFile = join(workDir, ".opencode", "agents", "developer.md")

    expect(created).toContain(claudeFile)
    expect(created).toContain(opencodeFile)
    expect(existsSync(claudeFile)).toBe(true)
    expect(existsSync(opencodeFile)).toBe(true)

    // No file outside the agent dirs.
    const escapePath = resolve(workDir, "..", "escape.md")
    expect(existsSync(escapePath)).toBe(false)

    // Each agent dir contains exactly one file.
    expect((await readdir(join(workDir, ".claude", "agents"))).length).toBe(1)
    expect((await readdir(join(workDir, ".opencode", "agents"))).length).toBe(1)
  })

  it("ensures resolved paths are contained within the target directory", async () => {
    const claudeDir = join(workDir, ".claude", "agents")
    const resolvedDir = resolve(claudeDir)

    for (const name of ["developer", "qa-bot", "agent_1"]) {
      const filePath = resolveAgentFilePath(claudeDir, name)
      expect(filePath).not.toBeNull()
      const resolvedFile = resolve(filePath as string)
      expect(resolvedFile.startsWith(resolvedDir + sep)).toBe(true)
    }
  })
})
