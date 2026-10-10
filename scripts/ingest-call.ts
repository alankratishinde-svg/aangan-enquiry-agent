/**
 * Pull one or more Vaani calls into the dashboard by call id, through the same verified path the webhook uses:
 * the call is read from Vaani with our API key (so it must be a real call on our account), then classified,
 * checked and saved. Safe to run twice on the same call.
 *   npm run vaani:ingest -- [--replace] <call_id> [<call_id> ...]
 *   --replace  delete the stored copy of that call first and process it again (use after a bug fix)
 * Find the call id in the Vaani dashboard: Conversations, History.
 */
import { join } from "node:path";
import { loadEnvFile } from "node:process";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }

const { processCall } = await import("../src/lib/postcall/process");
const { verifyWithVaani } = await import("../src/lib/webhook/verify");
const rt = await import("../src/server/runtime");

const replace = process.argv.includes("--replace");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (ids.length === 0) throw new Error("Usage: npm run vaani:ingest -- <call_id> [<call_id> ...]");

for (const id of ids) {
  const v = await verifyWithVaani({ event: "call_postprocessing", call_id: id, data: { call_id: id } }, rt.vaani());
  if (!v.ok) { console.log(`${id}: not ingested. ${v.reason}`); continue; }
  if (v.kind !== "call") { console.log(`${id}: ignored`); continue; }
  if (replace) await rt.pool().query("delete from calls where vaani_call_id = $1", [id]); // leads, requirements, review items cascade
  const r = await processCall(v.record, rt.processDeps());
  console.log(`${id}: ${r.status}${r.duplicate ? " (already stored)" : ""}; price_spoken=${r.priceSpoken}; booking_flag=${r.bookingBeforeQualified}; hubspot=${r.hubspot}${r.reasons.length ? `; ${r.reasons.join(", ")}` : ""}`);
}
await rt.pool().end();
