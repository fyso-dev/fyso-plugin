import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createTracker } from "./tracking"
import { readConfig, readTeamConfig } from "./config"
import { listTeams, fetchTeamAgents, syncAgentsToDirectory } from "./tools/sync-team"
import { listAgents, createTeam, assignAgents } from "./tools/create-team"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"

const HEARTBEAT_INTERVAL = 5 * 60 * 1000 // 5 minutes

export const FysoPlugin: Plugin = async (ctx) => {
  const tracker = createTracker()
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let currentSessionID: string | undefined
  let recentTools: string[] = []

  return {
    tool: {
      "fyso-sync-team": tool({
        description:
          "Sync a Fyso agent team to local directories. Lists teams, lets user pick one, then downloads agent definitions and creates files for Claude Code (.claude/agents/) and OpenCode (.opencode/agents/).",
        args: {
          team_id: tool.schema
            .string()
            .optional()
            .describe(
              "Team ID to sync. If omitted, lists all teams and returns them for user selection.",
            ),
        },
        async execute(args, context) {
          const config = await readConfig()
          if (!config) {
            return "No Fyso credentials found. Run the sync-team skill first to configure credentials at ~/.fyso/config.json, or visit https://agent-ui-sites.fyso.dev/ to get your token."
          }

          const cwd = context.directory || process.cwd()

          // If no team_id, list teams for selection
          if (!args.team_id) {
            const teams = await listTeams(config)
            if (!teams.length) {
              return "No teams found in your Fyso account."
            }
            const list = teams.map((t, i) => `${i + 1}. **${t.name}** (ID: ${t.id})`).join("\n")
            return `Available teams:\n\n${list}\n\nCall this tool again with the team_id to sync.`
          }

          // Fetch agents for the selected team
          const agents = await fetchTeamAgents(config, args.team_id)
          if (!agents.length) {
            return `No agents found for team ${args.team_id}. Check the team configuration at https://agent-ui-sites.fyso.dev/`
          }

          // Get team info for prompt
          const teams = await listTeams(config)
          const team = teams.find((t) => t.id === args.team_id)
          const teamPrompt = team?.prompt || undefined

          // Save team config locally
          await mkdir(join(cwd, ".fyso"), { recursive: true })
          await writeFile(
            join(cwd, ".fyso", "team.json"),
            JSON.stringify(
              {
                team_id: args.team_id,
                team_name: team?.name || args.team_id,
                synced_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          )

          // Sync agents
          const created = await syncAgentsToDirectory(agents, cwd, teamPrompt)

          const summary = [
            `Synced **${agents.length}** agents for team "${team?.name || args.team_id}":`,
            "",
            ...agents.map((a) => `- **${a.display_name}** (${a.role})`),
            "",
            `Files created (${created.length}):`,
            ...created.map((f) => `- ${f}`),
            "",
            teamPrompt
              ? "Team prompt written to `.claude/CLAUDE.md` and `opencode.md`."
              : "No team prompt configured.",
            "",
            "Agents are now available as subagents:",
            "- **Claude Code**: via Agent tool",
            "- **OpenCode**: via @ mention",
          ]
          return summary.join("\n")
        },
      }),

      "fyso-create-team": tool({
        description:
          "Create a new Fyso agent team. Call with no args to list available agents for selection; call with name to create the team. Optionally assigns initial agents.",
        args: {
          name: tool.schema
            .string()
            .optional()
            .describe("Team name. If omitted, the tool lists available agents instead."),
          prompt: tool.schema
            .string()
            .optional()
            .describe("Team system prompt -- shared instructions for all agents on the team."),
          description: tool.schema
            .string()
            .optional()
            .describe("Short human-readable description of the team."),
          agent_ids: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("IDs of agents to assign to the team at creation."),
        },
        async execute(args) {
          const config = await readConfig()
          if (!config) {
            return "No Fyso credentials found. Run the sync-team skill first to configure credentials at ~/.fyso/config.json, or visit https://agent-ui-sites.fyso.dev/ to get your token."
          }

          if (!args.name) {
            const agents = await listAgents(config)
            if (!agents.length) {
              return "No agents found in your Fyso account. Create agents in the Fyso dashboard before assembling a team."
            }
            const list = agents
              .map((a, i) => `${i + 1}. **${a.display_name}** (${a.role}) -- ID: ${a.id}`)
              .join("\n")
            return `Available agents to assign:\n\n${list}\n\nCall this tool again with name, prompt, description, and agent_ids to create the team.`
          }

          const created = await createTeam(config, {
            name: args.name,
            prompt: args.prompt,
            description: args.description,
          })

          let assignedCount = 0
          let failedLines: string[] = []
          if (args.agent_ids?.length) {
            const result = await assignAgents(config, created.id, args.agent_ids)
            assignedCount = result.assigned_agent_ids.length
            if (result.failed.length) {
              failedLines = [
                `Failed to assign ${result.failed.length} agent(s):`,
                ...result.failed.map((f) => `- ${f.agent_id}: ${f.message}`),
              ]
            }
          }

          const summary = [
            `Team **${created.name}** created (ID: ${created.id}).`,
            created.description ? `Description: ${created.description}` : "",
            created.prompt ? "Team prompt saved." : "No team prompt set.",
            assignedCount
              ? `Assigned ${assignedCount} agent(s) to the team.`
              : "No agents assigned yet -- use the Fyso dashboard or call this tool again with agent_ids.",
            ...failedLines,
            "",
            "Run /fyso:sync-team (Claude Code) or the fyso-sync-team tool (OpenCode) to pull this team into the current project.",
          ]
          return summary.filter(Boolean).join("\n")
        },
      }),
    },

    "session.created": async (event) => {
      currentSessionID = (event as { properties?: { sessionID?: string } })?.properties?.sessionID
      recentTools = []

      await tracker.sessionStart({
        sessionID: currentSessionID,
        directory: ctx.directory,
      })

      // Start heartbeat
      heartbeatTimer = setInterval(async () => {
        const detail =
          recentTools.length > 0
            ? `Tools: ${recentTools.slice(-5).join(", ")}`
            : "idle"
        await tracker.heartbeat({
          sessionID: currentSessionID,
          directory: ctx.directory,
          detail,
        })
      }, HEARTBEAT_INTERVAL)
    },

    "tool.execute.after": async (event) => {
      const props = (event as { properties?: Record<string, unknown> })?.properties || {}
      const toolName = (props.tool as string) || ""
      if (toolName) recentTools.push(toolName)

      await tracker.toolExecuted({
        sessionID: currentSessionID,
        directory: ctx.directory,
        tool: toolName,
        agent: (props.agent as string) || undefined,
        model: (props.model as string) || undefined,
        input_tokens: (props.input_tokens as number) || undefined,
        output_tokens: (props.output_tokens as number) || undefined,
        cache_creation_tokens: (props.cache_creation_tokens as number) || undefined,
        cache_read_tokens: (props.cache_read_tokens as number) || undefined,
      })
    },

    "session.deleted": async () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      await tracker.sessionEnd({
        sessionID: currentSessionID,
        directory: ctx.directory,
      })
    },
  }
}

export default FysoPlugin
