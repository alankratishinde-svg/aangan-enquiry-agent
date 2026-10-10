import { z } from "zod";

export const CRITERIA = ["real_project", "service_area", "timeline", "budget_band", "decision_maker"] as const;
export type Criterion = (typeof CRITERIA)[number];
/** Criteria 1 to 3: an unclear one triggers a question. */
export const ASKABLE: readonly Criterion[] = ["real_project", "service_area", "timeline"];

export type Status = "pass" | "fail" | "unclear" | "not_mentioned";
export type Verdict = "qualified" | "unqualified" | "ask_question";

const crit = z.object({
  status: z.enum(["pass", "fail", "unclear", "not_mentioned"]),
  evidence: z.string().default(""),
});

/** What Gemini must return (prompts/classify_lead.v1.md). */
export const GeminiOutputSchema = z.object({
  verdict: z.enum(["qualified", "unqualified", "ask_question"]).optional(),
  criteria: z.object({
    real_project: crit,
    service_area: crit,
    timeline: crit,
    budget_band: crit,
    decision_maker: crit,
  }),
  questions: z.array(z.object({ criterion: z.enum(CRITERIA), question: z.string() })).default([]),
  question_to_ask: z.string().nullable().default(null),
  decline_reason: z.string().nullable().default(null),
  handoff_notes: z.array(z.string()).default([]),
});
export type GeminiOutput = z.infer<typeof GeminiOutputSchema>;

export interface CriterionResult {
  status: Status;
  evidence: string;
  /** Who set the final status. */
  source: "gemini" | "rule";
  /** What Gemini said before the rule engine ran. */
  gemini_status: Status;
}

export interface ClassificationResult {
  verdict: Verdict;
  criteria: Record<Criterion, CriterionResult>;
  /** One per unclear criterion among 1 to 3, only when verdict is ask_question. */
  questions: { criterion: Criterion; question: string }[];
  question_to_ask: string | null;
  decline_reason: string | null;
  /** The graceful close from qualified.md, for unqualified verdicts. */
  close_script: string | null;
  handoff_notes: string[];
  round: number;
  /** True when no further classify_lead round will ask anything. */
  final: boolean;
  gemini_verdict: Verdict | null;
  prompt_version: string;
  /** Text fields that the price guard replaced. Empty in normal operation. */
  price_guard_hits: string[];
}
