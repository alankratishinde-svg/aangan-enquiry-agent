import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPatch } from "diff";
import { z } from "zod";
import { containsPrice, redactMoney } from "./classify/guard";
import type { GeminiClient } from "./gemini";
import { weekMetrics, weekStartIst, type WeekMetrics } from "./metrics";
import type { Sql } from "./postcall/db";

async function prompt(name: string, dir?: string) {
  const raw = await readFile(join(dir ?? join(process.cwd(), "prompts"), `${name}.md`), "utf8");
  const s = raw.indexOf("=====SYSTEM=====");
  const u = raw.indexOf("=====USER=====");
  return { system: raw.slice(s + 16, u).trim(), user: raw.slice(u + 14).trim() };
}
const fill = (t: string, vars: Record<string, string>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{{${k}}}`, () => v), t);

export interface WeeklyResult {
  weekStart: string;
  metrics: WeekMetrics;
  summary: string;
  proposalId: string | null;
}

/** The week that just ended (Monday to Sunday, IST) relative to `now`. */
export function previousWeekStart(now: Date): string {
  return weekStartIst(new Date(now.getTime() - 7 * 86_400_000));
}

/**
 * Weekly job: counts and callback metrics, a Gemini written improvement summary for Nikhil, and (only when the
 * evidence supports it) a DRAFT rubric change. Nothing changes the live rubric until Nikhil approves.
 */
export async function runWeekly(
  sql: Sql,
  deps: { gemini: GeminiClient; rubricMd: string; weekStart?: string; now?: Date; promptsDir?: string },
): Promise<WeeklyResult> {
  const now = deps.now ?? new Date();
  const weekStart = deps.weekStart ?? previousWeekStart(now);
  const metrics = await weekMetrics(sql, weekStart, now);
  const from = `${weekStart}T00:00:00+05:30`;

  const reasons = (
    await sql.query<{ criterion: string; status: string; n: number }>(
      `select c->>'criterion' criterion, c->>'status' status, count(*)::int n
         from review_queue rq, jsonb_array_elements(rq.reasons) r, jsonb_array_elements(r->'criteria') c
        where r->>'type' = 'unqualified' and rq.created_at >= $1::timestamptz and rq.created_at < $1::timestamptz + interval '7 days'
        group by 1, 2 order by n desc`,
      [from],
    )
  ).rows;
  const decisions = (
    await sql.query<{ action: string; original_verdict: string | null; final_outcome: string | null; n: number }>(
      `select action, original_verdict, final_outcome, count(*)::int n from decisions
        where decided_at >= $1::timestamptz and decided_at < $1::timestamptz + interval '7 days' group by 1, 2, 3 order by n desc`,
      [from],
    )
  ).rows;

  const p = await prompt("weekly_summary.v1", deps.promptsDir);
  let summary: string;
  try {
    summary = await deps.gemini.generate({
      system: p.system,
      user: fill(p.user, { WEEK_START: weekStart, METRICS: JSON.stringify(metrics, null, 2), REASONS: JSON.stringify(reasons), DECISIONS: JSON.stringify(decisions) }),
    });
    summary = redactMoney(summary.trim()).text;
    if (containsPrice(summary)) summary = "The written summary was withheld because it contained a price. See the counts above.";
  } catch {
    summary = "The written summary could not be generated this week. See the counts above.";
  }
  await sql.query(
    `insert into weekly_summaries (week_start, counts, improvement_summary) values ($1, $2::jsonb, $3)
     on conflict (week_start) do update set counts = excluded.counts, improvement_summary = excluded.improvement_summary`,
    [weekStart, JSON.stringify(metrics), summary],
  );

  const proposalId = await draftRubricProposal(sql, deps.gemini, deps.rubricMd, from, deps.promptsDir);
  return { weekStart, metrics, summary, proposalId };
}

const Proposal = z.object({ change: z.boolean(), rationale: z.string().default(""), new_text: z.string().nullable().default(null) });
const moneyTokens = (s: string) => new Set(s.match(/₹\s*[\d.,]+(?:\s*[–-]\s*[\d.,]+)?(?:\s*lakh)?/g) ?? []);

/** Returns the new proposal id, or null when there is no supported change. */
export async function draftRubricProposal(sql: Sql, gemini: GeminiClient, rubricMd: string, from: string, promptsDir?: string): Promise<string | null> {
  const converted = (
    await sql.query(
      `select d.action, d.original_verdict, d.final_outcome, rq.reasons
         from decisions d left join review_queue rq on rq.lead_id = d.lead_id
        where d.final_outcome = 'converted' and d.decided_at >= $1::timestamptz - interval '28 days' and d.decided_at < $1::timestamptz + interval '7 days'`,
      [from],
    )
  ).rows;
  if (converted.length < 2) return null; // not enough evidence to draft anything
  const others = (
    await sql.query(
      `select action, original_verdict, final_outcome, count(*)::int n from decisions
        where decided_at >= $1::timestamptz - interval '28 days' and decided_at < $1::timestamptz + interval '7 days' group by 1, 2, 3`,
      [from],
    )
  ).rows;
  const p = await prompt("rubric_proposal.v1", promptsDir);
  let out: z.infer<typeof Proposal>;
  try {
    const text = await gemini.generate({
      system: p.system,
      user: fill(p.user, { RUBRIC: rubricMd.trim(), CONVERTED: JSON.stringify(converted), DECISIONS: JSON.stringify(others) }),
      json: true,
    });
    out = Proposal.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
  } catch {
    return null;
  }
  if (!out.change || !out.new_text) return null;
  const next = out.new_text;
  // Guards: the file keeps its structure and gains no new money figure.
  const keeps = [/^#\s+/m, /###\s*1\./m, /###\s*2\./m, /###\s*3\./m, /###\s*4\./m, /###\s*5\./m, /decline gracefully/i].every((re) => re.test(next));
  const oldMoney = moneyTokens(rubricMd);
  const newMoneyOk = [...moneyTokens(next)].every((t) => oldMoney.has(t));
  if (!keeps || !newMoneyOk || next.trim() === rubricMd.trim()) return null;
  const diff = createPatch("knowledge/qualified.md", rubricMd, next, "current", "proposed");
  const dup = await sql.query(`select 1 from rubric_proposals where state = 'pending' and proposed_text = $1`, [next]);
  if (dup.rows.length) return null;
  const r = await sql.query<{ id: string }>(
    `insert into rubric_proposals (diff, rationale, proposed_text) values ($1, $2, $3) returning id`,
    [diff, redactMoney(out.rationale).text, next],
  );
  return r.rows[0]!.id;
}
