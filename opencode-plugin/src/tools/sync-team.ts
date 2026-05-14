import { readConfig, readTeamConfig, apiRequest } from "../config"
import { readFile, writeFile, mkdir, rm } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"

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

export const FYSO_MARKER_START = "<!-- FYSO TEAM START -->"
export const FYSO_MARKER_END = "<!-- FYSO TEAM END -->"

export async function writeMarkerSection(filePath: string, content: string): Promise<void> {
  const section = `${FYSO_MARKER_START}\n${content}\n${FYSO_MARKER_END}`

  if (existsSync(filePath)) {
    const existing = await readFile(filePath, "utf-8")
    const startIdx = existing.indexOf(FYSO_MARKER_START)
    const endIdx = existing.lastIndexOf(FYSO_MARKER_END)
    if (startIdx !== -1 && endIdx !== -1) {
      if (endIdx < startIdx) {
        throw new Error(
          `writeMarkerSection: malformed markers in ${filePath} — END appears before START. Refusing to modify file to avoid corruption.`,
        )
      }
      const updated =
        existing.slice(0, startIdx) + section + existing.slice(endIdx + FYSO_MARKER_END.length)
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

export async function syncAgentsToDirectory(
  agents: Agent[],
  cwd: string,
  teamPrompt?: string,
): Promise<string[]> {
  const created: string[] = []

  // Claude Code agents (.claude/agents/)
  const claudeDir = join(cwd, ".claude", "agents")
  await mkdir(claudeDir, { recursive: true })

  for (const agent of agents) {
    const filePath = join(claudeDir, `${agent.name}.md`)
    if (existsSync(filePath)) await rm(filePath)
    const color = getColor(agent.role)
    const firstLine = firstLineOf(agent.soul, agent.display_name)
    const content = `---
name: ${agent.name}
description: ${agent.role} -- ${agent.display_name}. ${firstLine}
tools: Read, Write, Edit, Bash, Grep, Glob
color: ${color}
---

# ${agent.display_name}

**Role:** ${agent.role}

## Soul
${agent.soul}

## System Prompt
${agent.system_prompt}
`
    await writeFile(filePath, content)
    created.push(filePath)
  }

  // OpenCode agents (.opencode/agents/)
  const opencodeDir = join(cwd, ".opencode", "agents")
  await mkdir(opencodeDir, { recursive: true })

  for (const agent of agents) {
    const filePath = join(opencodeDir, `${agent.name}.md`)
    if (existsSync(filePath)) await rm(filePath)
    const color = getColor(agent.role)
    const content = `---
description: "${agent.role} -- ${agent.display_name}"
mode: subagent
color: "${color}"
---

# ${agent.display_name}

You are **${agent.display_name}**, a specialized agent with the role of **${agent.role}**.

## Soul
${agent.soul}

## System Prompt
${agent.system_prompt}
`
    await writeFile(filePath, content)
    created.push(filePath)
  }

  // Team prompt
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
