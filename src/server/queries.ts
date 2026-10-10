import type { Sql } from "../lib/postcall/db";

export interface DesignerLead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  areaSqFt: number | null;
  location: string | null;
  neededBy: string | null;
  clientSize: string | null;
  summary: string | null;
  bookedSlot: string | null;
  handoffNotes: string[];
  addOnTips: { title: string; detail: string }[];
  estimateText: string | null;
  createdAt: string;
  designerName: string | null;
  designerId: string | null;
  requirements: { id: string; item: string; delivered: boolean }[];
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));

/**
 * Leads for the dashboard. With a designer id: only that designer's leads. With null (the whole team view): every
 * qualified lead plus every converted lead, with the designer's name.
 */
export async function leadsFor(sql: Sql, designerId: string | null): Promise<DesignerLead[]> {
  const r = await sql.query<Record<string, unknown>>(
    `select l.id, l.name, l.phone, l.email, l.project_type, l.area_sq_ft, l.location, l.needed_by, l.client_size, l.summary, l.booked_slot,
            l.handoff_notes, l.add_on_tips, l.internal_estimate->>'text' as estimate_text, l.created_at, l.assigned_designer_id, d.name as designer_name,
            coalesce((select json_agg(json_build_object('id', q.id, 'item', q.item, 'delivered', q.delivered) order by q.item)
                        from requirements q where q.lead_id = l.id), '[]'::json) as requirements
       from leads l join calls c on c.id = l.call_id left join designers d on d.id = l.assigned_designer_id
      where ($1::uuid is not null and l.assigned_designer_id = $1)
         or ($1::uuid is null and (c.status = 'qualified' or l.assigned_designer_id is not null))
      order by l.created_at desc limit 100`,
    [designerId],
  );
  return r.rows.map((x) => ({
    id: x.id as string, name: x.name as string | null, phone: x.phone as string | null, email: x.email as string | null,
    projectType: x.project_type as string | null, areaSqFt: x.area_sq_ft as number | null, location: x.location as string | null,
    neededBy: x.needed_by instanceof Date ? x.needed_by.toISOString().slice(0, 10) : (x.needed_by as string | null),
    clientSize: x.client_size as string | null, summary: x.summary as string | null, bookedSlot: iso(x.booked_slot),
    handoffNotes: (x.handoff_notes as string[]) ?? [], addOnTips: (x.add_on_tips as { title: string; detail: string }[]) ?? [],
    estimateText: x.estimate_text as string | null, createdAt: iso(x.created_at)!, designerName: x.designer_name as string | null,
    designerId: x.assigned_designer_id as string | null, requirements: (x.requirements as DesignerLead["requirements"]) ?? [],
  }));
}

/** A designer sees only leads assigned to them. */
export const designerLeads = (sql: Sql, designerId: string) => leadsFor(sql, designerId);

/** Tick or untick a checklist item. A designer can only tick their own; designerId null (team view) can tick any. */
export async function setRequirement(sql: Sql, designerId: string | null, requirementId: string, delivered: boolean): Promise<boolean> {
  const r = await sql.query(
    `update requirements q set delivered = $3
       from leads l where q.id = $2 and l.id = q.lead_id and ($1::uuid is null or l.assigned_designer_id = $1) returning q.id`,
    [designerId, requirementId, delivered],
  );
  return r.rows.length === 1;
}

export const progressPct = (reqs: { delivered: boolean }[]) => (reqs.length ? Math.round((100 * reqs.filter((r) => r.delivered).length) / reqs.length) : 0);

export interface ReviewItem {
  reviewId: string;
  kind: "unqualified" | "compliance";
  createdAt: string;
  reasons: { type: string; [k: string]: unknown }[];
  leadId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  location: string | null;
  summary: string | null;
  callId: string;
  startedAt: string;
  transcript: string | null;
  priceSpoken: boolean;
  bookingBeforeQualified: boolean;
}

export async function pendingReview(sql: Sql): Promise<ReviewItem[]> {
  const r = await sql.query<Record<string, unknown>>(
    `select rq.id review_id, rq.kind, rq.created_at, rq.reasons, l.id lead_id, l.name, l.phone, l.email, l.project_type, l.location, l.summary,
            c.id call_id, c.started_at, c.transcript, c.price_spoken, c.booking_before_qualified
       from review_queue rq join leads l on l.id = rq.lead_id join calls c on c.id = l.call_id
      where rq.state = 'pending' order by rq.kind, rq.created_at limit 200`,
  );
  return r.rows.map((x) => ({
    reviewId: x.review_id as string, kind: x.kind as ReviewItem["kind"], createdAt: iso(x.created_at)!, reasons: (x.reasons as ReviewItem["reasons"]) ?? [],
    leadId: x.lead_id as string, name: x.name as string | null, phone: x.phone as string | null, email: x.email as string | null,
    projectType: x.project_type as string | null, location: x.location as string | null, summary: x.summary as string | null,
    callId: x.call_id as string, startedAt: iso(x.started_at)!, transcript: x.transcript as string | null,
    priceSpoken: x.price_spoken as boolean, bookingBeforeQualified: x.booking_before_qualified as boolean,
  }));
}

