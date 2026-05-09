import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, readdir, readFile } from "fs/promises"
import { existsSync } from "fs"
import { tmpdir } from "os"
import { join, resolve, sep } from "path"

import { safeAgentFilePath, syncAgentsToDirectory } from "./sync-team"

describe("safeAgentFilePath", () => {
  const dir = "/tmp/agents"

  it("accepts a plain agent name", () => {
    const out = safeAgentFilePath(dir, "developer")
    expect(out).toBe(join(dir, "developer.md"))
  })

  it("accepts a name with dots that is not a traversal component", () => {
    const out = safeAgentFilePath(dir, "agent.v2")
    expect(out).toBe(join(dir, "agent.v2.md"))
  })

  it("rejects empty names", () => {
    expect(safeAgentFilePath(dir, "")).toBeNull()
  })

  it("rejects exact '.' and '..'", () => {
    expect(safeAgentFilePath(dir, ".")).toBeNull()
    expect(safeAgentFilePath(dir, "..")).toBeNull()
  })

  it("rejects names with forward slashes", () => {
    expect(safeAgentFilePath(dir, "../../evil")).toBeNull()
    expect(safeAgentFilePath(dir, "foo/bar")).toBeNull()
    expect(safeAgentFilePath(dir, "foo/../../bar")).toBeNull()
  })

  it("rejects names with backslashes", () => {
    expect(safeAgentFilePath(dir, "..\\..\\evil")).toBeNull()
    expect(safeAgentFilePath(dir, "foo\\bar")).toBeNull()
  })

  it("rejects names containing a null byte", () => {
    expect(safeAgentFilePath(dir, "evil\0name")).toBeNull()
  })

  it("returned path always resolves inside the directory", () => {
    const names = ["developer", "qa-engineer", "agent.v2", "x_y_z"]
    const resolvedDir = resolve(dir)
    const prefix = resolvedDir.endsWith(sep) ? resolvedDir : resolvedDir + sep
    for (const name of names) {
      const out = safeAgentFilePath(dir, name)
      expect(out).not.toBeNull()
      expect(resolve(out!).startsWith(prefix)).toBe(true)
    }
  })
})

describe("syncAgentsToDirectory path traversal protection", () => {
  let tmp: string
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "fyso-sync-test-"))
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(async () => {
    warnSpy.mockRestore()
    if (tmp) await rm(tmp, { recursive: true, force: true })
  })

  it("skips agents whose names attempt path traversal", async () => {
    const agents = [
      {
        name: "../../evil",
        display_name: "Evil",
        role: "developer",
        soul: "",
        system_prompt: "",
      },
      {
        name: "foo/../../bar",
        display_name: "Bar",
        role: "developer",
        soul: "",
        system_prompt: "",
      },
      { name: "..", display_name: "Dot", role: "developer", soul: "", system_prompt: "" },
      {
        name: "good-agent",
        display_name: "Good",
        role: "developer",
        soul: "",
        system_prompt: "",
      },
    ]

    const created = await syncAgentsToDirectory(agents, tmp)

    // Only the safe agent should have been written, in both target dirs.
    const claudeDir = join(tmp, ".claude", "agents")
    const opencodeDir = join(tmp, ".opencode", "agents")
    const claudeFiles = await readdir(claudeDir)
    const opencodeFiles = await readdir(opencodeDir)

    expect(claudeFiles).toEqual(["good-agent.md"])
    expect(opencodeFiles).toEqual(["good-agent.md"])

    // Nothing escaped the tmp sandbox.
    const tmpResolved = resolve(tmp)
    const prefix = tmpResolved.endsWith(sep) ? tmpResolved : tmpResolved + sep
    for (const f of created) {
      expect(resolve(f).startsWith(prefix)).toBe(true)
    }

    // Files that traversal would have produced do not exist.
    expect(existsSync(join(tmp, ".claude", "evil.md"))).toBe(false)
    expect(existsSync(join(tmp, "evil.md"))).toBe(false)
    expect(existsSync(join(tmp, "..md"))).toBe(false)

    // Each unsafe name produced a warning per target dir (3 unsafe x 2 dirs).
    expect(warnSpy).toHaveBeenCalledTimes(6)
  })

  it("writes the safe agent file inside the expected directories", async () => {
    const agents = [
      {
        name: "developer",
        display_name: "Developer",
        role: "developer",
        soul: "Helps with code.",
        system_prompt: "Be helpful.",
      },
    ]

    const created = await syncAgentsToDirectory(agents, tmp)

    expect(created).toContain(join(tmp, ".claude", "agents", "developer.md"))
    expect(created).toContain(join(tmp, ".opencode", "agents", "developer.md"))

    const claudeContent = await readFile(
      join(tmp, ".claude", "agents", "developer.md"),
      "utf-8",
    )
    expect(claudeContent).toContain("name: developer")
    expect(claudeContent).toContain("# Developer")
  })
})
