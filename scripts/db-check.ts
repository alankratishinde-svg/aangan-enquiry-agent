/** Connectivity and schema smoke test against the real Neon database: npm run db:check */
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { pgDb } from "../src/lib/postcall/db";
import { PostCallStore } from "../src/lib/postcall/store";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const db = pgDb(pool);
const tables = await db.query<{ n: number }>("select count(*)::int n from information_schema.tables where table_schema = 'public'");
const designers = await db.query<{ n: number }>("select count(*)::int n from designers");

// Round trip through the same store the webhook uses, then clean up.
const store = new PostCallStore(db);
const id = "db-check-" + Date.now();
const ev = await store.recordEvent("db_check", id, { ok: true });
const saved = await store.saveCall({
  call: { vaaniCallId: id, startedAt: new Date(), endedAt: new Date(), callerNumber: null, status: "unqualified", transcript: "t", answers: {}, verdict: null, responseSeconds: 0, isAfterHours: false, failureReason: null, callbackDueAt: null, priceSpoken: true, bookingBeforeQualified: false, summary: null, entities: {}, flags: {}, recordingUrl: null },
  lead: { name: "db check", phone: null, email: null, projectType: null, areaSqFt: null, location: null, neededBy: null, summary: null, clientSize: null, handoffNotes: [] },
  review: { kind: "compliance", reasons: [{ type: "price_spoken" }] },
});
const rq = await db.query<{ n: number }>("select count(*)::int n from review_queue where lead_id = $1", [saved.leadId]);
await db.query("delete from calls where vaani_call_id = $1", [id]);
await db.query("delete from webhook_events where id = $1", [ev]);
console.log(`ok: ${tables.rows[0]!.n} public tables, ${designers.rows[0]!.n} designers, store round trip saved call+lead+review (${rq.rows[0]!.n} review row), cleaned up`);
await pool.end();
