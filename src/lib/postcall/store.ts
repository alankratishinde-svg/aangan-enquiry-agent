import type { Db } from "./db";
import type { DealInput } from "./hubspot";

export interface CallRow {
  vaaniCallId: string;
  startedAt: Date;
  endedAt: Date | null;
  callerNumber: string | null;
  status: "qualified" | "unqualified" | "failed";
  transcript: string;
  answers: unknown;
  verdict: unknown;
  responseSeconds: number | null;
  isAfterHours: boolean;
  failureReason: string | null;
  callbackDueAt: Date | null;
  priceSpoken: boolean;
  bookingBeforeQualified: boolean;
  summary: string | null;
  entities: unknown;
  flags: unknown;
  recordingUrl: string | null;
}

export interface LeadRow {
  name: string | null;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  areaSqFt: number | null;
  location: string | null;
  neededBy: string | null;
  summary: string | null;
  clientSize: string | null;
  handoffNotes: string[];
}

export interface ReviewRow {
  kind: "unqualified" | "compliance";
  reasons: unknown[];
}

export interface SavePlan {
  call: CallRow;
  lead: LeadRow | null;
  review: ReviewRow | null;
}

export interface ExistingCall {
  callId: string;
  status: string;
  leadId: string | null;
  hubspotDealId: string | null;
}

export class PostCallStore {
  constructor(private readonly db: Db) {}

  /** Store the raw webhook body first, so a processing failure never loses a call. */
  async recordEvent(event: string, vaaniCallId: string | null, payload: unknown): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `insert into webhook_events (event, vaani_call_id, payload) values ($1, $2, $3::jsonb) returning id`,
      [event, vaaniCallId, JSON.stringify(payload ?? null)],
    );
    return r.rows[0]!.id;
  }

  async markEvent(id: string, state: "processed" | "failed" | "ignored", error?: string): Promise<void> {
    await this.db.query(
      `update webhook_events set state = $2, error = $3, attempts = attempts + 1, processed_at = now() where id = $1`,
      [id, state, error ?? null],
    );
  }

  async findCall(vaaniCallId: string): Promise<ExistingCall | null> {
    const r = await this.db.query<{ id: string; status: string; lead_id: string | null; hubspot_deal_id: string | null }>(
      `select c.id, c.status, l.id as lead_id, l.hubspot_deal_id
         from calls c left join leads l on l.call_id = c.id
        where c.vaani_call_id = $1 order by l.created_at limit 1`,
      [vaaniCallId],
    );
    const row = r.rows[0];
    return row ? { callId: row.id, status: row.status, leadId: row.lead_id, hubspotDealId: row.hubspot_deal_id } : null;
  }

  /** One transaction: call, lead and review entry together. A repeat of the same call id changes nothing. */
  async saveCall(plan: SavePlan): Promise<{ callId: string | null; leadId: string | null; duplicate: boolean }> {
    return this.db.transaction(async (tx) => {
      const c = plan.call;
      const ins = await tx.query<{ id: string }>(
        `insert into calls (vaani_call_id, started_at, ended_at, caller_number, status, transcript, answers, verdict,
                            response_seconds, is_after_hours, failure_reason, callback_due_at, price_spoken,
                            booking_before_qualified, summary, entities, flags, recording_url)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18)
         on conflict (vaani_call_id) do nothing returning id`,
        [
          c.vaaniCallId, c.startedAt.toISOString(), c.endedAt?.toISOString() ?? null, c.callerNumber, c.status, c.transcript,
          JSON.stringify(c.answers ?? {}), JSON.stringify(c.verdict ?? null), c.responseSeconds, c.isAfterHours,
          c.failureReason, c.callbackDueAt?.toISOString() ?? null, c.priceSpoken, c.bookingBeforeQualified, c.summary,
          JSON.stringify(c.entities ?? {}), JSON.stringify(c.flags ?? {}), c.recordingUrl,
        ],
      );
      const callId = ins.rows[0]?.id;
      if (!callId) return { callId: null, leadId: null, duplicate: true };

      let leadId: string | null = null;
      if (plan.lead) {
        const l = plan.lead;
        const li = await tx.query<{ id: string }>(
          `insert into leads (call_id, name, phone, email, project_type, area_sq_ft, location, needed_by, summary,
                              client_size, handoff_notes)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) returning id`,
          [callId, l.name, l.phone, l.email, l.projectType, l.areaSqFt, l.location, l.neededBy, l.summary, l.clientSize, JSON.stringify(l.handoffNotes)],
        );
        leadId = li.rows[0]!.id;
        if (plan.review) {
          await tx.query(`insert into review_queue (lead_id, kind, reasons) values ($1, $2, $3::jsonb)`, [
            leadId,
            plan.review.kind,
            JSON.stringify(plan.review.reasons),
          ]);
        }
      }
      return { callId, leadId, duplicate: false };
    });
  }

  async setHubspotDeal(leadId: string, dealId: string): Promise<void> {
    await this.db.query(`update leads set hubspot_deal_id = $2 where id = $1`, [leadId, dealId]);
  }

  async addCallFlags(callId: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.query(`update calls set flags = flags || $2::jsonb where id = $1`, [callId, JSON.stringify(patch)]);
  }

  /** Rebuild the HubSpot deal input from a stored lead, for retries. */
  async loadDealInput(leadId: string): Promise<DealInput | null> {
    const r = await this.db.query<{
      name: string | null; phone: string | null; email: string | null; project_type: string | null; area_sq_ft: number | null;
      location: string | null; needed_by: Date | string | null; client_size: string | null; handoff_notes: string[];
    }>(`select name, phone, email, project_type, area_sq_ft, location, needed_by, client_size, handoff_notes from leads where id = $1`, [leadId]);
    const l = r.rows[0];
    if (!l) return null;
    const neededBy = l.needed_by instanceof Date ? l.needed_by.toISOString().slice(0, 10) : l.needed_by;
    return {
      dealName: dealName(l.project_type, l.name, l.location),
      contactName: l.name,
      email: l.email,
      phone: l.phone,
      projectType: l.project_type,
      areaSqFt: l.area_sq_ft,
      location: l.location,
      neededBy,
      clientSize: l.client_size,
      handoffNotes: l.handoff_notes ?? [],
      internalEstimate: null,
    };
  }
}

export function dealName(projectType: string | null, name: string | null, location: string | null): string {
  return [name ?? "Unnamed caller", projectType?.replace(/_/g, " "), location].filter(Boolean).join(" - ");
}
