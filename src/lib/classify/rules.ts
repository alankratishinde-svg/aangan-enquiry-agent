import type { Config } from "../config";
import { COMMERCIAL_TYPES, type Answers } from "./answers";
import { containsPrice, guardSpoken, redactMoney } from "./guard";
import {
  ASKABLE,
  CRITERIA,
  type ClassificationResult,
  type Criterion,
  type CriterionResult,
  type GeminiOutput,
  type Status,
  type Verdict,
} from "./types";

export const PROMPT_VERSION = "classify_lead.v1";

/** Used when Gemini gives no usable question, or the question held a price. */
const FALLBACK_QUESTION: Record<Criterion, string> = {
  real_project: "Are you looking for complete design and execution of the space, or mainly advice and ideas?",
  service_area: "Which area of Pune or Pimpri-Chinchwad is the property in?",
  timeline: "When would you need the project to be complete?",
  budget_band: "",
  decision_maker: "",
};
const TIMELINE_BAND_QUESTION =
  "Is that finish date fixed, or could it be a little later if needed?";
const SIZE_BAND_QUESTION =
  "Could you confirm the carpet area of the space, in square feet?";

/** Short honest sentences for each failing criterion. No prices, no promises. */
const FALLBACK_DECLINE: Record<Criterion, string> = {
  real_project: "Aangan takes on complete design and execution projects, so this may not be the right fit for us.",
  service_area: "We currently serve Pune city and Pimpri-Chinchwad only.",
  timeline: "We would need a little more lead time than that to deliver well.",
  budget_band: "The scope you described usually needs a larger investment than the figure you mentioned.",
  decision_maker: "We would like to speak with the person who will decide on the project.",
};

export const DEFAULT_CLOSE =
  "This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.";

export interface RuleInput {
  gemini: GeminiOutput;
  answers: Answers;
  config: Config;
  /** 1 for the first classify_lead run of a call, 2 for the one allowed re-run. */
  round: number;
  /** Criteria already questioned on this call. */
  alreadyAsked: Criterion[];
  closeScript: string | null;
}

