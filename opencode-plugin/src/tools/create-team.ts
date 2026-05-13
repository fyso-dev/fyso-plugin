import { apiRequest, type FysoConfig } from "../config"

export interface AgentSummary {
  id: string
  name: string
  display_name: string
  role: string
}

export interface CreateTeamInput {
  name: string
  prompt?: string
  description?: string
  agent_ids?: string[]
}

export interface CreatedTeam {
  id: string
  name: string
  prompt?: string
  description?: string
}

export async function listAgents(config: FysoConfig): Promise<AgentSummary[]> {
  const resp = (await apiRequest(config, "GET", "/api/entities/agents/records")) as {
    data?: { items?: Array<Partial<AgentSummary> & { id?: string }> }
  }
  const items = resp?.data?.items || []
  return items
    .filter((a): a is AgentSummary & { id: string } => typeof a.id === "string")
    .map((a) => ({
      id: a.id,
      name: a.name || "unnamed",
      display_name: a.display_name || a.name || "Unnamed Agent",
      role: a.role || "assistant",
    }))
}

export async function createTeam(
  config: FysoConfig,
  input: CreateTeamInput,
): Promise<CreatedTeam> {
  const body: Record<string, unknown> = { name: input.name }
  if (input.prompt) body.prompt = input.prompt
  if (input.description) body.description = input.description

  const resp = (await apiRequest(config, "POST", "/api/entities/teams/records", body)) as {
    data?: Partial<CreatedTeam> & { id?: string }
    id?: string
  }
  const record = resp?.data ?? resp
  const id = (record as { id?: string })?.id
  if (!id) {
    throw new Error("createTeam: API response missing team id")
  }
  return {
    id,
    name: (record as CreatedTeam).name ?? input.name,
    prompt: (record as CreatedTeam).prompt ?? input.prompt,
    description: (record as CreatedTeam).description ?? input.description,
  }
}

export async function assignAgents(
  config: FysoConfig,
  teamId: string,
  agentIds: string[],
): Promise<string[]> {
  const assigned: string[] = []
  for (const agentId of agentIds) {
    const resp = (await apiRequest(config, "POST", "/api/entities/team_agents/records", {
      team: teamId,
      agent: agentId,
    })) as { data?: { id?: string }; id?: string }
    const id = resp?.data?.id ?? resp?.id
    if (id) assigned.push(id)
  }
  return assigned
}
