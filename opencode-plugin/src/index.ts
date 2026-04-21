import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createTracker } from "./tracking"
import { readConfig, readTeamConfig } from "./config"
import { listTeams, fetchTeamAgents, syncAgentsToDirectory } from "./tools/sync-team"
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
