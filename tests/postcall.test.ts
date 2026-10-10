import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/lib/config";
import { MockGemini, type GenerateRequest } from "../src/lib/gemini";
import { detectSpokenPrice } from "../src/lib/postcall/compliance";
import { pgliteDb } from "../src/lib/postcall/db";
import { MockHubspotClient } from "../src/lib/postcall/hubspot";
import { parseVaaniEvent, PayloadError, type CallRecord } from "../src/lib/postcall/payload";
import { handleVaaniEvent, processCall, type ProcessDeps } from "../src/lib/postcall/process";
import { PostCallStore } from "../src/lib/postcall/store";
import { parseTranscript } from "../src/lib/postcall/transcript";

const root = join(import.meta.dirname, "..");
const DEFLECTION =
  "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.";

// ---- helpers ---------------------------------------------------------------
type Line = ["agent" | "user", string];
const transcriptOf = (lines: Line[]) =>
  lines.map(([r, t], i) => `[10:${String(i).padStart(2, "0")}:00] ${r.toUpperCase()}: ${t}`).join("\n\n");

function record(lines: Line[], over: Partial<CallRecord> = {}): CallRecord {
  const transcript = transcriptOf(lines);
  return {
    callId: "call-1", startedAt: new Date("2026-10-12T04:30:00Z"), endedAt: new Date("2026-10-12T04:36:00Z"), durationSeconds: 360,
    endReason: "Call ended", summary: "Caller wants a 3BHK redesign in Baner.", entities: {}, dispositions: {}, recordingUrl: "https://example.com/r",
    transcript, turns: parseTranscript(transcript), callerNumber: "+919800000001", ...over,
  };
}

const GOOD: Line[] = [
  ["agent", "Hello, thank you for calling Aangan Studio. How can I help you today?"],
  ["user", "Hi, I want to redo my 3BHK flat in Baner."],
  ["agent", "Lovely. May I have your name?"],
  ["user", "Rahul Sharma."],
  ["agent", "When would you need the project complete?"],
  ["user", "In about five months."],
  ["agent", "Great. Could I have your email and phone number?"],
  ["user", "rahul at gmail dot com, 98000 00001."],
  ["agent", "Let me check availability. I can offer Tuesday at 11 AM."],
  ["user", "That works."],
  ["agent", "Booked for Tuesday 11 AM. A designer will call you."],
];

function extraction(over: { answers?: object; contact?: object; agent?: object } = {}) {
  return {
    answers: { project_type: "full_home", project_description: "3BHK redesign", wants_design_and_execution: "yes", bhk: 3, location_text: "Baner", needed_by_text: "in about five months", weeks_until_needed: 20, decision_maker: "self", ...over.answers },
    contact: { name: "Rahul Sharma", email: "rahul@gmail.com", phone: "+919800000001", ...over.contact },
    agent: { stated_price: false, price_evidence: [], booking_started_turn: 8, booking_confirmed: true, qualifying_complete_turn: 5, asked_for_email: true, gave_decline_close: false, caller_not_understood: false, ...over.agent },
  };
}
const crit = (s: Record<string, string> = {}) => ({
  verdict: "qualified",
  criteria: Object.fromEntries(["real_project", "service_area", "timeline", "budget_band", "decision_maker"].map((c) => [c, { status: s[c] ?? (c === "budget_band" ? "not_mentioned" : "pass"), evidence: `${c} ok` }])),
  questions: [], question_to_ask: null, decline_reason: null, handoff_notes: [],
});

function gemini(ex: unknown, cl: unknown) {
  return new MockGemini((req: GenerateRequest) =>
    JSON.stringify(req.system.startsWith("You read the transcript") ? ex : cl),
  );
}

let db: PGlite;
let store: PostCallStore;
let hubspot: MockHubspotClient;

const deps = (g: MockGemini, hs: MockHubspotClient | null = hubspot): ProcessDeps => ({
  store, gemini: g, config: loadConfig({ KNOWLEDGE_DIR: join(root, "knowledge") }), hubspot: hs,
});
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;