/** Pure function: Gemini's per-criterion reading plus the structured answers become the final verdict. */
export function applyRules(input: RuleInput): ClassificationResult {
  const { gemini, answers, config, round } = input;
  const hits: string[] = [];

  const criteria = {} as Record<Criterion, CriterionResult>;
  for (const c of CRITERIA) {
    const g = gemini.criteria[c];
    criteria[c] = { status: g.status as Status, evidence: g.evidence, source: "gemini", gemini_status: g.status as Status };
  }

  const set = (c: Criterion, status: Status, evidence: string) => {
    criteria[c] = { ...criteria[c], status, evidence, source: "rule" };
  };

  // Criterion 3: numeric timeline overrides Gemini when the agent supplied weeks.
  const weeks = answers.weeks_until_needed;
  let timelineBand = false;
  if (weeks !== undefined) {
    if (weeks < config.timelineFailUnderWeeks) {
      set("timeline", "fail", `Needed in ${weeks} weeks. Execution cannot begin when the project must be ready in under ${config.timelineFailUnderWeeks} weeks.`);
    } else if (weeks < config.timelinePassFromWeeks) {
      if (answers.timeline_firm === false) {
        set("timeline", "pass", `Needed in about ${weeks} weeks, but the caller said the date can move.`);
      } else if (answers.timeline_firm === true) {
        set("timeline", "fail", `Needed in about ${weeks} weeks and the caller said the date is fixed.`);
      } else {
        set("timeline", "unclear", `Needed in about ${weeks} weeks. Between ${config.timelineFailUnderWeeks} and ${config.timelinePassFromWeeks} weeks needs one question.`);
        timelineBand = true;
      }
    } else {
      set("timeline", "pass", `Needed in ${weeks} weeks or more.`);
    }
  }

  // Criterion 1: commercial size limit from services.md (approx 3,000 sq ft).
  let sizeBand = false;
  if (COMMERCIAL_TYPES.includes(answers.project_type) && answers.area_sq_ft !== undefined && criteria.real_project.status !== "fail") {
    const max = config.commercialMaxSqFt;
    const hi = max * (1 + config.commercialBorderPct / 100);
    if (answers.area_sq_ft > hi) {
      set("real_project", "fail", `Commercial space is larger than the roughly ${max} sq ft Aangan takes on.`);
    } else if (answers.area_sq_ft > max) {
      set("real_project", "unclear", `Commercial space is slightly above the roughly ${max} sq ft limit.`);
      sizeBand = true;
    }
  }

  // Criterion 5: a clear fail alone never disqualifies. It becomes a note for the designer.
  const dmGeminiFail = criteria.decision_maker.status === "fail";
  if (dmGeminiFail) {
    set("decision_maker", "unclear", `${criteria.decision_maker.evidence} Treated as unclear: the rubric says note it, do not push.`);
  }

  // Redact money from every evidence string. The caller's figure stays in `answers`.
  for (const c of CRITERIA) {
    const r = redactMoney(criteria[c].evidence);
    if (r.changed) hits.push(`evidence.${c}`);
    criteria[c].evidence = r.text;
  }

  // Verdict.
  const fails = CRITERIA.filter((c) => c !== "decision_maker" && criteria[c].status === "fail");
  const failCount = fails.length + (config.failPolicy === "two_or_more" && dmGeminiFail ? 1 : 0);
  const failThreshold = config.failPolicy === "any_clear_fail" ? 1 : 2;
  const unclearAskable = ASKABLE.filter((c) => criteria[c].status === "unclear");

  let verdict: Verdict;
  let questions: { criterion: Criterion; question: string }[] = [];
  let exhausted: Criterion[] = [];

  if (failCount >= failThreshold) {
    verdict = "unqualified";
  } else if (unclearAskable.length > 0) {
    const askable = unclearAskable.filter((c) => !input.alreadyAsked.includes(c));
    if (round === 1 && askable.length > 0) {
      verdict = "ask_question";
      questions = askable.map((c) => ({
        criterion: c,
        question: pickQuestion(c, gemini, askable.length, { timelineBand, sizeBand }, hits),
      }));
    } else {
      exhausted = unclearAskable;
      verdict = config.unclearAfterRetry;
    }
  } else {
    verdict = "qualified";
  }

  // Handoff notes for the designer.
  const notes: string[] = [];
  for (const n of gemini.handoff_notes) {
    const r = redactMoney(n);
    if (r.changed) hits.push("handoff_notes");
    notes.push(r.text);
  }
  if (criteria.decision_maker.status === "unclear") notes.push(`Decision-maker unclear: ${criteria.decision_maker.evidence}`);
  if (criteria.budget_band.status === "unclear") notes.push(`Budget unclear: ${criteria.budget_band.evidence}`);
  for (const c of exhausted) notes.push(`Could not confirm ${c.replace("_", " ")} after one question: ${criteria[c].evidence}`);

  // Decline reason and close script for unqualified.
  let decline: string | null = null;
  if (verdict === "unqualified") {
    const primary: Criterion = fails[0] ?? exhausted[0] ?? "real_project";
    const fallback =
      fails.length === 0 && exhausted.length > 0
        ? "I was not able to confirm a few details I need before passing this to a designer."
        : FALLBACK_DECLINE[primary];
    const fromGemini = gemini.decline_reason?.trim() || null;
    decline = guardSpoken(fromGemini, fallback, hits, "decline_reason") ?? fallback;
  }

  const final = verdict !== "ask_question";
  const result: ClassificationResult = {
    verdict,
    criteria,
    questions,
    question_to_ask: questions[0]?.question ?? null,
    decline_reason: decline,
    close_script: verdict === "unqualified" ? (input.closeScript ?? DEFAULT_CLOSE) : null,
    handoff_notes: dedupe(notes),
    round,
    final,
    gemini_verdict: gemini.verdict ?? null,
    prompt_version: PROMPT_VERSION,
    price_guard_hits: [...new Set(hits)],
  };
  return result;
}

function pickQuestion(
  c: Criterion,
  gemini: GeminiOutput,
  askableCount: number,
  band: { timelineBand: boolean; sizeBand: boolean },
  hits: string[],
): string {
  // Rule-driven unclear states use a fixed question: Gemini does not know why the rule fired.
  if (c === "timeline" && band.timelineBand) return TIMELINE_BAND_QUESTION;
  if (c === "real_project" && band.sizeBand) return SIZE_BAND_QUESTION;
  const fallback = FALLBACK_QUESTION[c];
  const own = gemini.questions.find((q) => q.criterion === c)?.question?.trim();
  const single = askableCount === 1 ? gemini.question_to_ask?.trim() : undefined;
  const candidate = own || single || fallback;
  if (containsPrice(candidate)) {
    hits.push(`question.${c}`);
    return fallback;
  }
  return candidate;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}
