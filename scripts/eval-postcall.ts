/**
 * Live post-call eval: realistic transcripts go through the real Gemini (extraction + classification),
 * the flag logic, and a real (in-process) Postgres with our migrations. HubSpot is a mock.
 * Usage: npm run eval:postcall   (needs GEMINI_API_KEY in .env.local)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { PGlite } from "@electric-sql/pglite";
import { loadConfig } from "../src/lib/config";
import { geminiFromEnv } from "../src/lib/gemini";
import { pgliteDb } from "../src/lib/postcall/db";
import { MockHubspotClient } from "../src/lib/postcall/hubspot";
import { parseTranscript } from "../src/lib/postcall/transcript";
import { processCall } from "../src/lib/postcall/process";
import { PostCallStore } from "../src/lib/postcall/store";
import { TRANSCRIPT_CASES } from "../tests/fixtures/call-transcripts";

const root = join(import.meta.dirname, "..");
try { loadEnvFile(join(root, ".env.local")); } catch { /* env may already be set */ }

const gemini = geminiFromEnv();
const config = loadConfig({ ...process.env, KNOWLEDGE_DIR: join(root, "knowledge") });

async function runCase(c: (typeof TRANSCRIPT_CASES)[number]) {
  const db = new PGlite();
  for (const f of readdirSync(join(root, "db", "migrations")).sort()) await db.exec(readFileSync(join(root, "db", "migrations", f), "utf8"));
  const store = new PostCallStore(pgliteDb(db));
  const hubspot = new MockHubspotClient();
  const transcript = c.lines.map(([r, t], i) => `[10:${String(i).padStart(2, "0")}:00] ${r.toUpperCase()}: ${t}`).join("\n\n");
  const record = {
    callId: c.id, startedAt: new Date("2026-10-12T04:30:00Z"), endedAt: new Date("2026-10-12T04:36:00Z"), durationSeconds: 360, endReason: "Call ended",
    summary: null, entities: {}, dispositions: {}, recordingUrl: null, transcript, turns: parseTranscript(transcript), callerNumber: "+919800000001",
  };
  const r = await processCall(record, { store, gemini, config, hubspot });
  const call = (await db.query<{ flags: Record<string, unknown>; verdict: { criteria: Record<string, { status: string }> } | null }>("select flags, verdict from calls")).rows[0]!;
  const lead = (await db.query<{ email: string | null }>("select email from leads")).rows[0];
  const rq = (await db.query<{ kind: string; reasons: { type: string }[] }>("select kind, reasons from review_queue")).rows[0];
  const crit = call.verdict ? Object.entries(call.verdict.criteria).map(([k, v]) => `${k[0]!.toUpperCase()}:${v.status}`).join(" ") : "n/a";
  const problems: string[] = [];
  if (r.status !== c.expect.status) problems.push(`status ${r.status}, wanted ${c.expect.status}`);
  if (r.priceSpoken !== c.expect.priceSpoken) problems.push(`price_spoken ${r.priceSpoken}, wanted ${c.expect.priceSpoken}`);
  if (r.bookingBeforeQualified !== c.expect.bookingFlag) problems.push(`booking flag ${r.bookingBeforeQualified}, wanted ${c.expect.bookingFlag}`);
  if ((hubspot.deals.length === 1) !== c.expect.deal) problems.push(`HubSpot deals ${hubspot.deals.length}, wanted ${c.expect.deal ? 1 : 0}`);
  if (r.status === "unqualified" && lead?.email) problems.push("unqualified lead has an email");
  const ok = problems.length === 0;
  const row = `| ${c.id} | ${c.scenario} | ${crit} | ${r.status} | ${r.priceSpoken} | ${r.bookingBeforeQualified} | ${hubspot.deals.length ? "deal" : "no deal"} | ${rq ? `${rq.kind}: ${rq.reasons.map((x) => x.type).join("+")}` : "none"} | ${ok ? "PASS" : "FAIL " + problems.join("; ")} |`;
  console.log(row);
  return { row, ok, flags: JSON.stringify(call.flags) };
}

const results: Awaited<ReturnType<typeof runCase>>[] = new Array(TRANSCRIPT_CASES.length);
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < TRANSCRIPT_CASES.length) { const i = next++; results[i] = await runCase(TRANSCRIPT_CASES[i]!); }
}));
const pass = results.filter((r) => r.ok).length;
const md = `# Post-call eval, ${new Date().toISOString().slice(0, 10)}\n\n**${pass}/${results.length} PASS** (live Gemini extraction and classification, in-process Postgres, mock HubSpot)\n\n| ID | Scenario | Criteria (R S T B D) | Status | price_spoken | booking flag | HubSpot | Review list | Result |\n|---|---|---|---|---|---|---|---|---|\n${results.map((r) => r.row).join("\n")}\n`;
writeFileSync(join(root, "docs", "eval", "postcall-latest.md"), md);
console.log(`\n${pass}/${results.length} PASS`);
if (pass !== results.length) process.exitCode = 1;
