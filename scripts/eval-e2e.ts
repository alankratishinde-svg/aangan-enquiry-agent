/**
 * End to end, Milestone 10. Four scenarios go through the REAL webhook handler, with Vaani's call details
 * served by a mock, then live Gemini (extraction, classification, summary and tips), an in-process Postgres with
 * our migrations, mock Cal.com / Resend / HubSpot, and then the same queries the dashboards use.
 *   npm run eval:e2e   (needs GEMINI_API_KEY in .env.local)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { PGlite } from "@electric-sql/pglite";
import { MockCalcomClient } from "../src/lib/calcom";
import { loadConfig } from "../src/lib/config";
import { MockEmailSender } from "../src/lib/email";
import { geminiFromEnv } from "../src/lib/gemini";
import { weekMetrics, weekStartIst } from "../src/lib/metrics";
import { pgliteDb } from "../src/lib/postcall/db";
import { MockHubspotClient } from "../src/lib/postcall/hubspot";
import { processCall } from "../src/lib/postcall/process";
import { PostCallStore } from "../src/lib/postcall/store";
import { MockVaaniClient } from "../src/lib/vaani/client";
import { acceptWebhook } from "../src/lib/webhook/handler";
import { callbackList, designerLeads, pendingReview } from "../src/server/queries";
import { TRANSCRIPT_CASES, type Line } from "../tests/fixtures/call-transcripts";

const root = join(import.meta.dirname, "..");
try { loadEnvFile(join(root, ".env.local")); } catch { /* env may already be set */ }

const gemini = geminiFromEnv();
const config = loadConfig({ ...process.env, KNOWLEDGE_DIR: join(root, "knowledge") });
const TOKEN = "e2e-token-".padEnd(24, "x");
const plain = (lines: Line[]) => lines.map(([r, t]) => `${r.toUpperCase()}: ${t}`).join("\n\n ");

const pg = new PGlite();
for (const f of readdirSync(join(root, "db", "migrations")).sort()) await pg.exec(readFileSync(join(root, "db", "migrations", f), "utf8"));
await pg.exec(readFileSync(join(root, "db", "seed.sql"), "utf8"));
const sql = pgliteDb(pg);
const store = new PostCallStore(sql);
const vaani = new MockVaaniClient();
const calcom = new MockCalcomClient();
const email = new MockEmailSender();
const hubspot = new MockHubspotClient();

const byId = (id: string) => TRANSCRIPT_CASES.find((c) => c.id === id)!;
const scenarios: { name: string; id: string; lines: Line[]; bookingEmail?: string }[] = [
  { name: "1. Qualified call", id: "e2e-qualified", lines: byId("P1").lines, bookingEmail: "rahul.sharma@gmail.com" },
  { name: "2. Unqualified call (Talegaon)", id: "e2e-unqualified", lines: byId("P6").lines },
  { name: "3. Failed call (caller never spoke)", id: "e2e-failed", lines: [["agent", "Hello, thank you for calling Aangan Studio. How can I help you today?"]] },
  { name: "4a. Price question, approved deflection", id: "e2e-price-ok", lines: byId("P2").lines, bookingEmail: "priya.nair@outlook.com" },
  { name: "4b. Price question, agent names a price", id: "e2e-price-bad", lines: byId("P3").lines, bookingEmail: "amit.joshi@gmail.com" },
];
for (const s of scenarios) {
  vaani.calls.set(s.id, { status: "ok", transcription: plain(s.lines), summary: null, entity: {} });
  if (s.bookingEmail) calcom.bookings.push({ uid: `bk-${s.id}`, start: "2026-10-14T05:30:00.000Z", end: "2026-10-14T06:15:00.000Z", email: s.bookingEmail });
}

const now = new Date();
const rows: string[] = [];
let ok = 0;
const check = (cond: boolean, label: string, problems: string[]) => { if (!cond) problems.push(label); };

