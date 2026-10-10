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
  it("non call_postprocessing events are accepted and ignored; junk bodies are 400", async () => {
    expect((await run(TOKEN, { event: "call_started", room_name: "r" })).json).toMatchObject({ status: "ignored" });
    expect((await run(TOKEN, "nope")).status).toBe(400);
    expect((await run(TOKEN, body({ call_id: undefined, data: {} }))).status).toBe(400);
  });
});

describe("accepted webhook", () => {
  it("answers 200 first; the work runs afterwards and marks the stored event processed", async () => {
    const r = await run(TOKEN, body());
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: "accepted", call_id: "inbound-1" });
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
