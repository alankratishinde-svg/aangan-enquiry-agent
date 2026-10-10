import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { MockCalcomClient } from "../src/lib/calcom";
import { loadConfig } from "../src/lib/config";
import { MockEmailSender } from "../src/lib/email";
import { MockGemini, type GenerateRequest } from "../src/lib/gemini";
import { pickDesigner } from "../src/lib/leads/assign";
import { buildDesignerEmail } from "../src/lib/leads/designer-email";
import { computeEstimate, ESTIMATE_FALLBACK, ESTIMATE_LABEL, parsePricing } from "../src/lib/leads/estimate";
import { writeSummaryAndTips } from "../src/lib/leads/summary";
import { containsPrice } from "../src/lib/classify/guard";
import { pgliteDb } from "../src/lib/postcall/db";
import { MockHubspotClient } from "../src/lib/postcall/hubspot";
import { processCall, type ProcessDeps } from "../src/lib/postcall/process";
import { PostCallStore } from "../src/lib/postcall/store";
import { parseTranscript } from "../src/lib/postcall/transcript";

const root = join(import.meta.dirname, "..");
const pricing = readFileSync(join(root, "knowledge", "pricing.md"), "utf8");

describe("internal estimate from pricing.md", () => {
  it("parses every tier from the live file", () => {
    const t = parsePricing(pricing)!;
    expect(t).not.toBeNull();
    expect(t.standard.low).toBeGreaterThan(0);
    expect(t.premium.high).toBeGreaterThan(t.premium.low);
    expect(t.luxury.high).toBeNull();
    expect(t.singleRoom.high).toBeGreaterThan(t.singleRoom.low);
  });

  it("home: area times the standard low to the premium high, with the label", () => {
    const t = parsePricing(pricing)!;
    const e = computeEstimate(pricing, { projectType: "full_home", areaSqFt: 1000 });
    expect(e.low).toBe(1000 * t.standard.low);
    expect(e.high).toBe(1000 * t.premium.high!);
    expect(e.text).toContain(ESTIMATE_LABEL);
    expect(e.text).toMatch(/Rs 18 lakh to Rs 35 lakh/);
  });

  it("single room uses the room range, office uses basic to mid-range", () => {
    expect(computeEstimate(pricing, { projectType: "single_room", areaSqFt: null }).text).toMatch(/Rs 3\.5 lakh to Rs 8 lakh/);
    const t = parsePricing(pricing)!;
    const o = computeEstimate(pricing, { projectType: "office", areaSqFt: 2000 });
    expect(o.low).toBe(2000 * t.basic.low);
    expect(o.high).toBe(2000 * t.mid.high!);
  });

  it("follows an edited pricing file, never a hardcoded number", () => {
    const edited = pricing.replace("₹1,800 – ₹2,400", "₹2,000 – ₹2,400");
    expect(computeEstimate(edited, { projectType: "full_home", areaSqFt: 1000 }).low).toBe(2_000_000);
  });

  it("shows 'See pricing.md' when parsing fails or details are missing", () => {
    expect(computeEstimate("# nothing", { projectType: "full_home", areaSqFt: 1000 }).text).toBe(ESTIMATE_FALLBACK);
    expect(computeEstimate(pricing, { projectType: "full_home", areaSqFt: null }).text).toBe(ESTIMATE_FALLBACK);
    expect(computeEstimate(pricing, { projectType: null, areaSqFt: 900 }).text).toBe(ESTIMATE_FALLBACK);
  });
});

