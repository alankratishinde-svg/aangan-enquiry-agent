import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { MockGemini, type GenerateRequest } from "../src/lib/gemini";
import { loadConfig } from "../src/lib/config";
import { pgliteDb } from "../src/lib/postcall/db";
import { MockHubspotClient } from "../src/lib/postcall/hubspot";
import { processCall } from "../src/lib/postcall/process";
import { PostCallStore } from "../src/lib/postcall/store";
import { parseTranscript } from "../src/lib/postcall/transcript";
import { MockVaaniClient } from "../src/lib/vaani/client";
import { acceptWebhook } from "../src/lib/webhook/handler";
import { REAL_DELIVERY, REAL_TRANSCRIPT } from "./fixtures/real-vaani-delivery";
import { tokenOk, verifyWithVaani } from "../src/lib/webhook/verify";

const root = join(import.meta.dirname, "..");
const TOKEN = "t".repeat(32);
const NOW = new Date("2026-10-12T04:40:00Z");
const REAL = "AGENT: Hello, thank you for calling Aangan Studio.\n\n USER: I want my 3BHK in Baner redone fully, design and execution.\n\n AGENT: Which area?\n\n USER: Baner.";
const body = (over: Record<string, unknown> = {}) => ({
  event: "call_postprocessing", call_id: "inbound-1", timestamp: "2026-10-12T04:36:00+00:00",
  data: { call_id: "inbound-1", call_duration: 360000, end_reason: "Call ended", transcript: "FORGED TRANSCRIPT [10:00:00] AGENT: it costs 5 lakh", phone_number: "+919800000001" }, ...over,
});

let db: PGlite;
let store: PostCallStore;
let vaani: MockVaaniClient;
const q = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;

beforeEach(async () => {
  db = new PGlite();
  for (const f of readdirSync(join(root, "db", "migrations")).sort()) await db.exec(readFileSync(join(root, "db", "migrations", f), "utf8"));
  store = new PostCallStore(pgliteDb(db));
  vaani = new MockVaaniClient();
  vaani.calls.set("inbound-1", { status: "ok", transcription: REAL, summary: "A 3BHK in Baner.", entity: {} });
});

const run = (token: string | null, b: unknown) =>
  acceptWebhook({ token, body: b }, { store, vaani, expectedToken: TOKEN, now: () => NOW }, async (record) => {
    const g = new MockGemini((req: GenerateRequest) => { throw new Error(`gemini should not be needed here: ${req.system.slice(0, 20)}`); });
    return processCall(record, { store, gemini: g, config: loadConfig({ KNOWLEDGE_DIR: join(root, "knowledge") }), hubspot: new MockHubspotClient() });
  });

