import { readConfig, readTeamConfig, apiRequest } from "../config"
import { readFile, writeFile, mkdir, rm } from "fs/promises"
import { existsSync } from "fs"
import { basename, join, resolve, sep } from "path"

interface Agent {
  name: string
  display_name: string
  role: string
  soul: string
  system_prompt: string
}

const ROLE_COLORS: Record<string, string> = {
  developer: "green",
  qa: "yellow",
  tester: "yellow",
  reviewer: "purple",
  coordinator: "blue",
  writer: "cyan",
  security: "red",
  triage: "orange",
}

const SAFE_AGENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

export function isSafeAgentName(name: string): boolean {
  return typeof name === "string" && SAFE_AGENT_NAME_RE.test(name)
}

export function resolveAgentFilePath(dir: string, name: string): string | null {
  if (!isSafeAgentName(name)) return null
  // Defense-in-depth: strip any directory component the regex might have missed
  // and require the basename to round-trip identically.
  const safe = basename(name)
  if (safe !== name) return null
  const filePath = join(dir, `${safe}.md`)
  const dirResolved = resolve(dir) + sep
  const fileResolved = resolve(filePath)
  if (!fileResolved.startsWith(dirResolved)) return null
  return filePath
}

// YAML double-quoted scalar with escaping. Safe against newline / quote / colon
// injection, so untrusted strings cannot inject extra frontmatter fields.
export function yamlString(value: string): string {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
  return `"${escaped}"`
}

// Defensive: prevent untrusted body content from containing a line that is
// exactly `---`, which a lenient parser could mistake for a frontmatter fence.
export function sanitizeMarkdownBody(value: string): string {
  return String(value).replace(/^---\s*$/gm, "\u200B---")
}

function getColor(role: string): string {
  const lower = role.toLowerCase()
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (lower.includes(key)) return color
  }
  return "gray"
}

function firstLineOf(text: string, fallback: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return line || fallback
}

async function writeMarkerSection(filePath: string, content: string): Promise<void> {
  const START = "<!-- FYSO TEAM START -->"
  const END = "<!-- FYSO TEAM END -->"
  const section = `${START}\n${content}\n${END}`

  if (existsSync(filePath)) {
    const existing = await readFile(filePath, "utf-8")
    const startIdx = existing.indexOf(START)
    const endIdx = existing.indexOf(END)
    if (startIdx !== -1 && endIdx !== -1) {
      const updated = existing.slice(0, startIdx) + section + existing.slice(endIdx + END.length)
      await writeFile(filePath, updated)
      return
    }
    await writeFile(filePath, existing + "\n\n" + section + "\n")
    return
  }
  await writeFile(filePath, section + "\n")
}

export async function listTeams(config: NonNullable<Awaited<ReturnType<typeof readConfig>>>) {
  const resp = (await apiRequest(config, "GET", "/api/entities/teams/records")) as {
    data?: { items?: Array<{ id: string; name: string; prompt?: string }> }
  }
  return resp?.data?.items || []
}

export async function fetchTeamAgents(
  config: NonNullable<Awaited<ReturnType<typeof readConfig>>>,
  teamId: string,
) {
  const resp = (await apiRequest(
    config,
    "GET",
    `/api/entities/team_agents/records?resolve=true&filter.team=${teamId}`,
  )) as {
    data?: { items?: Array<{ _agent?: Agent }> }
  }
  const items = resp?.data?.items || []
  return items
    .map((item) => item._agent)
    .filter((a): a is Agent => !!a)
    .map((a) => ({
      name: a.name || "unnamed",
      display_name: a.display_name || a.name || "Unnamed Agent",
      role: a.role || "assistant",
      soul: a.soul || "",
      system_prompt: a.system_prompt || "",
    }))
}

interface SafeAgentFields {
  name: string
  display: string
  role: string
  soul: string
  systemPrompt: string
  color: string
}

function sanitizeAgent(agent: Agent): SafeAgentFields {
  return {
    name: agent.name,
    display: sanitizeMarkdownBody(agent.display_name),
    role: sanitizeMarkdownBody(agent.role),
    soul: sanitizeMarkdownBody(agent.soul),
    systemPrompt: sanitizeMarkdownBody(agent.system_prompt),
    color: getColor(agent.role),
  }
}

function renderClaudeAgent(agent: Agent, safe: SafeAgentFields): string {
  const firstLine = firstLineOf(agent.soul, agent.display_name)
  const description = `${agent.role} -- ${agent.display_name}. ${firstLine}`
  return `---
name: ${yamlString(agent.name)}
description: ${yamlString(description)}
tools: Read, Write, Edit, Bash, Grep, Glob
color: ${yamlString(safe.color)}
---

# ${safe.display}

**Role:** ${safe.role}

## Soul
${safe.soul}

## System Prompt
${safe.systemPrompt}
`
}

function renderOpencodeAgent(agent: Agent, safe: SafeAgentFields): string {
  const description = `${agent.role} -- ${agent.display_name}`
  return `---
description: ${yamlString(description)}
mode: subagent
color: ${yamlString(safe.color)}
---

# ${safe.display}

You are **${safe.display}**, a specialized agent with the role of **${safe.role}**.

## Soul
${safe.soul}

## System Prompt
${safe.systemPrompt}
`
}

async function writeAgentsTo(
  agents: Agent[],
  dir: string,
  render: (agent: Agent, safe: SafeAgentFields) => string,
  created: string[],
): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const agent of agents) {
    const filePath = resolveAgentFilePath(dir, agent.name)
    if (!filePath) {
      console.warn(`[fyso] skipping agent with unsafe name: ${JSON.stringify(agent.name)}`)
      continue
    }
    if (existsSync(filePath)) await rm(filePath)
    await writeFile(filePath, render(agent, sanitizeAgent(agent)))
    created.push(filePath)
  }
}

export async function syncAgentsToDirectory(
  agents: Agent[],
  cwd: string,
  teamPrompt?: string,
): Promise<string[]> {
  const created: string[] = []

  await writeAgentsTo(agents, join(cwd, ".claude", "agents"), renderClaudeAgent, created)
  await writeAgentsTo(agents, join(cwd, ".opencode", "agents"), renderOpencodeAgent, created)

  if (teamPrompt) {
    const claudeMd = join(cwd, ".claude", "CLAUDE.md")
    await mkdir(join(cwd, ".claude"), { recursive: true })
    await writeMarkerSection(claudeMd, teamPrompt)
    created.push(claudeMd)

    const opencodeMd = join(cwd, "opencode.md")
    await writeMarkerSection(opencodeMd, teamPrompt)
    created.push(opencodeMd)
  }

  return created
}
