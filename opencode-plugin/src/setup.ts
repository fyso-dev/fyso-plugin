#!/usr/bin/env bun
import { cp, mkdir, readFile, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = join(__dirname, "..")
const REPO_ROOT = join(PLUGIN_ROOT, "..")

const cwd = process.cwd()

async function copyDir(src: string, dest: string, label: string) {
  if (!existsSync(src)) {
    console.log(`  skip ${label} (source not found)`)
    return 0
  }
  await mkdir(dest, { recursive: true })
  await cp(src, dest, { recursive: true })
  const { readdirSync } = await import("fs")
  const count = readdirSync(dest).length
  console.log(`  ${count} ${label}`)
  return count
}

async function ensureOpenCodeConfig() {
  const configPath = join(cwd, "opencode.json")
  let config: Record<string, unknown> = {}

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(await readFile(configPath, "utf-8"))
    } catch {
      config = {}
    }
  }

  // Add plugin
  const plugins = (config.plugin as string[]) || []
  if (!plugins.includes("@fyso/opencode-plugin")) {
    plugins.push("@fyso/opencode-plugin")
    config.plugin = plugins
  }

  // Add MCP server
  const mcp = (config.mcp as Record<string, unknown>) || {}
  if (!mcp.fyso) {
    mcp.fyso = { type: "remote", url: "https://mcp.fyso.dev/mcp" }
    config.mcp = mcp
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
  return configPath
}

async function main() {
  console.log("\n@fyso/opencode-plugin setup\n")
  console.log(`Project: ${cwd}\n`)

  // 1. Copy agents
  console.log("Copying agents...")
  await copyDir(
    join(REPO_ROOT, ".opencode", "agents"),
    join(cwd, ".opencode", "agents"),
    "agents",
  )

  // 2. Copy skills (actual files, not symlinks)
  console.log("Copying skills...")
  await copyDir(join(REPO_ROOT, "skills"), join(cwd, ".opencode", "skills"), "skills")

  // 3. Copy reference
  console.log("Copying reference docs...")
  const refSrc = join(REPO_ROOT, "FYSO-REFERENCE.md")
  if (existsSync(refSrc)) {
    await cp(refSrc, join(cwd, "FYSO-REFERENCE.md"))
    console.log("  FYSO-REFERENCE.md")
  }

  // 4. Update opencode.json
  console.log("Updating opencode.json...")
  const configPath = await ensureOpenCodeConfig()
  console.log(`  ${configPath}`)

  console.log("\nDone! Restart OpenCode to activate.\n")
  console.log("Available:")
  console.log("  Skills:  via skill tool (plan, build, verify, ui, ...)")
  console.log("  Agents:  @architect, @builder, @designer, @verifier, @ui-architect")
  console.log("  Tools:   fyso-sync-team (sync your Fyso team agents)")
  console.log("  MCP:     Fyso server (80+ operations via OAuth)\n")
}

main().catch((e) => {
  console.error("Setup failed:", e.message)
  process.exit(1)
})
