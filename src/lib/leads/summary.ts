import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { containsPrice, redactMoney } from "../classify/guard";
import type { GeminiClient } from "../gemini";

export const SUMMARY_PROMPT_VERSION = "lead_summary.v1";

const Schema = z.object({
  summary: z.string(),
  tips: z.array(z.object({ title: z.string(), detail: z.string() })).min(2),
});
export interface Tip {
  title: string;
  detail: string;
}
export interface LeadSummary {
  summary: string;
  tips: [Tip, Tip];
}

/** Gemini writes a short summary and exactly two add-on tips. Any price is scrubbed. Null when Gemini fails. */
export async function writeSummaryAndTips(
  input: { servicesMd: string; answers: unknown; callSummary: string | null; notes: string[]; promptsDir?: string },
  gemini: GeminiClient,
): Promise<LeadSummary | null> {
  const raw = await readFile(join(input.promptsDir ?? join(process.cwd(), "prompts"), `${SUMMARY_PROMPT_VERSION}.md`), "utf8");
  const sys = raw.indexOf("=====SYSTEM=====");
  const usr = raw.indexOf("=====USER=====");
  const system = raw.slice(sys + 16, usr).trim();
  const user = raw
    .slice(usr + 14)
    .trim()
    .replace("{{SERVICES}}", () => input.servicesMd.trim())
    .replace("{{ANSWERS}}", () => JSON.stringify(input.answers, null, 2))
    .replace("{{CALL_SUMMARY}}", () => input.callSummary ?? "none")
    .replace("{{NOTES}}", () => (input.notes.length ? input.notes.join("\n") : "none"));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await gemini.generate({ system, user, json: true });
      const parsed = Schema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
      const clean = (s: string) => {
        const r = redactMoney(s).text;
        return containsPrice(r) ? "" : r;
      };
      const tips = parsed.tips.slice(0, 2).map((t) => ({ title: clean(t.title), detail: clean(t.detail) })) as [Tip, Tip];
      if (tips.some((t) => !t.title || !t.detail)) throw new Error("tip held a price");
      return { summary: clean(parsed.summary), tips };
    } catch {
      /* retry once */
    }
  }
  return null;
}