describe("assignment and email", () => {
  it("picks the designer with the fewest open leads, ties by name", () => {
    const ds = [{ id: "b", name: "Bea" }, { id: "a", name: "Asha" }, { id: "c", name: "Cy" }];
    expect(pickDesigner(ds, new Map())!.id).toBe("a");
    expect(pickDesigner(ds, new Map([["a", 2], ["b", 1], ["c", 1]]))!.id).toBe("b");
    expect(pickDesigner([], new Map())).toBeNull();
  });

  const lead = { designerName: "Asha", designerEmail: "a@x.co", name: "Rahul <b>", phone: "+91", email: "r@x.co", projectType: "full_home", areaSqFt: 1200, location: "Baner", neededBy: "2027-03-01", clientSize: "Full home", summary: "Wants a 3BHK redesign.", bookedSlotIst: "Tue, 11:00 am to 11:45 am IST", handoffNotes: ["Decision-maker unclear."], estimateText: "Rs 21 lakh to Rs 42 lakh. Internal, indicative only, not for the client.", dashboardUrl: "https://app.example/designer?lead=1" };
  it("email has the subject, client size, slot, notes, link, and the estimate only with its label", () => {
    const m = buildDesignerEmail(lead);
    expect(m.subject).toBe("New lead: full home, 1200 sq ft, Baner");
    for (const s of ["Full home", "Tue, 11:00 am", "Decision-maker unclear.", "https://app.example/designer?lead=1", ESTIMATE_LABEL]) expect(m.text).toContain(s);
    expect(m.html).toContain("Rahul &lt;b&gt;");
  });
  it("a bare estimate still gets the label added", () => {
    expect(buildDesignerEmail({ ...lead, estimateText: "See pricing.md" }).text).toContain(`See pricing.md (${ESTIMATE_LABEL})`);
  });
});

describe("summary and tips", () => {
  const ok = JSON.stringify({ summary: "A 3BHK redesign in Baner.", tips: [{ title: "Lighting plan", detail: "Warm layered lighting suits the living area." }, { title: "Wardrobe design", detail: "Built-in wardrobes can save floor space." }] });
  const inp = { servicesMd: "services", answers: {}, callSummary: null, notes: [] };
  it("returns exactly two tips", async () => {
    const r = await writeSummaryAndTips(inp, new MockGemini([ok]));
    expect(r!.tips).toHaveLength(2);
  });
  it("trims extra tips to two", async () => {
    const three = JSON.stringify({ summary: "s", tips: [1, 2, 3].map((n) => ({ title: `T${n}`, detail: `D${n}` })) });
    expect((await writeSummaryAndTips(inp, new MockGemini([three])))!.tips).toHaveLength(2);
  });
  it("never lets a price through: money figures are redacted from the summary and tips", async () => {
    const bad = JSON.stringify({ summary: "Budget about Rs 5 lakh.", tips: [{ title: "Phase it", detail: "Costs about 3 lakh per room." }, { title: "Lighting", detail: "Good for the hall." }] });
    const r = await writeSummaryAndTips(inp, new MockGemini([bad, bad]));
    expect(containsPrice(JSON.stringify(r))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/lakh/);
    const fine = JSON.stringify({ summary: "Budget about Rs 5 lakh.", tips: [{ title: "Phase it", detail: "Do the hall first." }, { title: "Lighting", detail: "Good for the hall." }] });
    const r2 = await writeSummaryAndTips(inp, new MockGemini([fine]));
    expect(containsPrice(JSON.stringify(r2))).toBe(false);
  });
  it("is null when Gemini keeps failing", async () => {
    expect(await writeSummaryAndTips(inp, new MockGemini(["nope", "nope"]))).toBeNull();
  });
});