describe("webhook token", () => {
  it("accepts only the exact token, and fails closed with no token set", () => {
    expect(tokenOk(TOKEN, TOKEN)).toBe(true);
    expect(tokenOk("x".repeat(32), TOKEN)).toBe(false);
    expect(tokenOk(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(tokenOk(null, TOKEN)).toBe(false);
    expect(tokenOk(TOKEN, undefined)).toBe(false);
    expect(tokenOk("short", "short")).toBe(false);
  });
  it("a missing or wrong token gets 401 and stores nothing", async () => {
    expect((await run(null, body())).status).toBe(401);
    expect((await run("wrong".repeat(8), body())).status).toBe(401);
    expect(await q("select * from webhook_events")).toHaveLength(0);
  });
});

describe("verifying the call with Vaani", () => {
  it("a call id Vaani does not know is refused (403) and the attempt is logged", async () => {
    const r = await run(TOKEN, body({ call_id: "forged-1", data: { call_id: "forged-1" } }));
    expect(r.status).toBe(403);
    expect(r.after).toBeUndefined();
    const [ev] = await q<{ state: string; error: string }>("select state, error from webhook_events");
    expect(ev).toMatchObject({ state: "failed", error: expect.stringMatching(/Not a call under this Vaani account/) });
    expect(await q("select * from calls")).toHaveLength(0);
  });
  it("Vaani still processing the call: 503 so Vaani retries", async () => {
    vaani.calls.set("inbound-1", { status: "pending" });
    expect((await run(TOKEN, body())).status).toBe(503);
  });
  it("our Vaani key refused: 502, not a silent success", async () => {
    vaani.calls.set("inbound-1", { status: "unauthorized" });
    expect((await run(TOKEN, body())).status).toBe(502);
  });
  it("uses Vaani's transcript, never the one in the posted body", async () => {
    const v = await verifyWithVaani(body(), vaani, NOW);
    expect(v.ok && v.kind === "call" && v.record.transcript).toBe(REAL);
    expect(v.ok && v.kind === "call" && v.record.transcript).not.toContain("FORGED");
    expect(v.ok && v.kind === "call" && v.record.turns.map((t) => t.role)).toEqual(["agent", "user", "agent", "user"]);
    expect(v.ok && v.kind === "call" && v.record.callerNumber).toBe("+919800000001");
  });
  it("clamps an absurd timestamp and duration from the body", async () => {
    const v = await verifyWithVaani(body({ timestamp: "2001-01-01T00:00:00Z", data: { call_id: "inbound-1", call_duration: 9e12 } }), vaani, NOW);
    if (!v.ok || v.kind !== "call") throw new Error("expected a call");
    expect(v.record.endedAt.toISOString()).toBe(NOW.toISOString());
    expect(v.record.durationSeconds).toBeLessThanOrEqual(4 * 3600);
  });
  it("call.completed (the campaign webhook name) is treated like call_postprocessing", async () => {
    const v = await verifyWithVaani({ event: "call.completed", call_id: "inbound-1", data: { call_id: "inbound-1" } }, vaani, NOW);
    expect(v.ok && v.kind).toBe("call");
    expect((await verifyWithVaani({ event: "call_ended", call_id: "inbound-1" }, vaani, NOW)).ok && true).toBe(true);
    const ended = await verifyWithVaani({ event: "call_ended", call_id: "inbound-1" }, vaani, NOW);
    expect(ended.ok && ended.kind).toBe("ignored");
  });
  it("non call_postprocessing events are accepted and ignored; junk bodies are 400", async () => {
    expect((await run(TOKEN, { event: "call_started", room_name: "r" })).json).toMatchObject({ status: "ignored", events: 1 });
    expect((await run(TOKEN, "nope")).status).toBe(400);
    expect((await run(TOKEN, body({ call_id: undefined, data: {} }))).status).toBe(400);
  });
});

describe("accepted webhook", () => {
  it("answers 200 first; the work runs afterwards and marks the stored event processed", async () => {
    const r = await run(TOKEN, body());
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "accepted", call_ids: ["inbound-1"] });
    expect(await q("select * from calls")).toHaveLength(0); // nothing processed yet: the reply came first
    await r.after!();
    const [ev] = await q<{ state: string }>("select state from webhook_events");
    expect(ev!.state).toBe("processed"); // Gemini is down on purpose: the call is still saved, as a failed call for a person
    const [row] = await q<{ status: string; failure_reason: string }>("select status, failure_reason from calls");
    expect(row!.status).toBe("failed"); // saved as a failed call for a person, not lost
    expect(row!.failure_reason).toMatch(/Post-call analysis failed/);
  });
  it("the same event delivered twice is processed once", async () => {
    await (await run(TOKEN, body())).after!();
    await (await run(TOKEN, body())).after!();
    expect(await q("select * from calls")).toHaveLength(1);
  });
});

