/**
 * Vaani adapter. Endpoints are taken from https://docs.vaanivoice.ai (checked 2026-10-10):
 *   POST   /api/create-agent              create an agent
 *   PATCH  /api/agent/{id}/persona        update persona (system prompt, greeting, language)
 *   GET    /api/agents                    list agents
 *   DELETE /api/agents/{id}               delete an agent
 * Auth header: X-API-Key. The key is never logged or put in error messages.
 */
export interface VaaniAgentSummary {
  id: string;
  display_name: string;
  agent_name?: string;
  published?: boolean;
  archived?: boolean;
}

export interface VaaniClient {
  createAgent(displayName: string, config: Record<string, unknown>): Promise<{ agentId: string }>;
  updatePersona(agentId: string, persona: Record<string, unknown>): Promise<void>;
  listAgents(): Promise<VaaniAgentSummary[]>;
  deleteAgent(agentId: string): Promise<void>;
}

export class VaaniError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "VaaniError";
  }
}

export class VaaniRestClient implements VaaniClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const base = (this.opts.baseUrl ?? "https://api.vaanivoice.ai").replace(/\/$/, "");
    const res = await this.fetchImpl(`${base}${path}`, {
      method,
      headers: { "X-API-Key": this.opts.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new VaaniError(`Vaani ${method} ${path} failed with HTTP ${res.status}: ${text.slice(0, 400)}`, res.status);
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  async createAgent(displayName: string, config: Record<string, unknown>) {
    const r = (await this.call("POST", "/api/create-agent", { agent_display_name: displayName, config })) as Record<string, unknown>;
    // Docs show { success, agent_id }. Accept the nearby shapes too, but never guess an id.
    const data = (typeof r.data === "object" && r.data ? r.data : {}) as Record<string, unknown>;
    const id = [r.agent_id, r.id, data.agent_id, data.id].find((v): v is string => typeof v === "string" && v.length > 0);
    if (!id) {
      throw new VaaniError(
        `Vaani create-agent returned no agent id (response keys: ${Object.keys(r).join(", ") || "none"}). The agent may still have been created: check listAgents.`,
      );
    }
    return { agentId: id };
  }

  async updatePersona(agentId: string, persona: Record<string, unknown>) {
    await this.call("PATCH", `/api/agent/${encodeURIComponent(agentId)}/persona`, persona);
  }

  async listAgents() {
    const r = (await this.call("GET", "/api/agents")) as VaaniAgentSummary[] | { data?: VaaniAgentSummary[] };
    return Array.isArray(r) ? r : (r.data ?? []);
  }

  async deleteAgent(agentId: string) {
    await this.call("DELETE", `/api/agents/${encodeURIComponent(agentId)}`);
  }
}

/** In-memory Vaani for automated tests: no network, no cost, no real calls. */
export class MockVaaniClient implements VaaniClient {
  readonly agents = new Map<string, { displayName: string; config: Record<string, unknown> }>();
  private n = 0;
  async createAgent(displayName: string, config: Record<string, unknown>) {
    const agentId = `mock-agent-${++this.n}`;
    this.agents.set(agentId, { displayName, config });
    return { agentId };
  }
  async updatePersona(agentId: string, persona: Record<string, unknown>) {
    const a = this.agents.get(agentId);
    if (!a) throw new VaaniError("unknown agent", 404);
    a.config = { ...a.config, persona };
  }
  async listAgents() {
    return [...this.agents.entries()].map(([id, a]) => ({ id, display_name: a.displayName }));
  }
  async deleteAgent(agentId: string) {
    this.agents.delete(agentId);
  }
}