beforeEach(async () => {
  db = new PGlite();
  const dir = join(root, "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  store = new PostCallStore(pgliteDb(db));
  hubspot = new MockHubspotClient();
});

// ---- the cases -------------------------------------------------------------
describe("processCall: qualified call", () => {
  it("saves call and lead, creates one HubSpot deal, raises no flags", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction(), crit())));
    expect(r.status).toBe("qualified");
    expect(r.hubspot).toBe("created");
    expect(r.priceSpoken).toBe(false);
    expect(r.bookingBeforeQualified).toBe(false);
    expect(hubspot.deals).toHaveLength(1);
    expect(hubspot.deals[0]).toMatchObject({ email: "rahul@gmail.com", projectType: "full_home", location: "Baner", clientSize: "Full home" });
    const [c] = await q<{ status: string; price_spoken: boolean; summary: string; is_after_hours: boolean }>("select * from calls");
    expect(c).toMatchObject({ status: "qualified", price_spoken: false, summary: "Caller wants a 3BHK redesign in Baner.", is_after_hours: false });
    const [l] = await q<{ email: string; hubspot_deal_id: string; needed_by: unknown }>("select * from leads");
    expect(l!.email).toBe("rahul@gmail.com");
    expect(l!.hubspot_deal_id).toBe("deal-1");
    expect(l!.needed_by).toBeTruthy();
    expect(await q("select * from review_queue")).toHaveLength(0);
  });
});

describe("processCall: price check", () => {
  it("a price question answered with the approved deflection is clean", async () => {
    const lines: Line[] = [...GOOD.slice(0, 2), ["user", "How much will it cost?"], ["agent", DEFLECTION + " Let me ask you a couple of quick things first."], ...GOOD.slice(2)];
    const r = await processCall(record(lines), deps(gemini(extraction({ agent: { booking_started_turn: 10, qualifying_complete_turn: 7 } }), crit())));
    expect(r.priceSpoken).toBe(false);
    expect(await q("select * from review_queue")).toHaveLength(0);
  });

  it("agent states a price: regex catches it even when Gemini misses it, call goes on the review list", async () => {
    const lines: Line[] = [...GOOD.slice(0, 2), ["user", "What will it cost?"], ["agent", "For a 3BHK it will cost around 15 lakh."], ...GOOD.slice(2)];
    const r = await processCall(record(lines), deps(gemini(extraction({ agent: { stated_price: false, booking_started_turn: 10, qualifying_complete_turn: 7 } }), crit())));
    expect(r.priceSpoken).toBe(true);
    const [c] = await q<{ price_spoken: boolean }>("select price_spoken from calls");
    expect(c!.price_spoken).toBe(true);
    const rq = await q<{ kind: string; reasons: { type: string }[] }>("select kind, reasons from review_queue");
    expect(rq).toHaveLength(1);
    expect(rq[0]!.kind).toBe("compliance");
    expect(rq[0]!.reasons.map((x) => x.type)).toContain("price_spoken");
  });

  it("Gemini catches a price the regex cannot (number words, hint)", async () => {
    const lines: Line[] = [...GOOD.slice(0, 2), ["user", "Roughly?"], ["agent", "Most clients land somewhere between fifteen and twenty for a flat like that."], ...GOOD.slice(2)];
    expect(detectSpokenPrice(parseTranscript(transcriptOf(lines))).found).toBe(false);
    const r = await processCall(record(lines), deps(gemini(extraction({ agent: { stated_price: true, price_evidence: [{ turn: 3, quote: "between fifteen and twenty" }], booking_started_turn: 10, qualifying_complete_turn: 7 } }), crit())));
    expect(r.priceSpoken).toBe(true);
  });

  it("price flag also applies to an unqualified call and a qualified call keeps its lead", async () => {
    const lines: Line[] = [["agent", "Hello."], ["user", "Price for a flat in Talegaon?"], ["agent", "Rates start at 1,800 per sq ft."]];
    const r = await processCall(record(lines), deps(gemini(extraction({ answers: { location_text: "Talegaon" }, agent: { booking_started_turn: null, booking_confirmed: false } }), crit({ service_area: "fail" }))));
    expect(r.status).toBe("unqualified");
    expect(r.priceSpoken).toBe(true);
    const [rq] = await q<{ kind: string; reasons: { type: string }[] }>("select kind, reasons from review_queue");
    expect(rq!.kind).toBe("unqualified");
    expect(rq!.reasons.map((x) => x.type)).toEqual(expect.arrayContaining(["unqualified", "price_spoken"]));
  });
});