export interface CallbackItem {
  callId: string;
  callerNumber: string | null;
  startedAt: string;
  dueAt: string | null;
  calledBackAt: string | null;
  reason: string | null;
  overdue: boolean;
}

export async function callbackList(sql: Sql, now: Date = new Date()): Promise<{ open: CallbackItem[]; recent: CallbackItem[] }> {
  const r = await sql.query<Record<string, unknown>>(
    `select id, caller_number, started_at, callback_due_at, called_back_at, failure_reason from calls
      where status = 'failed' and (called_back_at is null or called_back_at > now() - interval '7 days')
      order by (called_back_at is null) desc, callback_due_at limit 200`,
  );
  const items = r.rows.map((x): CallbackItem => ({
    callId: x.id as string, callerNumber: x.caller_number as string | null, startedAt: iso(x.started_at)!, dueAt: iso(x.callback_due_at),
    calledBackAt: iso(x.called_back_at), reason: x.failure_reason as string | null,
    overdue: !x.called_back_at && !!x.callback_due_at && new Date(iso(x.callback_due_at)!) < now,
  }));
  return { open: items.filter((i) => !i.calledBackAt), recent: items.filter((i) => i.calledBackAt) };
}

export async function markCalledBack(sql: Sql, callId: string): Promise<void> {
  await sql.query(`update calls set called_back_at = now() where id = $1 and status = 'failed' and called_back_at is null`, [callId]);
}

/** Front desk: reviewed (compliance) or deleted (unqualified). Delete removes personal details but keeps the decision. */
export async function resolveReview(sql: Sql, reviewId: string, action: "delete" | "reviewed", by: string): Promise<boolean> {
  return (async () => {
    const rq = await sql.query<{ lead_id: string; kind: string; reasons: unknown[] }>(
      `select lead_id, kind, reasons from review_queue where id = $1 and state = 'pending'`, [reviewId]);
    const row = rq.rows[0];
    if (!row) return false;
    const state = action === "delete" ? "deleted" : "reviewed";
    await sql.query(`update review_queue set state = $2, decided_by = $3, decided_at = now() where id = $1`, [reviewId, state, by]);
    await sql.query(
      `insert into decisions (lead_id, action, original_verdict, final_outcome, decided_by) values ($1, $2, $3, $4, $5)`,
      [row.lead_id, action, row.kind === "unqualified" ? "unqualified" : "compliance_flag", state, by],
    );
    if (action === "delete") {
      await sql.query(`update leads set name = null, phone = null, email = null, summary = null where id = $1`, [row.lead_id]);
      await sql.query(`update calls set caller_number = null, transcript = null, entities = '{}'::jsonb where id = (select call_id from leads where id = $1)`, [row.lead_id]);
    }
    return true;
  })();
}

export interface WeeklyRow {
  weekStart: string;
  counts: unknown;
  summary: string | null;
}
export async function latestWeekly(sql: Sql): Promise<WeeklyRow | null> {
  const r = await sql.query<{ week_start: Date | string; counts: unknown; improvement_summary: string | null }>(
    `select week_start, counts, improvement_summary from weekly_summaries order by week_start desc limit 1`,
  );
  const x = r.rows[0];
  return x ? { weekStart: x.week_start instanceof Date ? x.week_start.toISOString().slice(0, 10) : x.week_start, counts: x.counts, summary: x.improvement_summary } : null;
}

export interface ProposalRow {
  id: string;
  createdAt: string;
  diff: string;
  rationale: string;
  state: string;
  appliedAt: string | null;
}
export async function proposals(sql: Sql): Promise<ProposalRow[]> {
  const r = await sql.query<Record<string, unknown>>(`select id, created_at, diff, rationale, state, applied_at from rubric_proposals order by created_at desc limit 20`);
  return r.rows.map((x) => ({ id: x.id as string, createdAt: iso(x.created_at)!, diff: x.diff as string, rationale: x.rationale as string, state: x.state as string, appliedAt: iso(x.applied_at) }));
}
export async function decideProposal(sql: Sql, id: string, state: "approved" | "rejected", by: string): Promise<boolean> {
  const r = await sql.query(`update rubric_proposals set state = $2, decided_by = $3, decided_at = now() where id = $1 and state = 'pending' returning id`, [id, state, by]);
  return r.rows.length === 1;
}
