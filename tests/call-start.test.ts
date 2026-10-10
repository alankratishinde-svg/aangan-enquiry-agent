import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POLITE_FAILURE_MESSAGE, InMemoryCallStore, startCall, type FailedCallRecord } from "../src/lib/call-start";
import { InMemoryCalendar } from "../src/lib/calendar";
import { loadConfig } from "../src/lib/config";
import { StaticDesignerSource } from "../src/lib/designers";

const root = join(import.meta.dirname, "..");
const WED_10AM = new Date("2026-10-07T04:30:00Z");

let dir: string;
let calendar: InMemoryCalendar;
let store: InMemoryCallStore;

const start = () =>
  startCall({
    vaaniCallId: "call-1",
    callerNumber: "+919800000001",
    store,
    deps: {
      config: loadConfig({ KNOWLEDGE_DIR: dir }),
      designers: new StaticDesignerSource([
        { id: "d1", name: "Designer One", email: "d1@example.com", googleCalendarId: "cal-1" },
      ]),
      calendar,
      now: () => WED_10AM,
    },
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aangan-start-"));
  await cp(join(root, "knowledge"), dir, { recursive: true });
  calendar = new InMemoryCalendar();
  store = new InMemoryCallStore();
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("startCall fallback", () => {
  it("returns the bundle and records nothing when context builds", async () => {
    const r = await start();
    expect(r.ok).toBe(true);
    expect(store.failed).toHaveLength(0);
  });

  it("polite callback message plus callback list entry when a knowledge file is missing", async () => {
    await rm(join(dir, "services.md"));
    const r = await start();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(POLITE_FAILURE_MESSAGE);
    expect(r.message).toMatch(/call you back within the hour/);
    expect(r.recorded).toBe(true);
    expect(store.failed).toHaveLength(1);
    const rec = store.failed[0]!;
    expect(rec.status).toBe("failed");
    expect(rec.failureReason).toMatch(/services\.md/);
    expect(rec.callerNumber).toBe("+919800000001");
    expect(rec.callbackDueAt.getTime() - rec.startedAt.getTime()).toBe(60 * 60_000);
  });

  it("does the same when the calendar is down", async () => {
    calendar.failWith = new Error("calendar down");
    const r = await start();
    expect(r.ok).toBe(false);
    expect(store.failed[0]?.failureReason).toMatch(/calendar down/);
    expect(store.failed[0]?.callbackDueAt.toISOString()).toBe("2026-10-07T05:30:00.000Z");
  });

  it("does the same when the deflection line is gone", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "pricing.md"), "# Pricing\nno deflection here");
    const r = await start();
    expect(r.ok).toBe(false);
    expect(store.failed).toHaveLength(1);
  });

  it("still gives the caller the message if saving the callback fails, and hands back the record", async () => {
    await rm(join(dir, "qualified.md"));
    store.failWith = new Error("db down");
    const r = await start();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe(POLITE_FAILURE_MESSAGE);
    expect(r.recorded).toBe(false);
    expect(r.failed.callbackDueAt).toBeInstanceOf(Date);
  });

  it("the fallback message contains no price", () => {
    expect(POLITE_FAILURE_MESSAGE).not.toMatch(/₹|\brs\b|lakh|\d/i);
  });

  it("the record fits the calls table (constraints hold)", async () => {
    await rm(join(dir, "qualified.md"));
    await start();
    const rec: FailedCallRecord = store.failed[0]!;
    const db = new PGlite();
    await db.exec(readFileSync(join(root, "supabase", "migrations", "20261007000000_init.sql"), "utf8").replace(/create policy[\s\S]*?;\n/g, "").replace(/alter table .* enable row level security;/g, ""));
    await db.query(
      `insert into calls (vaani_call_id, started_at, caller_number, status, failure_reason, is_after_hours, callback_due_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [rec.vaaniCallId, rec.startedAt.toISOString(), rec.callerNumber, rec.status, rec.failureReason, rec.isAfterHours, rec.callbackDueAt.toISOString()],
    );
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from calls where status='failed' and called_back_at is null and callback_due_at is not null`,
    );
    expect(r.rows[0]!.n).toBe(1);
  });
});
