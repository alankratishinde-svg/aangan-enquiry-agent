import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../config";
import type { GeminiClient } from "../gemini";
import type { Knowledge } from "../knowledge";
import { AnswersSchema, type Answers } from "./answers";
import { applyRules, DEFAULT_CLOSE, PROMPT_VERSION } from "./rules";
import { GeminiOutputSchema, type ClassificationResult, type Criterion, type GeminiOutput } from "./types";

export class ClassifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifyError";
  }
}

export interface ClassifyState {
  /** Gemini runs so far on this call. Never above 2. */
  round: number;
  /** Criteria already questioned. Each criterion is questioned at most once. */
  asked: Criterion[];
  last: ClassificationResult;
}

/** Per-call state. The BYOL call server holds one process per call, so in-memory is enough there. */
export interface ClassifyStateStore {
  get(callId: string): Promise<ClassifyState | undefined>;
  set(callId: string, state: ClassifyState): Promise<void>;
}

export class InMemoryClassifyStore implements ClassifyStateStore {
  private readonly m = new Map<string, ClassifyState>();
  async get(callId: string) {
    return this.m.get(callId);
  }
  async set(callId: string, state: ClassifyState) {
    this.m.set(callId, state);
  }
}

export interface ClassifyDeps {
  gemini: GeminiClient;
  config: Config;
  /** The knowledge loaded at call start (from the context bundle). */
  knowledge: Knowledge;
  store: ClassifyStateStore;
  now?: () => Date;
  promptsDir?: string;
  /** Post-call audit mode: nobody can answer a question any more, so run as the last round. */
  finalRound?: boolean;
}

const MAX_ROUNDS = 2;

/** The graceful close from qualified.md, read at runtime. Null when the file no longer has it. */
export function extractGracefulClose(qualifiedMd: string): string | null {
  const m = /decline gracefully\.\s*["“]([^"”]+)["”]/i.exec(qualifiedMd);
  return m?.[1]?.trim() || null;
}

async function loadPrompt(dir: string): Promise<{ system: string; user: string }> {
  const raw = await readFile(join(dir, `${PROMPT_VERSION}.md`), "utf8");
  const sys = raw.indexOf("=====SYSTEM=====");
  const usr = raw.indexOf("=====USER=====");
  if (sys === -1 || usr === -1 || usr < sys) throw new ClassifyError(`Prompt ${PROMPT_VERSION} is missing its section markers`);
  return {
    system: raw.slice(sys + "=====SYSTEM=====".length, usr).trim(),
    user: raw.slice(usr + "=====USER=====".length).trim(),
  };
}

function parseGemini(text: string): GeminiOutput {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return GeminiOutputSchema.parse(JSON.parse(cleaned));
}

/**
 * classify_lead. First run may return ask_question (one question per unclear
 * criterion among 1 to 3, each criterion at most once). The agent then calls it
 * again once. After that no question is ever asked: a third call returns the
 * stored result without calling Gemini.
 */
export async function classifyLead(callId: string, rawAnswers: unknown, deps: ClassifyDeps): Promise<ClassificationResult> {
  const state = await deps.store.get(callId);
  if (state && (state.last.final || state.round >= MAX_ROUNDS)) return state.last;

  let answers: Answers;
  try {
    answers = AnswersSchema.parse(rawAnswers ?? {});
  } catch (err) {
    throw new ClassifyError(`classify_lead answers are invalid: ${(err as Error).message}`, { cause: err });
  }

  const round = deps.finalRound ? MAX_ROUNDS : (state?.round ?? 0) + 1;
  const asked = state?.asked ?? [];
  const prompt = await loadPrompt(deps.promptsDir ?? join(import.meta.dirname, "..", "..", "..", "prompts"));
  const today = (deps.now ?? (() => new Date()))();
  const fill = (t: string) =>
    t
      .replace("{{RUBRIC}}", () => deps.knowledge.qualified.trim())
      .replace("{{SERVICES}}", () => deps.knowledge.services.trim())
      .replace("{{TODAY}}", () => today.toISOString().slice(0, 10))
      .replace("{{ROUND}}", () => String(round))
      .replace("{{ALREADY_ASKED}}", () => (asked.length ? asked.join(", ") : "none"))
      .replace("{{ANSWERS}}", () => JSON.stringify(answers, null, 2));

  let gemini: GeminiOutput | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2 && !gemini; attempt++) {
    try {
      const text = await deps.gemini.generate({
        system: prompt.system,
        user: fill(prompt.user) + (attempt ? "\n\nYour previous reply was not valid JSON for the schema. Return only the JSON object." : ""),
        json: true,
      });
      gemini = parseGemini(text);
    } catch (err) {
      lastErr = err;
    }
  }
  if (!gemini) throw new ClassifyError(`Gemini classification failed: ${(lastErr as Error).message}`, { cause: lastErr });

  const result = applyRules({
    gemini,
    answers,
    config: deps.config,
    round,
    alreadyAsked: asked,
    closeScript: extractGracefulClose(deps.knowledge.qualified) ?? DEFAULT_CLOSE,
  });

  await deps.store.set(callId, {
    round,
    asked: [...asked, ...result.questions.map((q) => q.criterion)],
    last: result,
  });
  return result;
}

/** What the voice agent gets back from the classify_lead tool. No evidence, no internals. */
export interface ClassifyToolResponse {
  verdict: ClassificationResult["verdict"];
  /** Ask each of these aloud, one at a time, then call classify_lead once more. */
  questions: string[];
  /** One honest sentence for the caller. Unqualified only. */
  decline_reason: string | null;
  /** Polite closing wording. Unqualified only. */
  close_script: string | null;
  next_step: string;
}

export function toToolResponse(r: ClassificationResult): ClassifyToolResponse {
  const next =
    r.verdict === "qualified"
      ? "Ask for the caller's email and phone number, then call book_slot with a slot_id from your list."
      : r.verdict === "unqualified"
        ? "Say the decline reason, then the close script. Do not ask for an email. Do not book. End the call politely."
        : "Ask the questions, then call classify_lead once more with the updated answers.";
  return {
    verdict: r.verdict,
    questions: r.questions.map((q) => q.question),
    decline_reason: r.decline_reason,
    close_script: r.close_script,
    next_step: next,
  };
}