// ---- finalize through processCall ------------------------------------------
let db: PGlite;
let store: PostCallStore;
let calcom: MockCalcomClient;
let email: MockEmailSender;
let hubspot: MockHubspotClient;
const tx = (lines: ["agent" | "user", string][]) => lines.map(([r, t], i) => `[10:${String(i).padStart(2, "0")}:00] ${r.toUpperCase()}: ${t}`).join("\n\n");
const LINES: ["agent" | "user", string][] = [["agent", "Hello."], ["user", "Redo my 3BHK in Baner, full execution."], ["agent", "Email and phone?"], ["user", "r at x dot co, 98000 00001"], ["agent", "Booked Tuesday 11."]];
const rec = (id: string) => { const t = tx(LINES); return { callId: id, startedAt: new Date("2026-10-12T04:30:00Z"), endedAt: new Date("2026-10-12T04:36:00Z"), durationSeconds: 360, endReason: null, summary: "3BHK in Baner.", entities: {}, dispositions: {}, recordingUrl: null, transcript: t, turns: parseTranscript(t), callerNumber: "+919800000001" }; };
const EX = { answers: { project_type: "full_home", project_description: "3BHK", wants_design_and_execution: "yes", area_sq_ft: 1200, location_text: "Baner", weeks_until_needed: 20, decision_maker: "self" }, contact: { name: "Rahul", email: "r@x.co", phone: "+919800000001" }, requested_items: ["Living room redesign", "Modular kitchen"], agent: { stated_price: false, price_evidence: [], booking_started_turn: 4, booking_confirmed: true, qualifying_complete_turn: 3, asked_for_email: true, gave_decline_close: false, caller_not_understood: false } };
const CL = { verdict: "qualified", criteria: Object.fromEntries(["real_project", "service_area", "timeline", "budget_band", "decision_maker"].map((c) => [c, { status: c === "budget_band" ? "not_mentioned" : "pass", evidence: "ok" }])), questions: [], question_to_ask: null, decline_reason: null, handoff_notes: [] };
const SUM = { summary: "A 3BHK redesign in Baner.", tips: [{ title: "Lighting plan", detail: "Layered lighting suits living areas." }, { title: "Wardrobe design", detail: "Built-ins save space." }] };
const gemini = () => new MockGemini((req: GenerateRequest) => JSON.stringify(req.system.startsWith("You read the transcript") ? EX : req.system.startsWith("You help designers") ? SUM : CL));
const deps = (over: Partial<ProcessDeps> = {}): ProcessDeps => ({ store, gemini: gemini(), config: loadConfig({ KNOWLEDGE_DIR: join(root, "knowledge") }), hubspot, calcom, email, dashboardBaseUrl: "https://app.example", ...over });
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;