describe("processCall: booking flags", () => {
  it("booking started before the caller gave what, where and when is flagged", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction({ agent: { booking_started_turn: 2, qualifying_complete_turn: 5 } }), crit())));
    expect(r.bookingBeforeQualified).toBe(true);
    const [c] = await q<{ booking_before_qualified: boolean; flags: { booking: { before_info_complete: boolean } } }>("select booking_before_qualified, flags from calls");
    expect(c!.booking_before_qualified).toBe(true);
    expect(c!.flags.booking.before_info_complete).toBe(true);
    expect(await q("select * from review_queue")).toHaveLength(1);
  });

  it("booking a lead the classifier does not qualify is flagged, and no HubSpot deal is made", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction({ answers: { location_text: "Nashik" } }), crit({ service_area: "fail" }))));
    expect(r.status).toBe("unqualified");
    expect(r.bookingBeforeQualified).toBe(true);
    expect(hubspot.deals).toHaveLength(0);
    expect(r.hubspot).toBe("skipped");
  });

  it("details left unclear in the transcript do not cancel a lead the agent already took forward", async () => {
    const unclear = crit({ real_project: "unclear" });
    const r = await processCall(record(GOOD), deps(gemini(extraction(), unclear)));
    expect(r.status).toBe("qualified");
    const [l] = await q<{ handoff_notes: string[] }>("select handoff_notes from leads");
    expect(l!.handoff_notes.join(" ")).toMatch(/Could not confirm real project/);
  });

  it("the same unclear details with no booking or email ask follow the configured policy (unqualified)", async () => {
    const lines: Line[] = [["agent", "Hello."], ["user", "I want something done in my flat."], ["agent", "Thanks for calling."]];
    const r = await processCall(record(lines), deps(gemini(extraction({ agent: { booking_started_turn: null, booking_confirmed: false, asked_for_email: false } }), crit({ real_project: "unclear" }))));
    expect(r.status).toBe("unqualified");
  });

  it("never flags a booking made after the details were complete on a qualified call", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction(), crit())));
    expect(r.bookingBeforeQualified).toBe(false);
  });

  it("booking confirmed without a start turn counts, using the last agent turn", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction({ agent: { booking_started_turn: null, booking_confirmed: true, qualifying_complete_turn: null } }), crit())));
    expect(r.bookingBeforeQualified).toBe(true);
  });
});

