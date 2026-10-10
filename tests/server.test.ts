import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockCalcomClient } from "../src/lib/calcom";
import { loadConfig } from "../src/lib/config";
import { MockEmailSender } from "../src/lib/email";
import { MockGemini, type GenerateRequest } from "../src/lib/gemini";
import { ConvertError, convertLead } from "../src/lib/leads/convert";
import { weekMetrics, weekStartIst } from "../src/lib/metrics";
import { pgliteDb } from "../src/lib/postcall/db";
import { MockHubspotClient } from "../src/lib/postcall/hubspot";
import { PostCallStore } from "../src/lib/postcall/store";
import { draftRubricProposal, previousWeekStart, runWeekly } from "../src/lib/weekly";
import { callbackList, decideProposal, designerLeads, leadsFor, markCalledBack, pendingReview, progressPct, resolveReview, setRequirement } from "../src/server/queries";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`); } }));

const root = join(import.meta.dirname, "..");
const knowledge = { services: readFileSync(join(root, "knowledge", "services.md"), "utf8"), pricing: readFileSync(join(root, "knowledge", "pricing.md"), "utf8"), qualified: readFileSync(join(root, "knowledge", "qualified.md"), "utf8") };

let pg: PGlite;
let sql: ReturnType<typeof pgliteDb>;
let store: PostCallStore;
const q = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) => (await pg.query<T>(s, p)).rows;

beforeEach(async () => {
  pg = new PGlite();
  for (const f of readdirSync(join(root, "db", "migrations")).sort()) await pg.exec(readFileSync(join(root, "db", "migrations", f), "utf8"));
  await pg.exec(readFileSync(join(root, "db", "seed.sql"), "utf8"));
  sql = pgliteDb(pg);
  store = new PostCallStore(sql);
});

async function seedCall(id: string, status: string, over: Record<string, unknown> = {}) {
  const r = await q<{ id: string }>(
    `insert into calls (vaani_call_id, started_at, ended_at, status, failure_reason, callback_due_at, price_spoken, response_seconds, transcript)
     values ($1, coalesce($2::timestamptz, now()), coalesce($2::timestamptz, now()), $3, $4, $5::timestamptz, $6, $7, 'AGENT: hi') returning id`,
    [id, over.at ?? null, status, status === "failed" ? "dropped" : null, over.due ?? null, over.price ?? false, over.resp ?? 0],
  );
  return r[0]!.id;
}
async function seedLead(callId: string, over: Record<string, unknown> = {}) {
  const r = await q<{ id: string }>(`insert into leads (call_id, name, phone, email, project_type, assigned_designer_id) values ($1, $2, '+91980', $3, 'full_home', $4) returning id`, [callId, over.name ?? "Asha Caller", over.email ?? null, over.designer ?? null]);
  return r[0]!.id;
}
async function seedReview(leadId: string, kind: string, reasons: unknown[] = [{ type: "unqualified", decline_reason: "x", criteria: [{ criterion: "service_area", status: "fail", evidence: "outside" }] }]) {
  const r = await q<{ id: string }>(`insert into review_queue (lead_id, kind, reasons) values ($1, $2, $3::jsonb) returning id`, [leadId, kind, JSON.stringify(reasons)]);
  return r[0]!.id;
}

describe("designer view", () => {
  it("a designer sees only their own leads, with checklist and progress", async () => {
    const [d1, d2] = (await q<{ id: string }>("select id from designers order by name limit 2")).map((x) => x.id);
    const l1 = await seedLead(await seedCall("a", "qualified"), { email: "a@x.co", designer: d1 });
    await seedLead(await seedCall("b", "qualified"), { email: "b@x.co", designer: d2 });
    await q(`insert into requirements (lead_id, item) values ($1, 'Kitchen'), ($1, 'Wardrobes')`, [l1]);
    const mine = await designerLeads(sql, d1!);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.requirements).toHaveLength(2);
    expect(progressPct(mine[0]!.requirements)).toBe(0);
    expect(await designerLeads(sql, d2!)).toHaveLength(1);
  });

  it("ticking updates progress, and a designer cannot tick another designer's item", async () => {
    const [d1, d2] = (await q<{ id: string }>("select id from designers order by name limit 2")).map((x) => x.id);
    const l1 = await seedLead(await seedCall("a", "qualified"), { email: "a@x.co", designer: d1 });
    await q(`insert into requirements (lead_id, item) values ($1, 'Kitchen'), ($1, 'Wardrobes')`, [l1]);
    const [r1] = await q<{ id: string }>("select id from requirements order by item limit 1");
    expect(await setRequirement(sql, d2!, r1!.id, true)).toBe(false);
    expect(await setRequirement(sql, d1!, r1!.id, true)).toBe(true);
    expect(progressPct((await designerLeads(sql, d1!))[0]!.requirements)).toBe(50);
    expect(progressPct([])).toBe(0);
  });
});

describe("one team view", () => {
  it("the whole-team view lists every qualified lead with its designer, including unassigned ones; a designer sees only theirs", async () => {
    const [d1, d2] = (await q<{ id: string }>("select id from designers order by name limit 2")).map((x) => x.id);
    await seedLead(await seedCall("a", "qualified"), { email: "a@x.co", designer: d1, name: "A" });
    await seedLead(await seedCall("b", "qualified"), { email: "b@x.co", designer: d2, name: "B" });
    await seedLead(await seedCall("c", "qualified"), { name: "C" }); // qualified, no designer yet
    await seedLead(await seedCall("u", "unqualified"), { name: "U" }); // unqualified: review queue only
    const team = await leadsFor(sql, null);
    expect(team.map((l) => l.name).sort()).toEqual(["A", "B", "C"]);
    expect(team.find((l) => l.name === "A")!.designerName).toBeTruthy();
    expect(team.find((l) => l.name === "C")!.designerName).toBeNull();
    expect((await leadsFor(sql, d1!)).map((l) => l.name)).toEqual(["A"]);
  });
  it("the team view can tick any checklist item", async () => {
    const [d1] = (await q<{ id: string }>("select id from designers order by name limit 1")).map((x) => x.id);
    const l = await seedLead(await seedCall("a", "qualified"), { email: "a@x.co", designer: d1 });
    await q(`insert into requirements (lead_id, item) values ($1, 'Kitchen')`, [l]);
    const [r] = await q<{ id: string }>("select id from requirements");
    expect(await setRequirement(sql, null, r!.id, true)).toBe(true);
  });
});

describe("front desk", () => {
  it("delete scrubs the caller's details but keeps the decision, and logs it", async () => {
    const lead = await seedLead(await seedCall("u", "unqualified"));
    const rv = await seedReview(lead, "unqualified");
    expect(await resolveReview(sql, rv, "delete", "front desk")).toBe(true);
    const [l] = await q<{ name: string | null; phone: string | null }>("select name, phone from leads");
    expect(l).toEqual({ name: null, phone: null });
    const [c] = await q<{ transcript: string | null }>("select transcript from calls");
    expect(c!.transcript).toBeNull();
    expect(await q("select * from decisions where action = 'delete' and original_verdict = 'unqualified'")).toHaveLength(1);
    expect(await pendingReview(sql)).toHaveLength(0);
    expect(await resolveReview(sql, rv, "delete", "front desk")).toBe(false);
  });

  it("lists unqualified and compliance items", async () => {
    await seedReview(await seedLead(await seedCall("u", "unqualified")), "unqualified");
    await seedReview(await seedLead(await seedCall("c", "qualified", { price: true }), { email: "c@x.co" }), "compliance", [{ type: "price_spoken" }]);
    const items = await pendingReview(sql);
    expect(items.map((i) => i.kind).sort()).toEqual(["compliance", "unqualified"]);
    expect(items.find((i) => i.kind === "compliance")!.priceSpoken).toBe(true);
    expect(await resolveReview(sql, items.find((i) => i.kind === "compliance")!.reviewId, "reviewed", "front desk")).toBe(true);
  });

  it("callback list: open items first, overdue marked, mark called back", async () => {
    const now = new Date("2026-10-12T10:00:00Z");
    await seedCall("f1", "failed", { at: "2026-10-12T08:00:00Z", due: "2026-10-12T09:00:00Z" });
    await seedCall("f2", "failed", { at: "2026-10-12T09:30:00Z", due: "2026-10-12T10:30:00Z" });
    let list = await callbackList(sql, now);
    expect(list.open.map((i) => i.overdue)).toEqual([true, false]);
    await markCalledBack(sql, list.open[0]!.callId);
    list = await callbackList(sql, now);
    expect(list.open).toHaveLength(1);
    expect(list.recent).toHaveLength(1);
  });
});

describe("convert an unqualified lead", () => {
  const mk = () => {
    const calcom = new MockCalcomClient();
    const email = new MockEmailSender();
    const hubspot = new MockHubspotClient();
    const g = new MockGemini((req: GenerateRequest) => JSON.stringify(req.system.startsWith("You help designers") ? { summary: "Lead summary.", tips: [{ title: "A", detail: "a" }, { title: "B", detail: "b" }] } : {}));
    return { calcom, email, hubspot, deps: { store, config: loadConfig({ KNOWLEDGE_DIR: join(root, "knowledge") }), gemini: g, knowledge, calcom, email, hubspot, dashboardBaseUrl: "https://app.example" } };
  };

  it("needs a valid email first: the caller must be called back", async () => {
    const rv = await seedReview(await seedLead(await seedCall("u", "unqualified")), "unqualified");
    const { deps } = mk();
    await expect(convertLead(sql, { reviewId: rv, email: "", by: "fd" }, deps)).rejects.toBeInstanceOf(ConvertError);
    await expect(convertLead(sql, { reviewId: rv, email: "not-an-email", by: "fd" }, deps)).rejects.toThrow(/valid email/);
    expect((await q<{ state: string }>("select state from review_queue"))[0]!.state).toBe("pending");
  });

  it("books the chosen slot, assigns a designer, creates the deal, emails the designer, logs the decision", async () => {
    const lead = await seedLead(await seedCall("u", "unqualified"));
    const rv = await seedReview(lead, "unqualified");
    const { deps, calcom, email, hubspot } = mk();
    const r = await convertLead(sql, { reviewId: rv, email: " New@Example.com ", slotIso: "2026-10-14T05:30:00.000Z", by: "front desk" }, deps);
    expect(r).toMatchObject({ hubspot: "created", email: "sent" });
    expect(calcom.bookings[0]).toMatchObject({ email: "new@example.com", start: "2026-10-14T05:30:00.000Z" });
    const [l] = await q<{ email: string; assigned_designer_id: string; booked_slot: Date; calcom_booking_uid: string }>("select * from leads");
    expect(l!.email).toBe("new@example.com");
    expect(l!.assigned_designer_id).toBeTruthy();
    expect(l!.calcom_booking_uid).toBe("mock-1");
    expect(email.sent).toHaveLength(1);
    expect(hubspot.deals).toHaveLength(1);
    expect((await q<{ state: string }>("select state from review_queue"))[0]!.state).toBe("converted");
    expect(await q("select * from decisions where action = 'convert' and final_outcome = 'converted'")).toHaveLength(1);
  });

  it("works without a slot (designer arranges), and cannot be converted twice", async () => {
    const rv = await seedReview(await seedLead(await seedCall("u", "unqualified")), "unqualified");
    const { deps, calcom } = mk();
    await convertLead(sql, { reviewId: rv, email: "n@x.co", by: "fd" }, deps);
    expect(calcom.bookings).toHaveLength(0);
    await expect(convertLead(sql, { reviewId: rv, email: "n@x.co", by: "fd" }, deps)).rejects.toThrow(/no longer pending/);
  });

  it("a failed Cal.com booking leaves the lead unconverted", async () => {
    const rv = await seedReview(await seedLead(await seedCall("u", "unqualified")), "unqualified");
    const { deps, calcom } = mk();
    calcom.failWith = new Error("cal down");
    await expect(convertLead(sql, { reviewId: rv, email: "n@x.co", slotIso: "2026-10-14T05:30:00.000Z", by: "fd" }, deps)).rejects.toThrow(/cal down/);
    expect((await q<{ state: string }>("select state from review_queue"))[0]!.state).toBe("pending");
    expect((await q<{ email: string | null }>("select email from leads"))[0]!.email).toBeNull();
  });

  it("compliance items cannot be converted", async () => {
    const rv = await seedReview(await seedLead(await seedCall("c", "qualified"), { email: "c@x.co" }), "compliance", [{ type: "price_spoken" }]);
    await expect(convertLead(sql, { reviewId: rv, email: "n@x.co", by: "fd" }, mk().deps)).rejects.toThrow(/not an unqualified/);
  });
});

describe("metrics", () => {
  it("counts the week and callback performance", async () => {
    const monday = "2026-10-12";
    expect(weekStartIst(new Date("2026-10-15T10:00:00Z"))).toBe(monday);
    expect(weekStartIst(new Date("2026-10-11T19:00:00Z"))).toBe(monday); // Sunday 19:00 UTC is Monday 00:30 IST
    expect(previousWeekStart(new Date("2026-10-19T04:00:00Z"))).toBe(monday);
    await seedCall("q", "qualified", { at: "2026-10-13T05:00:00Z", resp: 0 });
    await seedCall("u", "unqualified", { at: "2026-10-13T06:00:00Z", resp: 10 });
    const f1 = await seedCall("f1", "failed", { at: "2026-10-14T05:00:00Z", due: "2026-10-14T06:00:00Z" });
    await seedCall("f2", "failed", { at: "2026-10-14T05:10:00Z", due: "2026-10-14T06:10:00Z" });
    await seedCall("old", "qualified", { at: "2026-10-01T05:00:00Z" });
    await q(`update calls set called_back_at = '2026-10-14T05:40:00Z' where id = $1`, [f1]);
    const m = await weekMetrics(sql, monday, new Date("2026-10-15T00:00:00Z"));
    expect(m.counts).toEqual({ qualified: 1, unqualified: 1, failed: 2, total: 4 });
    expect(m.response.underFiveMinutesPct).toBe(100);
    expect(m.failed).toMatchObject({ total: 2, calledBack: 1, calledBackWithinHour: 1, withinHourPct: 50, overdue: 1, medianMinutesToCallback: 40 });
  });
});

describe("weekly job and rubric proposals", () => {
  const goodNew = knowledge.qualified.replace("- Not knowing exactly what they want (that's the consultation's job)", "- Not knowing exactly what they want (that's the consultation's job)\n- Saying \"redo my whole flat\" without the word execution");
  const respond = (proposal: unknown) => new MockGemini((req: GenerateRequest) => (req.system.startsWith("You write the weekly note") ? "- Most unqualified calls were about location.\n- Two were converted." : JSON.stringify(proposal)));

  let seq = 0;
  async function seedConverted(n: number) {
    for (let i = 0; i < n; i++, seq++) {
      const lead = await seedLead(await seedCall(`cv${seq}`, "unqualified", { at: "2026-10-13T05:00:00Z" }), { email: `c${seq}@x.co` });
      const rv = await seedReview(lead, "unqualified");
      await q(`update review_queue set state='converted', decided_at='2026-10-14T05:00:00Z' where id=$1`, [rv]);
      await q(`insert into decisions (lead_id, action, original_verdict, final_outcome, decided_at) values ($1,'convert','unqualified','converted','2026-10-14T05:00:00Z')`, [lead]);
    }
  }

  it("writes the weekly summary and stores the numbers", async () => {
    await seedCall("q", "qualified", { at: "2026-10-13T05:00:00Z" });
    const r = await runWeekly(sql, { gemini: respond({ change: false, rationale: "", new_text: null }), rubricMd: knowledge.qualified, weekStart: "2026-10-12", now: new Date("2026-10-19T04:00:00Z") });
    expect(r.summary).toMatch(/location/);
    expect(r.proposalId).toBeNull();
    const [w] = await q<{ improvement_summary: string; counts: { counts: { total: number } } }>("select * from weekly_summaries");
    expect(w!.improvement_summary).toMatch(/Two were converted/);
    expect(w!.counts.counts.total).toBe(1);
  });

  it("a price in the written summary is withheld", async () => {
    const g = new MockGemini(() => "Calls cost Rs 5 lakh on average.");
    const r = await runWeekly(sql, { gemini: g, rubricMd: knowledge.qualified, weekStart: "2026-10-12" });
    expect(r.summary).toMatch(/withheld|redacted|budget figure/i);
    expect(r.summary).not.toMatch(/lakh/);
  });

  it("drafts a proposal only with two or more converted leads, and it starts pending", async () => {
    await seedConverted(1);
    const g = respond({ change: true, rationale: "Two converts said redo my whole flat.", new_text: goodNew });
    expect(await draftRubricProposal(sql, g, knowledge.qualified, "2026-10-12T00:00:00+05:30")).toBeNull();
    await seedConverted(2);
    const id = await draftRubricProposal(sql, g, knowledge.qualified, "2026-10-12T00:00:00+05:30");
    expect(id).toBeTruthy();
    const [p] = await q<{ state: string; diff: string; proposed_text: string }>("select state, diff, proposed_text from rubric_proposals");
    expect(p!.state).toBe("pending");
    expect(p!.diff).toContain("+- Saying");
    expect(p!.proposed_text).toBe(goodNew);
    expect(await draftRubricProposal(sql, g, knowledge.qualified, "2026-10-12T00:00:00+05:30")).toBeNull(); // no duplicate
  });

  it("rejects drafts that lose structure or add a money figure, and never touches the live file", async () => {
    await seedConverted(3);
    const bad = [
      knowledge.qualified.replace("### 3.", "### three"),
      knowledge.qualified.replace(/decline gracefully/i, "say goodbye"),
      knowledge.qualified + "\n- Budgets above ₹50 lakh always qualify",
      knowledge.qualified,
    ];
    for (const text of bad) expect(await draftRubricProposal(sql, respond({ change: true, rationale: "x", new_text: text }), knowledge.qualified, "2026-10-12T00:00:00+05:30")).toBeNull();
    expect(await q("select * from rubric_proposals")).toHaveLength(0);
  });

  it("approve and reject only work on pending proposals", async () => {
    await q(`insert into rubric_proposals (diff, rationale, proposed_text) values ('d', 'r', 't')`);
    const [p] = await q<{ id: string }>("select id from rubric_proposals");
    expect(await decideProposal(sql, p!.id, "approved", "Nikhil")).toBe(true);
    expect(await decideProposal(sql, p!.id, "rejected", "Nikhil")).toBe(false);
    expect((await q<{ state: string; decided_by: string }>("select state, decided_by from rubric_proposals"))[0]).toEqual({ state: "approved", decided_by: "Nikhil" });
  });
});

describe("sessions", () => {
  process.env.SESSION_SECRET = "s".repeat(32);
  it("signs and reads back a role, and rejects tampering and expiry", async () => {
    const { signSession, readSession } = await import("../src/server/session");
    const t0 = 1_000_000;
    const c = signSession({ kind: "designer", designerId: "d1", name: "Asha" }, t0);
    expect(readSession(c, t0 + 1000)).toEqual({ kind: "designer", designerId: "d1", name: "Asha" });
    expect(readSession(c, t0 + 13 * 3600 * 1000)).toBeNull();
    const [p, s] = c.split(".");
    const forged = `${Buffer.from(JSON.stringify({ role: { kind: "frontdesk" }, exp: t0 + 99999999 })).toString("base64url")}.${s}`;
    expect(readSession(forged, t0)).toBeNull();
    expect(readSession(`${p}.${"A".repeat(s!.length)}`, t0)).toBeNull();
    expect(readSession(undefined)).toBeNull();
    expect(readSession("garbage")).toBeNull();
  });
  it("one dashboard: OPEN_ACCESS shows everything without sign-in; otherwise it needs the team sign-in or a designer link", async () => {
    const { requireDashboard, requireTeam, openAccess } = await import("../src/server/session");
    delete process.env.OPEN_ACCESS;
    expect(openAccess()).toBe(false);
    await expect(requireDashboard()).rejects.toThrow(/redirect:\/login/);
    await expect(requireTeam()).rejects.toThrow(/redirect:\/login/);
    process.env.OPEN_ACCESS = "true";
    expect(await requireDashboard()).toEqual({ scope: "all" });
    await expect(requireTeam()).resolves.toBeUndefined();
    process.env.OPEN_ACCESS = "false";
    expect(openAccess()).toBe(false);
    delete process.env.OPEN_ACCESS;
  });
  it("password check fails closed when no password is configured or it is too short", async () => {
    const { passwordOk } = await import("../src/server/session");
    expect(passwordOk("hunter2hunter2", "hunter2hunter2")).toBe(true);
    expect(passwordOk("wrong", "hunter2hunter2")).toBe(false);
    expect(passwordOk("", undefined)).toBe(false);
    expect(passwordOk("short", "short")).toBe(false);
  });
});
