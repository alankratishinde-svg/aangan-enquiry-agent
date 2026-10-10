/**
 * Live classification eval: runs every case through the real Gemini and the rule engine.
 * Usage: npm run eval:classify   (needs GEMINI_API_KEY in .env.local)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { classifyLead, InMemoryClassifyStore } from "../src/lib/classify/classify";
import { containsPrice } from "../src/lib/classify/guard";
import type { ClassificationResult, Status } from "../src/lib/classify/types";
import { loadConfig } from "../src/lib/config";
import { geminiFromEnv } from "../src/lib/gemini";
import { loadKnowledge } from "../src/lib/knowledge";
import { CASES, type Case, type Expect } from "../tests/fixtures/classification-cases";

try { loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* env may already be set */ }

const only = process.argv.slice(2);
const abbr: Record<string, string> = { real_project: "R", service_area: "S", timeline: "T", budget_band: "B", decision_maker: "D" };
const short: Record<Status, string> = { pass: "pass", fail: "FAIL", unclear: "unclear", not_mentioned: "n/m" };

function cell(r: ClassificationResult): string {
  return (Object.keys(abbr) as (keyof typeof abbr)[])
    .map((c) => {
      const k = r.criteria[c as keyof ClassificationResult["criteria"]];
      const g = short[k.gemini_status];
      return `${abbr[c]}:${k.source === "rule" && k.status !== k.gemini_status ? `${g}→${short[k.status]}*` : g}`;
    })
    .join(" ");
}

function check(r: ClassificationResult, e: Expect): string[] {
  const problems: string[] = [];
  if (r.verdict !== e.verdict) problems.push(`verdict ${r.verdict}, wanted ${e.verdict}`);
  if (e.criterion) {
    const want = e.verdict === "unqualified" ? "fail" : "unclear";
    const got = r.criteria[e.criterion].status;
    if (got !== want && !(e.verdict === "unqualified" && r.verdict === "unqualified" && got === want)) problems.push(`${e.criterion} is ${got}, wanted ${want}`);
  }
  if (e.note && r.handoff_notes.length === 0) problems.push("no handoff note");
  if (containsPrice(JSON.stringify(r))) problems.push("PRICE IN OUTPUT");
  return problems;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const config = loadConfig({ ...process.env, KNOWLEDGE_DIR: join(import.meta.dirname, "..", "knowledge") });
  const knowledge = await loadKnowledge(config.knowledgeDir);
  const gemini = geminiFromEnv();
  const cases = only.length ? CASES.filter((c: Case) => only.includes(c.id)) : CASES;

  const results: { row: string; details: string[]; ok: boolean }[] = new Array(cases.length);
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const idx = next++;
      results[idx] = await runCase(cases[idx]!);
      console.log(results[idx]!.row);
    }
  }
  async function runCase(c: Case) {
    const details: string[] = [];
    const deps = { gemini, config, knowledge, store: new InMemoryClassifyStore() };
    const steps: { label: string; answers: Case["answers"]; expect: Expect }[] = [{ label: c.scenario, answers: c.answers, expect: c.expect }];
    if (c.followUp) steps.push({ label: c.followUp.scenario, answers: c.followUp.answers, expect: c.followUp.expect });
    const cells: string[] = [];
    const verdicts: string[] = [];
    const expects: string[] = [];
    let ok = true;
    for (const [i, s] of steps.entries()) {
      let r: ClassificationResult;
      try {
        r = await classifyLead(`${c.id}`, s.answers, deps);
      } catch (err) {
        ok = false;
        cells.push("ERROR");
        verdicts.push(`error: ${(err as Error).message.slice(0, 60)}`);
        expects.push(s.expect.verdict);
        break;
      }
      const problems = check(r, s.expect);
      if (problems.length) ok = false;
      cells.push(cell(r));
      verdicts.push(r.verdict + (r.questions.length ? ` (${r.questions.map((q) => q.criterion).join("+")})` : ""));
      expects.push(s.expect.verdict + (s.expect.criterion ? ` (${s.expect.criterion})` : ""));
      details.push(
        `### ${c.id}${steps.length > 1 ? `.${i + 1}` : ""}: ${s.label}\n` +
          `- answers: \`${JSON.stringify(s.answers)}\`\n` +
          `- verdict: **${r.verdict}** (Gemini advised: ${r.gemini_verdict ?? "n/a"}), round ${r.round}\n` +
          Object.entries(r.criteria).map(([k, v]) => `- ${k}: ${v.gemini_status}${v.source === "rule" && v.status !== v.gemini_status ? ` → ${v.status} (rule)` : ""}: ${v.evidence}`).join("\n") + "\n" +
          (r.questions.length ? `- questions: ${r.questions.map((q) => `[${q.criterion}] ${q.question}`).join(" | ")}\n` : "") +
          (r.decline_reason ? `- decline_reason: ${r.decline_reason}\n- close_script: ${r.close_script}\n` : "") +
          (r.handoff_notes.length ? `- handoff_notes: ${r.handoff_notes.join(" | ")}\n` : "") +
          (r.price_guard_hits.length ? `- PRICE GUARD HITS: ${r.price_guard_hits.join(", ")}\n` : "") +
          (problems.length ? `- **FAIL**: ${problems.join("; ")}\n` : "- PASS\n"),
      );
      await sleep(1500);
    }
    const row = `| ${c.id} | ${c.scenario}${c.followUp ? ` → ${c.followUp.scenario}` : ""} | ${cells.join(" ⟶ ")} | ${verdicts.join(" ⟶ ")} | ${expects.join(" ⟶ ")} | ${ok ? "PASS" : "FAIL"} |`;
    return { row, details, ok };
  }
  await Promise.all(Array.from({ length: Number(process.env.EVAL_CONCURRENCY ?? 4) }, worker));
  const rows = results.map((r) => r.row);
  const details = results.flatMap((r) => r.details);
  const total = results.length;
  const pass = results.filter((r) => r.ok).length;

  const head = "| ID | Scenario | Gemini criteria (R=real project S=service area T=timeline B=budget D=decision-maker; `→x*` = rule engine override) | Rule engine verdict | Expected | Result |\n|---|---|---|---|---|---|";
  const md = `# Classification eval, ${new Date().toISOString().slice(0, 10)}\n\nModel: ${process.env.GEMINI_MODEL ?? "gemini-flash-latest"}. Config: ${JSON.stringify({ failPolicy: config.failPolicy, timeline: [config.timelineFailUnderWeeks, config.timelinePassFromWeeks], commercialMaxSqFt: config.commercialMaxSqFt, unclearAfterRetry: config.unclearAfterRetry })}\n\n**${pass}/${total} PASS**\n\n${head}\n${rows.join("\n")}\n\n## Details\n\n${details.join("\n")}`;
  mkdirSync(join(import.meta.dirname, "..", "docs", "eval"), { recursive: true });
  const out = join(import.meta.dirname, "..", "docs", "eval", "classification-latest.md");
  writeFileSync(out, md);
  console.log(`\n${pass}/${total} PASS. Details: ${out}`);
  if (pass !== total) process.exitCode = 1;
}
main();