describe("processCall: unqualified, failed, duplicates", () => {
  it("unqualified call: lead has no email, goes to the review queue with criteria, no HubSpot deal", async () => {
    const lines: Line[] = [["agent", "Hello."], ["user", "I need interiors in Talegaon."], ["agent", "We currently serve Pune and PCMC only. This sounds like it may not be the right fit for us right now."]];
    const cl = { ...crit({ service_area: "fail" }), decline_reason: "We serve Pune and PCMC only." };
    const r = await processCall(record(lines), deps(gemini(extraction({ answers: { location_text: "Talegaon" }, contact: { email: "x@y.com" }, agent: { booking_started_turn: null, booking_confirmed: false, gave_decline_close: true } }), cl)));
    expect(r.status).toBe("unqualified");
    const [l] = await q<{ email: string | null; phone: string }>("select email, phone from leads");
    expect(l!.email).toBeNull();
    expect(l!.phone).toBe("+919800000001");
    const [rq] = await q<{ kind: string; state: string; reasons: { criteria: { criterion: string }[] }[] }>("select kind, state, reasons from review_queue");
    expect(rq).toMatchObject({ kind: "unqualified", state: "pending" });
    expect(rq!.reasons[0]!.criteria[0]!.criterion).toBe("service_area");
    expect(hubspot.deals).toHaveLength(0);
  });

  it("no caller speech: failed, callback due one hour after the call ended", async () => {
    const r = await processCall(record([["agent", "Hello, thank you for calling Aangan Studio."]]), deps(gemini({}, {})));
    expect(r.status).toBe("failed");
    const [c] = await q<{ status: string; failure_reason: string; callback_due_at: Date; called_back_at: null }>("select * from calls");
    expect(c!.status).toBe("failed");
    expect(c!.failure_reason).toMatch(/No caller speech/);
    expect(new Date(c!.callback_due_at).toISOString()).toBe("2026-10-12T05:36:00.000Z");
    expect(await q("select * from leads")).toHaveLength(0);
    expect(hubspot.deals).toHaveLength(0);
  });

  it("Gemini down: the call is saved as failed for a person to review, not lost", async () => {
    const down = new MockGemini(() => { throw new Error("gemini down"); });
    const r = await processCall(record(GOOD), deps(down));
    expect(r.status).toBe("failed");
    const [c] = await q<{ failure_reason: string; transcript: string }>("select failure_reason, transcript from calls");
    expect(c!.failure_reason).toMatch(/Post-call analysis failed/);
    expect(c!.transcript).toContain("Rahul Sharma");
  });

  it("caller not understood: failed", async () => {
    const lines: Line[] = [["agent", "Hello."], ["user", "..."], ["agent", "Sorry, I could not understand."]];
    const r = await processCall(record(lines), deps(gemini(extraction({ agent: { caller_not_understood: true } }), crit())));
    expect(r.status).toBe("failed");
  });

  it("the same call twice stores one call and one deal", async () => {
    const g = gemini(extraction(), crit());
    await processCall(record(GOOD), deps(g));
    const again = await processCall(record(GOOD), deps(g));
    expect(again.duplicate).toBe(true);
    expect(await q("select * from calls")).toHaveLength(1);
    expect(await q("select * from leads")).toHaveLength(1);
    expect(hubspot.deals).toHaveLength(1);
  });

  it("HubSpot failure keeps the saved call, records the error, and a retry creates the deal once", async () => {
    hubspot.failWith = new Error("hubspot down");
    const g = gemini(extraction(), crit());
    const first = await processCall(record(GOOD), deps(g));
    expect(first.status).toBe("qualified");
    expect(first.hubspot).toBe("failed");
    const [c] = await q<{ flags: { hubspot_error: string } }>("select flags from calls");
    expect(c!.flags.hubspot_error).toMatch(/hubspot down/);
    hubspot.failWith = null;
    const retry = await processCall(record(GOOD), deps(g));
    expect(retry.duplicate).toBe(true);
    expect(retry.hubspot).toBe("created");
    expect(hubspot.deals).toHaveLength(1);
    const [l] = await q<{ hubspot_deal_id: string }>("select hubspot_deal_id from leads");
    expect(l!.hubspot_deal_id).toBe("deal-1");
  });

  it("HubSpot not configured: lead saved, reported as not_configured", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction(), crit()), null));
    expect(r.hubspot).toBe("not_configured");
    expect(await q("select * from leads")).toHaveLength(1);
  });

  it("agent declined a caller who qualifies: lead kept, note added, compliance entry for a callback", async () => {
    const r = await processCall(record(GOOD), deps(gemini(extraction({ agent: { gave_decline_close: true, booking_started_turn: null, booking_confirmed: false } }), crit())));
    expect(r.reasons).toContain("declined_but_qualified");
    const [l] = await q<{ handoff_notes: string[] }>("select handoff_notes from leads");
    expect(l!.handoff_notes.join(" ")).toMatch(/Call back first/);
  });

  it("after-hours call is marked", async () => {
    const night = record(GOOD, { startedAt: new Date("2026-10-12T20:30:00Z"), endedAt: new Date("2026-10-12T20:36:00Z") });
    await processCall(night, deps(gemini(extraction(), crit())));
    const [c] = await q<{ is_after_hours: boolean }>("select is_after_hours from calls");
    expect(c!.is_after_hours).toBe(true);
  });
});

