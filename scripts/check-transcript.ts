/**
 * Check one test call. Paste the transcript into a text file, then:
 *   npm run check:transcript -- path/to/transcript.txt
 * Accepts Vaani's "[10:01:02] AGENT: ..." format, or plain lines starting with
 * "Agent:" / "AI:" and "User:" / "Caller:". Prints the price check, the booking check and the verdict.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { classifyLead, InMemoryClassifyStore } from "../src/lib/classify/classify";
import { loadConfig } from "../src/lib/config";
import { geminiFromEnv } from "../src/lib/gemini";
import { loadKnowledge } from "../src/lib/knowledge";
import { detectSpokenPrice } from "../src/lib/postcall/compliance";
import { extractFromTranscript } from "../src/lib/postcall/extract";
import { parseTranscript, type Turn } from "../src/lib/postcall/transcript";

const root = join(import.meta.dirname, "..");
try { loadEnvFile(join(root, ".env.local")); } catch { /* env may already be set */ }

function toTurns(text: string): Turn[] {
  if (/\[\d{1,2}:\d{2}:\d{2}\]/.test(text)) return parseTranscript(text);
  const turns: Turn[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(agent|ai|assistant|bot|user|caller|customer)\s*[:\-]\s*(.*)$/i.exec(line);
    if (m) turns.push({ index: turns.length, clock: null, role: /^(agent|ai|assistant|bot)$/i.test(m[1]!) ? "agent" : "user", text: m[2]!.trim() });
    else if (turns.length && line.trim()) turns[turns.length - 1]!.text += ` ${line.trim()}`;
  }
  return turns;
}

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run check:transcript -- path/to/transcript.txt");
const turns = toTurns(readFileSync(file, "utf8"));
console.log(`${turns.length} turns (${turns.filter((t) => t.role === "agent").length} agent, ${turns.filter((t) => t.role === "user").length} caller)\n`);

const price = detectSpokenPrice(turns);
console.log(`PRICE (pattern check): ${price.found ? "AGENT SAID A PRICE" : "none found"}`);
for (const h of price.hits) console.log(`  turn ${h.turn}: ${h.text}`);

const config = loadConfig({ ...process.env, KNOWLEDGE_DIR: join(root, "knowledge") });
const gemini = geminiFromEnv();
const ex = await extractFromTranscript(turns, { gemini, callDate: new Date() });
console.log(`PRICE (Gemini reading): ${ex.agent.stated_price ? "AGENT SAID OR HINTED A PRICE" : "none"}`);
for (const e of ex.agent.price_evidence) console.log(`  turn ${e.turn ?? "?"}: ${e.quote}`);

const knowledge = await loadKnowledge(config.knowledgeDir);
const agentForward = ex.agent.booking_confirmed || ex.agent.booking_started_turn !== null || ex.agent.asked_for_email;
const r = await classifyLead("check", ex.answers, {
  gemini, config: agentForward && !ex.agent.gave_decline_close ? { ...config, unclearAfterRetry: "qualified" } : config,
  knowledge, store: new InMemoryClassifyStore(), finalRound: true,
});
const b = ex.agent.booking_started_turn ?? (ex.agent.booking_confirmed ? [...turns].reverse().find((t) => t.role === "agent")?.index ?? null : null);
const q = ex.agent.qualifying_complete_turn;
console.log(`\nBOOKING: ${b === null ? "agent did not book" : `started at turn ${b}, caller details complete at turn ${q ?? "never"}`}`);
console.log(`  booked before the details were complete: ${b !== null && (q === null || b <= q) ? "YES (flag)" : "no"}`);
console.log(`  booked although the lead is not qualified: ${b !== null && r.verdict !== "qualified" ? "YES (flag)" : "no"}`);
console.log(`\nVERDICT: ${r.verdict}  (R:${r.criteria.real_project.status} S:${r.criteria.service_area.status} T:${r.criteria.timeline.status} B:${r.criteria.budget_band.status} D:${r.criteria.decision_maker.status})`);
if (r.decline_reason) console.log(`  decline reason: ${r.decline_reason}`);
if (r.handoff_notes.length) console.log(`  notes: ${r.handoff_notes.join(" | ")}`);
console.log(`AGENT: asked for email=${ex.agent.asked_for_email}, gave a not-a-fit close=${ex.agent.gave_decline_close}, caller not understood=${ex.agent.caller_not_understood}`);