// The exact envelope Vaani's "send test" button delivered to production on 2026-10-10.
const VAANI_TEST_DELIVERY = {
  event: "webhook_test",
  events: [
    { data: { call_id: "test_room_123", summary: "This is a sample summary for testing.", entities: { intent: "inquiry", customer_name: "John Doe" }, room_name: "test_room_123", end_reason: "completed", transcript: "Agent: Hello\nUser: Hi", dispositions: { "CATALOG ID": "44", call_disposition: "Interested" }, call_duration: 120, recording_url: "https://example.com/recording.mp3" }, event: "call_postprocessing", call_id: "test_room_123", timestamp: "2026-10-10T12:19:00.005377+00:00" },
    { data: { reason: "INTERNAL_ERROR", call_id: "test_room_123", room_name: "test_room_123", phone_number: "+919876543210" }, event: "call_failed", timestamp: "2026-10-10T12:19:00.005427+00:00" },
  ],
  timestamp: "2026-10-10T12:19:00.005435+00:00",
};

describe("Vaani batch envelope (real delivery shape)", () => {
  it("the send-test delivery is acknowledged with 200 and processes nothing", async () => {
    const r = await run(TOKEN, VAANI_TEST_DELIVERY);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "test_received" });
    expect(r.after).toBeUndefined();
    expect(await q("select * from calls")).toHaveLength(0);
    expect((await q<{ state: string }>("select state from webhook_events"))[0]!.state).toBe("ignored");
  });

  it("a batch with a real finished call inside is accepted and processed once", async () => {
    const batch = { event: "call_batch", timestamp: "2026-10-12T04:36:00+00:00", events: [
      { event: "call_postprocessing", call_id: "inbound-1", data: { call_id: "inbound-1", call_duration: 240 } },
      { event: "call_ended", data: { call_id: "inbound-1", call_duration: 240 } },
    ] };
    const r = await run(TOKEN, batch);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "accepted", call_ids: ["inbound-1"] });
    await r.after!();
    expect(await q("select * from calls")).toHaveLength(1);
  });

  it("the same call twice in one batch is processed once", async () => {
    const e = { event: "call_postprocessing", call_id: "inbound-1", data: { call_id: "inbound-1" } };
    const r = await run(TOKEN, { events: [e, e] });
    expect((r.json as { call_ids: string[] }).call_ids).toEqual(["inbound-1"]);
  });

  it("a batch naming only unknown calls is refused (403); a batch with a call Vaani is still processing asks for a retry (503)", async () => {
    expect((await run(TOKEN, { events: [{ event: "call_postprocessing", call_id: "nope", data: { call_id: "nope" } }] })).status).toBe(403);
    vaani.calls.set("busy", { status: "pending" });
    const mixed = await run(TOKEN, { events: [{ event: "call_postprocessing", call_id: "inbound-1" }, { event: "call_postprocessing", call_id: "busy" }] });
    expect(mixed.status).toBe(503);
  });

  it("an empty or junk envelope is a 400, and a batch of only non-final events is ignored", async () => {
    expect((await run(TOKEN, { events: [] })).status).toBe(400);
    expect((await run(TOKEN, { events: ["x", 5] })).status).toBe(400);
    expect((await run(TOKEN, { events: [{ event: "call_started", room_name: "r" }] })).json).toMatchObject({ status: "ignored" });
  });

  it("a duration under 1000 is read as seconds (the test delivery sent 120 for two minutes)", async () => {
    const v = await verifyWithVaani({ event: "call_postprocessing", call_id: "inbound-1", timestamp: "2026-10-12T04:36:00+00:00", data: { call_id: "inbound-1", call_duration: 120 } }, vaani, NOW);
    if (!v.ok || v.kind !== "call") throw new Error("expected a call");
    expect(v.record.durationSeconds).toBe(120);
    expect(v.record.startedAt.toISOString()).toBe("2026-10-12T04:34:00.000Z");
  });
});

