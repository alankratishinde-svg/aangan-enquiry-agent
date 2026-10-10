/**
 * HubSpot adapter (CRM v3 objects). A deal is created only for qualified calls.
 * Needs a private-app token with crm.objects.contacts and crm.objects.deals write scopes,
 * the pipeline from scripts/setup-hubspot (default "Aangan Enquiries"), and these custom
 * deal properties: project_type, area_sq_ft, location, needed_by, client_size,
 * internal_estimate, handoff_notes.
 */
export interface DealInput {
  dealName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  projectType: string | null;
  areaSqFt: number | null;
  location: string | null;
  neededBy: string | null;
  clientSize: string | null;
  handoffNotes: string[];
  /** Filled in Milestone 6. Internal only. */
  internalEstimate: string | null;
}

export interface HubspotClient {
  createDeal(input: DealInput): Promise<{ dealId: string; contactId: string | null }>;
}

export class HubspotError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "HubspotError";
  }
}

export interface HubspotOptions {
  accessToken: string;
  pipelineLabel?: string;
  stageLabel?: string;
  fetchImpl?: typeof fetch;
}

const BASE = "https://api.hubapi.com";
const DEAL_TO_CONTACT = 3; // HUBSPOT_DEFINED association type id for deal to contact

export class HubspotRestClient implements HubspotClient {
  private readonly fetchImpl: typeof fetch;
  private ids: { pipelineId: string; stageId: string } | null = null;
  constructor(private readonly opts: HubspotOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.opts.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new HubspotError(`HubSpot ${method} ${path} failed with HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async resolveIds() {
    if (this.ids) return this.ids;
    const pipeLabel = this.opts.pipelineLabel ?? "Aangan Enquiries";
    const stageLabel = this.opts.stageLabel ?? "Qualified lead";
    const r = await this.call<{ results: { id: string; label: string; stages: { id: string; label: string }[] }[] }>("GET", "/crm/v3/pipelines/deals");
    const pipe = r.results.find((p) => p.label === pipeLabel);
    if (!pipe) throw new HubspotError(`HubSpot pipeline "${pipeLabel}" not found`);
    const stage = pipe.stages.find((s) => s.label === stageLabel);
    if (!stage) throw new HubspotError(`HubSpot stage "${stageLabel}" not found in pipeline "${pipeLabel}"`);
    this.ids = { pipelineId: pipe.id, stageId: stage.id };
    return this.ids;
  }

  private async upsertContact(input: DealInput): Promise<string | null> {
    if (!input.email && !input.phone) return null;
    if (input.email) {
      const found = await this.call<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: input.email }] }],
        limit: 1,
      });
      if (found.results[0]) return found.results[0].id;
    }
    const [first, ...rest] = (input.contactName ?? "").trim().split(/\s+/);
    const created = await this.call<{ id: string }>("POST", "/crm/v3/objects/contacts", {
      properties: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(first ? { firstname: first } : {}),
        ...(rest.length ? { lastname: rest.join(" ") } : {}),
      },
    });
    return created.id;
  }

  async createDeal(input: DealInput) {
    const { pipelineId, stageId } = await this.resolveIds();
    const contactId = await this.upsertContact(input);
    const properties: Record<string, string> = {
      dealname: input.dealName,
      pipeline: pipelineId,
      dealstage: stageId,
      ...(input.projectType ? { project_type: input.projectType } : {}),
      ...(input.areaSqFt != null ? { area_sq_ft: String(input.areaSqFt) } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.neededBy ? { needed_by: input.neededBy } : {}),
      ...(input.clientSize ? { client_size: input.clientSize } : {}),
      ...(input.internalEstimate ? { internal_estimate: input.internalEstimate } : {}),
      ...(input.handoffNotes.length ? { handoff_notes: input.handoffNotes.join("\n") } : {}),
    };
    const deal = await this.call<{ id: string }>("POST", "/crm/v3/objects/deals", {
      properties,
      ...(contactId ? { associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }] }] } : {}),
    });
    return { dealId: deal.id, contactId };
  }
}

/** In-memory HubSpot for tests. */
export class MockHubspotClient implements HubspotClient {
  readonly deals: DealInput[] = [];
  failWith: Error | null = null;
  async createDeal(input: DealInput) {
    if (this.failWith) throw this.failWith;
    this.deals.push(input);
    return { dealId: `deal-${this.deals.length}`, contactId: input.email || input.phone ? `contact-${this.deals.length}` : null };
  }
}