for (const s of scenarios) {
  const body = { event: "call_postprocessing", call_id: s.id, timestamp: now.toISOString(), data: { call_id: s.id, call_duration: 240000 } };
  const r = await acceptWebhook({ token: TOKEN, body }, { store, vaani, expectedToken: TOKEN, now: () => now }, (record) =>
    processCall(record, { store, gemini, config, hubspot, calcom, email, dashboardBaseUrl: "https://app.example", now: () => now }),
  );
  const problems: string[] = [];
  check(r.status === 200, `webhook replied ${r.status}`, problems);
  await r.after?.();
  const call = (await pg.query<{ status: string; price_spoken: boolean; booking_before_qualified: boolean; failure_reason: string | null; callback_due_at: Date | null }>(
    "select status, price_spoken, booking_before_qualified, failure_reason, callback_due_at from calls where vaani_call_id = $1", [s.id])).rows[0];
  rows.push(`| ${s.name} | ${call?.status ?? "missing"} | ${call?.price_spoken} | ${call?.booking_before_qualified} |`);
  s.id === "e2e-qualified" && check(call?.status === "qualified" && !call.price_spoken, "should be qualified, no price", problems);
  s.id === "e2e-unqualified" && check(call?.status === "unqualified", "should be unqualified", problems);
  s.id === "e2e-failed" && check(call?.status === "failed" && !!call.callback_due_at, "should be failed with callback due", problems);
  s.id === "e2e-price-ok" && check(call?.status === "qualified" && !call.price_spoken, "deflected price question stays clean and qualified", problems);
  s.id === "e2e-price-bad" && check(call?.price_spoken === true, "spoken price must be flagged", problems);
  if (problems.length === 0) ok++;
  rows[rows.length - 1] += ` ${problems.length ? "FAIL: " + problems.join("; ") : "PASS"} |`;
  console.log(rows[rows.length - 1]);
}

// What each person would see.
const designers = (await pg.query<{ id: string }>("select id from designers")).rows;
let leadCount = 0;
let tipsOk = true;
let estimateOk = true;
for (const d of designers) {
  for (const l of await designerLeads(sql, d.id)) {
    leadCount++;
    tipsOk &&= l.addOnTips.length === 2;
    estimateOk &&= !!l.estimateText && /Internal, indicative only, not for the client|See pricing\.md/.test(l.estimateText);
  }
}
const review = await pendingReview(sql);
const cb = await callbackList(sql, now);
const m = await weekMetrics(sql, weekStartIst(now), now);
const facts: [string, boolean, string][] = [
  ["Designers see the qualified leads (3 qualified calls)", leadCount === 3, `${leadCount} leads`],
  ["Every lead card has exactly 2 add-on tips", tipsOk, ""],
  ["Every estimate carries its internal label, or says See pricing.md", estimateOk, ""],
  ["Designer emails sent, one per qualified lead", email.sent.length === 3, `${email.sent.length} emails`],
  ["No email ever mentions a price except the labelled estimate", email.sent.every((e) => !/\b(rs|₹)\b/i.test(e.text.replace(/Internal estimate:[^\n]*/i, ""))), ""],
  ["HubSpot deals only for qualified calls", hubspot.deals.length === 3, `${hubspot.deals.length} deals`],
  ["Front desk list has the unqualified lead and the price flag", review.some((i) => i.kind === "unqualified") && review.some((i) => i.priceSpoken), `${review.length} items`],
  ["Callback list has the failed call, due in one hour", cb.open.length === 1 && cb.open[0]!.dueAt !== null, `${cb.open.length} open`],
  ["Weekly counts match", m.counts.qualified === 3 && m.counts.unqualified === 1 && m.counts.failed === 1, JSON.stringify(m.counts)],
];
for (const [label, pass, extra] of facts) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label} ${extra}`);
  if (pass) ok++;
}
const total = scenarios.length + facts.length;
const md = `# End to end, ${now.toISOString().slice(0, 10)}\n\n**${ok}/${total} PASS.** Real webhook handler, live Gemini, in-process Postgres with our migrations, mock Vaani/Cal.com/Resend/HubSpot.\n\n| Scenario | Status | price_spoken | booking flag | Result |\n|---|---|---|---|---|\n${rows.join("\n")}\n\n${facts.map(([l, p, e]) => `- ${p ? "PASS" : "FAIL"}: ${l} ${e}`).join("\n")}\n`;
writeFileSync(join(root, "docs", "eval", "e2e-latest.md"), md);
console.log(`\n${ok}/${total} PASS`);
if (ok !== total) process.exitCode = 1;
