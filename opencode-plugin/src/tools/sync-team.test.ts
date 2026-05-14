import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, readFile, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import {
  writeMarkerSection,
  FYSO_MARKER_START as START,
  FYSO_MARKER_END as END,
} from "./sync-team"

describe("writeMarkerSection", () => {
  let dir: string
  let filePath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fyso-sync-team-"))
    filePath = join(dir, "CLAUDE.md")
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("creates a new file with markers and content when no file exists", async () => {
    await writeMarkerSection(filePath, "hello team")

    const result = await readFile(filePath, "utf-8")
    expect(result).toBe(`${START}\nhello team\n${END}\n`)
  })

  it("appends a section without modifying original content when file has no markers", async () => {
    const original = "# Existing project notes\n\nSome handwritten content.\n"
    await writeFile(filePath, original)

    await writeMarkerSection(filePath, "team prompt")

    const result = await readFile(filePath, "utf-8")
    expect(result.startsWith(original)).toBe(true)
    expect(result).toContain(`${START}\nteam prompt\n${END}`)
  })

  it("replaces existing section while preserving content before START and after END", async () => {
    const before = "# Project\n\nIntro paragraph.\n\n"
    const after = "\n\n## Manual notes\nDeveloper-edited content below the section.\n"
    await writeFile(filePath, `${before}${START}\nold content\n${END}${after}`)

    await writeMarkerSection(filePath, "new content")

    const result = await readFile(filePath, "utf-8")
    expect(result).toBe(`${before}${START}\nnew content\n${END}${after}`)
    expect(result.startsWith(before)).toBe(true)
    expect(result.endsWith(after)).toBe(true)
  })

  it("preserves content after END marker exactly, including newlines and trailing text", async () => {
    const after = "\n\n\n## Trailing section\nLine A\nLine B\n"
    await writeFile(filePath, `${START}\nold\n${END}${after}`)

    await writeMarkerSection(filePath, "replacement")

    const result = await readFile(filePath, "utf-8")
    expect(result.endsWith(after)).toBe(true)
    expect(result).toBe(`${START}\nreplacement\n${END}${after}`)
  })

  it("throws and does not modify the file when END marker appears before START marker", async () => {
    const malformed = `intro\n${END}\norphan content\n${START}\nmore content\n`
    await writeFile(filePath, malformed)

    await expect(writeMarkerSection(filePath, "anything")).rejects.toThrow(/malformed markers/i)

    const onDisk = await readFile(filePath, "utf-8")
    expect(onDisk).toBe(malformed)
  })

  it("is idempotent: calling twice with the same content produces the same file output", async () => {
    const original = "# Header\nSome content before\n"
    await writeFile(filePath, original)

    await writeMarkerSection(filePath, "team prompt")
    const firstPass = await readFile(filePath, "utf-8")

    await writeMarkerSection(filePath, "team prompt")
    const secondPass = await readFile(filePath, "utf-8")

    expect(secondPass).toBe(firstPass)
  })
})
