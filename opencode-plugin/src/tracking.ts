import { readConfig, readTeamConfig, apiRequest, debugLog } from "./config"
import { createHash } from "crypto"
import { userInfo } from "os"

interface TrackingEvent {
  event: string
  tool?: string
  agent?: string
  detail?: string
  team_name?: string
  user?: string
  session_id?: string
  model?: string
  model_family?: string
  message_id?: string
  tokens?: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_tokens?: number
  cache_read_tokens?: number
  session_tokens?: number
  session_input_tokens?: number
  session_output_tokens?: number
  session_cache_creation_tokens?: number
  session_cache_read_tokens?: number
  cost_usd?: number
  cwd?: string
  timestamp: string
}

export function inferModelFamily(model: string): string {
  if (model.includes("opus")) return "opus"
  if (model.includes("sonnet")) return "sonnet"
  if (model.includes("haiku")) return "haiku"
  return "opus"
}

export const PRICING: Record<string, Record<string, number>> = {
  opus: { input: 15, output: 75, cache_write: 3.75, cache_read: 0.375 },
  sonnet: { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  haiku: { input: 0.8, output: 4, cache_write: 1.0, cache_read: 0.08 },
}

export function calculateCost(
  family: string,
  input: number,
  output: number,
  cacheWrite: number,
  cacheRead: number,
): number {
  const p = PRICING[family]
  if (!p) return 0
  return (
    (input / 1e6) * p.input +
    (output / 1e6) * p.output +
    (cacheWrite / 1e6) * p.cache_write +
    (cacheRead / 1e6) * p.cache_read
  )
}

export function createTracker() {
  let sessionTokens = {
    input: 0,
    output: 0,
    cache_creation: 0,
    cache_read: 0,
  }
  let lastModel = ""

  async function send(event: Partial<TrackingEvent> & { event: string }) {
    try {
      const config = await readConfig()
      if (!config) return

      const payload: Record<string, unknown> = {
        ...event,
        timestamp: new Date().toISOString(),
      }
      // Remove null/undefined
      for (const key of Object.keys(payload)) {
        if (payload[key] == null) delete payload[key]
      }

      await debugLog(`TRACKING: ${JSON.stringify(payload)}`)
      await apiRequest(config, "POST", "/api/entities/tracking/records", payload)
    } catch (e) {
      await debugLog(`TRACKING_ERROR: ${e}`)
    }
  }

  return {
    async sessionStart(ctx: { sessionID?: string; directory?: string }) {
      const config = await readConfig()
      if (!config) return
      const team = await readTeamConfig(ctx.directory || process.cwd())
      const sessionId =
        ctx.sessionID ||
        createHash("md5")
          .update(`${process.ppid}-${new Date().toISOString().split("T")[0]}`)
          .digest("hex")
          .slice(0, 12)

      await send({
        event: "session_start",
        detail: "session start",
        team_name: team?.team_name,
        user: config.user_email || userInfo().username,
        session_id: sessionId,
        model: "claude-opus-4-6",
        model_family: "opus",
        cwd: ctx.directory,
      })
    },

    async toolExecuted(ctx: {
      sessionID?: string
      directory?: string
      tool?: string
      agent?: string
      model?: string
      input_tokens?: number
      output_tokens?: number
      cache_creation_tokens?: number
      cache_read_tokens?: number
    }) {
      const config = await readConfig()
      if (!config) return
      const team = await readTeamConfig(ctx.directory || process.cwd())

      const inputTokens = ctx.input_tokens || 0
      const outputTokens = ctx.output_tokens || 0
      const cacheCreation = ctx.cache_creation_tokens || 0
      const cacheRead = ctx.cache_read_tokens || 0
      const tokens = inputTokens + outputTokens + cacheCreation + cacheRead

      sessionTokens.input += inputTokens
      sessionTokens.output += outputTokens
      sessionTokens.cache_creation += cacheCreation
      sessionTokens.cache_read += cacheRead

      if (ctx.model) lastModel = ctx.model
      const model = lastModel || "claude-opus-4-6"
      const family = inferModelFamily(model)

      await send({
        event: "agent_dispatch",
        tool: ctx.tool,
        agent: ctx.agent,
        team_name: team?.team_name,
        user: config.user_email || userInfo().username,
        session_id: ctx.sessionID,
        model,
        model_family: family,
        tokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_tokens: cacheCreation,
        cache_read_tokens: cacheRead,
        session_tokens:
          sessionTokens.input +
          sessionTokens.output +
          sessionTokens.cache_creation +
          sessionTokens.cache_read,
        session_input_tokens: sessionTokens.input,
        session_output_tokens: sessionTokens.output,
        session_cache_creation_tokens: sessionTokens.cache_creation,
        session_cache_read_tokens: sessionTokens.cache_read,
        cwd: ctx.directory,
      })
    },

    async sessionEnd(ctx: { sessionID?: string; directory?: string }) {
      const config = await readConfig()
      if (!config) return
      const team = await readTeamConfig(ctx.directory || process.cwd())
      const model = lastModel || "claude-opus-4-6"
      const family = inferModelFamily(model)
      const totalTokens =
        sessionTokens.input +
        sessionTokens.output +
        sessionTokens.cache_creation +
        sessionTokens.cache_read

      await send({
        event: "session_update",
        detail: "session end",
        team_name: team?.team_name,
        user: config.user_email || userInfo().username,
        session_id: ctx.sessionID,
        model,
        model_family: family,
        session_tokens: totalTokens,
        session_input_tokens: sessionTokens.input,
        session_output_tokens: sessionTokens.output,
        session_cache_creation_tokens: sessionTokens.cache_creation,
        session_cache_read_tokens: sessionTokens.cache_read,
        cost_usd:
          totalTokens > 0
            ? Math.round(
                calculateCost(
                  family,
                  sessionTokens.input,
                  sessionTokens.output,
                  sessionTokens.cache_creation,
                  sessionTokens.cache_read,
                ) * 1e6,
              ) / 1e6
            : undefined,
        cwd: ctx.directory,
      })
    },

    async heartbeat(ctx: { sessionID?: string; directory?: string; detail?: string }) {
      const config = await readConfig()
      if (!config) return
      const team = await readTeamConfig(ctx.directory || process.cwd())
      const model = lastModel || "claude-opus-4-6"
      const family = inferModelFamily(model)
      const totalTokens =
        sessionTokens.input +
        sessionTokens.output +
        sessionTokens.cache_creation +
        sessionTokens.cache_read

      await send({
        event: "heartbeat",
        detail: ctx.detail || "idle",
        team_name: team?.team_name,
        user: config.user_email || userInfo().username,
        session_id: ctx.sessionID,
        model,
        model_family: family,
        tokens: totalTokens > 0 ? totalTokens : undefined,
        input_tokens: sessionTokens.input > 0 ? sessionTokens.input : undefined,
        output_tokens: sessionTokens.output > 0 ? sessionTokens.output : undefined,
        cache_creation_tokens:
          sessionTokens.cache_creation > 0 ? sessionTokens.cache_creation : undefined,
        cache_read_tokens: sessionTokens.cache_read > 0 ? sessionTokens.cache_read : undefined,
        cost_usd:
          totalTokens > 0
            ? Math.round(
                calculateCost(
                  family,
                  sessionTokens.input,
                  sessionTokens.output,
                  sessionTokens.cache_creation,
                  sessionTokens.cache_read,
                ) * 1e6,
              ) / 1e6
            : undefined,
        cwd: ctx.directory,
      })
    },
  }
}