beforeEach(async () => {
  db = new PGlite();
  const dir = join(root, "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.exec(readFileSync(join(root, "db", "seed.sql"), "utf8"));
  store = new PostCallStore(pgliteDb(db));
  calcom = new MockCalcomClient();
  calcom.bookings.push({ uid: "bk-1", start: "2026-10-14T05:30:00.000Z", end: "2026-10-14T06:15:00.000Z", email: "r@x.co" });
  email = new MockEmailSender();
  hubspot = new MockHubspotClient();
});

describe("finalize a qualified lead", () => {
  it("finds the booking, assigns a designer, adds estimate, summary and 2 tips, makes the deal, emails the designer", async () => {
    const r = await processCall(rec("c1"), deps());
    expect(r.finalize).toMatchObject({ booking: "found", hubspot: "created", email: "sent", tips: true });
    const [l] = await q<{ assigned_designer_id: string; booked_slot: Date; calcom_booking_uid: string; add_on_tips: unknown[]; internal_estimate: { text: string }; email_sent_at: Date; hubspot_deal_id: string; summary: string }>("select * from leads");
    expect(l!.assigned_designer_id).toBeTruthy();
    expect(new Date(l!.booked_slot).toISOString()).toBe("2026-10-14T05:30:00.000Z");
    expect(l!.calcom_booking_uid).toBe("bk-1");
    expect(l!.add_on_tips).toHaveLength(2);
    expect(l!.internal_estimate.text).toContain(ESTIMATE_LABEL);
    expect(l!.summary).toBe("A 3BHK redesign in Baner.");
    expect(l!.hubspot_deal_id).toBe("deal-1");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.text).toContain("https://app.example/designer?lead=");
    expect(email.sent[0]!.text).toContain(ESTIMATE_LABEL);
    expect(hubspot.deals[0]!.internalEstimate).toContain(ESTIMATE_LABEL);
    const items = await q<{ item: string; delivered: boolean }>("select item, delivered from requirements order by item");
    expect(items.map((i) => i.item)).toEqual(["Living room redesign", "Modular kitchen"]);
  });

  it("running it again creates nothing new (one email, one deal)", async () => {
    await processCall(rec("c2"), deps());
    const again = await processCall(rec("c2"), deps());
    expect(again.duplicate).toBe(true);
    expect(email.sent).toHaveLength(1);
    expect(hubspot.deals).toHaveLength(1);
  });

  it("no Cal.com booking found: lead kept, designer told to arrange a time", async () => {
    calcom.bookings.length = 0;
    const r = await processCall(rec("c3"), deps());
    expect(r.finalize!.booking).toBe("none");
    const [l] = await q<{ booked_slot: Date | null; handoff_notes: string[] }>("select booked_slot, handoff_notes from leads");
    expect(l!.booked_slot).toBeNull();
    expect(l!.handoff_notes.join(" ")).toMatch(/No Cal\.com booking/);
    expect(email.sent[0]!.text).toMatch(/Please arrange a time/);
  });

  it("failures in one step do not stop the others and are recorded", async () => {
    calcom.failWith = new Error("cal down");
    email.failWith = new Error("mail down");
    const r = await processCall(rec("c4"), deps());
    expect(r.finalize).toMatchObject({ booking: "failed", email: "failed", hubspot: "created" });
    const [c] = await q<{ flags: { calcom_error: string; email_error: string } }>("select flags from calls");
    expect(c!.flags.calcom_error).toMatch(/cal down/);
    expect(c!.flags.email_error).toMatch(/mail down/);
    email.failWith = null;
    calcom.failWith = null;
    const retry = await processCall(rec("c4"), deps());
    expect(retry.finalize).toMatchObject({ booking: "found", email: "sent" });
    expect(hubspot.deals).toHaveLength(1);
  });

  it("with no email or Cal.com configured the lead is still saved and complete otherwise", async () => {
    const r = await processCall(rec("c5"), deps({ email: null, calcom: null, hubspot: null }));
    expect(r.finalize).toMatchObject({ booking: "not_configured", email: "not_configured", hubspot: "not_configured", tips: true });
  });

  it("spreads leads across designers", async () => {
    for (const [i, e] of ["a@x.co", "b@x.co", "c@x.co", "d@x.co", "e@x.co"].entries()) {
      const g = new MockGemini((req: GenerateRequest) => JSON.stringify(req.system.startsWith("You read the transcript") ? { ...EX, contact: { ...EX.contact, email: e } } : req.system.startsWith("You help designers") ? SUM : CL));
      await processCall(rec(`s${i}`), deps({ gemini: g, calcom: null }));
    }
    const counts = await q<{ n: number }>("select count(*)::int n from leads group by assigned_designer_id order by n desc");
    expect(counts.map((c) => c.n)).toEqual([2, 1, 1, 1]);
  });

  it("an unqualified call gets no designer, no email, no deal", async () => {
    const g = new MockGemini((req: GenerateRequest) => JSON.stringify(req.system.startsWith("You read the transcript") ? { ...EX, agent: { ...EX.agent, booking_started_turn: null, booking_confirmed: false, asked_for_email: false } } : { ...CL, criteria: { ...CL.criteria, service_area: { status: "fail", evidence: "outside" } } }));
    const r = await processCall(rec("u1"), deps({ gemini: g }));
    expect(r.status).toBe("unqualified");
    expect(r.finalize).toBeUndefined();
    expect(email.sent).toHaveLength(0);
    expect(hubspot.deals).toHaveLength(0);
    const [l] = await q<{ assigned_designer_id: string | null }>("select assigned_designer_id from leads");
    expect(l!.assigned_designer_id).toBeNull();
    expect(await q("select * from requirements")).toHaveLength(0);
  });
});