describe("handleVaaniEvent and payload parsing", () => {
  const docEvent = {
    event: "call_postprocessing", call_id: "inbound-1", timestamp: "2026-10-12T04:36:00+00:00",
    data: { room_name: "inbound-1", call_id: "inbound-1", call_duration: 360000, end_reason: "Call ended", summary: "s", entities: { name: "Rahul" }, dispositions: {}, recording_url: "https://x", transcript: transcriptOf(GOOD) },
  };

  it("parses the documented call_postprocessing payload (duration in ms)", () => {
    const e = parseVaaniEvent(docEvent);
    expect(e.kind).toBe("postprocessing");
    if (e.kind !== "postprocessing") return;
    expect(e.record.callId).toBe("inbound-1");
    expect(e.record.durationSeconds).toBe(360);
    expect(e.record.startedAt.toISOString()).toBe("2026-10-12T04:30:00.000Z");
    expect(e.record.turns).toHaveLength(11);
    expect(e.record.callerNumber).toBeNull();
  });

  it("other event types are ignored, a malformed one is rejected", () => {
    expect(parseVaaniEvent({ event: "call_started", room_name: "r1" }).kind).toBe("ignored");
    expect(() => parseVaaniEvent({ event: "call_postprocessing", data: { call_duration: "x" } })).toThrow(PayloadError);
  });

  it("stores the raw body, processes it, marks it processed; ignored and malformed bodies are kept too", async () => {
    const g = gemini(extraction(), crit());
    const ok = await handleVaaniEvent(docEvent, deps(g), parseVaaniEvent);
    expect("status" in ok.result && ok.result.status).toBe("qualified");
    await handleVaaniEvent({ event: "call_started", room_name: "r2" }, deps(g), parseVaaniEvent);
    await expect(handleVaaniEvent({ event: "call_postprocessing", data: {} }, deps(g), parseVaaniEvent)).rejects.toThrow();
    const ev = await q<{ event: string; state: string }>("select event, state from webhook_events order by received_at");
    expect(ev.map((e) => e.state).sort()).toEqual(["failed", "ignored", "processed"]);
  });
});

describe("transcript and price detector", () => {
  it("parses AGENT and USER turns in Vaani's format", () => {
    const t = parseTranscript("[13:33:14] AGENT: Hi there\n\n[13:33:19] USER: Yeah.\nHow are you?\n\n[13:33:31] AGENT: Fine.");
    expect(t.map((x) => x.role)).toEqual(["agent", "user", "agent"]);
    expect(t[1]!.text).toBe("Yeah.\nHow are you?");
  });

  it("flags agent prices and ignores the deflection, size talk, and the caller's own numbers", () => {
    const bad = ["It costs around 15 lakh.", "Rates start at 1800 per sq ft", "Roughly twenty thousand rupees.", "Typically the cost is moderate for this.", "bees hazaar rupaye lagenge", "₹5,00,000"];
    for (const s of bad) expect(detectSpokenPrice(parseTranscript(`[10:00:00] AGENT: ${s}`)).found, s).toBe(true);
    const ok = [DEFLECTION, "We take on offices up to about 3,000 square feet.", "The consultation is 45 minutes.", "Which area in Pune is it?", "We need about ten weeks of lead time."];
    for (const s of ok) expect(detectSpokenPrice(parseTranscript(`[10:00:00] AGENT: ${s}`)).found, s).toBe(false);
    expect(detectSpokenPrice(parseTranscript("[10:00:00] USER: my budget is 15 lakh")).found).toBe(false);
  });
});
