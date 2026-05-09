import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

export interface FysoConfig {
  token: string
  tenant_id: string
  api_url: string
  user_email?: string
  saved_at?: string
}

export interface TeamConfig {
  team_id: string
  team_name: string
  synced_at?: string
}

const FYSO_DIR = join(homedir(), ".fyso")
const CONFIG_PATH = join(FYSO_DIR, "config.json")
const DEBUG_PATH = join(FYSO_DIR, "debug")
const DEBUG_LOG = join(FYSO_DIR, "hook-debug.log")

export async function readConfig(): Promise<FysoConfig | null> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function readTeamConfig(cwd: string): Promise<TeamConfig | null> {
  try {
    const teamPath = join(cwd, ".fyso", "team.json")
    const content = await readFile(teamPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function isDebug(): boolean {
  return existsSync(DEBUG_PATH)
}

export async function debugLog(message: string): Promise<void> {
  if (!isDebug()) return
  try {
    const timestamp = new Date().toISOString()
    const line = `=== ${timestamp} === ${message}\n`
    await mkdir(FYSO_DIR, { recursive: true })
    const { appendFile } = await import("fs/promises")
    await appendFile(DEBUG_LOG, line)
  } catch {
    // Silent fail
  }
}

export async function apiRequest(
  config: FysoConfig,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${config.api_url}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    "X-Tenant-ID": config.tenant_id,
    "Content-Type": "application/json",
  }

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  })

  return resp.json()
}