describe("the real Vaani delivery captured from production", () => {
  it("parses a transcript whose turns are separated by single newlines (this was the bug)", () => {
    const turns = parseTranscript(REAL_TRANSCRIPT);
    expect(turns).toHaveLength(16);
    expect(turns.filter((t) => t.role === "user")).toHaveLength(9);
    expect(turns.filter((t) => t.role === "agent")).toHaveLength(7);
    expect(turns[1]).toMatchObject({ role: "user", clock: "12:31:20" });
    expect(turns[0]!.text).not.toContain("USER:");
  });

  it("also reads the plain label formats", () => {
    expect(parseTranscript("Agent: Hello\nUser: Hi").map((t) => t.role)).toEqual(["agent", "user"]);
    expect(parseTranscript("AGENT: Hi\n\n USER: Hello\nthere").map((t) => t.text)).toEqual(["Hi", "Hello\nthere"]);
    expect(parseTranscript("[10:00:00] AGENT: a\n\n[10:00:05] USER: b")).toHaveLength(2);
  });

  it("uses Vaani's own start and end times, ignores the unit of call_duration, and drops the 'web-user' number", async () => {
    vaani.calls.set(REAL_DELIVERY.call_id, { status: "ok", transcription: REAL_TRANSCRIPT, summary: REAL_DELIVERY.data.summary, entity: {} });
    const v = await verifyWithVaani(REAL_DELIVERY, vaani, new Date("2026-10-10T12:35:00Z"));
    if (!v.ok || v.kind !== "call") throw new Error("expected a call");
    expect(v.record.startedAt.toISOString()).toBe("2026-10-10T12:31:09.177Z");
    expect(v.record.endedAt.toISOString()).toBe("2026-10-10T12:33:21.161Z");
    expect(v.record.durationSeconds).toBe(132);
    expect(v.record.callerNumber).toBeNull();
    expect(v.record.turns.filter((t) => t.role === "user").length).toBe(9);
  });

  it("a real phone number in `from` is kept", async () => {
    vaani.calls.set("phone-1", { status: "ok", transcription: "AGENT: Hi\nUSER: Hello", summary: null, entity: {} });
    const v = await verifyWithVaani({ event: "call_postprocessing", call_id: "phone-1", from: "+919820011223", data: { call_id: "phone-1", phone_number: "web-user" } }, vaani, NOW);
    expect(v.ok && v.kind === "call" && v.record.callerNumber).toBe("+919820011223");
  });

  it("the real delivery is not saved as 'no caller speech': it is classified from the conversation", async () => {
    vaani.calls.set(REAL_DELIVERY.call_id, { status: "ok", transcription: REAL_TRANSCRIPT, summary: REAL_DELIVERY.data.summary, entity: {} });
    const EX = { answers: { project_type: "full_home", project_description: "3BHK", wants_design_and_execution: "yes", location_text: "Baner", weeks_until_needed: 20, decision_maker: "self" }, contact: { name: "Rahul Sharma", email: "rahul.sharma.test@example.com", phone: "9820011223" }, requested_items: [], agent: { stated_price: false, price_evidence: [], booking_started_turn: null, booking_confirmed: false, qualifying_complete_turn: 5, asked_for_email: true, gave_decline_close: false, caller_not_understood: false } };
    const CL = { verdict: "qualified", criteria: Object.fromEntries(["real_project", "service_area", "timeline", "budget_band", "decision_maker"].map((c) => [c, { status: c === "budget_band" ? "not_mentioned" : "pass", evidence: "ok" }])), questions: [], question_to_ask: null, decline_reason: null, handoff_notes: [] };
    const g = new MockGemini((req: GenerateRequest) => JSON.stringify(req.system.startsWith("You read the transcript") ? EX : CL));
    const r = await acceptWebhook({ token: TOKEN, body: REAL_DELIVERY }, { store, vaani, expectedToken: TOKEN, now: () => new Date("2026-10-10T12:35:00Z") }, (record) =>
      processCall(record, { store, gemini: g, config: loadConfig({ KNOWLEDGE_DIR: join(root, "knowledge") }), hubspot: new MockHubspotClient() }),
    );
    await r.after!();
    const [c] = await q<{ status: string; failure_reason: string | null; caller_number: string | null }>("select status, failure_reason, caller_number from calls");
    expect(c).toMatchObject({ status: "qualified", failure_reason: null, caller_number: null });
  });
});
